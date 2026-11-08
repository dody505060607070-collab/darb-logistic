import { createServerFn } from "@tanstack/react-start";
import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * WhatsApp login codes sent from the company's own WhatsApp gateway.
 * Codes are 6 digits, HMAC-hashed, valid 5 minutes, max 5 attempts, rate limited per number.
 * A verified code is exchanged for a real Cloud Auth session (magic-link token hash),
 * so permissions still come only from user_roles — the signup trigger assigns them.
 */
const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function validPhone(raw: unknown): string {
  const p = parsePhoneNumberFromString(String(raw ?? ""));
  if (!p?.isValid()) throw new Error("أدخل رقم جوال صحيحًا مع رمز الدولة");
  return p.number;
}

function gateway() {
  const url = (process.env.WHATSAPP_SERVER_URL ?? "").trim().replace(/\/+$/, "");
  const instance = (process.env.WHATSAPP_INSTANCE ?? "").trim();
  const key = (process.env.WHATSAPP_SERVER_KEY ?? "").trim();
  if (!url || !instance || !key) throw new Error("خدمة واتساب غير مربوطة بعد");
  return { url, instance, key };
}

async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export const requestLoginCode = createServerFn({ method: "POST" })
  .inputValidator((d: { phone: string }) => ({ phone: validPhone(d?.phone) }))
  .handler(async ({ data }) => {
    const g = gateway();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent, error } = await supabaseAdmin.from("login_codes").select("created_at").eq("phone", data.phone).gte("created_at", since).order("created_at", { ascending: false });
    if (error) throw new Error("تعذر إرسال الرمز، حاول مجددًا");
    if (recent && recent.length >= 5) throw new Error("طلبات كثيرة لهذا الرقم. حاول بعد ساعة.");
    if (recent?.[0] && Date.now() - new Date(recent[0].created_at).getTime() < 60_000) throw new Error("انتظر دقيقة قبل طلب رمز جديد");

    const n = (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % 1_000_000;
    const code = String(n).padStart(6, "0");
    const { error: insErr } = await supabaseAdmin.from("login_codes").insert({ phone: data.phone, code_hash: await hmac(g.key, `${data.phone}:${code}`), expires_at: new Date(Date.now() + TTL_MS).toISOString() });
    if (insErr) throw new Error("تعذر إنشاء الرمز");

    const text = `🔐 رمز الدخول إلى دَرب: *${code}*\nصالح لمدة 5 دقائق. لا تشاركه مع أي أحد.`;
    const res = await fetch(`${g.url}/message/sendText/${encodeURIComponent(g.instance)}`, {
      method: "POST",
      headers: { apikey: g.key, "Content-Type": "application/json" },
      body: JSON.stringify({ number: data.phone.replace(/^\+/, ""), text }),
    });
    if (!res.ok) {
      console.error("WhatsApp login send failed", res.status, (await res.text()).slice(0, 300));
      throw new Error("تعذر إرسال الرمز على واتساب. تأكد أن الرقم عليه واتساب.");
    }
    return { sent: true, phone: data.phone };
  });

export const verifyLoginCode = createServerFn({ method: "POST" })
  .inputValidator((d: { phone: string; code: string }) => {
    const code = String(d?.code ?? "").replace(/\D/g, "");
    if (code.length !== 6) throw new Error("الرمز 6 أرقام");
    return { phone: validPhone(d?.phone), code };
  })
  .handler(async ({ data }) => {
    const g = gateway();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin.from("login_codes").select("*").eq("phone", data.phone).is("consumed_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!row || row.attempts >= MAX_ATTEMPTS) throw new Error("الرمز منتهي أو غير صالح. اطلب رمزًا جديدًا.");
    if ((await hmac(g.key, `${data.phone}:${data.code}`)) !== row.code_hash) {
      await supabaseAdmin.from("login_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      throw new Error("الرمز غير صحيح");
    }
    const { data: used } = await supabaseAdmin.from("login_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id).is("consumed_at", null).select("id");
    if (!used?.length) throw new Error("الرمز مستخدم مسبقًا");

    // Find the account that owns this verified number (profile phone), else create a new account (the signup trigger grants its role).
    let userId: string | null = null;
    const { data: prof } = await supabaseAdmin.from("profiles").select("id").eq("phone", data.phone).limit(2);
    if (prof && prof.length > 1) throw new Error("هذا الرقم مرتبط بأكثر من حساب. تواصل مع المدير.");
    userId = prof?.[0]?.id ?? null;
    const digits = data.phone.replace(/^\+/, "");
    let email: string | null = null;
    if (userId) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
      email = u?.user?.email ?? null;
      if (!email) {
        email = `${digits}@phone.darb.app`;
        await supabaseAdmin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      }
    } else {
      email = `${digits}@phone.darb.app`;
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({ email, email_confirm: true, phone: data.phone, phone_confirm: true, user_metadata: { full_name: data.phone, phone: data.phone } });
      if (error || !created.user) throw new Error("تعذر إنشاء الحساب؛ تحقق من ربط رقم الجوال بملف الموظف");
      userId = created.user.id;
      // Cloud Auth stores phone without '+'. Profiles use E.164 for OTP identity.
      const { error: profileError } = await supabaseAdmin.from('profiles').update({ phone: data.phone }).eq('id', userId);
      if (profileError) throw new Error('تعذر تثبيت رقم الجوال للحساب');
    }
    if (!userId) throw new Error('تعذر تحديد حساب الموظف');
    // Only after a valid code has been consumed: apply server-owned reservations.
    const { error: ownerError } = await supabaseAdmin.rpc('apply_reserved_phone_owner', { p_user_id: userId, p_verified_phone: data.phone });
    if (ownerError) throw new Error('تعذر التحقق من صلاحيات الحساب');
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkErr || !link?.properties?.hashed_token) throw new Error("تعذر إنشاء جلسة الدخول");
    return { tokenHash: link.properties.hashed_token };
  });
