import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CircleDot, Package, Plus, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, Kpi, PageHeader, Panel, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, useRows, type Row } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { daysUntil, errMsg, fmtDate, fmtDateTime, fmtNum, fmtSAR, STATUS } from "@/lib/format";

export const Route = createFileRoute("/maintenance")({
  head: () => ({
    meta: [
      { title: "الصيانة والإطارات والمخزون — دَرب" },
      { name: "description", content: "أوامر العمل والصيانة الدورية والإطارات والمخزون." },
      { property: "og:title", content: "الصيانة والمخزون — دَرب" },
      { property: "og:description", content: "أوامر العمل والصيانة الدورية والإطارات والمخزون." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <MaintPage />
    </AppShell>
  ),
});

const WO_FLOW = ["open", "diagnosis", "waiting_parts", "in_progress", "completed", "closed"];

function MaintPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const wos = useRows(["work_orders"], () => db.from("work_orders").select("*, asset:assets(code,odometer_km)").order("opened_at", { ascending: false }));
  const plans = useRows(["maintenance_plans"], () => db.from("maintenance_plans").select("*, asset:assets(code,odometer_km)"));
  const parts = useRows(["parts"], () => db.from("parts").select("*").order("name"));
  const moves = useRows(["stock_moves"], () => db.from("stock_moves").select("*, part:parts(name), wo:work_orders(number)").order("created_at", { ascending: false }).limit(100));
  const tires = useRows(["tires"], () => db.from("tires").select("*, mounts:tire_mounts(id,position,axle,removed_at,asset:assets(code))").order("serial"));
  const crit = useRows(["inspections", "critical"], () => db.from("inspections").select("*, asset:assets(code)").eq("has_critical", true).eq("resolved", false));
  const [dlg, setDlg] = useState<"wo" | "plan" | "part" | "move" | "tire" | "mount" | null>(null);
  const [rec, setRec] = useState<Row | null>(null);
  const canEdit = can("maintenance", "ops_manager");
  const inv = () => void qc.invalidateQueries();

  async function setStatus(id: string, s: string) {
    const { error } = await db.rpc("set_work_order_status", { p_id: id, p_status: s });
    if (error) return void toast.error(errMsg(error));
    toast.success("تم تحديث الحالة");
    inv();
  }
  async function reinspect(id: string) {
    const { error } = await db.rpc("reinspect_ok", { p_inspection_id: id });
    if (error) return void toast.error(errMsg(error));
    toast.success("سُجلت إعادة الفحص وأُعيدت المركبة للجاهزية");
    inv();
  }
  async function unmount(id: string) {
    const { error } = await db.from("tire_mounts").update({ removed_at: new Date().toISOString() }).eq("id", id);
    if (error) return void toast.error(errMsg(error));
    inv();
  }

  const all = wos.data ?? [];
  const openW = all.filter((w) => !["completed", "closed"].includes(w.status));
  const dueOf = (p: Row) => {
    const km = p.interval_km && p.last_done_km != null ? Number(p.last_done_km) + Number(p.interval_km) - Number(p.asset?.odometer_km ?? 0) : null;
    const days = p.interval_days && p.last_done_at ? (daysUntil(p.last_done_at) ?? 0) + Number(p.interval_days) : null;
    return { km, days, due: (km !== null && km <= 1000) || (days !== null && days <= 7) };
  };

  return (
    <>
      <PageHeader title="الصيانة والإطارات والمخزون" subtitle="عيب/بلاغ ← أمر عمل ← تشخيص ← انتظار قطع ← جارٍ ← مكتمل ← مغلق" icon={<Wrench />}
        actions={<Button asChild><Link to="/repair-center"><Wrench/> مركز الصيانة والموافقات</Link></Button>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="أوامر مفتوحة" value={openW.length} tone="warning" />
        <Kpi label="انتظار قطع" value={all.filter((w) => w.status === "waiting_parts").length} />
        <Kpi label="عيوب حرجة مفتوحة" value={crit.data?.length ?? 0} tone={crit.data?.length ? "danger" : undefined} />
        <Kpi label="صيانة دورية مستحقة" value={(plans.data ?? []).filter((p) => dueOf(p).due).length} tone="info" />
        <Kpi label="أصناف تحت حد الطلب" value={(parts.data ?? []).filter((p) => Number(p.qty_on_hand) <= Number(p.reorder_level)).length} />
      </div>

      {(crit.data ?? []).length > 0 && (
        <Panel title="عيوب حرجة بانتظار الإصلاح وإعادة الفحص" icon={<ShieldCheck />} className="mb-5">
          <div className="space-y-2">
            {(crit.data??[]).map((i) => (
              <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-danger-soft p-3 text-sm">
                <span><b className="num">{i.asset?.code}</b> — {fmtDateTime(i.created_at)}</span>
                {canEdit && <Button size="sm" onClick={() => void reinspect(i.id)}>إعادة فحص سليم</Button>}
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Tabs defaultValue="wo" dir="rtl">
        <TabsList>
          <TabsTrigger value="wo">أوامر العمل</TabsTrigger>
          <TabsTrigger value="plans">الصيانة الدورية</TabsTrigger>
          <TabsTrigger value="tires">الإطارات</TabsTrigger>
          <TabsTrigger value="stock">المخزون</TabsTrigger>
        </TabsList>
        <TabsContent value="wo">
          <Panel title="أوامر العمل" icon={<Wrench />}>
            <DataTable rows={all} loading={wos.isLoading} error={wos.error} searchKeys={["number", "asset.code", "description", "workshop"]} cols={[
              { key: "number", label: "الأمر", render: (r) => <span className="num font-semibold text-primary">{r.number}</span> },
              { key: "asset", label: "الأصل", render: (r) => <span className="num">{r.asset?.code}</span> },
              { key: "kind", label: "النوع", render: (r) => (r.kind === "preventive" ? "دورية" : "تصحيحية") },
              { key: "description", label: "الوصف", className: "max-w-xs truncate" },
              { key: "workshop", label: "الورشة/الفني", render: (r) => [r.workshop, r.technician].filter(Boolean).join(" • ") || "—" },
              { key: "opened", label: "الفتح", render: (r) => <span className="num">{fmtDate(r.opened_at)}</span> },
              { key: "cost", label: "قطع + أجور", render: (r) => <span className="num">{fmtSAR(Number(r.parts_cost) + Number(r.labor_cost))}</span> },
              { key: "status", label: "الحالة", render: (r) => <Status kind="wo" value={r.status} /> },
              { key: "act", label: "", render: (r) => canEdit && r.status !== "closed" && (
                <div className="flex gap-1">
                  <Button asChild size="sm" variant="outline"><Link to="/repair-center">دورة الاعتماد</Link></Button>
                </div>
              ) },
            ]} />
          </Panel>
        </TabsContent>
        <TabsContent value="plans">
          <Panel title="خطط الصيانة الدورية" icon={<Wrench />} actions={canEdit && <Button size="sm" variant="gold" onClick={() => { setRec(null); setDlg("plan"); }}><Plus /> خطة</Button>}>
            <DataTable rows={plans.data} loading={plans.isLoading} onEdit={canEdit ? (r) => { setRec(r); setDlg("plan"); } : undefined} onRowClick={canEdit ? (r) => { setRec(r); setDlg("plan"); } : undefined} cols={[
              { key: "asset", label: "الأصل", render: (r) => <span className="num">{r.asset?.code}</span> },
              { key: "title", label: "الخطة" },
              { key: "interval", label: "الفاصل", render: (r) => [r.interval_km && `${fmtNum(r.interval_km)} كم`, r.interval_days && `${r.interval_days} يوم`].filter(Boolean).join(" أو ") },
              { key: "last", label: "آخر تنفيذ", render: (r) => <span className="num">{fmtDate(r.last_done_at)} • {fmtNum(r.last_done_km)} كم</span> },
              { key: "rem", label: "المتبقي", render: (r) => { const d = dueOf(r); return <span className="num">{d.km !== null ? `${fmtNum(d.km)} كم` : ""} {d.days !== null ? `${d.days} يوم` : ""}</span>; } },
              { key: "due", label: "", render: (r) => (dueOf(r).due ? <Badge tone="warning">مستحقة</Badge> : <Badge tone="success">ضمن الموعد</Badge>) },
            ]} />
          </Panel>
        </TabsContent>
        <TabsContent value="tires">
          <Panel title="الإطارات" icon={<CircleDot />} actions={canEdit && <>
            <Button size="sm" variant="outline" onClick={() => { setRec(null); setDlg("mount"); }}>تركيب إطار</Button>
            <Button size="sm" variant="gold" onClick={() => { setRec(null); setDlg("tire"); }}><Plus /> إطار</Button>
          </>}>
            <DataTable rows={tires.data} loading={tires.isLoading} searchKeys={["serial", "brand", "size"]} cols={[
              { key: "serial", label: "الرقم التسلسلي", render: (r) => <span className="num font-semibold">{r.serial}</span> },
              { key: "size", label: "المقاس", render: (r) => <span className="num">{r.size}</span> },
              { key: "brand", label: "الشركة" },
              { key: "cost", label: "التكلفة", render: (r) => <span className="num">{fmtSAR(r.cost)}</span> },
              { key: "status", label: "الحالة", render: (r) => <Status kind="tire" value={r.status} /> },
              { key: "pos", label: "التركيب الحالي", render: (r) => { const m = (r.mounts ?? []).find((x: Row) => !x.removed_at); return m ? <span>{m.asset?.code} • {m.position} {canEdit && <button className="mr-2 text-xs text-danger underline" onClick={() => void unmount(m.id)}>فك</button>}</span> : "—"; } },
            ]} />
          </Panel>
        </TabsContent>
        <TabsContent value="stock">
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="الأصناف" icon={<Package />} actions={can("maintenance") && <Button size="sm" variant="gold" onClick={() => { setRec(null); setDlg("part"); }}><Plus /> صنف</Button>}>
              <DataTable rows={parts.data} loading={parts.isLoading} searchKeys={["sku", "name"]} cols={[
                { key: "sku", label: "الرمز", render: (r) => <span className="num">{r.sku}</span> },
                { key: "name", label: "الصنف" },
                { key: "qty", label: "الرصيد", render: (r) => <span className="num">{fmtNum(r.qty_on_hand)} {r.unit}</span> },
                { key: "cost", label: "تكلفة الوحدة", render: (r) => <span className="num">{fmtSAR(r.unit_cost)}</span> },
                { key: "re", label: "", render: (r) => Number(r.qty_on_hand) <= Number(r.reorder_level) && <Badge tone="warning">إعادة طلب</Badge> },
              ]} />
            </Panel>
            <Panel title="حركات المخزون" icon={<Package />} actions={can("maintenance") && <Button size="sm" variant="gold" onClick={() => { setRec(null); setDlg("move"); }}><Plus /> حركة</Button>}>
              <DataTable rows={moves.data} loading={moves.isLoading} cols={[
                { key: "at", label: "التاريخ", render: (r) => <span className="num">{fmtDateTime(r.created_at)}</span> },
                { key: "part", label: "الصنف", render: (r) => r.part?.name },
                { key: "kind", label: "النوع", render: (r) => ({ receive: "استلام", issue: "صرف", return: "إرجاع", adjust: "تسوية" })[r.kind as "receive"] },
                { key: "qty", label: "الكمية", render: (r) => <span className="num">{fmtNum(r.qty)}</span> },
                { key: "wo", label: "أمر العمل", render: (r) => r.wo?.number ?? "—" },
              ]} />
            </Panel>
          </div>
        </TabsContent>
      </Tabs>

      <EntityDialog open={dlg === "wo"} onOpenChange={(o) => !o && setDlg(null)} title={rec ? `أمر العمل ${rec.number}` : "أمر عمل جديد"} table="work_orders" record={rec} invalidate={["work_orders"]} fields={[
        { name: "asset_id", label: "الأصل", type: "ref", required: true, ref: { table: "assets", label: "code" } },
        { name: "kind", label: "النوع", type: "select", required: true, default: "corrective", options: [["corrective", "تصحيحية"], ["preventive", "دورية"]] },
        { name: "description", label: "الوصف / التشخيص", type: "textarea", required: true },
        { name: "workshop", label: "الورشة" },
        { name: "technician", label: "الفني" },
        { name: "labor_cost", label: "الأجور (ر.س)", type: "number", default: 0 },
        { name: "vendor_invoice_ref", label: "رقم فاتورة المورد", hint: "فريد — يمنع تكرار احتساب التكلفة" },
      ]} />
      <EntityDialog open={dlg === "plan"} onOpenChange={(o) => !o && setDlg(null)} title="خطة صيانة دورية" table="maintenance_plans" record={rec} invalidate={["maintenance_plans"]} fields={[
        { name: "asset_id", label: "الأصل", type: "ref", required: true, ref: { table: "assets", label: "code" } },
        { name: "title", label: "العنوان", required: true },
        { name: "interval_km", label: "كل (كم)", type: "number" },
        { name: "interval_days", label: "كل (يوم)", type: "number" },
        { name: "last_done_at", label: "آخر تنفيذ", type: "date" },
        { name: "last_done_km", label: "العداد عند آخر تنفيذ", type: "number" },
      ]} />
      <EntityDialog open={dlg === "part"} onOpenChange={(o) => !o && setDlg(null)} title="صنف مخزون" table="parts" record={rec} invalidate={["parts"]} fields={[
        { name: "sku", label: "الرمز", required: true },
        { name: "name", label: "الاسم", required: true },
        { name: "unit", label: "الوحدة", default: "قطعة" },
        { name: "unit_cost", label: "تكلفة الوحدة", type: "number", default: 0 },
        { name: "reorder_level", label: "حد إعادة الطلب", type: "number", default: 0 },
      ]} />
      <EntityDialog open={dlg === "move"} onOpenChange={(o) => !o && setDlg(null)} title="حركة مخزون" table="stock_moves" invalidate={["stock_moves", "parts", "work_orders"]}
        extra={{ client_ref: typeof crypto !== "undefined" ? crypto.randomUUID() : undefined }} fields={[
        { name: "part_id", label: "الصنف", type: "ref", required: true, ref: { table: "parts", label: (r) => `${r["name"]} (رصيد ${r["qty_on_hand"]})` } },
        { name: "kind", label: "النوع", type: "select", required: true, options: [["receive", "استلام"], ["issue", "صرف"], ["return", "إرجاع"], ["adjust", "تسوية (±)"]] },
        { name: "qty", label: "الكمية", type: "number", required: true },
        { name: "unit_cost", label: "تكلفة الوحدة", type: "number", default: 0 },
        { name: "work_order_id", label: "أمر العمل (للصرف)", type: "ref", ref: { table: "work_orders", label: "number", filter: (q) => q.not("status", "eq", "closed") } },
        { name: "notes", label: "ملاحظات", type: "textarea" },
      ]} />
      <EntityDialog open={dlg === "tire"} onOpenChange={(o) => !o && setDlg(null)} title="إطار جديد" table="tires" invalidate={["tires"]} fields={[
        { name: "serial", label: "الرقم التسلسلي", required: true },
        { name: "size", label: "المقاس" },
        { name: "brand", label: "الشركة" },
        { name: "cost", label: "التكلفة", type: "number" },
      ]} />
      <EntityDialog open={dlg === "mount"} onOpenChange={(o) => !o && setDlg(null)} title="تركيب إطار" table="tire_mounts" invalidate={["tires"]} fields={[
        { name: "tire_id", label: "الإطار", type: "ref", required: true, ref: { table: "tires", label: "serial", filter: (q) => q.eq("status", "in_stock") } },
        { name: "asset_id", label: "الأصل", type: "ref", required: true, ref: { table: "assets", label: "code" } },
        { name: "position", label: "الموضع", required: true, hint: "مثال: محور 1 يمين خارجي" },
        { name: "axle", label: "المحور", type: "number" },
        { name: "mounted_km", label: "العداد عند التركيب", type: "number" },
      ]} />
    </>
  );
}
