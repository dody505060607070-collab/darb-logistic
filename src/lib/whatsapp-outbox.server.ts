import { withWhatsAppLinks } from '@/lib/wa-links';
import { whatsappNumber } from './phone';
import { canStartSend, SEND_TIMEOUT_MS } from './outbox-budget';

type SendOptions = { limit?: number; deadlineAt?: number; concurrency?: number };

/**
 * Sends queued WhatsApp messages. Claims are atomic; ambiguous outcomes stay "unresolved" and are never resent.
 * A message is only claimed when its send can finish before `deadlineAt`, because the scheduler cancels the
 * run after a few seconds and a send cut off mid-way can't be known as delivered or not.
 */
export async function processWhatsAppOutbox(opts: SendOptions | number = {}) {
  const { limit = 30, deadlineAt = Date.now() + 15000, concurrency = 3 } = typeof opts === 'number' ? { limit: opts } : opts;
  const url = (process.env.WHATSAPP_SERVER_URL ?? '').trim().replace(/\/+$/, '');
  const instance = (process.env.WHATSAPP_INSTANCE ?? '').trim();
  const key = (process.env.WHATSAPP_SERVER_KEY ?? '').trim();
  if (!url || !instance || !key) return { sent: 0, reason: 'not_configured' };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const db = supabaseAdmin as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  await db.from('whatsapp_outbox').update({ state: 'unresolved', error: 'انقطع تأكيد الإرسال' }).eq('state', 'sending').lt('claimed_at', new Date(Date.now() - 60000).toISOString());
  const { data: rows, error } = await db.from('whatsapp_outbox').select('id').in('state', ['pending', 'failed']).lt('attempts', 5).order('created_at').limit(limit);
  if (error) throw new Error(error.message);
  const queue: string[] = (rows ?? []).map((r: { id: string }) => r.id);
  let sent = 0, skipped = 0;

  async function sendOne(id: string) {
    const { data: claimed } = await db.rpc('claim_whatsapp_message', { p_id: id });
    const row = claimed?.[0];
    if (!row) return;
    let state = 'unresolved', err: string | null = null, providerId: string | null = null;
    const number = whatsappNumber(row.phone);
    if (!number) {
      await db.from('whatsapp_outbox').update({ state: 'failed', attempts: 5, error: 'رقم الجوال غير صحيح، صحّحه في ملف الموظف' }).eq('id', row.id);
      return;
    }
    try {
      const res = await fetch(`${url}/message/sendText/${encodeURIComponent(instance)}`, {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number, text: withWhatsAppLinks(row.body, row.phone) }), signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      const body = await res.text();
      if (!res.ok) { state = res.status >= 500 ? 'unresolved' : 'failed'; err = `[${res.status}] ${body.slice(0, 300)}`; }
      else {
        const p = JSON.parse(body);
        providerId = p?.key?.id ?? p?.message?.key?.id ?? p?.id ?? null;
        state = providerId ? 'accepted' : 'unresolved';
        if (!providerId) err = 'لم يرجع معرف الرسالة';
      }
    } catch (e) { err = (e as Error).message; }
    await db.from('whatsapp_outbox').update({ state, error: err, provider_id: providerId, accepted_at: state === 'accepted' ? new Date().toISOString() : null }).eq('id', row.id).eq('state', 'sending');
    if (state === 'accepted') sent++;
  }

  // Up to 5 parallel lanes (the runtime allows 6 open requests); each takes the next message only while a full send still fits in the time left.
  async function lane() {
    while (queue.length) {
      if (!canStartSend(Date.now(), deadlineAt)) { skipped = queue.length; return; }
      const id = queue.shift()!;
      await sendOne(id);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, 5)) }, lane));
  return { sent, left: skipped, reason: null };
}
