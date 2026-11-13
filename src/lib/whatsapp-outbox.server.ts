/** Sends queued WhatsApp messages. Claims are atomic; ambiguous outcomes stay "unresolved" and are never resent. */
export async function processWhatsAppOutbox(limit = 20) {
  const url = (process.env.WHATSAPP_SERVER_URL ?? '').trim().replace(/\/+$/, '');
  const instance = (process.env.WHATSAPP_INSTANCE ?? '').trim();
  const key = (process.env.WHATSAPP_SERVER_KEY ?? '').trim();
  if (!url || !instance || !key) return { sent: 0, reason: 'not_configured' };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const db = supabaseAdmin as any;
  await db.from('whatsapp_outbox').update({ state: 'unresolved', error: 'انقطع تأكيد الإرسال' }).eq('state', 'sending').lt('claimed_at', new Date(Date.now() - 60000).toISOString());
  const { data: rows, error } = await db.from('whatsapp_outbox').select('id').in('state', ['pending', 'failed']).lt('attempts', 5).order('created_at').limit(limit);
  if (error) throw new Error(error.message);
  let sent = 0;
  for (const r of rows ?? []) {
    const { data: claimed } = await db.rpc('claim_whatsapp_message', { p_id: r.id });
    const row = claimed?.[0];
    if (!row) continue;
    let state = 'unresolved', err: string | null = null, providerId: string | null = null;
    try {
      const res = await fetch(`${url}/message/sendText/${encodeURIComponent(instance)}`, {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: row.phone, text: row.body }), signal: AbortSignal.timeout(4000),
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
  return { sent, reason: null };
}
