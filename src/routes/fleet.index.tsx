import { RecordActions } from "@/components/darb/RecordActions";
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CircleCheck, CirclePause, Container, Pencil, Plus, Truck, Wrench } from "lucide-react";
import truck from "@/assets/fleet-truck.png";
import { AppShell } from "@/components/darb/AppShell";
import { DataTable, Kpi, KV, PageHeader, Panel, Select, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { ASSET_FIELDS } from "@/components/darb/shared";
import { Button } from "@/components/ui/button";
import { useRows, type Row } from "@/lib/db";
import { fetchAssets, fetchTrips } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { ASSET_KIND, fmtNum, fmtTime, STATUS } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/fleet/")({
  head: () => ({
    meta: [
      { title: "الأسطول — الرؤوس والمقطورات | Shata" },
      { name: "description", content: "إدارة رؤوس الشاحنات والمقطورات وحالتها وربطها بالرحلات." },
      { property: "og:title", content: "الأسطول | Shata" },
      { property: "og:description", content: "إدارة رؤوس الشاحنات والمقطورات وحالتها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <FleetPage />
    </AppShell>
  ),
});


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
  const selected = list.find((a) => a.id === sel?.id) ?? list[0] ?? null;
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
        <Kpi label="رأس مسجل" value={tractors.length} icon={<Truck />} />
        <Kpi label="تعمل" value={cnt("active")} tone="success" icon={<CircleCheck />} />
        <Kpi label="متاحة" value={cnt("available")} tone="info" icon={<CircleCheck />} />
        <Kpi label="تحت الصيانة" value={cnt("maintenance")} tone="warning" icon={<Wrench />} />
        <Kpi label="متوقفة" value={cnt("stopped")} tone="danger" icon={<CirclePause />} />
        <Kpi label="مقطورات مسجلة" value={all.length - tractors.length} icon={<Container />} />
      </div>

      <div className="mb-4 flex gap-1 rounded-xl border bg-muted p-1">
        {(["tractor", "trailer"] as const).map((k) => (
          <Button variant={tab === k ? "default" : "outline"}
            key={k}
            onClick={() => { setTab(k); setSel(null); }}
            aria-pressed={tab === k}
            className="min-w-0 flex-1 gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
          >
            {k === "tractor" ? <Truck className="size-4" /> : <Container className="size-4" />}
            {k === "tractor" ? "الرؤوس" : "المقطورات"} ({all.filter((a) => (k === "tractor" ? a.kind !== "trailer" : a.kind === "trailer")).length})
          </Button>
        ))}
      </div>

      <div className="split-layout min-w-0">
        <Panel className="min-w-0" title={tab === "tractor" ? "الرؤوس (شاحنات السحب)" : "المقطورات"} icon={tab === "tractor" ? <Truck /> : <Container />}>
          <DataTable
            entityTable="assets" rows={list}
            loading={assets.isLoading}
            error={assets.error}
            searchKeys={["code", "plate", "make_model", "trailer_type", "location_text"]}
            selectedId={selected?.id}
            onEdit={canEdit ? (r) => setEdit(r) : undefined}
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
          <Panel className="record-preview side-detail" title={`تفاصيل ${ASSET_KIND[selected.kind]} ${selected.code}`} icon={<Truck />} actions={<Status kind="asset" value={selected.status} />}>
            <div className="asset-hero mb-4">
              <div className="relative z-10 max-w-[55%]">
                <div className="num text-xl font-bold">{selected.code}</div>
                <p className="mt-1 text-sm">{ASSET_KIND[selected.kind]}</p>
              </div>
              <img src={truck} alt="" loading="lazy" width={720} height={450} />
            </div>
            <KV
              items={[
                ["رقم الأصل", <span className="num">{selected.code}</span>],
                ["النوع", selected.make_model ?? selected.trailer_type],
                ["سنة الصنع", selected.year],
                ["اللوحة", selected.plate],
                ["رقم الهيكل (VIN)", <span className="num">{selected.vin ? `••••••••${String(selected.vin).slice(-4)}` : "—"}</span>],
                ["العداد", selected.odometer_km != null ? `${fmtNum(selected.odometer_km)} كم` : "—"],
                ["السائق الحالي", selTrip?.driver?.full_name ?? "—"],
                ["الرحلة الحالية", selTrip?.number ?? "—"],
                ["المسار", selTrip ? `${selTrip.origin_city} ← ${selTrip.dest_city}` : "—"],
              ]}
            />
            <div className="mt-4 space-y-2">
              <RecordActions table="assets" id={selected.id} onEdit={canEdit ? () => setEdit(selected) : undefined} />
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
