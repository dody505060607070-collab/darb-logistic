import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { linkedWhatsAppNumber } from './whatsapp-instance';

/**
 * WhatsApp gateway on the company's own Ubuntu server (Evolution API compatible).
 * Secrets: WHATSAPP_SERVER_URL, WHATSAPP_INSTANCE, WHATSAPP_SERVER_KEY — server-only.
 */
type Ctx = { supabase: { from: (t: string) => any }; userId: string };

async function requireOwner(context: Ctx) {
  const { data, error } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw new Error('تعذر التحقق من صلاحية المالك');
  if (!((data ?? []) as { role: string }[]).some((r) => r.role === "owner")) throw new Error("غير مصرح — للمالك فقط");
}

const cfg = createServerOnlyFn(() => {
  const url = (process.env.WHATSAPP_SERVER_URL ?? "").trim().replace(/\/+$/, "");
  const instance = (process.env.WHATSAPP_INSTANCE ?? "").trim();
  const key = (process.env.WHATSAPP_SERVER_KEY ?? "").trim();
  return { url, instance, key, ready: !!(url && instance && key) };
});

async function call(path: string, init?: RequestInit) {
  const c = cfg();
  const res = await fetch(`${c.url}${path}`, {
    ...init,
    headers: { apikey: c.key, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 400) };
}

export const whatsappStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context as unknown as Ctx);
    const c = cfg();
    if (!c.ready) return { configured: false as const, state: "not_configured", instance: c.instance || null, number: null as string | null, error: null as string | null };
    try {
      const r = await call(`/instance/connectionState/${encodeURIComponent(c.instance)}`);
      if (!r.ok) return { configured: true as const, state: r.status === 404 ? "missing" : "error", instance: c.instance, number: null, error: `[${r.status}] ${r.text}` };
      const state = r.json?.instance?.state ?? r.json?.state ?? "unknown";
      if (state !== 'open') return { configured: true as const, state: String(state), instance: c.instance, number: null, error: null };
      const details = await call(`/instance/fetchInstances?instanceName=${encodeURIComponent(c.instance)}`);
      return { configured: true as const, state: String(state), instance: c.instance, number: details.ok ? linkedWhatsAppNumber(details.json, c.instance) : null, error: details.ok ? null : `تعذر قراءة الرقم [${details.status}]: ${details.text}` };
    } catch (e) {
      return { configured: true as const, state: "unreachable", instance: c.instance, number: null, error: (e as Error).message };
    }
  });

export const whatsappDisconnect = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context as unknown as Ctx);
    const c = cfg();
    if (!c.ready) throw new Error('بيانات خادم واتساب غير مضافة بعد');
    const result = await call(`/instance/logout/${encodeURIComponent(c.instance)}`, { method: 'DELETE' });
    if (!result.ok) throw new Error(`تعذر فك الربط [${result.status}]: ${result.text}`);
    const verify = await call(`/instance/connectionState/${encodeURIComponent(c.instance)}`);
    if (!verify.ok && verify.status !== 404) throw new Error(`تعذر تأكيد فك الربط [${verify.status}]: ${verify.text}`);
    if (verify.json?.instance?.state === 'open' || verify.json?.state === 'open') throw new Error('الخادم ما زال يعرض الرقم مربوطًا؛ حدّث الحالة قبل المحاولة مجددًا');
    return { disconnected: true };
  });

export const whatsappQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireOwner(context as unknown as Ctx);
    const c = cfg();
    if (!c.ready) throw new Error("بيانات خادم واتساب غير مضافة بعد");
    let r = await call(`/instance/connect/${encodeURIComponent(c.instance)}`);
    if (r.status === 404) {
      const created = await call(`/instance/create`, {
        method: "POST",
        body: JSON.stringify({ instanceName: c.instance, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
      });
      if (!created.ok) throw new Error(`تعذّر إنشاء الجلسة [${created.status}]: ${created.text}`);
      if (created.json?.qrcode?.base64) return { base64: String(created.json.qrcode.base64), pairingCode: created.json.qrcode.pairingCode ?? null };
      r = await call(`/instance/connect/${encodeURIComponent(c.instance)}`);
    }
    if (!r.ok) throw new Error(`الخادم رد بخطأ [${r.status}]: ${r.text}`);
    const base64 = r.json?.base64 ?? r.json?.qrcode?.base64 ?? null;
    if (!base64) {
      if (r.json?.instance?.state === "open") return { base64: null, pairingCode: null, connected: true };
      throw new Error("لم يرجع الخادم رمز QR — ربما الرقم مربوط بالفعل");
    }
    return { base64: String(base64), pairingCode: r.json?.pairingCode ?? null };
  });

export const whatsappSendTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { number: string }) => {
    const n = String(d?.number ?? "").replace(/\D/g, "");
    if (n.length < 9 || n.length > 15) throw new Error("رقم غير صحيح — اكتبه بالصيغة الدولية مثل 9665xxxxxxxx");
    return { number: n };
  })
  .handler(async ({ context, data }) => {
    await requireOwner(context as unknown as Ctx);
    const c = cfg();
    if (!c.ready) throw new Error("بيانات خادم واتساب غير مضافة بعد");
    const r = await call(`/message/sendText/${encodeURIComponent(c.instance)}`, {
      method: "POST",
      body: JSON.stringify({ number: data.number, text: "رسالة اختبار من نظام Shata ✅" }),
    });
    if (!r.ok) throw new Error(`فشل الإرسال [${r.status}]: ${r.text}`);
    return { ok: true };
  });

/** Process only the event queued by a committed, authorized task change. */
export const notifyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const d = input as { taskId?: string; event?: string };
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d?.taskId ?? '')) throw new Error('مهمة غير صحيحة');
    if (!['assigned','submitted','returned','approved'].includes(d?.event ?? '')) throw new Error('حدث غير صحيح');
    return { taskId: d.taskId as string, event: d.event as 'assigned' | 'submitted' | 'returned' | 'approved' };
  })
  .handler(async ({ context, data }) => {
    const { data: task, error } = await context.supabase.from('tasks').select('*').eq('id', data.taskId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!task) throw new Error('المهمة غير موجودة أو غير مسموح بها');
    const { data: roles, error: roleError } = await context.supabase.from('user_roles').select('role').eq('user_id', context.userId);
    if (roleError) throw new Error('تعذر التحقق من الصلاحيات');
    const manager = (roles ?? []).some(r => r.role === 'owner' || r.role === 'ops_manager');
    const { canNotifyTask } = await import('@/lib/task-notifications');
    if (!canNotifyTask(data.event, task.status, manager, task.assignee_id === context.userId)) throw new Error('غير مصرح بهذا الإشعار أو حالة المهمة تغيرت');
    const { processTaskNotifications } = await import('@/lib/task-notifications.server');
    return processTaskNotifications(task.id, data.event);
  });

/** Tell the assigned driver about a trip on WhatsApp. Caller must be dispatch staff and able to read the trip. */
export const notifyTripDriver = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const id = (input as { tripId?: string })?.tripId ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("رحلة غير صحيحة");
    return { tripId: id };
  })
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const { data: roles } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
    if (!((roles ?? []) as { role: string }[]).some((r) => ["owner", "ops_manager", "dispatcher"].includes(r.role))) throw new Error("غير مصرح");
    const c = cfg();
    if (!c.ready) return { sent: false, reason: "واتساب: لم يتم الربط" };
    const { data: trip, error } = await ctx.supabase.from("trips").select("number, origin_city, dest_city, planned_start, driver:drivers!trips_driver_id_fkey(full_name, phone)").eq("id", data.tripId).single();
    if (error || !trip) throw new Error("تعذر قراءة الرحلة");
    const phone = String(trip.driver?.phone ?? "").replace(/\D/g, "").replace(/^0/, "966");
    if (phone.length < 9) return { sent: false, reason: "لا يوجد رقم جوال للسائق — لم يُرسل واتساب" };
    const when = trip.planned_start ? new Date(trip.planned_start).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" }) : "—";
    const text = `مرحبًا ${trip.driver?.full_name ?? ""}\nتم تكليفك برحلة ${trip.number}\nمن: ${trip.origin_city} إلى: ${trip.dest_city}\nموعد التحميل: ${when}\nافتح تطبيق Shata لتفاصيل الرحلة.`;
    const r = await call(`/message/sendText/${encodeURIComponent(c.instance)}`, { method: "POST", body: JSON.stringify({ number: phone, text }) });
    if (!r.ok) throw new Error(`فشل الإرسال [${r.status}]`);
    return { sent: true, reason: "" };
  });
