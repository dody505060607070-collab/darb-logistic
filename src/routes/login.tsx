import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, Loader2, Lock, LogIn, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/darb/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClientOnly } from "@tanstack/react-router";
import SignaturePenFooter from "@/components/ui/signature-pen-footer";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — دَرب" },
      { name: "description", content: "تسجيل الدخول إلى نظام دَرب لإدارة عمليات النقل البري والأسطول." },
      { property: "og:title", content: "تسجيل الدخول — دَرب" },
      { property: "og:description", content: "الدخول إلى نظام دَرب لإدارة النقل البري." },
    ],
  }),
  component: LoginPage,
});

type Mode = "signin" | "signup" | "reset";

function LoginPage() {
  const auth = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (auth.ready && auth.session) void nav({ to: auth.isStaff || auth.roles.length === 0 ? "/" : "/driver" });
  }, [auth.ready, auth.session, auth.isStaff, auth.roles, nav]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("تم إنشاء الحساب. تحقق من بريدك لتأكيد العنوان.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast.success("أرسلنا رابط إعادة التعيين إلى بريدك");
        setMode("signin");
      }
    } catch (err) {
      const m = (err as Error).message;
      toast.error(m.includes("Invalid login") ? "البريد أو كلمة المرور غير صحيحة" : m);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error("تعذر تسجيل الدخول عبر Google");
  }

  return (
    <div dir="rtl" className="dark grid min-h-screen bg-background lg:grid-cols-2">
        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-16">
          <div className="panel mx-auto w-full max-w-md p-8">
          <Logo className="mb-6 justify-center" />
          <h1 className="text-center text-2xl font-bold text-primary">
            {mode === "signin" ? "تسجيل الدخول إلى نظام دَرب" : mode === "signup" ? "إنشاء حساب بدعوة" : "استعادة كلمة المرور"}
          </h1>
          <p className="mt-1 mb-8 text-center text-sm text-muted-foreground">إدارة عمليات النقل البري والأسطول</p>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <Label className="mb-1.5 block">الاسم الكامل</Label>
                <div className="relative">
                  <User className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={name} onChange={(e) => setName(e.target.value)} required className="h-11 pr-9" />
                </div>
              </div>
            )}
            <div>
              <Label className="mb-1.5 block">
                البريد الإلكتروني <span className="text-danger">*</span>
              </Label>
              <div className="relative">
                <Mail className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required className="h-11 pr-9 text-right" />
              </div>
            </div>
            {mode !== "reset" && (
              <div>
                <Label className="mb-1.5 block">
                  كلمة المرور <span className="text-danger">*</span>
                </Label>
                <div className="relative">
                  <Lock className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type={show ? "text" : "password"}
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    className="h-11 pr-9 pl-10 text-right"
                  />
                  <button type="button" onClick={() => setShow(!show)} className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-label="إظهار">
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
            )}
            {mode === "signin" && (
              <div className="flex items-center justify-between text-sm">
                <label className="flex items-center gap-2 text-muted-foreground">
                  <input type="checkbox" defaultChecked className="size-4 accent-gold" /> تذكّرني على هذا الجهاز
                </label>
                <button type="button" className="font-medium text-gold hover:underline" onClick={() => setMode("reset")}>
                  هل نسيت كلمة المرور؟
                </button>
              </div>
            )}
            <Button type="submit" variant="gold" className="h-11 w-full text-base" disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <LogIn />}
              {mode === "signin" ? "تسجيل الدخول" : mode === "signup" ? "إنشاء الحساب" : "إرسال الرابط"}
            </Button>
          </form>

          {mode !== "reset" && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" /> أو <span className="h-px flex-1 bg-border" />
              </div>
              <Button variant="outline" className="h-11 w-full" onClick={() => void google()}>
                المتابعة باستخدام Google
              </Button>
            </>
          )}
          <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? (
              <>
                لديك دعوة؟{" "}
                <button className="font-semibold text-primary hover:underline" onClick={() => setMode("signup")}>
                  أنشئ حسابك
                </button>
              </>
            ) : (
              <button className="font-semibold text-primary hover:underline" onClick={() => setMode("signin")}>
                العودة لتسجيل الدخول
              </button>
            )}
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">الوصول للنظام عبر دعوة من مالك الحساب فقط.</p>
        </div>
        </div>
        <div dir="ltr" className="relative hidden overflow-hidden border-r border-border lg:block">
          <ClientOnly fallback={<div className="h-full bg-background" />}>
            <SignaturePenFooter
              word="Finished"
              title="أهلاً بك في دَرب"
              description="منصة واحدة لإدارة أوامر النقل والرحلات والأسطول والمالية في المملكة. سجّل دخولك لمتابعة عملياتك لحظة بلحظة."
              actions={[]}
              brand="دَرب DARB"
              links={[]}
              theme="dark"
              background="#000000"
              accent="#E8FF1F"
              inkFrom="#F4FF9A"
              inkTo="#E8FF1F"
              height="100svh"
              fontSans='"IBM Plex Sans Arabic", system-ui, sans-serif'
            />
          </ClientOnly>
        </div>
      </div>
  );
}
