import { tripScope } from "@/lib/home-summary";
import { useScreenSearch, useScreenNavigate } from "@/lib/screen-navigation";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileText, CalendarRange, Truck, AlertTriangle, CheckCircle2, Lock, Plus, Route as RouteIcon } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, Kpi, KV, PageHeader, Panel, Select, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { Button } from "@/components/ui/button";
import { useRows, type Row } from "@/lib/db";
import { fetchSummaryTrips } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { EVENT_LABELS, fmtDateTime, fmtNum, STATUS } from "@/lib/format";

function TripsPage() {
  const nav = useScreenNavigate();
  const search = useScreenSearch();
  const auth = useAuth();
  const can = (...roles: Parameters<typeof auth.can>) => !auth.viewAs && auth.can(...roles);
  const trips = useRows(["trips", "summary"], fetchSummaryTrips);
  const [status, setStatus] = useState(search.status ?? "");
  const [emptyOpen, setEmptyOpen] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const all = tripScope(trips.data ?? [], search.scope);
  const preview = selected && (!status || selected.status === status) ? selected : all.find((t) => !status || t.status === status);
  const stages = [["draft", "مسودة"], ["planned", "مخططة"], ["ready", "جاهزة"], ["in_progress", "جارية"], ["delivered", "تم التسليم"], ["closed", "مغلقة تشغيليًا"]];
  const stageIndex = stages.findIndex(([key]) => key === preview?.status);
  const c = (s: string) => all.filter((t) => t.status === s).length;
  const late = all.filter((t) => t.status === "in_progress" && t.planned_end && new Date(t.planned_end) < new Date()).length;
  return (
    <>
      <PageHeader title="الرحلات" subtitle="مسودة ← مخططة ← جاهزة ← جارية ← تم التسليم ← مغلقة تشغيليًا" icon={<RouteIcon />}
        actions={can("ops_manager", "dispatcher") && <>
          <Button variant="outline" onClick={() => setEmptyOpen(true)}>رحلة فارغة / عودة</Button>
          <Button asChild><Link to="/orders/new"><Plus /> رحلة بأمر نقل</Link></Button>
        </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi icon={<FileText />} label="مسودة" value={c("draft")} />
        <Kpi icon={<CalendarRange />} label="مخططة" value={c("planned")} tone="info" />
        <Kpi icon={<Truck />} label="جارية" value={c("in_progress")} tone="success" />
        <Kpi icon={<AlertTriangle />} label="متأخرة" value={late} tone={late ? "warning" : undefined} />
        <Kpi icon={<CheckCircle2 />} label="تم التسليم" value={c("delivered")} tone="gold" />
        <Kpi icon={<Lock />} label="مغلقة" value={c("closed")} />
      </div>
      <Panel title="كل الرحلات" icon={<RouteIcon />}>
        <DataTable rows={all.filter((t) => !status || t.status === status)} loading={trips.isLoading} error={trips.error}
          searchKeys={["number", "origin_city", "dest_city", "driver.full_name", "tractor.code", "trailer.code", "order.number", "order.customer.name"]}
          filters={<Select value={status} onChange={setStatus} placeholder="كل الحالات" options={Object.entries(STATUS["trip"]!).map(([k, v]) => [k, v[0]])} />}
          selectedId={preview?.id} onRowClick={setSelected}
          cols={[
            { key: "number", label: "رقم الرحلة", render: (r) => <Link to="/trips/$id" params={{ id: r.id }} onClick={(e) => e.stopPropagation()} className="num font-semibold text-primary underline-offset-4 hover:underline">{r.number}</Link> },
            { key: "route", label: "المسار", render: (r) => <span>{r.origin_city} ← {r.dest_city} {r.is_empty && <Badge tone="neutral">فارغة</Badge>}</span> },
            { key: "customer", label: "العميل", render: (r) => r.order?.customer?.name ?? "—" },
            { key: "tractor", label: "الرأس", render: (r) => <span className="num">{r.tractor?.code ?? "—"}</span> },
            { key: "trailer", label: "المقطورة", render: (r) => <span className="num">{r.trailer?.code ?? "—"}</span> },
            { key: "driver", label: "السائق", render: (r) => r.driver?.full_name ?? "—" },
            { key: "start", label: "الانطلاق المخطط", render: (r) => <span className="num">{fmtDateTime(r.planned_start)}</span> },
            { key: "km", label: "المسافة", render: (r) => <span className="num">{r.distance_km ? `${fmtNum(r.distance_km)} كم` : "—"}</span> },
            { key: "stage", label: "المرحلة", render: (r) => <span className="text-xs">{EVENT_LABELS[r.stage] ?? r.stage}{r.exception && <Badge tone="danger">{EVENT_LABELS[r.exception]}</Badge>}</span> },
            { key: "status", label: "الحالة", render: (r) => <Status kind="trip" value={r.status} /> },
          ]} />
      </Panel>
      {preview && <Panel className="mt-5" title={`تفاصيل الرحلة ${preview.number}`} icon={<RouteIcon />} actions={<>
        {preview.status === "in_progress" && preview.planned_end && new Date(preview.planned_end) < new Date() && <Badge tone="warning"><AlertTriangle className="size-4" /> متأخرة عن الموعد المخطط</Badge>}
        <Button variant="outline" asChild><Link to="/trips/$id" params={{ id: preview.id }}>فتح ملف الرحلة</Link></Button>
      </>}>
        <ol aria-label="مراحل الرحلة — للعرض فقط" className="grid grid-cols-2 gap-y-5 py-5 sm:grid-cols-6">
          {stages.map(([key, label], i) => <li key={key} aria-current={i === stageIndex ? "step" : undefined} className="relative flex flex-col items-center gap-2 text-center text-sm">
            <span aria-hidden className={`z-10 flex size-9 items-center justify-center rounded-full border-2 ${i <= stageIndex ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground"}`}>
              {i < stageIndex ? <CheckCircle2 className="size-5" /> : i === stageIndex ? <Truck className="size-5" /> : <span className="size-2 rounded-full bg-current" />}
            </span>
            {i < stages.length - 1 && <span aria-hidden className={`absolute top-4 right-1/2 hidden h-0.5 w-full sm:block ${i < stageIndex ? "bg-primary" : "bg-border"}`} />}
            <span className={i === stageIndex ? "font-bold text-primary" : "text-muted-foreground"}>{label}</span>
          </li>)}
        </ol>
        <div className="rounded-lg border bg-muted/30 p-4"><KV items={[
          ["المسار", `${preview.origin_city} ← ${preview.dest_city}`], ["العميل", preview.order?.customer?.name ?? "—"],
          ["الشاحنة", preview.tractor?.code ?? "—"], ["المقطورة", preview.trailer?.code ?? "—"],
          ["السائق", preview.driver?.full_name ?? "—"], ["المسافة", preview.distance_km ? `${fmtNum(preview.distance_km)} كم` : "—"],
          ["الانطلاق المخطط", fmtDateTime(preview.planned_start)],
        ]} /></div>
      </Panel>}
      <EntityDialog open={emptyOpen} onOpenChange={setEmptyOpen} title="رحلة فارغة / عودة" table="trips" invalidate={["trips"]}
        extra={{ is_empty: true }}
        fields={[
          { name: "origin_city", label: "من مدينة", required: true },
          { name: "dest_city", label: "إلى مدينة", required: true },
          { name: "empty_reason", label: "سبب النقل الفارغ", required: true, type: "select", options: [["عودة للقاعدة", "عودة للقاعدة"], ["تموضع لرحلة قادمة", "تموضع لرحلة قادمة"], ["صيانة", "صيانة"], ["أخرى", "أخرى"]] },
          { name: "parent_trip_id", label: "الرحلة الأصلية المرتبطة", type: "ref", ref: { table: "trips", label: (r) => `${r["number"]} — ${r["origin_city"]} ← ${r["dest_city"]}`, filter: (q) => q.eq("is_empty", false).order("created_at", { ascending: false }) } },
          { name: "distance_km", label: "المسافة (كم)", type: "number", hint: "تُحتسب كمسافة فارغة منفصلة عن الرحلة المحملة" },
          { name: "planned_start", label: "الانطلاق المخطط", type: "datetime" },
          { name: "planned_end", label: "الوصول المخطط", type: "datetime" },
        ]} onSaved={(r) => void nav({ to: "/trips/$id", params: { id: r.id } })} />
    </>
  );
}

export default () => <AppShell><TripsPage /></AppShell>;
