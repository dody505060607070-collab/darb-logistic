import { LanguageToggle } from "@/components/darb/LanguageLayer";
import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/darb/Logo";
import { ClientOnly } from "@tanstack/react-router";
import { ThemeToggle } from "@/components/darb/ThemeToggle";
import loginTruck from '@/assets/login-truck.jpg';
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
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const auth = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (auth.ready && auth.session) {
      const executive = auth.roles.includes('owner') || auth.roles.includes('ops_manager');
      const workshop = !executive && (auth.roles.includes('workshop') || auth.roles.includes('field_maintenance'));
      void nav({ to: workshop ? '/repair-center' : auth.isStaff || auth.roles.length === 0 ? '/' : '/driver' });
    }
  }, [auth.ready, auth.session, auth.isStaff, auth.roles, nav]);

  return (
    <div dir="rtl" className="relative flex min-h-screen items-center justify-center bg-background px-4 py-16">
      <img src={loginTruck} alt="أسطول الشاحنات" className="absolute inset-0 h-full w-full object-cover opacity-15" />
      <ThemeToggle className="absolute top-4 left-4 z-20" />
      <ClientOnly fallback={<div className="min-h-screen bg-background" />}>
          <div dir="rtl" className="panel relative w-full max-w-md p-6 sm:p-8">
            <div className="mb-2 flex justify-end"><LanguageToggle /></div>
            <Logo className="mb-8 justify-center" />
            <h1 className="text-center text-2xl font-bold text-primary">
              تسجيل الدخول
            </h1>
            <p className="mt-1 mb-8 text-center text-sm text-muted-foreground">Shata — نظام إدارة الأسطول والصيانة</p>

            <PhoneLogin />
            <p className="mt-3 text-center text-xs text-muted-foreground">صلاحيات الشركة تُمنح من المدير فقط.</p>
          </div>
      </ClientOnly>
    </div>
  );
}
