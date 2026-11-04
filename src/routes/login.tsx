import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { Logo } from "@/components/darb/Logo";
import { ClientOnly } from "@tanstack/react-router";
import { ThemeToggle, useThemeMode } from "@/components/darb/ThemeToggle";
import SignaturePenFooter from "@/components/ui/signature-pen-footer";
import { PhoneLogin } from '@/components/darb/PhoneLogin';

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول — دَرب" },
      { name: "description", content: "تسجيل الدخول إلى نظام دَرب لإدارة عمليات النقل البري والأسطول." },
      { property: "og:title", content: "تسجيل الدخول — دَرب" },
      { property: "og:description", content: "الدخول إلى نظام دَرب لإدارة النقل البري." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const auth = useAuth();
  const theme = useThemeMode();
  const nav = useNavigate();

  useEffect(() => {
    if (auth.ready && auth.session) void nav({ to: auth.isStaff || auth.roles.length === 0 ? "/" : "/driver" });
  }, [auth.ready, auth.session, auth.isStaff, auth.roles, nav]);

  const light = theme.mode === "light";
  return (
    <div dir="ltr" className="relative min-h-screen bg-background">
      <ThemeToggle className="absolute top-4 left-4 z-20" />
      <ClientOnly fallback={<div className="min-h-screen bg-background" />}>
        <SignaturePenFooter
          word="دَرب"
          logo={<Logo />}
          title=""
          description=""
          actions={[]}
          brand=""
          links={[]}
          legal="© دَرب DARB"
          stamp=""
          theme={light ? "light" : "dark"}
          background={light ? "#F7F8F2" : "#000000"}
          accent={light ? "#6E8F12" : "#E8FF1F"}
          inkFrom={light ? "#9BBE1E" : "#F4FF9A"}
          inkTo={light ? "#5E7D0B" : "#E8FF1F"}
          height="100svh"
          fontSans='"IBM Plex Sans Arabic", system-ui, sans-serif'
        >
          <div dir="rtl" className="panel w-full max-w-md p-6 sm:p-8">
            <h1 className="text-center text-2xl font-bold text-primary">
              تسجيل الدخول إلى نظام دَرب
            </h1>
            <p className="mt-1 mb-8 text-center text-sm text-muted-foreground">إدارة عمليات النقل البري والأسطول</p>

            <PhoneLogin />
            <p className="mt-3 text-center text-xs text-muted-foreground">صلاحيات الشركة تُمنح من المدير فقط.</p>
          </div>
        </SignaturePenFooter>
      </ClientOnly>
    </div>
  );
}
