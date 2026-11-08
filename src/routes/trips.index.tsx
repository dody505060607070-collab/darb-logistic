import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus, Route as RouteIcon } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, Kpi, PageHeader, Panel, Select, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { Button } from "@/components/ui/button";
import { useRows } from "@/lib/db";
import { fetchTrips } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { EVENT_LABELS, fmtDateTime, fmtNum, STATUS } from "@/lib/format";

export const Route = createFileRoute("/trips/")({
  head: () => ({
    meta: [
      { title: "الرحلات — دَرب" },
      { name: "description", content: "قائمة الرحلات وحالاتها ومراحلها والموارد المخصصة." },
      { property: "og:title", content: "الرحلات — دَرب" },
      { property: "og:description", content: "قائمة الرحلات وحالاتها والموارد المخصصة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <TripsPage />
    </AppShell>
  ),
});

function TripsPage() {
  const nav = useNavigate();
  const { can } = useAuth();
  const trips = useRows(["trips"], fetchTrips);
  const [status, setStatus] = useState("");
  const [emptyOpen, setEmptyOpen] = useState(false);
  const all = trips.data ?? [];
  const c = (s: string) => all.filter((t) => t.status === s).length;
  const late = all.filter((t) => t.status === "in_progress" && t.planned_end && new Date(t.planned_end) < new Date()).length;
  return (
    <>
      <PageHeader title="الرحلات" subtitle="مسودة ← مخططة ← جاهزة ← جارية ← تم التسليم ← مغلقة تشغيليًا" icon={<RouteIcon />}
        actions={can("ops_manager", "dispatcher") && <>
          <Button variant="outline" onClick={() => setEmptyOpen(true)}>رحلة فارغة / عودة</Button>
          <Button variant="gold" asChild><Link to="/orders/new"><Plus /> رحلة بأمر نقل</Link></Button>
        </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="مسودة" value={c("draft")} />
        <Kpi label="مخططة" value={c("planned")} tone="info" />
        <Kpi label="جارية" value={c("in_progress")} tone="success" />
        <Kpi label="متأخرة" value={late} tone={late ? "warning" : undefined} />
        <Kpi label="تم التسليم" value={c("delivered")} tone="gold" />
        <Kpi label="مغلقة" value={c("closed")} />
      </div>
      <Panel title="كل الرحلات" icon={<RouteIcon />}>
        <DataTable rows={all.filter((t) => !status || t.status === status)} loading={trips.isLoading} error={trips.error}
          searchKeys={["number", "origin_city", "dest_city", "driver.full_name", "tractor.code", "trailer.code", "order.number", "order.customer.name"]}
          filters={<Select value={status} onChange={setStatus} placeholder="كل الحالات" options={Object.entries(STATUS["trip"]!).map(([k, v]) => [k, v[0]])} />}
          onRowClick={(r) => void nav({ to: "/trips/$id", params: { id: r.id } })}
          cols={[
            { key: "number", label: "رقم الرحلة", render: (r) => <span className="num font-semibold text-primary">{r.number}</span> },
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
