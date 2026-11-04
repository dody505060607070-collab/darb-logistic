import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * WhatsApp gateway on the company's own Ubuntu server (Evolution API compatible).
 * Secrets: WHATSAPP_SERVER_URL, WHATSAPP_INSTANCE, WHATSAPP_SERVER_KEY — server-only.
 */
type Ctx = { supabase: { from: (t: string) => any }; userId: string };

async function requireOwner(context: Ctx) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  if (!((data ?? []) as { role: string }[]).some((r) => r.role === "owner")) throw new Error("غير مصرح — للمالك فقط");
}

function cfg() {
  const url = (process.env.WHATSAPP_SERVER_URL ?? "").trim().replace(/\/+$/, "");
  const instance = (process.env.WHATSAPP_INSTANCE ?? "").trim();
  const key = (process.env.WHATSAPP_SERVER_KEY ?? "").trim();
  return { url, instance, key, ready: !!(url && instance && key) };
}

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
    if (!c.ready) return { configured: false as const, state: "not_configured", instance: c.instance || null, error: null as string | null };
    try {
      const r = await call(`/instance/connectionState/${encodeURIComponent(c.instance)}`);
      if (!r.ok) return { configured: true as const, state: r.status === 404 ? "missing" : "error", instance: c.instance, error: `[${r.status}] ${r.text}` };
      const state = r.json?.instance?.state ?? r.json?.state ?? "unknown";
      return { configured: true as const, state: String(state), instance: c.instance, error: null };
    } catch (e) {
      return { configured: true as const, state: "unreachable", instance: c.instance, error: (e as Error).message };
    }
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
