import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, FolderOpen, Plus, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, Kpi, PageHeader, Panel, Select, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { DOC_FIELDS, DocExpiry, openFile } from "@/components/darb/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, useRows, type Row } from "@/lib/db";
import { fetchAssets, fetchDrivers } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "التفويضات وانتهاء المستندات — دَرب" },
      { name: "description", content: "متابعة المستندات والتفويضات وتواريخ الانتهاء." },
      { property: "og:title", content: "المستندات والتفويضات — دَرب" },
      { property: "og:description", content: "متابعة المستندات والتفويضات وتواريخ الانتهاء." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <DocsPage />
    </AppShell>
  ),
});

function DocsPage() {
  const { can } = useAuth();
  const docs = useRows(["documents"], () => db.from("documents").select("*").order("expiry_date"));
  const auths = useRows(["authorizations"], () => db.from("authorizations").select("*, driver:drivers(full_name), asset:assets(code)").order("valid_to"));
  const assets = useRows(["assets"], fetchAssets);
  const drivers = useRows(["drivers"], fetchDrivers);
  const [filter, setFilter] = useState("");
  const [edit, setEdit] = useState<Row | null | undefined>(undefined);
  const [authEdit, setAuthEdit] = useState<Row | null | undefined>(undefined);
  const [newEntity, setNewEntity] = useState("");
  const canEdit = can("ops_manager", "fleet_supervisor");

  const names = useMemo(() => {
    const m = new Map<string, string>();
    (assets.data ?? []).forEach((a) => m.set(a.id, a.code));
    (drivers.data ?? []).forEach((d) => m.set(d.id, d.full_name));
    return m;
  }, [assets.data, drivers.data]);

  const all = docs.data ?? [];
  const bucket = (d: Row) => { const n = daysUntil(d.expiry_date); return n === null ? "none" : n < 0 ? "expired" : n <= 30 ? "soon" : "valid"; };
  const list = all.filter((d) => !filter || bucket(d) === filter);
  const [etype, eid] = newEntity.split(":");

  return (
    <>
      <PageHeader title="التفويضات وانتهاء المستندات" subtitle="تسجيل التفويض داخليًا لا يعني إصداره رسميًا" icon={<FolderOpen />}
        actions={canEdit && <Button variant="gold" onClick={() => setAuthEdit(null)}><Plus /> تفويض جديد</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="إجمالي المستندات" value={all.length} />
        <Kpi label="منتهية" value={all.filter((d) => bucket(d) === "expired").length} tone="danger" />
        <Kpi label="تنتهي خلال 30 يومًا" value={all.filter((d) => bucket(d) === "soon").length} tone="warning" />
        <Kpi label="تفويضات سارية" value={(auths.data ?? []).filter((a) => (daysUntil(a.valid_to) ?? -1) >= 0).length} tone="success" />
      </div>
      <Tabs defaultValue="docs" dir="rtl">
        <TabsList><TabsTrigger value="docs">المستندات</TabsTrigger><TabsTrigger value="auth">التفويضات</TabsTrigger></TabsList>
        <TabsContent value="docs">
          <Panel title="المستندات" icon={<FileText />} actions={canEdit && (
            <div className="flex gap-2">
              <select className="h-8 rounded-md border bg-card px-2 text-xs" value={newEntity} onChange={(e) => setNewEntity(e.target.value)}>
                <option value="">مستند لـ…</option>
                <optgroup label="أصول">{(assets.data ?? []).map((a) => <option key={a.id} value={`asset:${a.id}`}>{a.code}</option>)}</optgroup>
                <optgroup label="سائقون">{(drivers.data ?? []).map((d) => <option key={d.id} value={`driver:${d.id}`}>{d.full_name}</option>)}</optgroup>
              </select>
              <Button size="sm" variant="gold" disabled={!newEntity} onClick={() => setEdit(null)}><Plus /> إضافة</Button>
            </div>
          )}>
            <DataTable rows={list} loading={docs.isLoading} error={docs.error} searchKeys={["doc_type", "number"]} onEdit={canEdit ? (r) => setEdit(r) : undefined} onRowClick={canEdit ? (r) => setEdit(r) : undefined}
              filters={<Select value={filter} onChange={setFilter} placeholder="الكل" options={[["expired", "منتهية"], ["soon", "قريبة الانتهاء"], ["valid", "سارية"]]} />}
              cols={[
                { key: "entity", label: "الجهة", render: (r) => <span><Badge dot={false}>{r.entity_type === "asset" ? "أصل" : r.entity_type === "driver" ? "سائق" : "شركة"}</Badge> {names.get(r.entity_id) ?? "—"}</span> },
                { key: "doc_type", label: "النوع" },
                { key: "number", label: "الرقم", render: (r) => <span className="num">{r.number ?? "—"}</span> },
                { key: "issue", label: "الإصدار", render: (r) => <span className="num">{fmtDate(r.issue_date)}</span> },
                { key: "expiry", label: "الانتهاء", render: (r) => <DocExpiry d={r.expiry_date} /> },
                { key: "review", label: "المراجعة", render: (r) => <Status kind="review" value={r.review_status} /> },
                { key: "file", label: "المرفق", render: (r) => r.file_path ? <button className="text-gold underline" onClick={(e) => { e.stopPropagation(); void openFile(r.file_path); }}>عرض</button> : "—" },
              ]} />
          </Panel>
        </TabsContent>
        <TabsContent value="auth">
          <Panel title="التفويضات" icon={<ShieldCheck />}>
            <DataTable rows={auths.data} loading={auths.isLoading} onEdit={canEdit ? setAuthEdit : undefined} onRowClick={canEdit ? setAuthEdit : undefined} cols={[
              { key: "number", label: "الرقم", render: (r) => <span className="num">{r.number ?? "—"}</span> },
              { key: "driver", label: "السائق", render: (r) => r.driver?.full_name },
              { key: "asset", label: "المركبة", render: (r) => r.asset?.code ?? "—" },
              { key: "scope", label: "النطاق" },
              { key: "from", label: "من", render: (r) => <span className="num">{fmtDate(r.valid_from)}</span> },
              { key: "to", label: "إلى", render: (r) => <DocExpiry d={r.valid_to} /> },
              { key: "review", label: "المراجعة", render: (r) => <Status kind="review" value={r.review_status} /> },
            ]} />
          </Panel>
        </TabsContent>
      </Tabs>
      <EntityDialog open={edit !== undefined} onOpenChange={(o) => !o && setEdit(undefined)} title="مستند" table="documents" fields={DOC_FIELDS} record={edit}
        extra={edit ? undefined : { entity_type: etype, entity_id: eid }} invalidate={["documents"]} />
      <EntityDialog open={authEdit !== undefined} onOpenChange={(o) => !o && setAuthEdit(undefined)} title="تفويض قيادة" table="authorizations" record={authEdit} invalidate={["authorizations"]} fields={[
        { name: "number", label: "رقم التفويض" },
        { name: "driver_id", label: "السائق", type: "ref", required: true, ref: { table: "drivers", label: "full_name" } },
        { name: "asset_id", label: "المركبة", type: "ref", ref: { table: "assets", label: "code" } },
        { name: "scope", label: "النطاق", default: "قيادة داخل المملكة" },
        { name: "valid_from", label: "من تاريخ", type: "date", required: true },
        { name: "valid_to", label: "إلى تاريخ", type: "date", required: true },
        { name: "review_status", label: "حالة المراجعة", type: "select", default: "pending", options: [["pending", "بانتظار المراجعة"], ["approved", "معتمد"], ["rejected", "مرفوض"]] },
        { name: "file_path", label: "المرفق", type: "file" },
      ]} />
    </>
  );
}
