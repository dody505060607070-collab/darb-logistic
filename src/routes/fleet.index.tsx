import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Container, Pencil, Plus, Truck } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { DataTable, Kpi, KV, PageHeader, Panel, Select, Status } from "@/components/darb/ui";
import { EntityDialog, type Field } from "@/components/darb/EntityDialog";
import { Button } from "@/components/ui/button";
import { useRows, type Row } from "@/lib/db";
import { fetchAssets, fetchTrips } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { ASSET_KIND, fmtNum, fmtTime, STATUS } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fleet/")({
  head: () => ({
    meta: [
      { title: "الأسطول — الرؤوس والمقطورات | دَرب" },
      { name: "description", content: "إدارة رؤوس الشاحنات والمقطورات وحالتها وربطها بالرحلات." },
      { property: "og:title", content: "الأسطول — دَرب" },
      { property: "og:description", content: "إدارة رؤوس الشاحنات والمقطورات وحالتها." },
    ],
  }),
  component: () => (
    <AppShell>
      <FleetPage />
    </AppShell>
  ),
});

export const ASSET_FIELDS: Field[] = [
  { name: "code", label: "رقم الأصل", required: true },
  { name: "kind", label: "النوع", type: "select", required: true, options: Object.entries(ASSET_KIND) },
  { name: "plate", label: "اللوحة" },
  { name: "make_model", label: "الشركة والطراز" },
  { name: "year", label: "سنة الصنع", type: "number" },
  { name: "vin", label: "رقم الهيكل (VIN)" },
  { name: "trailer_type", label: "نوع المقطورة", hint: "للمقطورات فقط" },
  { name: "capacity_tons", label: "السعة (طن)", type: "number" },
  { name: "status", label: "الحالة التشغيلية", type: "select", required: true, default: "available", options: Object.entries(STATUS["asset"]!).map(([k, v]) => [k, v[0]]) },
  { name: "odometer_km", label: "العداد (كم)", type: "number" },
  { name: "location_text", label: "الموقع الحالي" },
  { name: "branch_id", label: "الفرع", type: "ref", ref: { table: "branches", label: "name" } },
  { name: "notes", label: "ملاحظات", type: "textarea" },
];

function FleetPage() {
  const nav = useNavigate();
  const { can } = useAuth();
  const assets = useRows(["assets"], fetchAssets);
  const trips = useRows(["trips"], fetchTrips);
  const [tab, setTab] = useState<"tractor" | "trailer">("tractor");
  const [status, setStatus] = useState("");
  const [sel, setSel] = useState<Row | null>(null);
  const [edit, setEdit] = useState<Row | null | undefined>(undefined);

  const all = assets.data ?? [];
  const list = all.filter((a) => (tab === "tractor" ? a.kind !== "trailer" : a.kind === "trailer")).filter((a) => !status || a.status === status);
  const tractors = all.filter((a) => a.kind !== "trailer");
  const activeTrip = (id: string) => (trips.data ?? []).find((t) => ["planned", "ready", "in_progress"].includes(t.status) && (t.tractor_id === id || t.trailer_id === id));
  const cnt = (s: string) => tractors.filter((a) => a.status === s).length;
  const selected = sel ?? list[0] ?? null;
  const selTrip = selected ? activeTrip(selected.id) : null;
  const canEdit = can("ops_manager", "fleet_supervisor");

  return (
    <>
      <PageHeader
        title="قائمة الرؤوس والمقطورات"
        subtitle="إدارة رؤوس الشاحنات والمقطورات، حالتها، وربطها بالرحلات والأوامر."
        icon={<Truck />}
        actions={canEdit && <Button variant="gold" onClick={() => setEdit(null)}><Plus /> إضافة أصل جديد</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Kpi label="رأس مسجل" value={tractors.length} />
        <Kpi label="تعمل" value={cnt("active")} tone="success" />
        <Kpi label="متاحة" value={cnt("available")} tone="info" />
        <Kpi label="تحت الصيانة" value={cnt("maintenance")} tone="warning" />
        <Kpi label="متوقفة" value={cnt("stopped")} tone="danger" />
        <Kpi label="مقطورات مسجلة" value={all.length - tractors.length} />
      </div>

      <div className="mb-4 flex gap-2">
        {(["tractor", "trailer"] as const).map((k) => (
          <button
            key={k}
            onClick={() => { setTab(k); setSel(null); }}
            className={cn("flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold", tab === k ? "border-gold bg-gold-soft text-primary" : "bg-card")}
          >
            {k === "tractor" ? <Truck className="size-4" /> : <Container className="size-4" />}
            {k === "tractor" ? "الرؤوس" : "المقطورات"} ({all.filter((a) => (k === "tractor" ? a.kind !== "trailer" : a.kind === "trailer")).length})
          </button>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
        <Panel title={tab === "tractor" ? "الرؤوس (شاحنات السحب)" : "المقطورات"} icon={tab === "tractor" ? <Truck /> : <Container />}>
          <DataTable
            rows={list}
            loading={assets.isLoading}
            error={assets.error}
            searchKeys={["code", "plate", "make_model", "trailer_type", "location_text"]}
            selectedId={selected?.id}
            onRowClick={(r) => setSel(r)}
            filters={
              <Select value={status} onChange={setStatus} placeholder="كل الحالات" options={Object.entries(STATUS["asset"]!).map(([k, v]) => [k, v[0]])} />
            }
            cols={[
              { key: "code", label: tab === "tractor" ? "رقم الرأس" : "رقم المقطورة", render: (r) => <span className="num font-semibold text-primary underline">{r.code}</span> },
              ...(tab === "tractor"
                ? [
                    { key: "plate", label: "اللوحة" },
                    { key: "make_model", label: "النوع" },
                    { key: "year", label: "سنة الصنع", render: (r: Row) => <span className="num">{r.year ?? "—"}</span> },
                  ]
                : [
                    { key: "trailer_type", label: "النوع" },
                    { key: "capacity_tons", label: "السعة", render: (r: Row) => <span className="num">{r.capacity_tons ? `${r.capacity_tons} طن` : "—"}</span> },
                  ]),
              { key: "status", label: "الحالة", render: (r) => <Status kind="asset" value={r.status} /> },
              { key: "trip", label: "الرحلة الحالية", render: (r) => <span className="num">{activeTrip(r.id)?.number ?? "—"}</span> },
              { key: "loc", label: "الموقع", render: (r) => r.location_text ?? "—" },
              { key: "upd", label: "آخر تحديث", render: (r) => <span className="num">{fmtTime(r.last_position_at)}</span> },
            ]}
          />
        </Panel>

        {selected && (
          <Panel title={`تفاصيل ${ASSET_KIND[selected.kind]} ${selected.code}`} icon={<Truck />} actions={<Status kind="asset" value={selected.status} />}>
            <KV
              items={[
                ["رقم الأصل", <span className="num">{selected.code}</span>],
                ["النوع", selected.make_model ?? selected.trailer_type],
                ["سنة الصنع", selected.year],
                ["اللوحة", selected.plate],
                ["رقم الهيكل (VIN)", <span className="num">{selected.vin ?? "—"}</span>],
                ["العداد", selected.odometer_km ? `${fmtNum(selected.odometer_km)} كم` : "—"],
                ["السائق الحالي", selTrip?.driver?.full_name ?? "—"],
                ["الرحلة الحالية", selTrip?.number ?? "—"],
                ["المسار", selTrip ? `${selTrip.origin_city} ← ${selTrip.dest_city}` : "—"],
              ]}
            />
            <div className="mt-4 space-y-2">
              {canEdit && <Button variant="gold" className="w-full" onClick={() => setEdit(selected)}><Pencil /> تعديل البيانات</Button>}
              <Button variant="outline" className="w-full" onClick={() => void nav({ to: "/fleet/$id", params: { id: selected.id } })}>عرض الملف الكامل</Button>
            </div>
          </Panel>
        )}
      </div>

      <EntityDialog
        open={edit !== undefined}
        onOpenChange={(o) => !o && setEdit(undefined)}
        title={edit ? `تعديل ${edit.code}` : "إضافة أصل جديد"}
        table="assets"
        fields={ASSET_FIELDS}
        record={edit}
        invalidate={["assets"]}
        onSaved={(r) => setSel(r)}
      />
    </>
  );
}
