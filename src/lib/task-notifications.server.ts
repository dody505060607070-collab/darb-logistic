import { taskMessage } from './task-notifications';
import { whatsappNumber } from './phone';
import { SEND_TIMEOUT_MS } from './outbox-budget';
import type { TaskEvent } from './task-notifications';

/** Acceptance is not recipient delivery; uncertain outcomes stay visible, never blindly resent. */
export async function processTaskNotifications(taskId?: string, event?: TaskEvent) {
  const url = (process.env.WHATSAPP_SERVER_URL ?? '').trim().replace(/\/+$/, '');
  const instance = (process.env.WHATSAPP_INSTANCE ?? '').trim();
  const key = (process.env.WHATSAPP_SERVER_KEY ?? '').trim();
  if (!url || !instance || !key) return { sent: 0, reason: 'not_configured' };
  const { supabaseAdmin: admin } = await import('@/integrations/supabase/client.server');
  const db = admin as any;
  const check = (r: any) => { if (r.error) throw new Error(r.error.message); return r.data; };
  // A previous invocation may have been interrupted after sending; retain for operator review.
  check(await db.from('task_notifications').update({ state: 'unresolved', error: 'انقطع تأكيد الإرسال؛ يلزم التحقق قبل إعادة المحاولة' }).eq('state', 'sending').lt('claimed_at', new Date(Date.now() - 60000).toISOString()));
  let query = db.from('task_notifications').select('*').in('state', ['pending', 'failed']).lte('next_attempt_at', new Date().toISOString()).order('next_attempt_at').limit(4);
  if (taskId) query = query.eq('task_id', taskId);
  if (event) query = query.eq('event', event);
  const rows = check(await query) ?? [];
  const results = await Promise.all(rows.map(async (row: any) => {
    const task = check(await db.from('tasks').select('status,assignee_id').eq('id', row.task_id).maybeSingle());
    const wanted = row.event === 'submitted' ? 'submitted' : row.event === 'approved' ? 'completed' : 'assigned';
    if (!task || task.status !== wanted || (row.event !== 'submitted' && row.recipient_id !== task.assignee_id)) {
      check(await db.from('task_notifications').update({ state: 'cancelled' }).eq('id', row.id).in('state', ['pending', 'failed']));
      return { sent: 0, reason: 'cancelled' };
    }
    const profile = check(await db.from('profiles').select('phone').eq('id', row.recipient_id).maybeSingle());
    const number = whatsappNumber(profile?.phone);
    if (!number) {
      check(await db.from('task_notifications').update({ state: 'failed', error: 'لا يوجد جوال صحيح للموظف', next_attempt_at: new Date(Date.now() + 3600000).toISOString() }).eq('id', row.id));
      return { sent: 0, reason: 'no_phone' };
    }
    const claimed = check(await db.rpc('claim_task_notification', { p_id: row.id }));
    if (!claimed?.length) return { sent: 0, reason: 'already_claimed' };
    let state = 'unresolved', error: string | null = null, providerId: string | null = null;
    try {
      let media: string | null = null;
      if (row.payload.photo_path && ['assigned', 'returned'].includes(row.event)) {
        media = check(await admin.storage.from('attachments').createSignedUrl(row.payload.photo_path, 3600))?.signedUrl ?? null;
      }
      const text = taskMessage(row.payload, row.event);
      const response = await fetch(`${url}/message/${media ? 'sendMedia' : 'sendText'}/${encodeURIComponent(instance)}`, {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify(media ? { number, mediatype: 'image', media, caption: text } : { number, text }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      const body = await response.text();
      if (!response.ok) { state = response.status >= 500 ? 'unresolved' : 'failed'; error = `خادم واتساب [${response.status}]: ${body.slice(0, 400)}`; }
      else {
        const parsed = JSON.parse(body);
        providerId = parsed?.key?.id ?? parsed?.message?.key?.id ?? parsed?.id ?? null;
        state = providerId ? 'accepted' : 'unresolved';
        if (!providerId) error = 'لم يرجع خادم واتساب معرف الرسالة؛ الوصول غير مؤكد';
      }
    } catch (e) { error = (e as Error).message; }
    check(await db.from('task_notifications').update({ state, provider_id: providerId, error, accepted_at: state === 'accepted' ? new Date().toISOString() : null, next_attempt_at: new Date(Date.now() + 3600000).toISOString() }).eq('id', row.id).eq('state', 'sending'));
    check(await db.from('tasks').update({ whatsapp_status: state === 'accepted' ? `accepted_${row.event}` : state }).eq('id', row.task_id));
    return { sent: state === 'accepted' ? 1 : 0, reason: error ? state : null };
  }));
  return { sent: results.reduce((n, r) => n + r.sent, 0), reason: results.find(r => r.reason)?.reason ?? (rows.length ? null : 'already_processed') };
}