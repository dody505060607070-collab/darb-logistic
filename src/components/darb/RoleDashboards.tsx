import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, Coins, FileText, Package, Plus, RefreshCcw, Route as RouteIcon, Truck, Undo2, Users, Wrench, XCircle } from "lucide-react";
import { Badge, DataTable, Empty, Kpi, PageHeader, Panel, Status } from "./ui";
import { db, useRows, type Row } from "@/lib/db";
import { fetchTrips } from "@/lib/queries";
import { daysUntil, fmtDate, fmtSAR, fmtTime } from "@/lib/format";
import type { AppRole } from "@/lib/auth";

/** Which role dashboard "/" shows for a non-admin user, or null for the full admin dashboard. */
export function dashboardFor(roles: AppRole[]): "dispatcher" | "accountant" | "maintenance" | "fleet_supervisor" | null {
  if (roles.includes("owner") || roles.includes("ops_manager")) return null;
  for (const r of ["dispatcher", "accountant", "maintenance", "fleet_supervisor"] as const) if (roles.includes(r)) return r;
  return null;
}

function Action({ to, children, primary }: { to: string; children: ReactNode; primary?: boolean }) {
  return (
    <Link to={to} className={`flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${primary ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"}`}>
      {children}
    </Link>
  );
}
const today = () => new Date().toISOString().slice(0, 10);

export function RoleDashboard({ kind, name }: { kind: NonNullable<ReturnType<typeof dashboardFor>>; name: string }) {
  if (kind === "dispatcher") return <Dispatcher name={name} />;
  if (kind === "accountant") return <Accountant name={name} />;
  if (kind === "maintenance") return <Maintenance name={name} />;
  return <Fleet name={name} />;
}

function Dispatcher({ name }: { name: string }) {
  const trips = useRows(["trips"], fetchTrips);
  const assets = useRows(["assets"], () => db.from("assets").select("id,status,kind"));
  const t = trips.data ?? [];
  const d = today();
  const todays = t.filter((x) => (x.planned_start ?? "").slice(0, 10) === d || x.status === "in_progress");
  const waiting = t.filter((x) => ["draft", "planned"].includes(x.status) && (!x.driver_id || !x.tractor_id));
  const late = t.filter((x) => x.status === "in_progress" && x.planned_end && new Date(x.planned_end) < new Date());
  const free = (assets.data ?? []).filter((a) => a.kind !== "trailer" && a.status === "available").length;
  const exceptions = [
    ...late.map((x) => ({ id: x.id, icon: AlertTriangle, text: `تأخر في الرحلة ${x.number}`, sub: `${x.origin_city} ← ${x.dest_city}` })),
    ...waiting.map((x) => ({ id: x.id, icon: CalendarClock, text: `رحلة ${x.number} بدون موارد`, sub: "تحتاج إلى تخصيص سائق ومركبة" })),
    ...t.filter((x) => x.exception).map((x) => ({ id: x.id, icon: AlertTriangle, text: `${x.number}: ${x.exception}`, sub: "استثناء مسجّل" })),
  ].slice(0, 6);
  return (
    <div className="space-y-5">
      <PageHeader title="لوحة موظف الحركة" subtitle={`أهلاً ${name} — إدارة وتنسيق رحلات الشاحنات اليوم`} icon={<RouteIcon />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="رحلات اليوم" value={todays.length} tone="info" />
        <Kpi label="بانتظار التخصيص" value={waiting.length} tone="warning" />
        <Kpi label="متأخرة" value={late.length} tone="danger" />
        <Kpi label="موارد متاحة" value={free} tone="success" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Action to="/orders/new" primary><Plus className="size-4" /> إنشاء رحلة</Action>
        <Action to="/operations"><Users className="size-4" /> تخصيص الموارد</Action>
      </div>
      <Panel title="رحلات اليوم">
        <DataTable rows={todays} empty="لا توجد رحلات اليوم" cols={[
          { key: "number", label: "رحلة", render: (r: Row) => <Link to="/trips/$id" params={{ id: r.id }} className="font-semibold text-gold">{r.number}</Link> },
          { key: "route", label: "المسار", render: (r: Row) => `${r.origin_city} ← ${r.dest_city}` },
          { key: "driver", label: "السائق", render: (r: Row) => r.driver?.full_name ?? "—" },
          { key: "tractor", label: "الرأس والمقطورة", render: (r: Row) => `${r.tractor?.code ?? "—"} | ${r.trailer?.code ?? "—"}` },
          { key: "planned_start", label: "الموعد", render: (r: Row) => (r.planned_start ? fmtTime(r.planned_start) : "—") },
          { key: "status", label: "الحالة", render: (r: Row) => <Status kind="trip" value={r.status} /> },
        ]} />
      </Panel>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="صندوق الاستثناءات">
          {exceptions.length === 0 ? <Empty text="لا توجد استثناءات" /> : exceptions.map((e, i) => (
            <Link key={e.id + i} to="/trips/$id" params={{ id: e.id }} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
              <e.icon className="size-5 text-warning" /><div><div className="text-sm font-medium">{e.text}</div><div className="text-xs text-muted-foreground">{e.sub}</div></div>
            </Link>
          ))}
        </Panel>
        <Panel title="جدول اليوم">
          {todays.length === 0 ? <Empty text="لا يوجد جدول" /> : [...todays].sort((a, b) => (a.planned_start ?? "").localeCompare(b.planned_start ?? "")).slice(0, 8).map((x) => (
            <div key={x.id} className="flex items-center gap-3 border-b border-border py-2.5 last:border-0">
              <span className="num rounded-lg bg-muted px-2 py-1 text-xs">{x.planned_start ? fmtTime(x.planned_start) : "—"}</span>
              <div className="flex-1 text-sm"><b>{x.number}</b> <span className="text-muted-foreground">{x.origin_city} ← {x.dest_city}</span></div>
              {x.status === "in_progress" ? <CheckCircle2 className="size-4 text-success" /> : null}
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Accountant({ name }: { name: string }) {
  const inv = useRows(["invoices", "acct"], () => db.from("invoices").select("*, customer:customers(name), alloc:payment_allocations(amount)").neq("status", "cancelled").order("issued_at", { ascending: false }).limit(300));
  const pay = useRows(["payments", "acct"], () => db.from("payments").select("*, customer:customers(name)").order("paid_at", { ascending: false }).limit(50));
  const exp = useRows(["expenses", "pending"], () => db.from("expenses").select("*, driver:drivers(full_name)").eq("status", "pending").order("spent_at", { ascending: false }));
  const adv = useRows(["advances", "open"], () => db.from("advances").select("*, driver:drivers(full_name)").eq("status", "open"));
  const due = (r: Row) => Number(r.total) - (r.alloc ?? []).reduce((s: number, a: Row) => s + Number(a.amount), 0);
  const open = (inv.data ?? []).filter((r) => r.status === "approved" && due(r) > 0.005);
  const ages = [[0, 30, "حالية (0–30 يوم)"], [31, 60, "31–60 يوم"], [61, 90, "61–90 يوم"], [91, 1e6, "أكثر من 90 يوم"]] as const;
  const total = open.reduce((s, r) => s + due(r), 0);
  const bucket = ages.map(([a, b, l]) => {
    const v = open.filter((r) => { const d = -(daysUntil(r.due_at ?? r.issued_at) ?? 0); return d >= a && d <= b || (a === 0 && d < 0); }).reduce((s, r) => s + due(r), 0);
    return { l, v, p: total ? Math.round((v / total) * 100) : 0 };
  });
  const sum = (rows: Row[] | undefined) => (rows ?? []).reduce((s, r) => s + Number(r.amount ?? r.balance ?? 0), 0);
  return (
    <div className="space-y-5">
      <PageHeader title="لوحة المحاسب" subtitle={`أهلاً ${name} — نظرة سريعة على الذمم والتحصيلات والمصروفات والسلف`} icon={<Coins />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="مستحقات العملاء" value={fmtSAR(total)} tone="info" />
        <Kpi label="تحصيلات اليوم" value={fmtSAR(sum((pay.data ?? []).filter((p) => p.paid_at === today())))} tone="success" />
        <Kpi label="مصروفات تنتظر الاعتماد" value={fmtSAR(sum(exp.data))} tone="warning" />
        <Kpi label="سلف مفتوحة" value={fmtSAR(sum(adv.data))} tone="gold" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Action to="/finance" primary><Coins className="size-4" /> تسجيل تحصيل</Action>
        <Action to="/expenses"><ClipboardCheck className="size-4" /> مراجعة المصروفات</Action>
        <Action to="/finance"><FileText className="size-4" /> إنشاء مسودة فاتورة</Action>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="بنود بانتظار الاعتماد" className="lg:col-span-2">
          <DataTable rows={[...(exp.data ?? []).map((e) => ({ ...e, _t: "مصروف" })), ...(adv.data ?? []).map((a) => ({ ...a, _t: "سلفة", category: "سلفة تشغيلية", spent_at: a.issued_at }))]} empty="لا توجد بنود معلقة" cols={[
            { key: "_t", label: "النوع", render: (r: Row) => <Badge tone={r._t === "سلفة" ? "warning" : "success"}>{r._t}</Badge> },
            { key: "category", label: "الوصف", render: (r: Row) => r.description ?? r.category },
            { key: "driver", label: "مقدم الطلب", render: (r: Row) => r.driver?.full_name ?? "—" },
            { key: "amount", label: "المبلغ", render: (r: Row) => fmtSAR(r.amount) },
            { key: "spent_at", label: "التاريخ", render: (r: Row) => fmtDate(r.spent_at) },
          ]} />
        </Panel>
        <Panel title="أعمار مستحقات العملاء">
          {bucket.map((b) => (
            <div key={b.l} className="flex items-center justify-between border-b border-border py-2.5 text-sm last:border-0">
              <span>{b.l}</span><Badge tone="neutral" dot={false}>{b.p}%</Badge><span className="num">{fmtSAR(b.v)}</span>
            </div>
          ))}
        </Panel>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="أحدث الفواتير">
          <DataTable rows={(inv.data ?? []).slice(0, 6)} empty="لا توجد فواتير" cols={[
            { key: "number", label: "رقم الفاتورة" },
            { key: "customer", label: "العميل", render: (r: Row) => r.customer?.name ?? "—" },
            { key: "total", label: "المبلغ", render: (r: Row) => fmtSAR(r.total) },
            { key: "issued_at", label: "التاريخ", render: (r: Row) => fmtDate(r.issued_at) },
            { key: "s", label: "الحالة", render: (r: Row) => r.status === "draft" ? <Badge tone="neutral">مسودة</Badge> : due(r) > 0.005 ? <Badge tone="warning">مفتوحة</Badge> : <Badge tone="success">مسددة</Badge> },
          ]} />
        </Panel>
        <Panel title="التحصيلات الواردة">
          <DataTable rows={(pay.data ?? []).slice(0, 6)} empty="لا توجد تحصيلات" cols={[
            { key: "paid_at", label: "التاريخ", render: (r: Row) => fmtDate(r.paid_at) },
            { key: "customer", label: "العميل", render: (r: Row) => r.customer?.name ?? "—" },
            { key: "amount", label: "المبلغ", render: (r: Row) => fmtSAR(r.amount) },
          ]} />
        </Panel>
      </div>
    </div>
  );
}

const WO_COLS = [["open", "جديدة"], ["in_progress", "جارٍ الإصلاح"], ["waiting_parts", "انتظار قطع"]] as const;

function Maintenance({ name }: { name: string }) {
  const wo = useRows(["work_orders", "board"], () => db.from("work_orders").select("*, asset:assets(code,kind,status)").not("status", "in", "(completed,closed)").order("opened_at", { ascending: false }));
  const parts = useRows(["parts"], () => db.from("parts").select("*").order("name"));
  const plans = useRows(["maintenance_plans"], () => db.from("maintenance_plans").select("*, asset:assets(code,odometer_km)"));
  const insp = useRows(["inspections", "critical"], () => db.from("inspections").select("id").eq("has_critical", true).eq("resolved", false));
  const w = wo.data ?? [];
  const low = (parts.data ?? []).filter((p) => Number(p.qty_on_hand) <= Number(p.reorder_level));
  const upcoming = (plans.data ?? []).map((p): Row => {
    const byDays = p.interval_days && p.last_done_at ? new Date(new Date(p.last_done_at).getTime() + p.interval_days * 864e5) : null;
    return { ...p, next: byDays };
  }).filter((p) => p.next).sort((a, b) => +a.next! - +b.next!).slice(0, 5);
  const notReady = w.filter((x) => ["maintenance", "stopped"].includes(x.asset?.status));
  return (
    <div className="space-y-5">
      <PageHeader title="لوحة مسؤول الصيانة" subtitle={`أهلاً ${name} — أوامر الصيانة والأعطال والصيانة الدورية وقطع الغيار`} icon={<Wrench />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="أوامر مفتوحة" value={w.length} tone="info" />
        <Kpi label="أعطال حرجة" value={(insp.data ?? []).length} tone="danger" />
        <Kpi label="صيانة مستحقة" value={upcoming.filter((p) => p.next! <= new Date(Date.now() + 7 * 864e5)).length} tone="success" />
        <Kpi label="انتظار قطع" value={w.filter((x) => x.status === "waiting_parts").length} tone="warning" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Action to="/maintenance" primary><Plus className="size-4" /> أمر صيانة جديد</Action>
        <Action to="/maintenance"><Package className="size-4" /> صرف قطعة</Action>
        <Action to="/custody"><RefreshCcw className="size-4" /> إعادة فحص</Action>
      </div>
      <Panel title="لوحة أوامر الصيانة">
        <div className="grid gap-3 md:grid-cols-3">
          {WO_COLS.map(([s, l]) => {
            const list = w.filter((x) => (s === "open" ? ["open", "diagnosis"].includes(x.status) : x.status === s));
            return (
              <div key={s} className="rounded-2xl bg-muted/40 p-3">
                <div className="mb-2 text-sm font-bold">{l} ({list.length})</div>
                {list.length === 0 ? <p className="text-xs text-muted-foreground">لا يوجد</p> : list.map((x) => (
                  <div key={x.id} className="mb-2 rounded-xl border border-border bg-card p-3">
                    <div className="text-xs text-muted-foreground">{x.number}</div>
                    <div className="text-sm font-semibold">{x.asset?.code}</div>
                    <div className="text-xs">{x.description}</div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Panel>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="مخزون منخفض">
          {low.length === 0 ? <Empty text="المخزون كافٍ" /> : low.map((p) => (
            <div key={p.id} className="flex justify-between border-b border-border py-2 text-sm last:border-0"><span>{p.name}</span><Badge tone="danger" dot={false}>{p.qty_on_hand}</Badge></div>
          ))}
        </Panel>
        <Panel title="الصيانة القادمة">
          {upcoming.length === 0 ? <Empty text="لا توجد خطط" /> : upcoming.map((p) => (
            <div key={p.id} className="flex justify-between border-b border-border py-2 text-sm last:border-0"><span><b>{p.asset?.code}</b> — {p.title}</span><Badge tone="success" dot={false}>{fmtDate(p.next!.toISOString())}</Badge></div>
          ))}
        </Panel>
        <Panel title="أصل غير جاهز للتشغيل">
          {notReady.length === 0 ? <Empty text="كل الأصول جاهزة" /> : notReady.slice(0, 4).map((x) => (
            <div key={x.id} className="mb-2 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm">
              <div className="flex items-center gap-2 font-semibold"><Truck className="size-4" />{x.asset?.code} <Badge tone="danger">غير جاهز</Badge></div>
              <div className="text-xs">العطل: {x.description} — {x.number}</div>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Fleet({ name }: { name: string }) {
  const assets = useRows(["assets"], () => db.from("assets").select("*").order("code"));
  const cust = useRows(["custody", "open"], () => db.from("custody").select("*, driver:drivers(full_name)").is("closed_at", null));
  const docs = useRows(["documents", "expiring"], () => db.from("documents").select("*").lte("expiry_date", new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)).order("expiry_date"));
  const insp = useRows(["inspections", "critical-list"], () => db.from("inspections").select("*, asset:assets(code)").eq("has_critical", true).eq("resolved", false));
  const a = (assets.data ?? []);
  const holder = (id: string) => (cust.data ?? []).find((c) => c.asset_id === id)?.driver?.full_name ?? "—";
  const docSoon = (id: string) => (docs.data ?? []).find((d) => d.entity_id === id && (daysUntil(d.expiry_date) ?? 99) <= 7);
  const crit = (id: string) => (insp.data ?? []).find((i) => i.asset_id === id);
  const ready = (r: Row) => crit(r.id) || ["maintenance", "stopped"].includes(r.status) ? "no" : docSoon(r.id) ? "limited" : "yes";
  return (
    <div className="space-y-5">
      <PageHeader title="لوحة مشرف الأسطول" subtitle={`أهلاً ${name} — جاهزية الأسطول والعهد والفحوصات والوثائق`} icon={<Truck />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="مركبات متاحة" value={a.filter((x) => x.status === "available").length} tone="success" />
        <Kpi label="عهد مفتوحة" value={(cust.data ?? []).length} tone="info" />
        <Kpi label="وثائق تنتهي قريباً" value={(docs.data ?? []).length} tone="warning" />
        <Kpi label="فحوصات معلقة" value={(insp.data ?? []).length} tone="danger" />
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Action to="/custody" primary><Truck className="size-4" /> تسليم مركبة</Action>
        <Action to="/custody"><Undo2 className="size-4" /> استلام مرتجع</Action>
        <Action to="/custody"><ClipboardCheck className="size-4" /> مراجعة الفحص</Action>
        <Action to="/documents"><Users className="size-4" /> إدارة التفويضات</Action>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="جاهزية الأسطول">
          <DataTable rows={a} empty="لا توجد مركبات" cols={[
            { key: "code", label: "المركبة / المقطورة", render: (r: Row) => <Link to="/fleet/$id" params={{ id: r.id }} className="font-semibold text-gold">{r.code}</Link> },
            { key: "driver", label: "السائق", render: (r: Row) => holder(r.id) },
            { key: "ready", label: "الجاهزية", render: (r: Row) => ready(r) === "yes" ? <Badge tone="success"><CheckCircle2 className="size-3" /> جاهزة</Badge> : ready(r) === "limited" ? <Badge tone="warning">جاهزية محدودة</Badge> : <Badge tone="danger"><XCircle className="size-3" /> غير جاهزة</Badge> },
            { key: "why", label: "السبب", render: (r: Row) => crit(r.id) ? "فحص حرج غير محلول" : r.status === "maintenance" ? "قيد الصيانة" : r.status === "stopped" ? "موقوفة" : docSoon(r.id) ? `وثيقة تنتهي ${fmtDate(docSoon(r.id)?.expiry_date)}` : "—" },
          ]} />
        </Panel>
        <Panel title="الأولويات اليوم">
          <div className="mb-2 text-sm font-bold">وثائق تنتهي قريباً ({(docs.data ?? []).length})</div>
          {(docs.data ?? []).slice(0, 5).map((d) => (
            <div key={d.id} className="flex justify-between border-b border-border py-2 text-sm"><span>{d.number ?? d.doc_type}</span><Badge tone="warning" dot={false}>{(daysUntil(d.expiry_date) ?? 0) < 0 ? "منتهية" : `بعد ${daysUntil(d.expiry_date)} أيام`}</Badge></div>
          ))}
          <div className="mt-4 mb-2 text-sm font-bold">فحوصات حرجة غير محلولة ({(insp.data ?? []).length})</div>
          {(insp.data ?? []).map((i) => (
            <div key={i.id} className="flex justify-between border-b border-border py-2 text-sm"><span>{i.asset?.code} — {i.kind}</span><Badge tone="danger" dot={false}>متأخر</Badge></div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
