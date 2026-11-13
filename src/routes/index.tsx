import truck3d from "@/assets/truck-3d.jpg";
import { lazy, Suspense, useMemo } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ArrowLeft, BarChart3, Coins, Gauge, Route as RouteIcon, Truck, Container } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, Kpi, Panel, Status, Loading } from "@/components/darb/ui";
import { useRows, type Row } from "@/lib/db";
import { fetchAssets, fetchFinancials, fetchTrips } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { CITY_COORDS, daysUntil, fmtNum, fmtSAR, fmtTime } from "@/lib/format";
import { db } from "@/lib/db";
import { ClientOnly } from "@tanstack/react-router";
import { dashboardFor, RoleDashboard } from "@/components/darb/RoleDashboards";
import { CrmDashboard } from '@/components/darb/CrmDashboard';

const MapView = lazy(() => import("@/components/darb/MapView"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الصفحة الرئيسية وإدارة علاقات العملاء — Shata" },
      { name: "description", content: "مؤشرات تشغيل Shata وإدارة العملاء وفرص البيع والتواصل والمتابعات." },
      { property: "og:title", content: "الصفحة الرئيسية وإدارة علاقات العملاء — Shata" },
      { property: "og:description", content: "لوحات التشغيل والعملاء ومسار المبيعات والمتابعات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Home />
    </AppShell>
  ),
});

function Home() {
  const { roles, fullName, can } = useAuth();
  const kind = dashboardFor(roles);
  return <>{kind ? <RoleDashboard kind={kind} name={fullName} /> : <Dashboard />}{can('ops_manager','accountant') && <CrmDashboard />}</>;
}

function Dashboard() {
  const { can, fullName } = useAuth();
  const nav = useNavigate();
  const trips = useRows(["trips"], fetchTrips);
  const assets = useRows(["assets"], fetchAssets);
  const showFin = can("ops_manager", "accountant");
  const fin = useRows(["trip_financials"], fetchFinancials, showFin);
  const docs = useRows(["documents", "expiring"], () =>
    db.from("documents").select("*").lte("expiry_date", new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)).order("expiry_date"),
  );
  const wos = useRows(["work_orders", "open"], () =>
    db.from("work_orders").select("*, asset:assets(code)").not("status", "in", "(completed,closed)"),
  );

  const t = trips.data ?? [];
  const a = assets.data ?? [];
  const active = t.filter((x) => x.status === "in_progress");
  const tractors = a.filter((x) => x.kind !== "trailer");
  const trailers = a.filter((x) => x.kind === "trailer");
  const count = (list: Row[], s: string) => list.filter((x) => x.status === s).length;
  const today = new Date().toISOString().slice(0, 10);
  const todayTrips = t.filter((x) => (x.actual_start ?? x.planned_start ?? "").slice(0, 10) === today || x.status === "in_progress");
  const late = active.filter((x) => x.planned_end && new Date(x.planned_end) < new Date());
  const delivered = t.filter((x) => ["delivered", "closed"].includes(x.status));
  const onTime = delivered.filter((x) => x.actual_end && x.order?.delivery_due_at && new Date(x.actual_end) <= new Date(x.order.delivery_due_at));
  const onTimePct = delivered.length ? Math.round((onTime.length / delivered.length) * 100) : null;
  const utilization = tractors.length ? Math.round((count(tractors, "active") / tractors.length) * 100) : null;

  const finSum = useMemo(() => {
    const ids = new Set(active.map((x) => x.id));
    const rows = (fin.data ?? []).filter((f) => ids.has(f.trip_id));
    const rev = rows.reduce((s, r) => s + Number(r.revenue), 0);
    const cost = rows.reduce((s, r) => s + Number(r.est_cost) + Number(r.carrier_cost), 0);
    return { rev, cost, margin: rev - cost, pct: rev ? ((rev - cost) / rev) * 100 : null };
  }, [fin.data, active]);

  const markers = useMemo(
    () =>
      a
        .filter((x) => x.kind !== "trailer" && x.last_lat && x.last_lng)
        .map((x) => ({
          id: x.id,
          lat: x.last_lat,
          lng: x.last_lng,
          label: x.code,
          color: (x.status === "active" ? "green" : x.status === "maintenance" ? "gold" : x.status === "stopped" ? "red" : "blue") as "green",
          popup: `${x.code} — ${x.location_text ?? ""}`,
        })),
    [a],
  );
  const lines = useMemo(
    () =>
      active
        .map((x) => {
          const o = CITY_COORDS[x.origin_city];
          const d = CITY_COORDS[x.dest_city];
          return o && d ? { id: x.id, points: [o, d] as [number, number][], dashed: true } : null;
        })
        .filter(Boolean) as { id: string; points: [number, number][]; dashed: boolean }[],
    [active],
  );

  const alerts: { tone: "danger" | "warning" | "info"; tag: string; text: string }[] = [
    ...late.map((x) => ({ tone: "warning" as const, tag: "تأخير", text: `الرحلة ${x.number} تجاوزت موعد الوصول المخطط` })),
    ...(wos.data ?? []).map((w) => ({ tone: "warning" as const, tag: "صيانة", text: `${w.asset?.code}: ${w.description}` })),
    ...(docs.data ?? []).map((d) => {
      const n = daysUntil(d.expiry_date) ?? 0;
      return { tone: n < 0 ? ("danger" as const) : ("info" as const), tag: n < 0 ? "منتهٍ" : "مستند", text: `${d.doc_type} ${d.number ?? ""} ${n < 0 ? "منتهٍ" : `ينتهي خلال ${n} يوم`}` };
    }),
  ];

  const current = active[0];

  return (
    <div className="space-y-5">
      <section className="bento bento-glass relative min-h-[220px] overflow-hidden">
        <img src={truck3d} alt="شاحنة Shata على طريق سريع في المملكة" width={1536} height={768} className="absolute inset-0 h-full w-full object-cover opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-l from-background via-background/70 to-transparent" />
        <div className="relative flex h-full max-w-xl flex-col gap-3 p-6 md:p-8">
          <span className="chip w-fit">ملخص الصباح</span>
          <h1 className="text-3xl font-bold text-foreground md:text-4xl">Shata</h1>
          <p className="font-medium">{greeting()}، {fullName?.split(' ')[0]??''} — نظام إدارة الأسطول والصيانة</p>
          <p className="text-sm leading-7 text-muted-foreground">
            لديك <b className="text-foreground">{fmtNum(active.length)}</b> رحلة نشطة و<b className="text-foreground">{fmtNum(todayTrips.length)}</b> رحلة اليوم
            {late.length ? <> — <b className="text-warning">{fmtNum(late.length)} متأخرة</b> تحتاج متابعة</> : <> — لا توجد رحلات متأخرة</>}.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link to="/operations" className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:brightness-110">غرفة العمليات</Link>
            <Link to="/tracking" className="rounded-full border border-foreground/20 bg-background/40 px-4 py-2 text-sm font-semibold backdrop-blur transition hover:border-primary">التتبع المباشر</Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="col-span-2 flex items-center gap-3 md:col-span-1">
          <Truck className="size-8 text-gold" />
          <div className="text-lg font-bold text-primary">التشغيل اليوم</div>
        </div>
        <Kpi label="الرحلات النشطة" value={fmtNum(active.length)} />
        <Kpi label="رحلات اليوم" value={fmtNum(todayTrips.length)} />
        <Kpi label="المسافة المخططة النشطة" value={`${fmtNum(active.reduce((s, x) => s + Number(x.distance_km ?? 0), 0))} كم`} />
        <Kpi label="رحلات متأخرة" value={fmtNum(late.length)} tone={late.length ? "warning" : undefined} />
      </section>

      <div className="grid gap-5 lg:grid-cols-4">
        <Panel tone="blue" title="مؤشرات التشغيل" icon={<BarChart3 />}>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between rounded-md bg-muted px-3 py-2">
              <span>الالتزام بالمواعيد المتفق عليها</span>
              <b className="num text-success">{onTimePct === null ? "غير متاح" : `${onTimePct}%`}</b>
            </div>
            <div className="flex justify-between rounded-md bg-muted px-3 py-2">
              <span>نسبة استغلال الرؤوس</span>
              <b className="num text-success">{utilization === null ? "غير متاح" : `${utilization}%`}</b>
            </div>
            <div className="flex justify-between rounded-md bg-muted px-3 py-2">
              <span>رحلات مسلّمة (إجمالي)</span>
              <b className="num">{fmtNum(delivered.length)}</b>
            </div>
          </div>
        </Panel>
        <Panel tone="graph" title="الأسطول — الرؤوس" icon={<Truck />}>
          <div className="flex items-center gap-4">
            <FleetDonut total={tractors.length} parts={[count(tractors, "active"), count(tractors, "available"), count(tractors, "maintenance"), count(tractors, "stopped")]} />
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-success" /> تعمل <b className="num">{count(tractors, "active")}</b></li>
              <li className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-info" /> متاحة <b className="num">{count(tractors, "available")}</b></li>
              <li className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-warning" /> في صيانة <b className="num">{count(tractors, "maintenance")}</b></li>
              <li className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-danger" /> متوقفة <b className="num">{count(tractors, "stopped")}</b></li>
            </ul>
          </div>
        </Panel>
        <Panel tone="copper" title="المقطورات" icon={<Container />}>
          <div className="text-center">
            <div className="num text-4xl font-bold text-primary">{trailers.length}</div>
            <div className="text-sm text-muted-foreground">مقطورة مسجلة</div>
            <div className="mt-3 flex justify-center gap-2 text-xs">
              <Badge tone="success">تعمل {count(trailers, "active")}</Badge>
              <Badge tone="info">متاحة {count(trailers, "available")}</Badge>
            </div>
          </div>
        </Panel>
        {showFin ? (
          <Panel tone="green" title="الأداء المالي (رحلات نشطة)" icon={<Coins />}>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div><div className="text-muted-foreground">الإيراد</div><b className="num text-success">{fmtSAR(finSum.rev)}</b></div>
              <div><div className="text-muted-foreground">التكلفة التقديرية</div><b className="num text-danger">{fmtSAR(finSum.cost)}</b></div>
              <div><div className="text-muted-foreground">الهامش المباشر</div><b className="num text-success">{fmtSAR(finSum.margin)}</b>{finSum.pct !== null && <div className="num text-xs">({finSum.pct.toFixed(1)}%)</div>}</div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">الهامش المباشر = الإيراد ناقص التكلفة المباشرة، وليس صافي ربح الشركة.</p>
          </Panel>
        ) : (
          <Panel title="مستندات قريبة الانتهاء" icon={<Gauge />}>
            <div className="num text-center text-4xl font-bold text-warning">{docs.data?.length ?? 0}</div>
          </Panel>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="الخريطة — مواقع الرؤوس الأخيرة" icon={<RouteIcon />} className="xl:col-span-2"
          actions={<span className="text-xs text-muted-foreground">المصدر: آخر موقع مسجل (GPS غير مربوط)</span>}>
          <ClientOnly fallback={<Loading />}>
            <Suspense fallback={<Loading />}>
              <MapView markers={markers} lines={lines} height={380} onMarkerClick={(id) => void nav({ to: "/fleet/$id", params: { id } })} />
            </Suspense>
          </ClientOnly>
        </Panel>
        <Panel title="تفاصيل الرحلة الحالية" icon={<Truck />} actions={current && <Status kind="trip" value={current.status} />}>
          {current ? (
            <div className="space-y-2 text-sm">
              {[
                ["رقم الرحلة", current.number],
                ["أمر النقل", current.order?.number],
                ["المسار", `${current.origin_city} ← ${current.dest_city}`.replace("←", "إلى")],
                ["الرأس", current.tractor?.code],
                ["المقطورة", current.trailer?.code],
                ["السائق", current.driver?.full_name],
                ["المسافة الكلية", current.distance_km ? `${fmtNum(current.distance_km)} كم` : "—"],
                ["نوع الحمولة", current.order?.cargo_type],
                ["الوزن", current.order?.weight_kg ? `${fmtNum(current.order.weight_kg / 1000, 1)} طن` : "—"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-1.5">
                  <span className="text-muted-foreground">{k}</span>
                  <b>{v ?? "—"}</b>
                </div>
              ))}
              <Link to="/trips/$id" params={{ id: current.id }} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-gold">
                فتح الرحلة <ArrowLeft className="size-4" />
              </Link>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد رحلة جارية الآن.</p>
          )}
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="آخر الرحلات" icon={<RouteIcon />} actions={<Link to="/trips" className="text-xs font-semibold text-gold">عرض الكل</Link>}>
          <DataTable
            rows={t.slice(0, 6)}
            loading={trips.isLoading}
            error={trips.error}
            onRowClick={(r) => void nav({ to: "/trips/$id", params: { id: r.id } })}
            cols={[
              { key: "number", label: "رقم الرحلة", render: (r) => <span className="num font-medium text-primary">{r.number}</span> },
              { key: "route", label: "المسار", render: (r) => `${r.origin_city} ← ${r.dest_city}` },
              { key: "status", label: "الحالة", render: (r) => <Status kind="trip" value={r.status} /> },
            ]}
          />
        </Panel>
        <Panel title="حالة الأسطول" icon={<Truck />} actions={<Link to="/fleet" className="text-xs font-semibold text-gold">عرض الأسطول</Link>}>
          <DataTable
            rows={tractors.slice(0, 6)}
            loading={assets.isLoading}
            onRowClick={(r) => void nav({ to: "/fleet/$id", params: { id: r.id } })}
            cols={[
              { key: "code", label: "الرأس", render: (r) => <span className="num font-medium text-primary">{r.code}</span> },
              { key: "status", label: "الحالة", render: (r) => <Status kind="asset" value={r.status} /> },
              { key: "loc", label: "الموقع", render: (r) => r.location_text ?? "—" },
              { key: "upd", label: "آخر تحديث", render: (r) => <span className="num">{fmtTime(r.last_position_at)}</span> },
            ]}
          />
        </Panel>
        <Panel title="تنبيهات وتشغيل" icon={<AlertTriangle />}>
          {alerts.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد تنبيهات.</p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto">
              {alerts.slice(0, 8).map((x, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                  <Badge tone={x.tone}>{x.tag}</Badge>
                  <span>{x.text}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function FleetDonut({ total, parts }: { total: number; parts: number[] }) {
  const colors = ["var(--success)", "var(--info)", "var(--warning)", "var(--danger)"];
  let acc = 0;
  const segs = parts.map((p, i) => {
    const start = total ? (acc / total) * 100 : 0;
    acc += p;
    const end = total ? (acc / total) * 100 : 0;
    return `${colors[i]} ${start}% ${end}%`;
  });
  return (
    <div className="relative size-24 shrink-0 rounded-full" style={{ background: total ? `conic-gradient(${segs.join(",")})` : "var(--muted)" }}>
      <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-card">
        <b className="num text-xl text-primary">{total}</b>
        <span className="text-[10px] text-muted-foreground">رأس</span>
      </div>
    </div>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Riyadh", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "صباح الخير" : "مساء الخير";
}
