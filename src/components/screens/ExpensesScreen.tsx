import { useState } from "react";
import { Check, CircleCheck, Clock, Coins, FileText, Fuel, HandCoins, Pencil, Plus, Trash2, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/darb/AppShell";
import { DataTable, Empty, Kpi, KV, PageHeader, Panel, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { openFile } from "@/components/darb/shared";
import { DeleteConfirmation } from "@/components/darb/DeleteConfirmation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, useRows, type Row } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { errMsg, fmtDateTime, fmtNum, fmtSAR } from "@/lib/format";

import { useScreenSearch } from "@/lib/screen-navigation";
const EXP_CATS: [string, string][] = [["وجبات", "وجبات"], ["رسوم ميزان", "رسوم ميزان"], ["رسوم طرق", "رسوم طرق"], ["مبيت", "مبيت"], ["إصلاح طارئ", "إصلاح طارئ"], ["غسيل", "غسيل"], ["أخرى", "أخرى"]];

function ExpensesPage() {
  const qc = useQueryClient();
  const auth = useAuth();
  const can = (...roles: Parameters<typeof auth.can>) => !auth.viewAs && auth.can(...roles);
  const search = useScreenSearch();
  const fuel = useRows(["fuel"], () => db.from("fuel_entries").select("*, asset:assets(code), driver:drivers(full_name), trip:trips(number)").order("filled_at", { ascending: false }));
  const exp = useRows(["expenses"], () => db.from("expenses").select("*, driver:drivers(full_name), trip:trips(number)").order("spent_at", { ascending: false }));
  const adv = useRows(["advances"], () => db.from("advances").select("*, driver:drivers(full_name), trip:trips(number)").order("issued_at", { ascending: false }));
  const [dlg, setDlg] = useState<"fuel" | "exp" | "adv" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(search.id ?? null);
  const isAcc = can("accountant");
  const canExp = can("ops_manager", "accountant");
  const canFuel = can("ops_manager", "fleet_supervisor", "accountant");
  const inv = () => void qc.invalidateQueries();
  const [rec, setRec] = useState<Row | null>(null);
  const open = (kind: "fuel" | "exp" | "adv", row: Row | null = null) => { setRec(row); setDlg(kind); };
  const [del, setDel] = useState<{ table: "expenses" | "fuel_entries" | "advances"; row: Row; label: string } | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  async function confirmDelete() {
    if (!del) return;
    setDelBusy(true);
    const { data, error } = await db.from(del.table).delete().eq("id", del.row.id).select("id");
    setDelBusy(false);
    if (error) return void toast.error(errMsg(error));
    if (!data?.length) return void toast.error("لم يتم الحذف؛ تحقق من صلاحياتك");
    toast.success("تم الحذف، ويبقى أثره في سجل التدقيق");
    setDel(null);
    inv();
  }
  async function reopenExpense(id: string) {
    const { error } = await db.rpc("expense_reopen", { p_id: id });
    if (error) return void toast.error(errMsg(error));
    toast.success("رجع المصروف للمراجعة ويمكن تعديله الآن");
    inv();
  }
  async function reopenFuel(id: string) {
    const { error } = await db.from("fuel_entries").update({ status: "pending" }).eq("id", id);
    if (error) return void toast.error(errMsg(error));
    toast.success("رجعت التعبئة للمراجعة");
    inv();
  }
  async function reopenAdvance(id: string) {
    const { error } = await db.rpc("advance_reopen", { p_id: id });
    if (error) return void toast.error(errMsg(error));
    toast.success("أُعيد فتح السلفة؛ يمكن تعديل مصروفاتها ثم تسويتها من جديد");
    inv();
  }
  const editBtn = (onClick: () => void) => <Button size="icon" variant="ghost" className="size-7" aria-label="تعديل" title="تعديل" onClick={onClick}><Pencil className="size-4" /></Button>;
  const delBtn = (onClick: () => void) => <Button size="icon" variant="ghost" className="size-7" aria-label="حذف" title="حذف" onClick={onClick}><Trash2 className="size-4 text-danger" /></Button>;
  const reopenBtn = (onClick: () => void, title: string) => <Button size="icon" variant="ghost" className="size-7" aria-label={title} title={title} onClick={onClick}><Undo2 className="size-4" /></Button>;

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

  const match = (r: Row) => (!search.status || r.status === search.status) && (!search.id || r.id === search.id);
  const f = (fuel.data ?? []).filter(match), e = (exp.data ?? []).filter(match), a = (adv.data ?? []).filter(match);
  const selected = e.find((r) => r.id === selectedId) ?? e[0] ?? null;
  const liters = f.filter((x) => x.status === "approved").reduce((s, x) => s + Number(x.liters), 0);
  return (
    <>
      <PageHeader title="الوقود والمصروفات والسلف" subtitle="السلفة ليست تكلفة عند الصرف؛ المصروف المعتمد هو التكلفة، والتسوية لا تكرره." icon={<Coins />} />
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="لترات معتمدة" value={`${fmtNum(liters)} L`} icon={<Fuel />} />
        <Kpi label="قيمة الوقود المعتمد" value={fmtSAR(f.filter((x) => x.status === "approved").reduce((s, x) => s + Number(x.amount), 0))} icon={<Coins />} />
        <Kpi label="مصروفات بانتظار الاعتماد" value={e.filter((x) => x.status === "pending").length} tone="warning" icon={<Clock />} />
        <Kpi label="مصروفات معتمدة" value={fmtSAR(e.filter((x) => x.status === "approved").reduce((s, x) => s + Number(x.amount), 0))} tone="success" icon={<CircleCheck />} />
        <Kpi label="سلف مفتوحة" value={fmtSAR(a.filter((x) => x.status === "open").reduce((s, x) => s + Number(x.amount), 0))} tone="info" icon={<HandCoins />} />
      </div>
      <Tabs defaultValue={search.tab === "fuel" ? "fuel" : search.tab === "adv" ? "adv" : "exp"} dir="rtl">
        <TabsList><TabsTrigger value="exp">المصروفات</TabsTrigger><TabsTrigger value="fuel">الديزل</TabsTrigger><TabsTrigger value="adv">السلف</TabsTrigger></TabsList>
        <TabsContent value="exp">
          <Panel title="المصروفات" icon={<Coins />} actions={can("ops_manager", "accountant") && <Button size="sm" variant="gold" onClick={() => open("exp")}><Plus /> مصروف</Button>}>
            <DataTable rows={e} loading={exp.isLoading} error={exp.error} selectedId={selected?.id} onRowClick={(r) => setSelectedId(r.id)} searchKeys={["category", "driver.full_name", "trip.number", "description"]} cols={[
              { key: "at", label: "التاريخ", render: (r) => <span className="num">{fmtDateTime(r.spent_at)}</span> },
              { key: "driver", label: "السائق", render: (r) => r.driver?.full_name ?? "—" },
              { key: "trip", label: "الرحلة", render: (r) => <span className="num">{r.trip?.number ?? "—"}</span> },
              { key: "category", label: "الفئة" },
              { key: "amount", label: "المبلغ", render: (r) => <span className="num">{fmtSAR(r.amount)}</span> },
              { key: "pm", label: "طريقة الدفع", render: (r) => ({ advance: "من السلفة", company_card: "بطاقة الشركة", driver_cash: "نقدًا من السائق" })[r.payment_method as "advance"] ?? r.payment_method },
              { key: "rcpt", label: "الإيصال", render: (r) => r.receipt_path ? <button className="text-gold underline" onClick={() => void openFile(r.receipt_path)}>عرض</button> : "—" },
              { key: "status", label: "الحالة", render: (r) => <span className="flex items-center gap-1"><Status kind="review" value={r.status} />{r.reject_reason && <span className="text-xs text-muted-foreground">({r.reject_reason})</span>}</span> },
              { key: "act", label: "", render: (r) => <div className="flex gap-1" onClick={(ev) => ev.stopPropagation()}>
                {isAcc && r.status === "pending" && <><Button size="icon" className="size-7" aria-label="اعتماد" onClick={() => void review(r.id, true)}><Check /></Button><Button size="icon" variant="outline" className="size-7" aria-label="رفض" onClick={() => void review(r.id, false)}><X /></Button></>}
                {isAcc && r.status !== "pending" && reopenBtn(() => void reopenExpense(r.id), "إعادة للمراجعة")}
                {canExp && r.status !== "approved" && editBtn(() => open("exp", r))}
                {canExp && delBtn(() => setDel({ table: "expenses", row: r, label: `مصروف ${r.category} ${fmtSAR(r.amount)}` }))}
              </div> },
            ]} />
          </Panel>
          <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Panel title="تفاصيل المصروف" icon={<FileText />} actions={selected && <Status kind="review" value={selected.status} />}>
              {selected ? <KV items={[
                ["الرحلة", <span className="num">{selected.trip?.number ?? "—"}</span>],
                ["السائق", selected.driver?.full_name ?? "—"],
                ["التاريخ", <span className="num">{fmtDateTime(selected.spent_at)}</span>],
                ["الفئة", selected.category ?? "—"],
                ["المبلغ", <span className="num font-semibold">{fmtSAR(selected.amount)}</span>],
                ["طريقة الدفع", ({ advance: "من السلفة", company_card: "بطاقة الشركة", driver_cash: "نقدًا من السائق" })[selected.payment_method as "advance"] ?? selected.payment_method ?? "—"],
                ["الوصف", selected.description ?? "—"],
                ...(selected.reject_reason ? [["سبب الرفض", selected.reject_reason] as [string, string]] : []),
              ]} /> : <Empty text="لا توجد مصروفات" />}
            </Panel>
            <Panel title="إيصال المصروف" icon={<FileText />}>
              <div className="rounded-xl border border-dashed p-6 text-center">
                {selected?.receipt_path
                  ? <Button variant="outline" onClick={() => void openFile(selected.receipt_path)}><FileText /> عرض الإيصال</Button>
                  : <><FileText className="mx-auto mb-2 size-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">لا يوجد إيصال مرفق</p></>}
              </div>
            </Panel>
          </div>
        </TabsContent>
        <TabsContent value="fuel">
          <Panel title="تعبئة الديزل" icon={<Fuel />} actions={can("ops_manager", "fleet_supervisor", "accountant") && <Button size="sm" variant="gold" onClick={() => open("fuel")}><Plus /> تعبئة</Button>}>
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
              { key: "act", label: "", render: (r) => <div className="flex gap-1">
                {isAcc && r.status === "pending" && <><Button size="icon" className="size-7" aria-label="اعتماد" onClick={() => void reviewFuel(r.id, true)}><Check /></Button><Button size="icon" variant="outline" className="size-7" aria-label="رفض" onClick={() => void reviewFuel(r.id, false)}><X /></Button></>}
                {isAcc && r.status !== "pending" && reopenBtn(() => void reopenFuel(r.id), "إعادة للمراجعة")}
                {canFuel && editBtn(() => open("fuel", r))}
                {canFuel && delBtn(() => setDel({ table: "fuel_entries", row: r, label: `تعبئة ${fmtNum(r.liters, 1)} لتر` }))}
              </div> },
            ]} />
            <p className="mt-3 text-xs text-muted-foreground">التعبئة ليست استهلاكًا. معدل الاستهلاك يُحسب في التقارير بين تعبئتين كاملتين فقط عند كفاية البيانات.</p>
          </Panel>
        </TabsContent>
        <TabsContent value="adv">
          <Panel title="السلف" icon={<HandCoins />} actions={isAcc && <Button size="sm" variant="gold" onClick={() => open("adv")}><Plus /> صرف سلفة</Button>}>
            <DataTable rows={a} loading={adv.isLoading} cols={[
              { key: "driver", label: "السائق", render: (r) => r.driver?.full_name },
              { key: "trip", label: "الرحلة", render: (r) => r.trip?.number ?? "عامة" },
              { key: "amount", label: "المبلغ", render: (r) => <span className="num">{fmtSAR(r.amount)}</span> },
              { key: "issued", label: "الصرف", render: (r) => <span className="num">{fmtDateTime(r.issued_at)}</span> },
              { key: "spent", label: "مصروفات معتمدة", render: (r) => <span className="num">{r.settled_expenses === null ? "—" : fmtSAR(r.settled_expenses)}</span> },
              { key: "bal", label: "الرصيد", render: (r) => r.balance === null ? "—" : <span className="num">{Number(r.balance) >= 0 ? `يعاد ${fmtSAR(r.balance)}` : `مستحق للسائق ${fmtSAR(-r.balance)}`}</span> },
              { key: "status", label: "الحالة", render: (r) => <Status kind="advance" value={r.status} /> },
              { key: "act", label: "", render: (r) => isAcc && <div className="flex items-center gap-1">
                {r.status === "open" && <Button size="sm" variant="soft" onClick={() => void settle(r.id)}>تسوية</Button>}
                {r.status === "settled" && reopenBtn(() => void reopenAdvance(r.id), "إعادة فتح السلفة")}
                {r.status === "open" && editBtn(() => open("adv", r))}
                {r.status === "open" && delBtn(() => setDel({ table: "advances", row: r, label: `سلفة ${fmtSAR(r.amount)}` }))}
              </div> },
            ]} />
          </Panel>
        </TabsContent>
      </Tabs>
      <EntityDialog open={dlg === "exp"} onOpenChange={(o) => !o && setDlg(null)} title={rec ? "تعديل المصروف" : "مصروف"} table="expenses" record={dlg === "exp" ? rec : null} invalidate={["expenses", "acct"]} fields={[
        { name: "driver_id", label: "السائق", type: "ref", ref: { table: "drivers", label: "full_name" } },
        { name: "trip_id", label: "الرحلة", type: "ref", ref: { table: "trips", label: "number" } },
        { name: "category", label: "الفئة", type: "select", required: true, options: EXP_CATS },
        { name: "amount", label: "المبلغ", type: "number", required: true },
        { name: "payment_method", label: "طريقة الدفع", type: "select", default: "advance", options: [["advance", "من السلفة"], ["company_card", "بطاقة الشركة"], ["driver_cash", "نقدًا من السائق"]] },
        { name: "receipt_path", label: "الإيصال", type: "file" },
        { name: "description", label: "الوصف", type: "textarea" },
      ]} />
      <EntityDialog open={dlg === "fuel"} onOpenChange={(o) => !o && setDlg(null)} title={rec ? "تعديل التعبئة" : "تعبئة ديزل"} table="fuel_entries" record={dlg === "fuel" ? rec : null} invalidate={["fuel", "acct"]}
        transform={(v) => { const calc = Math.round(Number(v["liters"]) * Number(v["unit_price"]) * 100) / 100; return { ...v, amount: v["amount"] === null || Math.abs(Number(v["amount"]) - calc) > 1 ? calc : v["amount"] }; }} fields={[
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
      <EntityDialog open={dlg === "adv"} onOpenChange={(o) => !o && setDlg(null)} title={rec ? "تعديل السلفة" : "صرف سلفة"} table="advances" record={dlg === "adv" ? rec : null} invalidate={["advances"]} fields={[
        { name: "driver_id", label: "السائق", type: "ref", required: true, ref: { table: "drivers", label: "full_name" } },
        { name: "trip_id", label: "الرحلة", type: "ref", ref: { table: "trips", label: "number" } },
        { name: "amount", label: "المبلغ", type: "number", required: true },
        { name: "notes", label: "ملاحظات", type: "textarea" },
      ]} />
      <DeleteConfirmation open={!!del} onOpenChange={(o) => { if (!delBusy && !o) setDel(null); }} busy={delBusy} onConfirm={() => void confirmDelete()}
        title={`حذف ${del?.label ?? "السجل"}؟`} description="يُحذف من الحسابات فورًا ويبقى أثر الحذف في سجل التدقيق. المصروف الداخل في سلفة مسوّاة لا يُحذف حتى تُعاد فتح السلفة." />
    </>
  );
}

export default () => <AppShell><ExpensesPage /></AppShell>;
