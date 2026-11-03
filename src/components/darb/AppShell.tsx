import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BarChart3,
  Calendar,
  ClipboardCheck,
  Clock,
  Coins,
  FileText,
  FolderOpen,
  Home,
  Landmark,
  LogOut,
  MapPin,
  Menu,
  Route as RouteIcon,
  Settings,
  ShieldAlert,
  Truck,
  User,
  Users,
  Wrench,
  X,
  Cog,
  Loader2,
  Plus,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth, ROLE_LABELS, type AppRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtHijri, fmtTime } from "@/lib/format";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "./ui";

type NavItem = { to: string; label: string; icon: typeof Home; roles?: AppRole[] };

export const NAV: NavItem[] = [
  { to: "/", label: "الرئيسية", icon: Home },
  { to: "/operations", label: "العمليات", icon: Cog, roles: ["ops_manager", "dispatcher"] },
  { to: "/orders", label: "أوامر النقل", icon: FileText, roles: ["ops_manager", "dispatcher", "accountant"] },
  { to: "/trips", label: "الرحلات", icon: RouteIcon },
  { to: "/tracking", label: "التتبع", icon: MapPin },
  { to: "/fleet", label: "الأسطول", icon: Truck },
  { to: "/drivers", label: "السائقون", icon: User },
  { to: "/custody", label: "العهد والفحص", icon: ClipboardCheck, roles: ["ops_manager", "fleet_supervisor", "maintenance"] },
  { to: "/documents", label: "المستندات", icon: FolderOpen, roles: ["ops_manager", "fleet_supervisor"] },
  { to: "/maintenance", label: "الصيانة", icon: Wrench, roles: ["ops_manager", "maintenance", "fleet_supervisor"] },
  { to: "/expenses", label: "المصروفات", icon: Coins, roles: ["ops_manager", "accountant", "fleet_supervisor"] },
  { to: "/finance", label: "المالية", icon: Landmark, roles: ["ops_manager", "accountant"] },
  { to: "/customers", label: "العملاء", icon: Users, roles: ["ops_manager", "accountant", "dispatcher"] },
  { to: "/incidents", label: "الحوادث والبلاغات", icon: ShieldAlert, roles: ["ops_manager", "fleet_supervisor"] },
  { to: "/reports", label: "التقارير", icon: BarChart3, roles: ["ops_manager", "accountant"] },
  { to: "/settings", label: "الإعدادات", icon: Settings, roles: [] },
];

/** Landing page per role: owners/ops managers keep the full dashboard. */
export function roleHome(roles: AppRole[]): string {
  if (roles.includes("owner") || roles.includes("ops_manager")) return "/";
  if (roles.includes("dispatcher")) return "/operations";
  if (roles.includes("accountant")) return "/finance";
  if (roles.includes("maintenance")) return "/maintenance";
  if (roles.includes("fleet_supervisor")) return "/fleet";
  return "/";
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Notifications() {
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await db.from("notifications").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(20);
      return (data ?? []) as { id: string; title: string; body: string; severity: string }[];
    },
  });
  const n = data?.length ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative rounded-full p-2 hover:bg-muted" aria-label="التنبيهات">
          <Bell className="size-5 text-primary" />
          {n > 0 && (
            <span className="num absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-primary-foreground">
              {n}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" align="end" className="w-80 p-0">
        <div className="border-b px-4 py-2 text-sm font-bold text-primary">التنبيهات المفتوحة</div>
        <div className="max-h-80 divide-y overflow-y-auto">
          {n === 0 && <p className="p-4 text-sm text-muted-foreground">لا توجد تنبيهات</p>}
          {data?.map((x) => (
            <div key={x.id} className="space-y-1 px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <Badge tone={x.severity === "critical" ? "danger" : x.severity === "warning" ? "warning" : "info"}>
                  {x.severity === "critical" ? "حرج" : x.severity === "warning" ? "تنبيه" : "معلومة"}
                </Badge>
                <span className="font-medium">{x.title}</span>
              </div>
              {x.body && <p className="text-xs text-muted-foreground">{x.body}</p>}
            </div>
          ))}
        </div>
        <Link to="/settings" search={{ tab: "alerts" }} className="block border-t px-4 py-2 text-center text-xs font-medium text-gold">
          إدارة التنبيهات
        </Link>
      </PopoverContent>
    </Popover>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 pt-6 pb-4">
        <Logo light />
        <p className="mt-2 text-xs text-sidebar-foreground/70">إدارة عمليات النقل والشاحنات</p>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {NAV.filter((n) => !n.roles || can(...n.roles)).map((n) => {
          const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
          return (
            <li key={n.to}>
              <Link
                to={n.to}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow" : "hover:bg-sidebar-accent",
                )}
              >
                <n.icon className="size-5" />
                {n.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function AppShell({ children, staffOnly = true }: { children: ReactNode; staffOnly?: boolean }) {
  const auth = useAuth();
  const nav = useNavigate();
  const now = useClock();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.session) void nav({ to: "/login" });
    else if (staffOnly && !auth.isStaff && auth.roles.includes("driver")) void nav({ to: "/driver" });
    else if (auth.roles.length) {
      // Role-specific home and page guard
      const item = NAV.filter((n) => n.to !== "/").find((n) => path.startsWith(n.to));
      const home = roleHome(auth.roles);
      if (path === "/" && home !== "/") void nav({ to: home });
      else if (item?.roles && !auth.can(...item.roles)) void nav({ to: home });
    }
  }, [auth.ready, auth.session, auth.isStaff, auth.roles, staffOnly, nav, path]);

  if (!auth.ready || !auth.session)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" />
      </div>
    );

  if (auth.roles.length === 0)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="panel max-w-md p-8 text-center">
          <Logo className="mb-6 justify-center" />
          <h1 className="text-lg font-bold text-primary">بانتظار منح الصلاحية</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            تم إنشاء حسابك ({auth.session.user.email}) لكن لم تُمنح لك صلاحية بعد. التسجيل في دَرب يتم عبر دعوة من مالك الحساب.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void auth.signOut()}>
            <LogOut /> تسجيل الخروج
          </Button>
        </div>
      </div>
    );

  const roleLabel = auth.roles.map((r) => ROLE_LABELS[r]).join("، ");

  return (
    <div className="flex min-h-screen bg-background" dir="rtl">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
        <Sidebar />
      </aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setOpen(false)} />
          <div className="absolute top-0 right-0 h-full w-72">
            <button className="absolute top-4 left-4 z-10 text-sidebar-foreground" onClick={() => setOpen(false)} aria-label="إغلاق">
              <X />
            </button>
            <Sidebar onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card/95 px-4 py-2.5 backdrop-blur">
          <button className="rounded-md p-2 hover:bg-muted lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة">
            <Menu className="size-5" />
          </button>
          <div className="hidden items-center gap-4 text-sm text-muted-foreground md:flex">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 text-gold" /> المملكة العربية السعودية
            </span>
            {now && (
              <>
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-4 text-gold" />
                  {new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}
                  <span className="text-xs">({fmtHijri(now)})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-gold" />
                  <span className="num">{fmtTime(now.toISOString())}</span>
                </span>
              </>
            )}
          </div>
          <div className="mr-auto flex items-center gap-2">
            <Notifications />
            <div className="hidden text-left sm:block">
              <div className="text-sm font-semibold text-primary">{auth.fullName}</div>
              <div className="text-xs text-muted-foreground">{roleLabel}</div>
            </div>
            <div className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <User className="size-4" />
            </div>
            <Button size="icon" variant="ghost" onClick={() => void auth.signOut()} aria-label="تسجيل الخروج" title="تسجيل الخروج">
              <LogOut />
            </Button>
          </div>
        </header>
        <main key={path} className="page-enter min-w-0 flex-1 p-3 pb-24 sm:p-4 sm:pb-24 md:p-6 lg:pb-6">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
          {[
            { to: "/", label: "الرئيسية", icon: Home },
            { to: "/trips", label: "الرحلات", icon: RouteIcon },
          ].map((n) => (
            <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", (n.to === "/" ? path === "/" : path.startsWith(n.to)) ? "text-gold" : "text-muted-foreground")}>
              <n.icon className="size-5" />{n.label}
            </Link>
          ))}
          <Link to={auth.can("ops_manager", "dispatcher") ? "/orders/new" : "/expenses"} className="-mt-4 mx-1 flex flex-col items-center justify-center rounded-xl bg-gold py-2 text-[11px] font-semibold text-gold-foreground shadow-lg">
            <Plus className="size-5" />إجراء سريع
          </Link>
          <Link to="/tracking" className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", path.startsWith("/tracking") ? "text-gold" : "text-muted-foreground")}>
            <MapPin className="size-5" />التتبع
          </Link>
          <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
            <Menu className="size-5" />المزيد
          </button>
        </nav>
      </div>
    </div>
  );
}
