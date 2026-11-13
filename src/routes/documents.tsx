import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { FileText, FolderOpen, Plus, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, Kpi, PageHeader, Panel, Select, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { DOC_FIELDS, DocExpiry, openFile } from "@/components/darb/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, useOne, useRows, type Row } from "@/lib/db";
import { DEFAULT_ALERT_DAYS, DEFAULT_REQUIRED_ASSET, DEFAULT_REQUIRED_DRIVER, docStage, driverProfileDocs, missingDocs } from "@/lib/doc-alerts";
import { fetchAssets, fetchDrivers } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/documents")({
  head: () => ({
    meta: [
      { title: "التفويضات وانتهاء المستندات — Shata" },
      { name: "description", content: "متابعة المستندات والتفويضات وتواريخ الانتهاء." },
      { property: "og:title", content: "المستندات والتفويضات — Shata" },
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

  const settings = useOne(["company_settings"], () => db.from("company_settings").select("doc_alert_days, doc_required_driver, doc_required_asset").eq("id", 1).maybeSingle());
  const alertDays: number[] = settings.data?.doc_alert_days?.length ? settings.data.doc_alert_days : DEFAULT_ALERT_DAYS;
  const maxWindow = Math.max(...alertDays);
  const all = docs.data ?? [];
  const bucket = (d: Row) => { const k = docStage(daysUntil(d.expiry_date), alertDays).kind; return k === "undated" ? "none" : k === "alert" ? "soon" : k; };
  const list = all.filter((d) => !filter || bucket(d) === filter);
  const missing = useMemo(() => missingDocs(
    [...(drivers.data ?? []).map((d) => ({ type: "driver" as const, id: d.id })), ...(assets.data ?? []).map((a) => ({ type: "asset" as const, id: a.id }))],
    [...(all as { entity_type: string; entity_id: string | null; doc_type: string; review_status?: string | null }[]), ...driverProfileDocs((drivers.data ?? []) as { id: string; license_no?: string | null; license_expiry?: string | null }[])],
    { driver: settings.data?.doc_required_driver ?? DEFAULT_REQUIRED_DRIVER, asset: settings.data?.doc_required_asset ?? DEFAULT_REQUIRED_ASSET },
  ), [all, drivers.data, assets.data, settings.data]);
  const [preset, setPreset] = useState<Row | undefined>(undefined);
  const [etype, eid] = newEntity.split(":");

  return (
    <>
      <PageHeader title="التفويضات وانتهاء المستندات" subtitle="تسجيل التفويض داخليًا لا يعني إصداره رسميًا" icon={<FolderOpen />}
        actions={canEdit && <Button variant="gold" onClick={() => setAuthEdit(null)}><Plus /> تفويض جديد</Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="إجمالي المستندات" value={all.length} />
        <Kpi label="منتهية" value={all.filter((d) => bucket(d) === "expired").length} tone="danger" />
        <Kpi label={`تنتهي خلال ${maxWindow} يومًا`} value={all.filter((d) => bucket(d) === "soon").length} tone="warning" hint={`التنبيه عند ${alertDays.join("، ")} يوم`} />
        <Kpi label="مستندات ناقصة" value={missing.length} tone={missing.length ? "danger" : "success"} />
        <Kpi label="تفويضات سارية" value={(auths.data ?? []).filter((a) => (daysUntil(a.valid_to) ?? -1) >= 0).length} tone="success" />
      </div>
      <Tabs defaultValue="docs" dir="rtl">
        <TabsList><TabsTrigger value="docs">المستندات</TabsTrigger><TabsTrigger value="missing">الناقصة ({missing.length})</TabsTrigger><TabsTrigger value="auth">التفويضات</TabsTrigger></TabsList>
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
                { key: "expiry", label: "الانتهاء", render: (r) => <DocStageCell d={r.expiry_date} days={alertDays} /> },
                { key: "review", label: "المراجعة", render: (r) => <Status kind="review" value={r.review_status} /> },
                { key: "file", label: "المرفق", render: (r) => r.file_path ? <button className="text-gold underline" onClick={(e) => { e.stopPropagation(); void openFile(r.file_path); }}>عرض</button> : "—" },
              ]} />
          </Panel>
        </TabsContent>
        <TabsContent value="missing">
          <Panel title="المستندات المطلوبة غير المسجلة" icon={<FileText />}>
            <DataTable rows={missing.map((m) => ({ ...m, id: `${m.entity_type}:${m.entity_id}:${m.doc_type}` }))} loading={docs.isLoading || drivers.isLoading || assets.isLoading} searchKeys={["doc_type"]}
              cols={[
                { key: "entity", label: "الجهة", render: (r) => <span><Badge dot={false}>{r.entity_type === "asset" ? "مركبة" : "سائق"}</Badge> {names.get(r.entity_id) ?? "—"}</span> },
                { key: "doc_type", label: "المستند الناقص" },
                { key: "act", label: "", render: (r) => canEdit ? <Button size="sm" variant="outline" onClick={() => { setNewEntity(`${r.entity_type}:${r.entity_id}`); setPreset({ doc_type: r.doc_type }); setEdit(null); }}><Plus /> تسجيل</Button> : null },
              ]} />
            <p className="mt-3 text-xs text-muted-foreground">القائمة تُحسب من المستندات المطلوبة في الإعدادات؛ المستند المرفوض لا يُحتسب. التحقق عبر مزود خارجي غير مربوط.</p>
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
      <EntityDialog open={edit !== undefined} onOpenChange={(o) => { if (!o) { setEdit(undefined); setPreset(undefined); } }} title="مستند" table="documents" fields={DOC_FIELDS} record={edit ?? preset ?? null}
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

function DocStageCell({ d, days }: { d?: string | null; days: number[] }) {
  const st = docStage(daysUntil(d), days);
  if (st.kind === "undated") return <span className="text-muted-foreground">بدون تاريخ</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="num">{fmtDate(d)}</span>
      {st.kind === "expired" ? <Badge tone="danger">منتهٍ</Badge>
        : st.kind === "alert" ? <Badge tone={st.threshold <= Math.min(...days) ? "danger" : "warning"}>{`باقي ${st.days} يوم · تنبيه ${st.threshold}`}</Badge>
        : <Badge tone="success">ساري</Badge>}
    </span>
  );
}
