import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClipboardCheck, Plus, RotateCcw, ShieldCheck, Wrench } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, Kpi, PageHeader, Panel } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { Checklist, freshChecklist, type CheckAnswer } from "@/components/darb/Checklist";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, useRows, type Row } from "@/lib/db";
import { fetchAssets, fetchDrivers } from "@/lib/queries";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime, fmtNum } from "@/lib/format";

export const Route = createFileRoute("/custody")({
  head: () => ({
    meta: [
      { title: "العهد والفحص — دَرب" },
      { name: "description", content: "محاضر استلام العهد وقوائم الفحص والعيوب." },
      { property: "og:title", content: "العهد والفحص — دَرب" },
      { property: "og:description", content: "محاضر استلام العهد وقوائم الفحص." },
    ],
  }),
  component: () => (
    <AppShell>
      <CustodyPage />
    </AppShell>
  ),
});

const KINDS: [string, string][] = [["handover", "استلام"], ["pre_trip", "قبل الانطلاق"], ["loading", "التحميل والتثبيت"], ["unloading", "التفريغ"], ["return", "الإرجاع"], ["driver_change", "تغيير السائق"]];

function CustodyPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const custody = useRows(["custody"], () => db.from("custody").select("*, asset:assets(code,kind), driver:drivers(full_name,code)").order("opened_at", { ascending: false }));
  const insp = useRows(["inspections"], () => db.from("inspections").select("*, asset:assets(code), driver:drivers(full_name)").order("created_at", { ascending: false }).limit(200));
  const assets = useRows(["assets"], fetchAssets);
  const drivers = useRows(["drivers"], fetchDrivers);
  const [openC, setOpenC] = useState(false);
  const [ret, setRet] = useState<Row | null>(null);
  const [retOdo, setRetOdo] = useState("");
  const [retFuel, setRetFuel] = useState("");
  const [inspOpen, setInspOpen] = useState(false);
  const [inspAsset, setInspAsset] = useState("");
  const [inspDriver, setInspDriver] = useState("");
  const [inspKind, setInspKind] = useState("handover");
  const [answers, setAnswers] = useState<CheckAnswer[]>(freshChecklist());
  const canEdit = can("ops_manager", "fleet_supervisor");

  const open = (custody.data ?? []).filter((c) => !c.closed_at);
  const critical = (insp.data ?? []).filter((i) => i.has_critical && !i.resolved);

  async function closeCustody(transferTo?: string) {
    if (!ret) return;
    const { error } = await db.from("custody").update({ closed_at: new Date().toISOString(), odometer_in: retOdo ? Number(retOdo) : null, fuel_level_in: retFuel || null }).eq("id", ret.id);
    if (error) return void toast.error(errMsg(error));
    if (transferTo) {
      const { error: e2 } = await db.from("custody").insert({ asset_id: ret.asset_id, driver_id: transferTo, odometer_out: retOdo ? Number(retOdo) : null, fuel_level_out: retFuel || null, previous_custody_id: ret.id });
      if (e2) return void toast.error(errMsg(e2));
    }
    toast.success(transferTo ? "تم نقل العهدة مع حفظ السجل السابق" : "تم إرجاع العهدة");
    setRet(null);
    void qc.invalidateQueries({ queryKey: ["custody"] });
  }

  async function saveInspection(e: React.FormEvent) {
    e.preventDefault();
    if (answers.some((a) => a.result === "fail" && !a.reason)) return void toast.error("اذكر سبب كل بند غير سليم");
    const { error } = await db.from("inspections").insert({ asset_id: inspAsset, driver_id: inspDriver || null, kind: inspKind, template_version: "v1", items: answers });
    if (error) return void toast.error(errMsg(error));
    const crit = answers.some((a) => a.result === "fail" && a.severity === "critical");
    toast[crit ? "warning" : "success"](crit ? "سُجل الفحص — عيب حرج: أُوقفت المركبة حتى الإصلاح وإعادة الفحص" : "سُجل الفحص");
    setInspOpen(false);
    setAnswers(freshChecklist());
    void qc.invalidateQueries();
  }

  async function createWO(i: Row) {
    const desc = (i.items as CheckAnswer[]).filter((x) => x.result === "fail").map((x) => `${x.label}: ${x.reason ?? ""}`).join("، ");
    const { error } = await db.from("work_orders").insert({ asset_id: i.asset_id, kind: "corrective", description: `من فحص: ${desc}`, inspection_id: i.id });
    if (error) return void toast.error(errMsg(error));
    toast.success("أُنشئ أمر عمل للصيانة");
    void qc.invalidateQueries({ queryKey: ["work_orders"] });
  }

  return (
    <>
      <PageHeader title="العهد والفحص" subtitle="محاضر الاستلام والإرجاع، قوائم الفحص، والعيوب الحرجة" icon={<ClipboardCheck />}
        actions={canEdit && <>
          <Button variant="outline" onClick={() => setInspOpen(true)}><ShieldCheck /> فحص جديد</Button>
          <Button variant="gold" onClick={() => setOpenC(true)}><Plus /> محضر استلام عهدة</Button>
        </>} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="عهد مفتوحة" value={open.length} tone="info" />
        <Kpi label="بانتظار إقرار السائق" value={open.filter((c) => !c.acknowledged).length} tone="warning" />
        <Kpi label="فحوصات (آخر 200)" value={insp.data?.length ?? 0} />
        <Kpi label="عيوب حرجة مفتوحة" value={critical.length} tone={critical.length ? "danger" : undefined} />
      </div>
      <Tabs defaultValue="custody" dir="rtl">
        <TabsList><TabsTrigger value="custody">العهد</TabsTrigger><TabsTrigger value="insp">الفحوصات</TabsTrigger></TabsList>
        <TabsContent value="custody">
          <Panel title="سجل العهد" icon={<ClipboardCheck />}>
            <DataTable rows={custody.data} loading={custody.isLoading} error={custody.error} searchKeys={["asset.code", "driver.full_name"]} cols={[
              { key: "asset", label: "الأصل", render: (r) => <span className="num font-semibold text-primary">{r.asset?.code}</span> },
              { key: "driver", label: "السائق", render: (r) => r.driver?.full_name },
              { key: "opened_at", label: "الاستلام", render: (r) => <span className="num">{fmtDateTime(r.opened_at)}</span> },
              { key: "odo", label: "العداد عند الاستلام", render: (r) => <span className="num">{fmtNum(r.odometer_out)}</span> },
              { key: "fuel", label: "الوقود", render: (r) => r.fuel_level_out ?? "—" },
              { key: "ack", label: "الإقرار", render: (r) => (r.acknowledged ? <Badge tone="success">مُقر</Badge> : <Badge tone="warning">بانتظار</Badge>) },
              { key: "status", label: "الحالة", render: (r) => (r.closed_at ? <Badge>مُرجعة {fmtDateTime(r.closed_at)}</Badge> : <Badge tone="success">مفتوحة</Badge>) },
              { key: "act", label: "", render: (r) => canEdit && !r.closed_at && <Button size="sm" variant="outline" onClick={() => { setRet(r); setRetOdo(""); setRetFuel(""); }}><RotateCcw /> إرجاع/نقل</Button> },
            ]} />
          </Panel>
        </TabsContent>
        <TabsContent value="insp">
          <Panel title="الفحوصات" icon={<ShieldCheck />}>
            <DataTable rows={insp.data} loading={insp.isLoading} searchKeys={["asset.code", "driver.full_name"]} cols={[
              { key: "created_at", label: "التاريخ", render: (r) => <span className="num">{fmtDateTime(r.created_at)}</span> },
              { key: "asset", label: "الأصل", render: (r) => <span className="num">{r.asset?.code}</span> },
              { key: "kind", label: "النوع", render: (r) => KINDS.find((k) => k[0] === r.kind)?.[1] ?? r.kind },
              { key: "driver", label: "السائق", render: (r) => r.driver?.full_name ?? "—" },
              { key: "v", label: "إصدار القالب", render: (r) => r.template_version },
              { key: "fails", label: "العيوب", render: (r) => (r.items as CheckAnswer[]).filter((x) => x.result === "fail").map((x) => <Badge key={x.key} tone={x.severity === "critical" ? "danger" : "warning"}>{x.label}</Badge>) },
              { key: "res", label: "النتيجة", render: (r) => r.has_critical ? (r.resolved ? <Badge>حرج — مُعالج</Badge> : <Badge tone="danger">حرج — موقوفة</Badge>) : <Badge tone="success">جاهزة</Badge> },
              { key: "act", label: "", render: (r) => r.has_critical && !r.resolved && can("maintenance", "ops_manager") && <Button size="sm" variant="soft" onClick={() => void createWO(r)}><Wrench /> أمر عمل</Button> },
            ]} />
            <p className="mt-3 text-xs text-muted-foreground">العيب الحرج يُغلق فقط بإعادة فحص سليم بعد إغلاق أمر العمل (من شاشة الصيانة).</p>
          </Panel>
        </TabsContent>
      </Tabs>

      <EntityDialog open={openC} onOpenChange={setOpenC} title="محضر استلام عهدة" table="custody" invalidate={["custody"]} fields={[
        { name: "asset_id", label: "الأصل", type: "ref", required: true, ref: { table: "assets", label: (r) => `${r["code"]} — ${r["make_model"] ?? r["trailer_type"] ?? ""}` } },
        { name: "driver_id", label: "السائق", type: "ref", required: true, ref: { table: "drivers", label: "full_name" } },
        { name: "odometer_out", label: "العداد", type: "number" },
        { name: "fuel_level_out", label: "مستوى الوقود", type: "select", options: [["ممتلئ", "ممتلئ"], ["3/4", "3/4"], ["1/2", "1/2"], ["1/4", "1/4"], ["فارغ", "فارغ"]] },
        { name: "accessories", label: "الملحقات", full: true },
        { name: "damages", label: "التلفيات الموجودة", type: "textarea" },
      ]} />

      <Dialog open={!!ret} onOpenChange={(o) => !o && setRet(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إرجاع أو نقل عهدة {ret?.asset?.code}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="mb-1 block text-xs">العداد عند الإرجاع</Label><Input type="number" value={retOdo} onChange={(e) => setRetOdo(e.target.value)} /></div>
            <div><Label className="mb-1 block text-xs">الوقود</Label><Input value={retFuel} onChange={(e) => setRetFuel(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button onClick={() => void closeCustody()}>إرجاع فقط</Button>
            <select id="transfer" className="h-9 flex-1 rounded-md border bg-card px-2 text-sm" defaultValue="">
              <option value="">نقل إلى سائق…</option>
              {(drivers.data ?? []).filter((d) => d.id !== ret?.driver_id).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select>
            <Button variant="gold" onClick={() => { const v = (document.getElementById("transfer") as HTMLSelectElement).value; if (!v) return void toast.error("اختر السائق"); void closeCustody(v); }}>نقل</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={inspOpen} onOpenChange={setInspOpen}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>قائمة فحص (إصدار v1)</DialogTitle></DialogHeader>
          <form onSubmit={saveInspection} className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <select required value={inspAsset} onChange={(e) => setInspAsset(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-sm">
                <option value="">الأصل *</option>
                {(assets.data ?? []).map((a) => <option key={a.id} value={a.id}>{a.code}</option>)}
              </select>
              <select value={inspDriver} onChange={(e) => setInspDriver(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-sm">
                <option value="">السائق</option>
                {(drivers.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.full_name}</option>)}
              </select>
              <select value={inspKind} onChange={(e) => setInspKind(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-sm">
                {KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <Checklist value={answers} onChange={setAnswers} />
            <Button type="submit" variant="gold" className="w-full">حفظ الفحص</Button>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
