import { getLang, localeFor } from "@/lib/i18n/lang";
import { DisplayControls } from "@/components/darb/DisplayControls";
import { PageGuide } from "@/components/darb/PageGuide";
import { alertLink } from "@/lib/alert-links";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  MessageCircle,
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
  ListChecks,
  Activity,
  Eye,
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
import { CommandPalette } from "./CommandPalette";
import { CardArrangement } from './CardArrangement';
import { useScreenNavigate, useScreenPath } from '@/lib/screen-navigation';
import { getPresentationRuntime } from '@/lib/presentation-runtime';

type NavItem = { to: string; label: string; icon: typeof Home; roles?: AppRole[]; group: string };

export const NAV_GROUPS = ["الرئيسية", "العمليات", "الأسطول والصيانة", "المالية والعملاء", "الفريق والتواصل", "الإدارة والإعدادات"];

export const NAV: NavItem[] = [
  { to: "/", label: "الرئيسية", icon: Home , group: NAV_GROUPS[0]! },
  { to: "/operations", label: "العمليات", icon: Cog, roles: ["ops_manager", "dispatcher"] , group: NAV_GROUPS[1]! },
  { to: "/orders", label: "أوامر النقل", icon: FileText, roles: ["ops_manager", "dispatcher", "accountant"] , group: NAV_GROUPS[1]! },
  { to: "/customer-requests", label: "طلبات العملاء", icon: Users, roles: ["ops_manager", "dispatcher"], group: NAV_GROUPS[1]! },
  { to: "/trips", label: "الرحلات", icon: RouteIcon, roles:['ops_manager','dispatcher','fleet_supervisor','accountant'], group: NAV_GROUPS[1]! },
  { to: "/tracking", label: "التتبع", icon: MapPin, roles:['ops_manager','dispatcher','fleet_supervisor'], group: NAV_GROUPS[1]! },
  { to: "/fleet", label: "الأسطول", icon: Truck, roles:['ops_manager','fleet_supervisor','maintenance'], group: NAV_GROUPS[2]! },
  { to: "/drivers", label: "السائقون", icon: User, roles:['ops_manager','fleet_supervisor'], group: NAV_GROUPS[2]! },
  { to: "/custody", label: "العهد والفحص", icon: ClipboardCheck, roles: ["ops_manager", "fleet_supervisor", "maintenance"] , group: NAV_GROUPS[2]! },
  { to: "/documents", label: "المستندات", icon: FolderOpen, roles: ["ops_manager", "fleet_supervisor"] , group: NAV_GROUPS[2]! },
  { to: "/maintenance", label: "الصيانة", icon: Wrench, roles: ["ops_manager", "maintenance", "fleet_supervisor"] , group: NAV_GROUPS[2]! },
  { to: '/repair-center', label: 'مركز الصيانة والورش', icon: Wrench, roles:['ops_manager','maintenance','field_maintenance','workshop','fleet_supervisor'], group:'الأسطول والصيانة' },
  { to: '/maintenance-wallet', label: 'عهدة الصيانة المالية', icon: Coins, roles:['accountant','field_maintenance'], group:'المالية والعملاء' },
  { to: "/expenses", label: "المصروفات", icon: Coins, roles: ["ops_manager", "accountant", "fleet_supervisor"] , group: NAV_GROUPS[3]! },
  { to: "/finance", label: "المالية", icon: Landmark, roles: ["ops_manager", "accountant"] , group: NAV_GROUPS[3]! },
  { to: "/customers", label: "العملاء", icon: Users, roles: ["ops_manager", "accountant", "dispatcher"] , group: NAV_GROUPS[3]! },
  { to: "/incidents", label: "الحوادث والبلاغات", icon: ShieldAlert, roles: ["ops_manager", "fleet_supervisor"] , group: NAV_GROUPS[2]! },
  { to: "/tasks", label: "المهام", icon: ListChecks , group: NAV_GROUPS[4]! },
  { to: "/chat", label: "المحادثات", icon: MessageCircle , group: NAV_GROUPS[4]! },
  { to: "/my-account", label: "حسابي", icon: User , group: NAV_GROUPS[4]! },
  { to: "/my-documents", label: "مستنداتي", icon: FolderOpen , group: NAV_GROUPS[4]! },
  { to: "/activity", label: "متابعة النشاط", icon: Activity, roles: [] , group: NAV_GROUPS[5]! },
  { to: "/reports", label: "التقارير", icon: BarChart3, roles: ["ops_manager", "accountant"] , group: NAV_GROUPS[5]! },
  { to: "/settings", label: "الإعدادات", icon: Settings, roles: [] , group: NAV_GROUPS[5]! },
];

/** Most specific menu entry owning a path; matches whole path segments so "/maintenance" never claims "/maintenance-wallet". */
export function navItemForPath(path: string): NavItem | undefined {
  return NAV.filter((n) => n.to !== "/" && (path === n.to || path.startsWith(n.to + "/")))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

import { roleHome } from "@/lib/role-home";
export { roleHome };

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/** Shows a system notification for alerts that arrive while the app is open (after the user allows it). */
function useBrowserAlerts(rows: { id: string; title: string; body: string }[] | undefined) {
  const [seen] = useState(() => new Set<string>());
  const [primed, setPrimed] = useState(false);
  useEffect(() => {
    if (!rows) return;
    if (!primed) { rows.forEach((r) => seen.add(r.id)); setPrimed(true); return; }
    const fresh = rows.filter((r) => !seen.has(r.id));
    fresh.forEach((r) => seen.add(r.id));
    if (!fresh.length || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    fresh.slice(0, 3).forEach((r) => { try { new Notification(r.title, { body: r.body ?? "", icon: "/shata-original.png", tag: r.id }); } catch { /* ignore */ } });
  }, [rows, primed, seen]);
}

function Notifications() {
  const nav = useNavigate();
  const [openPop, setOpenPop] = useState(false);
  const { data } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await db.from("notifications").select("*").eq("status", "open").order("created_at", { ascending: false }).limit(20);
      return (data ?? []) as { id: string; title: string; body: string; severity: string; entity_type: string | null; entity_id: string | null }[];
    },
  });
  const n = data?.length ?? 0;
  useBrowserAlerts(data);
  return (
    <Popover open={openPop} onOpenChange={setOpenPop}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label="التنبيهات">
          <Bell className="size-5 text-primary" />
          {n > 0 && (
            <span className="num absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-primary-foreground">
              {n}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-4 py-2 text-sm font-bold text-primary"><span>التنبيهات المفتوحة</span>
          {typeof Notification !== "undefined" && Notification.permission === "default" && <button type="button" className="text-xs font-semibold text-gold underline" onClick={() => { if (window.top !== window.self) { toast.info("افتح النظام في نافذة مستقلة لتفعيل التنبيهات"); return; } void Notification.requestPermission().then((p) => toast[p === "granted" ? "success" : "info"](p === "granted" ? "تم تفعيل تنبيهات الجهاز" : "لم يتم السماح بالتنبيهات من المتصفح")); }}>تفعيل تنبيهات الجهاز</button>}
        </div>
        <div className="max-h-80 divide-y overflow-y-auto">
          {n === 0 && <p className="p-4 text-sm text-muted-foreground">لا توجد تنبيهات</p>}
          {data?.map((x) => (
            <button type="button" key={x.id} onClick={() => { const to = alertLink(x.entity_type, x.entity_id); if (to) void nav(to); setOpenPop(false); }} title={alertLink(x.entity_type, x.entity_id) ? "اضغط لفتح التفاصيل" : undefined} className="block w-full space-y-1 px-4 py-2.5 text-start text-sm hover:bg-accent/40">
              <div className="flex items-center gap-2">
                <Badge tone={x.severity === "critical" ? "danger" : x.severity === "warning" ? "warning" : "info"}>
                  {x.severity === "critical" ? "حرج" : x.severity === "warning" ? "تنبيه" : "معلومة"}
                </Badge>
                <span className="font-medium">{x.title}</span>
              </div>
              {x.body && <p className="text-xs text-muted-foreground">{x.body}</p>}
            </button>
          ))}
        </div>
        <Link to="/settings" search={{ tab: "alerts" }} className="block border-t px-4 py-2 text-center text-xs font-medium text-gold">
          إدارة التنبيهات
        </Link>
      </PopoverContent>
    </Popover>
  );
}

/** Live counters for items waiting on someone (RLS scopes them per role). */
function useNavCounts() {
  return useQuery({
    queryKey: ["nav-counts"],
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      const c = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
      const [exp, inc, wo] = await Promise.all([
        c(db.from("expenses").select("id", { count: "exact", head: true }).eq("status", "pending")),
        c(db.from("incidents").select("id", { count: "exact", head: true }).not("status", "in", "(closed,resolved)")),
        c(db.from("work_orders").select("id", { count: "exact", head: true }).not("status", "in", "(done,closed,cancelled)")),
      ]);
      return { "/expenses": exp, "/incidents": inc, "/maintenance": wo } as Record<string, number>;
    },
  });
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth();
  const path = useScreenPath();
  const counts = useNavCounts().data ?? {};
  return (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-5 pt-6 pb-4">
        <Logo light />
        <p className="mt-2 text-xs text-sidebar-foreground/70">نظام إدارة الأسطول والصيانة</p>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((g) => {
          const items = NAV.filter((n) => n.group === g && (!n.roles || can(...n.roles)));
          if (!items.length) return null;
          return (
            <div key={g}>
              {g !== NAV_GROUPS[0] && <p className="mb-1 px-3 text-[11px] font-semibold tracking-wide text-sidebar-foreground/50">{g}</p>}
              <ul className="space-y-0.5">
                {items.map((n) => {
                  const active = n.to === "/" ? path === "/" : path.startsWith(n.to);
                  return (
                    <li key={n.to}>
                      <Link
                        to={n.to}
                        aria-current={active ? 'page' : undefined}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active ? "bg-sidebar-primary text-sidebar-primary-foreground shadow" : "hover:bg-sidebar-accent",
                        )}
                      >
                        <n.icon className="size-5" />
                        <span className="flex-1">{n.label}</span>
                        {!!counts[n.to] && (
                          <span className={cn("num grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px] font-bold", active ? "bg-gold text-gold-foreground" : "bg-warning-soft text-warning")}>{counts[n.to]}</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <RolePreview onNavigate={onNavigate} />
    </nav>
  );
}

export function AppShell({ children, staffOnly = true }: { children: ReactNode; staffOnly?: boolean }) {
  const auth = useAuth();
  const nav = useScreenNavigate();
  const now = useClock();
  const path = useScreenPath();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!auth.ready) return;
    if (!auth.session) void nav({ to: "/login" });
    else if (staffOnly && !auth.isStaff && auth.roles.includes('driver')) void nav({ to: "/driver" });
    else if (staffOnly && !auth.isStaff && auth.roles.includes('representative')) void nav({ to: "/representative" });
    else if (auth.roles.length) {
      // Role-specific home and page guard
      const item = navItemForPath(path);
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

  if (auth.roles.length === 0 && !getPresentationRuntime())
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="panel max-w-md p-8 text-center">
          <Logo className="mb-6 justify-center" />
          <h1 className="text-lg font-bold text-primary">بانتظار منح الصلاحية</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            تم إنشاء حسابك ({auth.session.user.phone || "رقم الجوال غير مضاف"}) لكن لم تُمنح لك صلاحية بعد. يمنح المدير صلاحيات الوصول إلى بيانات الشركة.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => void auth.signOut()}>
            <LogOut /> تسجيل الخروج
          </Button>
        </div>
      </div>
    );

  const roleLabel = auth.roles.map((r) => ROLE_LABELS[r]).join("، ");

  return (
    <div className={cn("app-shell flex min-h-screen", path !== "/" && "internal-ui")} dir="rtl">
      <aside className="app-sidebar sticky top-3 hidden w-64 shrink-0 lg:block">
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
        <header className="app-toolbar sticky top-2 z-30 flex min-w-0 items-center gap-3 px-4 py-2.5">
          <Button variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={() => setOpen(true)} aria-label="القائمة">
            <Menu className="size-5" />
          </Button>
          <div className="hidden min-w-0 items-center gap-4 text-xs text-muted-foreground xl:flex">
            <span className="flex items-center gap-1.5">
              <MapPin className="size-4 text-gold" /> المملكة العربية السعودية
            </span>
            {now && (
              <>
                <span className="flex items-center gap-1.5">
                  <Calendar className="size-4 text-gold" />
                  {new Intl.DateTimeFormat(localeFor(getLang(), "gregory"), { timeZone: "Asia/Riyadh", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now)}
                  <span className="text-xs">({fmtHijri(now)})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="size-4 text-gold" />
                  <span className="num">{fmtTime(now.toISOString())}</span>
                </span>
              </>
            )}
          </div>
          <div className="mr-auto flex min-w-0 items-center gap-2">
            <CommandPalette />
            <DisplayControls />
            <Notifications />
            <div className="hidden min-w-0 max-w-48 text-left sm:block">
              <div className="truncate text-sm font-semibold text-primary">{auth.fullName}</div>
              <div className="truncate text-xs text-muted-foreground">{roleLabel}</div>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <User className="size-4" />
            </div>
            <Button size="icon" variant="ghost" onClick={() => void auth.signOut()} aria-label="تسجيل الخروج" title="تسجيل الخروج">
              <LogOut />
            </Button>
          </div>
        </header>
        {auth.viewAs && (
          <div className="flex items-center justify-center gap-2 bg-warning/15 px-4 py-1.5 text-xs text-warning">
            <Eye className="size-3.5" /> هذا مجرد شكل صفحة «{ROLE_LABELS[auth.viewAs]}» — أنت ما زلت Super Admin
            <button className="underline" onClick={() => { auth.setViewAs(null); void nav({ to: "/" }); }}>رجوع</button>
          </div>
        )}
        <main key={path} data-page={path} className="page-enter min-w-0 flex-1 p-3 pb-24 sm:p-4 sm:pb-24 md:p-6 lg:pb-6"><PageGuide path={path} /><CardArrangement account={auth.session.user.id} path={path}>{children}</CardArrangement></main>
        {(() => {
          // Mobile bar shows only screens this account may open (server rules still enforce access).
          const allowed = (to: string) => { const it = NAV.find((n) => n.to === to); return !!it && (!it.roles || auth.can(...it.roles)); };
          const slots = ["/trips", "/tracking", "/repair-center", "/maintenance", "/tasks", "/chat", "/expenses", "/fleet"].filter(allowed).slice(0, 2).map((to) => NAV.find((n) => n.to === to)!);
          const quick = auth.can("ops_manager", "dispatcher") ? "/orders/new" : allowed("/expenses") ? "/expenses" : null;
          const items = [{ to: "/", label: "الرئيسية", icon: Home }, ...slots];
          return (
            <nav className="fixed inset-x-0 bottom-0 z-40 grid border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden" style={{ gridTemplateColumns: `repeat(${items.length + (quick ? 2 : 1)}, minmax(0, 1fr))` }}>
              {items.slice(0, 2).map((n) => (
                <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", (n.to === "/" ? path === "/" : path.startsWith(n.to)) ? "text-gold" : "text-muted-foreground")}>
                  <n.icon className="size-5" />{n.label}
                </Link>
              ))}
              {quick && (
                <Link to={quick} className="-mt-4 mx-1 flex flex-col items-center justify-center rounded-xl bg-gold py-2 text-[11px] font-semibold text-gold-foreground shadow-lg">
                  <Plus className="size-5" />إجراء سريع
                </Link>
              )}
              {items.slice(2).map((n) => (
                <Link key={n.to} to={n.to} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", path.startsWith(n.to) ? "text-gold" : "text-muted-foreground")}>
                  <n.icon className="size-5" />{n.label}
                </Link>
              ))}
              <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted-foreground">
                <Menu className="size-5" />المزيد
              </button>
            </nav>
          );
        })()}
      </div>
    </div>
  );
}

function RolePreview({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const nav = useNavigate();
  if (!auth.isSuperAdmin) return null;
  const opts: AppRole[] = ["owner", "dispatcher", "accountant", "fleet_supervisor", "maintenance", "field_maintenance", "workshop", "driver", "representative"];
  return (
    <div className="border-t border-sidebar-border px-3 py-3">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] text-sidebar-foreground/60">
        <Eye className="size-3" /> معاينة شكل صفحة كل دور (شكل فقط)
      </div>
      <select
        value={auth.viewAs ?? "owner"}
        onChange={(e) => {
          const r = e.target.value as AppRole;
          auth.setViewAs(r === "owner" ? null : r);
          onNavigate?.();
          void nav({ to: r === "driver" ? "/driver" : roleHome([r]) });
        }}
        className="h-8 w-full rounded-lg border border-sidebar-border bg-sidebar-accent px-2 text-xs text-sidebar-foreground"
      >
        {opts.map((r) => <option key={r} value={r}>{r === "owner" ? "Super Admin (الكل)" : ROLE_LABELS[r]}</option>)}
      </select>
    </div>
  );
}
