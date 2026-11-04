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
      body: JSON.stringify({ number: data.number, text: "رسالة اختبار من نظام دَرب ✅" }),
    });
    if (!r.ok) throw new Error(`فشل الإرسال [${r.status}]: ${r.text}`);
    return { ok: true };
  });

const digits = (p?: string | null) => {
  let n = String(p ?? "").replace(/\D/g, "");
  if (n.startsWith("05") && n.length === 10) n = "966" + n.slice(1);
  return n.length >= 9 && n.length <= 15 ? n : null;
};
const SUPPORT = "\n\n📞 هذا رقم دَرب الرسمي — يمكنك مراسلتنا عليه في أي وقت للدعم والاستفسار.";

/**
 * Sends the WhatsApp message for a task event. The caller must be able to read the task (RLS),
 * then recipients' phones are looked up with the admin client.
 * assigned/returned → assignee; submitted → owners (the company's linked number receives it as well).
 */
export const notifyTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { taskId: string; event: "assigned" | "submitted" | "returned" | "approved" }) => {
    if (!/^[0-9a-f-]{36}$/i.test(String(d?.taskId))) throw new Error("مهمة غير صحيحة");
    if (!["assigned", "submitted", "returned", "approved"].includes(d.event)) throw new Error("حدث غير صحيح");
    return d;
  })
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    const { data: task } = await ctx.supabase.from("tasks").select("*").eq("id", data.taskId).maybeSingle();
    if (!task) throw new Error("المهمة غير موجودة أو غير مسموح بها");
    const c = cfg();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const setStatus = (s: string) => supabaseAdmin.from("tasks").update({ whatsapp_status: s }).eq("id", task.id);
    if (!c.ready) { await setStatus("not_connected"); return { sent: 0, reason: "not_configured" }; }

    const { data: people } = await supabaseAdmin.from("profiles").select("id, full_name, phone").in("id", [task.assignee_id, task.assigned_by].filter(Boolean));
    const who = (id: string) => people?.find((p) => p.id === id);
    let recipients: string[] = [];
    if (data.event === "submitted") {
      const { data: owners } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "owner");
      const ids = [...new Set([task.assigned_by, ...(owners ?? []).map((o) => o.user_id)])];
      const { data: ph } = await supabaseAdmin.from("profiles").select("phone").in("id", ids);
      recipients = (ph ?? []).map((p) => digits(p.phone)).filter(Boolean) as string[];
      const own = await call(`/instance/fetchInstances?instanceName=${encodeURIComponent(c.instance)}`).catch(() => null);
      const ownNum = digits(String((Array.isArray(own?.json) ? own?.json[0] : own?.json)?.ownerJid ?? (Array.isArray(own?.json) ? own?.json[0]?.instance?.owner : "") ?? "").split("@")[0]);
      if (ownNum) recipients.push(ownNum);
    } else {
      const n = digits(who(task.assignee_id)?.phone);
      if (n) recipients = [n];
    }
    recipients = [...new Set(recipients)];
    if (!recipients.length) { await setStatus("no_phone"); return { sent: 0, reason: "no_phone" }; }

    const name = who(task.assignee_id)?.full_name ?? "الموظف";
    const pr = task.priority === "urgent" ? "🔴 عاجلة" : "عادية";
    const details = [
      `📌 *${task.title}*`,
      task.description ? `📝 ${task.description}` : "",
      `الأولوية: ${pr}`,
      task.due_at ? `⏰ الموعد: ${new Date(task.due_at).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}` : "",
      task.requested_by_external ? `بطلب من: ${task.requested_by_external}` : "",
      task.location_text ? `📍 الموقع: ${task.location_text}\n${task.lat ? `https://maps.google.com/?q=${task.lat},${task.lng}` : `https://maps.google.com/?q=${encodeURIComponent(task.location_text)}`}` : "",
    ].filter(Boolean).join("\n");
    const head = {
      assigned: `مرحباً ${name} 👋\nتم تكليفك بمهمة جديدة في نظام دَرب:`,
      returned: `⚠️ ${name}، أُعيدت إليك المهمة لأنها لم تكتمل بعد.${task.review_note ? `\nالسبب: ${task.review_note}` : ""}`,
      submitted: `✅ ${name} أبلغ أنه أنهى المهمة — ادخل إلى صفحة المهام للمراجعة والاعتماد أو الإرجاع.${task.done_note ? `\nملاحظته: ${task.done_note}` : ""}`,
      approved: `🎉 ${name}، تم اعتماد مهمتك كمكتملة. شكراً لك!`,
    }[data.event];
    const text = `${head}\n\n${details}${data.event === "submitted" ? "" : "\n\nبعد الإنجاز ادخل إلى نظام دَرب واضغط «أنهيت المهمة»."}${SUPPORT}`;

    let photo: string | null = null;
    if (task.photo_path && (data.event === "assigned" || data.event === "returned")) {
      const { data: s } = await supabaseAdmin.storage.from("attachments").createSignedUrl(task.photo_path, 3600);
      photo = s?.signedUrl ?? null;
    }
    let sent = 0; const errors: string[] = [];
    for (const number of recipients) {
      const r = photo
        ? await call(`/message/sendMedia/${encodeURIComponent(c.instance)}`, { method: "POST", body: JSON.stringify({ number, mediatype: "image", media: photo, caption: text }) })
        : await call(`/message/sendText/${encodeURIComponent(c.instance)}`, { method: "POST", body: JSON.stringify({ number, text }) });
      if (r.ok) sent++; else errors.push(`[${r.status}] ${r.text}`);
      if (task.lat && r.ok && data.event === "assigned") {
        await call(`/message/sendLocation/${encodeURIComponent(c.instance)}`, { method: "POST", body: JSON.stringify({ number, latitude: Number(task.lat), longitude: Number(task.lng), name: task.title, address: task.location_text ?? "" }) }).catch(() => null);
      }
    }
    await setStatus(sent ? `sent_${data.event}` : "failed");
    if (!sent) throw new Error(`فشل إرسال واتساب: ${errors[0] ?? ""}`);
    return { sent, reason: null };
  });
