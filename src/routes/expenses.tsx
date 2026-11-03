import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Coins, Fuel, HandCoins, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/darb/AppShell";
import { DataTable, Kpi, PageHeader, Panel, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { openFile } from "@/components/darb/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, useRows } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime, fmtNum, fmtSAR } from "@/lib/format";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [
      { title: "الوقود والمصروفات والسلف — دَرب" },
      { name: "description", content: "تعبئة الديزل والمصروفات واعتمادها والسلف وتسويتها." },
      { property: "og:title", content: "الوقود والمصروفات — دَرب" },
      { property: "og:description", content: "تعبئة الديزل والمصروفات والسلف." },
    ],
  }),
  component: () => (
    <AppShell>
      <ExpensesPage />
    </AppShell>
  ),
});

export const EXP_CATS: [string, string][] = [["وجبات", "وجبات"], ["رسوم ميزان", "رسوم ميزان"], ["رسوم طرق", "رسوم طرق"], ["مبيت", "مبيت"], ["إصلاح طارئ", "إصلاح طارئ"], ["غسيل", "غسيل"], ["أخرى", "أخرى"]];

function ExpensesPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const fuel = useRows(["fuel"], () => db.from("fuel_entries").select("*, asset:assets(code), driver:drivers(full_name), trip:trips(number)").order("filled_at", { ascending: false }));
  const exp = useRows(["expenses"], () => db.from("expenses").select("*, driver:drivers(full_name), trip:trips(number)").order("spent_at", { ascending: false }));
  const adv = useRows(["advances"], () => db.from("advances").select("*, driver:drivers(full_name), trip:trips(number)").order("issued_at", { ascending: false }));
  const [dlg, setDlg] = useState<"fuel" | "exp" | "adv" | null>(null);
  const isAcc = can("accountant");
  const inv = () => void qc.invalidateQueries();

  async function review(id: string, ok: boolean) {
    const reason = ok ? null : window.prompt("سبب الرفض");
    if (!ok && !reason) return;
    const { error } = await db.rpc("review_expense", { p_id: id, p_approve: ok, p_reason: reason });
    if (error) return void toast.error(errMsg(error));
    toast.success(ok ? "تم الاعتماد" : "تم الرفض");
    inv();
  }
  async function reviewFuel(id: string, ok: boolean) {
    const { error } = await db.from("fuel_entries").update({ status: ok ? "approved" : "rejected" }).eq("id", id);
    if (error) return void toast.error(errMsg(error));
    inv();
  }
  async function settle(id: string) {
    const { data, error } = await db.rpc("settle_advance", { p_id: id });
    if (error) return void toast.error(errMsg(error));
    const b = Number(data);
    toast.success(b >= 0 ? `تمت التسوية — مبلغ يعاد من السائق: ${fmtSAR(b)}` : `تمت التسوية — مستحق للسائق: ${fmtSAR(-b)}`);
    inv();
  }

  const f = fuel.data ?? [], e = exp.data ?? [], a = adv.data ?? [];
  const liters = f.filter((x) => x.status === "approved").reduce((s, x) => s + Number(x.liters), 0);
  return (
    <>
      <PageHeader title="الوقود والمصروفات والسلف" subtitle="السلفة ليست تكلفة عند الصرف؛ المصروف المعتمد هو التكلفة، والتسوية لا تكرره." icon={<Coins />} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="لترات معتمدة" value={`${fmtNum(liters)} L`} />
        <Kpi label="قيمة الوقود المعتمد" value={fmtSAR(f.filter((x) => x.status === "approved").reduce((s, x) => s + Number(x.amount), 0))} />
        <Kpi label="مصروفات بانتظار الاعتماد" value={e.filter((x) => x.status === "pending").length} tone="warning" />
        <Kpi label="مصروفات معتمدة" value={fmtSAR(e.filter((x) => x.status === "approved").reduce((s, x) => s + Number(x.amount), 0))} tone="success" />
        <Kpi label="سلف مفتوحة" value={fmtSAR(a.filter((x) => x.status === "open").reduce((s, x) => s + Number(x.amount), 0))} tone="info" />
      </div>
      <Tabs defaultValue="exp" dir="rtl">
        <TabsList><TabsTrigger value="exp">المصروفات</TabsTrigger><TabsTrigger value="fuel">الديزل</TabsTrigger><TabsTrigger value="adv">السلف</TabsTrigger></TabsList>
        <TabsContent value="exp">
          <Panel title="المصروفات" icon={<Coins />} actions={can("ops_manager", "accountant") && <Button size="sm" variant="gold" onClick={() => setDlg("exp")}><Plus /> مصروف</Button>}>
            <DataTable rows={e} loading={exp.isLoading} error={exp.error} searchKeys={["category", "driver.full_name", "trip.number", "description"]} cols={[
              { key: "at", label: "التاريخ", render: (r) => <span className="num">{fmtDateTime(r.spent_at)}</span> },
              { key: "driver", label: "السائق", render: (r) => r.driver?.full_name ?? "—" },
              { key: "trip", label: "الرحلة", render: (r) => <span className="num">{r.trip?.number ?? "—"}</span> },
              { key: "category", label: "الفئة" },
              { key: "amount", label: "المبلغ", render: (r) => <span className="num">{fmtSAR(r.amount)}</span> },
              { key: "pm", label: "طريقة الدفع", render: (r) => ({ advance: "من السلفة", company_card: "بطاقة الشركة", driver_cash: "نقدًا من السائق" })[r.payment_method as "advance"] ?? r.payment_method },
              { key: "rcpt", label: "الإيصال", render: (r) => r.receipt_path ? <button className="text-gold underline" onClick={() => void openFile(r.receipt_path)}>عرض</button> : "—" },
              { key: "status", label: "الحالة", render: (r) => <span className="flex items-center gap-1"><Status kind="review" value={r.status} />{r.reject_reason && <span className="text-xs text-muted-foreground">({r.reject_reason})</span>}</span> },
              { key: "act", label: "", render: (r) => isAcc && r.status === "pending" && <div className="flex gap-1"><Button size="icon" className="size-7" onClick={() => void review(r.id, true)}><Check /></Button><Button size="icon" variant="outline" className="size-7" onClick={() => void review(r.id, false)}><X /></Button></div> },
            ]} />
          </Panel>
        </TabsContent>
        <TabsContent value="fuel">
          <Panel title="تعبئة الديزل" icon={<Fuel />} actions={can("ops_manager", "fleet_supervisor", "accountant") && <Button size="sm" variant="gold" onClick={() => setDlg("fuel")}><Plus /> تعبئة</Button>}>
            <DataTable rows={f} loading={fuel.isLoading} searchKeys={["asset.code", "driver.full_name", "station"]} cols={[
              { key: "at", label: "التاريخ", render: (r) => <span className="num">{fmtDateTime(r.filled_at)}</span> },
              { key: "asset", label: "الأصل", render: (r) => <span className="num">{r.asset?.code}</span> },
              { key: "driver", label: "السائق", render: (r) => r.driver?.full_name ?? "—" },
              { key: "station", label: "المحطة" },
              { key: "liters", label: "اللترات", render: (r) => <span className="num">{fmtNum(r.liters, 1)} L</span> },
              { key: "price", label: "سعر اللتر", render: (r) => <span className="num">{fmtNum(r.unit_price, 2)}</span> },
              { key: "amount", label: "المبلغ", render: (r) => <span className="num">{fmtSAR(r.amount)}</span> },
              { key: "odo", label: "العداد", render: (r) => <span className="num">{fmtNum(r.odometer)}</span> },
              { key: "full", label: "التعبئة", render: (r) => (r.full_tank ? "كاملة" : "جزئية") },
              { key: "status", label: "الحالة", render: (r) => <Status kind="review" value={r.status} /> },
              { key: "act", label: "", render: (r) => isAcc && r.status === "pending" && <div className="flex gap-1"><Button size="icon" className="size-7" onClick={() => void reviewFuel(r.id, true)}><Check /></Button><Button size="icon" variant="outline" className="size-7" onClick={() => void reviewFuel(r.id, false)}><X /></Button></div> },
            ]} />
            <p className="mt-3 text-xs text-muted-foreground">التعبئة ليست استهلاكًا. معدل الاستهلاك يُحسب في التقارير بين تعبئتين كاملتين فقط عند كفاية البيانات.</p>
          </Panel>
        </TabsContent>
        <TabsContent value="adv">
          <Panel title="السلف" icon={<HandCoins />} actions={isAcc && <Button size="sm" variant="gold" onClick={() => setDlg("adv")}><Plus /> صرف سلفة</Button>}>
            <DataTable rows={a} loading={adv.isLoading} cols={[
              { key: "driver", label: "السائق", render: (r) => r.driver?.full_name },
              { key: "trip", label: "الرحلة", render: (r) => r.trip?.number ?? "عامة" },
              { key: "amount", label: "المبلغ", render: (r) => <span className="num">{fmtSAR(r.amount)}</span> },
              { key: "issued", label: "الصرف", render: (r) => <span className="num">{fmtDateTime(r.issued_at)}</span> },
              { key: "spent", label: "مصروفات معتمدة", render: (r) => <span className="num">{r.settled_expenses === null ? "—" : fmtSAR(r.settled_expenses)}</span> },
              { key: "bal", label: "الرصيد", render: (r) => r.balance === null ? "—" : <span className="num">{Number(r.balance) >= 0 ? `يعاد ${fmtSAR(r.balance)}` : `مستحق للسائق ${fmtSAR(-r.balance)}`}</span> },
              { key: "status", label: "الحالة", render: (r) => <Status kind="advance" value={r.status} /> },
              { key: "act", label: "", render: (r) => isAcc && r.status === "open" && <Button size="sm" variant="soft" onClick={() => void settle(r.id)}>تسوية</Button> },
            ]} />
          </Panel>
        </TabsContent>
      </Tabs>
      <EntityDialog open={dlg === "exp"} onOpenChange={(o) => !o && setDlg(null)} title="مصروف" table="expenses" invalidate={["expenses"]} fields={[
        { name: "driver_id", label: "السائق", type: "ref", ref: { table: "drivers", label: "full_name" } },
        { name: "trip_id", label: "الرحلة", type: "ref", ref: { table: "trips", label: "number" } },
        { name: "category", label: "الفئة", type: "select", required: true, options: EXP_CATS },
        { name: "amount", label: "المبلغ", type: "number", required: true },
        { name: "payment_method", label: "طريقة الدفع", type: "select", default: "advance", options: [["advance", "من السلفة"], ["company_card", "بطاقة الشركة"], ["driver_cash", "نقدًا من السائق"]] },
        { name: "receipt_path", label: "الإيصال", type: "file" },
        { name: "description", label: "الوصف", type: "textarea" },
      ]} />
      <EntityDialog open={dlg === "fuel"} onOpenChange={(o) => !o && setDlg(null)} title="تعبئة ديزل" table="fuel_entries" invalidate={["fuel"]}
        transform={(v) => ({ ...v, amount: v["amount"] ?? Math.round(Number(v["liters"]) * Number(v["unit_price"]) * 100) / 100 })} fields={[
        { name: "asset_id", label: "الأصل", type: "ref", required: true, ref: { table: "assets", label: "code", filter: (q) => q.neq("kind", "trailer") } },
        { name: "driver_id", label: "السائق", type: "ref", ref: { table: "drivers", label: "full_name" } },
        { name: "trip_id", label: "الرحلة", type: "ref", ref: { table: "trips", label: "number" } },
        { name: "station", label: "المحطة" },
        { name: "liters", label: "اللترات", type: "number", required: true },
        { name: "unit_price", label: "سعر اللتر", type: "number", required: true, default: 1.66 },
        { name: "amount", label: "المبلغ (يُحسب تلقائيًا إن تُرك)", type: "number" },
        { name: "odometer", label: "العداد", type: "number" },
        { name: "full_tank", label: "تعبئة كاملة", type: "checkbox", default: true },
        { name: "receipt_path", label: "الفاتورة", type: "file" },
      ]} />
      <EntityDialog open={dlg === "adv"} onOpenChange={(o) => !o && setDlg(null)} title="صرف سلفة" table="advances" invalidate={["advances"]} fields={[
        { name: "driver_id", label: "السائق", type: "ref", required: true, ref: { table: "drivers", label: "full_name" } },
        { name: "trip_id", label: "الرحلة", type: "ref", ref: { table: "trips", label: "number" } },
        { name: "amount", label: "المبلغ", type: "number", required: true },
        { name: "notes", label: "ملاحظات", type: "textarea" },
      ]} />
    </>
  );
}
