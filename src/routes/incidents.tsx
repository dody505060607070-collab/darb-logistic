import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Plus, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { DataTable, Kpi, PageHeader, Panel, Select, Status } from "@/components/darb/ui";
import { EntityDialog, type Field } from "@/components/darb/EntityDialog";
import { Button } from "@/components/ui/button";
import { db, useRows, type Row } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { fmtDateTime, fmtSAR, STATUS } from "@/lib/format";

export const Route = createFileRoute("/incidents")({
  head: () => ({
    meta: [
      { title: "الحوادث والبلاغات — دَرب" },
      { name: "description", content: "مركز معالجة الحوادث والتلفيات والبلاغات ومطالبات التأمين." },
      { property: "og:title", content: "الحوادث والبلاغات — دَرب" },
      { property: "og:description", content: "مركز معالجة الحوادث والبلاغات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <IncidentsPage />
    </AppShell>
  ),
});

const FIELDS: Field[] = [
  { name: "kind", label: "النوع", type: "select", required: true, default: "accident", options: [["accident", "حادث مروري"], ["damage", "تلفيات"], ["cargo", "ضرر بضاعة"], ["breakdown", "عطل"], ["violation", "مخالفة"], ["other", "أخرى"]] },
  { name: "severity", label: "الخطورة", type: "select", required: true, default: "medium", options: Object.entries(STATUS["severity"]!).filter(([k]) => ["low", "medium", "high", "critical"].includes(k)).map(([k, v]) => [k, v[0]]) },
  { name: "occurred_at", label: "وقت الوقوع", type: "datetime", required: true },
  { name: "location_text", label: "الموقع" },
  { name: "trip_id", label: "الرحلة", type: "ref", ref: { table: "trips", label: "number" } },
  { name: "asset_id", label: "المركبة", type: "ref", ref: { table: "assets", label: "code" } },
  { name: "driver_id", label: "السائق", type: "ref", ref: { table: "drivers", label: "full_name" } },
  { name: "description", label: "الوصف", type: "textarea", required: true },
  { name: "parties", label: "الأطراف", type: "textarea" },
  { name: "police_ref", label: "مرجع المرور / نجم" },
  { name: "insurance_claim_ref", label: "رقم مطالبة التأمين" },
  { name: "est_cost", label: "التكلفة التقديرية", type: "number" },
  { name: "approved_liability", label: "المسؤولية المعتمدة", hint: "لا خصم تلقائي من السائق" },
  { name: "status", label: "الحالة", type: "select", default: "reported", options: Object.entries(STATUS["incident"]!).map(([k, v]) => [k, v[0]]) },
];

function IncidentsPage() {
  const { can } = useAuth();
  const inc = useRows(["incidents"], () => db.from("incidents").select("*, trip:trips(number), asset:assets(code), driver:drivers(full_name)").order("occurred_at", { ascending: false }));
  const [rec, setRec] = useState<Row | null | undefined>(undefined);
  const [status, setStatus] = useState("");
  const all = inc.data ?? [];
  const canEdit = can("ops_manager", "fleet_supervisor");
  return (
    <>
      <PageHeader title="الحوادث والبلاغات ومركز المعالجة" icon={<ShieldAlert />} actions={canEdit && <Button variant="gold" onClick={() => setRec(null)}><Plus /> بلاغ جديد</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="الإجمالي" value={all.length} />
        <Kpi label="مفتوحة" value={all.filter((i) => !["resolved", "closed"].includes(i.status)).length} tone="warning" />
        <Kpi label="عالية/حرجة" value={all.filter((i) => ["high", "critical"].includes(i.severity)).length} tone="danger" />
        <Kpi label="مطالبات تأمين" value={all.filter((i) => i.status === "claim").length} tone="gold" />
        <Kpi label="التكلفة التقديرية" value={fmtSAR(all.reduce((s, i) => s + Number(i.est_cost ?? 0), 0))} />
      </div>
      <Panel title="البلاغات" icon={<ShieldAlert />}>
        <DataTable rows={all.filter((i) => !status || i.status === status)} loading={inc.isLoading} error={inc.error} searchKeys={["number", "description", "asset.code", "driver.full_name"]} onRowClick={canEdit ? setRec : undefined}
          filters={<Select value={status} onChange={setStatus} placeholder="كل الحالات" options={Object.entries(STATUS["incident"]!).map(([k, v]) => [k, v[0]])} />}
          cols={[
            { key: "number", label: "الرقم", render: (r) => <span className="num font-semibold">{r.number}</span> },
            { key: "at", label: "الوقت", render: (r) => <span className="num">{fmtDateTime(r.occurred_at)}</span> },
            { key: "kind", label: "النوع", render: (r) => FIELDS[0]!.options!.find((o) => o[0] === r.kind)?.[1] ?? r.kind },
            { key: "severity", label: "الخطورة", render: (r) => <Status kind="severity" value={r.severity} /> },
            { key: "asset", label: "المركبة", render: (r) => r.asset?.code ?? "—" },
            { key: "driver", label: "السائق", render: (r) => r.driver?.full_name ?? "—" },
            { key: "trip", label: "الرحلة", render: (r) => r.trip?.number ?? "—" },
            { key: "description", label: "الوصف", className: "max-w-xs truncate" },
            { key: "cost", label: "التكلفة", render: (r) => <span className="num">{fmtSAR(r.est_cost)}</span> },
            { key: "status", label: "الحالة", render: (r) => <Status kind="incident" value={r.status} /> },
          ]} />
      </Panel>
      <EntityDialog open={rec !== undefined} onOpenChange={(o) => !o && setRec(undefined)} title={rec ? `بلاغ ${rec.number}` : "بلاغ جديد"} table="incidents" fields={FIELDS} record={rec} invalidate={["incidents", "notifications"]} />
    </>
  );
}
