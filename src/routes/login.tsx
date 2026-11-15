import { DisplayControls } from "@/components/darb/DisplayControls";
import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { roleHome } from "@/lib/role-home";
import { Logo } from "@/components/darb/Logo";
import { ClientOnly } from "@tanstack/react-router";

import loginHero from '@/assets/login-hero-dusk.jpg';
import { ShieldCheck } from 'lucide-react';
import { PhoneLogin } from '@/components/darb/PhoneLogin';

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول | Shata" },
      { name: "description", content: "تسجيل الدخول إلى Shata لإدارة الأسطول والصيانة." },
      { property: "og:title", content: "تسجيل الدخول | Shata" },
      { property: "og:description", content: "الدخول الآمن بالجوال إلى نظام Shata." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:url", content: "https://darb.website/login" },
    ],
    links: [{ rel: 'canonical', href: 'https://darb.website/login' }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const auth = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (auth.ready && auth.session) {
      // Each job opens straight on its own page.
      void nav({ to: roleHome(auth.roles) });
    }
  }, [auth.ready, auth.session, auth.roles, nav]);

  return (
    <div dir="rtl" className="grid min-h-svh bg-background lg:grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)]">
      <section aria-labelledby="login-title" className="relative flex min-w-0 flex-col px-5 pb-6 pt-5 sm:px-10 lg:px-14">
        <div className="flex justify-end"><DisplayControls /></div>
        <div className="mx-auto flex w-full max-w-[34rem] flex-1 flex-col justify-center py-8">
          <Logo className="mb-8 justify-center [&_img]:h-[150px] [&_img]:w-[206px] sm:[&_img]:h-[178px] sm:[&_img]:w-[244px]" />
          <h1 id="login-title" className="text-center text-4xl font-bold leading-tight text-primary sm:text-5xl">مرحبًا بعودتك</h1>
          <p className="mt-3 text-center text-lg text-muted-foreground sm:text-xl">سجّل دخولك لمتابعة أعمالك.</p>
          <div className="mt-6 flex justify-center">
            <span className="glass-chip inline-flex items-center gap-2 rounded-full px-5 py-2 text-sm font-medium text-foreground"><ShieldCheck className="size-4 text-primary" aria-hidden />دخول آمن</span>
          </div>
          <div className="mt-8">
            <ClientOnly fallback={<div className="h-[230px]" aria-hidden />}>
              <PhoneLogin />
            </ClientOnly>
          </div>
          <hr className="my-7 border-border" />
          <p className="text-center text-sm text-muted-foreground">صلاحيات الحساب تُحدد من إدارة الشركة.</p>
        </div>
        <p className="text-center text-sm text-muted-foreground">شركة شاتا الصناعية © <span className="num">{new Date().getFullYear()}</span></p>
      </section>
      <aside className="relative order-first hidden min-h-svh overflow-hidden lg:order-none lg:block" aria-label="إدارة الأسطول والصيانة">
        <img src={loginHero} alt="شاحنة على طريق سريع نحو الرياض عند الغروب" width={1152} height={1440} fetchPriority="high" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
        <div className="login-hero-shade absolute inset-0" aria-hidden />
        <div className="relative flex flex-col items-start gap-6 p-10 pt-28 xl:p-16 xl:pt-28">
          <span className="login-hero-badge inline-flex items-center gap-3 rounded-full px-6 py-3 text-lg font-semibold"><span className="h-6 w-1 rounded-full bg-brand-red" aria-hidden />إدارة الأسطول والصيانة</span>
          <h2 className="login-hero-text text-5xl font-bold leading-[1.25] xl:text-6xl">كل رحلة تبدأ بخطوة</h2>
          <p className="login-hero-text text-xl opacity-90 xl:text-2xl">أسطولك وعملياتك في مكان واحد.</p>
        </div>
      </aside>
    </div>
  );
}
