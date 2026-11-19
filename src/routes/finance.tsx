import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Banknote, CalendarClock, FileSpreadsheet, Landmark, Pencil, Plus, Printer, Receipt, Trash2, Truck, Undo2, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/darb/AppShell";
import { Badge, DataTable, Empty, Kpi, KV, PageHeader, Panel, Status } from "@/components/darb/ui";
import { EntityDialog } from "@/components/darb/EntityDialog";
import { InvoiceDocument } from "@/components/darb/InvoiceDocument";
import { AccountingSummary } from "@/components/darb/AccountingSummary";
import { FinanceAutomation } from "@/components/darb/FinanceAutomation";
import { InvoiceEditor } from "@/components/darb/InvoiceEditor";
import { DeleteConfirmation } from "@/components/darb/DeleteConfirmation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { db, useRows, useOne, type Row } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { daysUntil, errMsg, fmtDate, fmtSAR } from "@/lib/format";

export const Route = createFileRoute("/finance")({
  head: () => ({
    meta: [
      { title: "المالية والفوترة والتحصيل | Shata" },
      { name: "description", content: "مسودات الفواتير من الرحلات المسلّمة والدفعات والتحصيل والمتأخرات." },
      { property: "og:title", content: "المالية والفوترة | Shata" },
      { property: "og:description", content: "الفواتير والدفعات والتحصيل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <FinancePage />
    </AppShell>
  ),
});

function FinancePage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const isAcc = can("accountant");
  const invoices = useRows(["invoices"], () => db.from("invoices").select("*, customer:customers(name,vat_number,cr_number), lines:invoice_lines(*), allocs:payment_allocations(amount)").order("created_at", { ascending: false }));
  const seller = useOne(['company_settings', 'invoice'], () => db.from('company_settings').select('company_name,vat_number,cr_number,vat_rate').eq('id', 1).maybeSingle());
  const [printInvoice, setPrintInvoice] = useState<Row | null>(null);
  const payments = useRows(["payments"], () => db.from("payments").select("*, customer:customers(name), allocs:payment_allocations(id, amount, invoice:invoices(number))").order("paid_at", { ascending: false }));
  const billable = useRows(["trips", "billable"], () =>
    db.from("trips").select("id,number,origin_city,dest_city,status,actual_end, order:transport_orders(customer_id, customer:customers(name)), lines:invoice_lines(id), fin:trip_financials(revenue)").in("status", ["delivered", "closed"]).eq("is_empty", false),
  );
  const [selTrips, setSelTrips] = useState<string[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [alloc, setAlloc] = useState<Row | null>(null);
  const [allocInv, setAllocInv] = useState("");
  const [allocAmt, setAllocAmt] = useState("");
  const inv = () => void qc.invalidateQueries();
  const [editor, setEditor] = useState<{ invoice: Row | null } | null>(null);
  const [payRecord, setPayRecord] = useState<Row | null>(null);
  const [del, setDel] = useState<{ kind: "invoice" | "payment"; row: Row } | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [price, setPrice] = useState<{ trip: Row; value: string } | null>(null);
  const official = (i: Row) => ["sending", "accepted", "issued"].includes(i.provider_status);

  const paidOf = (i: Row) => (i.allocs ?? []).reduce((s: number, a: Row) => s + Number(a.amount), 0);
  const unbilled = (billable.data ?? []).filter((t) => !(t.lines ?? []).length);
  const custOfSel = useMemo(() => new Set(unbilled.filter((t) => selTrips.includes(t.id)).map((t) => t.order?.customer_id)), [unbilled, selTrips]);
  const all = invoices.data ?? [];
  const selectedInvoice = all.find((i) => i.id === selectedInvoiceId) ?? all[0] ?? null;
  const approved = all.filter((i) => i.status === "approved");
  const outstanding = approved.reduce((s, i) => s + Number(i.total) - paidOf(i), 0);
  const overdue = approved.filter((i) => Number(i.total) - paidOf(i) > 0.01 && (daysUntil(i.due_at) ?? 1) < 0);

  async function createInvoice() {
    if (custOfSel.size !== 1) return void toast.error("اختر رحلات لعميل واحد");
    const { error } = await db.rpc("create_invoice_from_trips", { p_customer_id: [...custOfSel][0], p_trip_ids: selTrips, p_discount: 0 });
    if (error) return void toast.error(errMsg(error));
    toast.success("أُنشئت مسودة الفاتورة");
    setSelTrips([]);
    inv();
  }
  async function approve(id: string) {
    if (!(Number(all.find((i) => i.id === id)?.total) > 0)) return void toast.error("قيمة الفاتورة صفر؛ لا تُعتمد. عدّل البنود أو سعر الرحلة أولًا");
    const { error } = await db.rpc("invoice_set_status", { p_id: id, p_status: "approved" });
    if (error) return void toast.error(errMsg(error));
    toast.success("اعتُمدت الفاتورة داخليًا. الإصدار الرسمي يتطلب مزود فوترة مهيأ.");
    inv();
  }
  async function unapprove(id: string) {
    const { error } = await db.rpc("invoice_set_status", { p_id: id, p_status: "draft" });
    if (error) return void toast.error(errMsg(error));
    toast.success("رجعت الفاتورة مسودة ويمكن تعديلها");
    inv();
  }
  async function confirmDelete() {
    if (!del) return;
    setDelBusy(true);
    const { error } = del.kind === "invoice"
      ? await db.rpc("invoice_delete", { p_id: del.row.id })
      : await db.from("payments").delete().eq("id", del.row.id);
    setDelBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success(del.kind === "invoice" ? "حُذفت الفاتورة ورجعت رحلاتها للفوترة" : "حُذفت الدفعة وتوزيعاتها");
    setDel(null);
    if (del.kind === "invoice" && selectedInvoiceId === del.row.id) setSelectedInvoiceId(null);
    inv();
  }
  async function autoAllocate(id: string) {
    const { data, error } = await db.rpc("payment_auto_allocate", { p_payment_id: id });
    if (error) return void toast.error(errMsg(error));
    toast.success(Number(data) > 0 ? `وُزّع ${fmtSAR(data)} على أقدم الفواتير المفتوحة` : "لا توجد فواتير معتمدة مفتوحة لهذا العميل أو لا يوجد رصيد غير موزع");
    inv();
  }
  async function removeAllocation(id: string) {
    const { error } = await db.from("payment_allocations").delete().eq("id", id);
    if (error) return void toast.error(errMsg(error));
    toast.success("أُلغي التوزيع ورجع المبلغ غير موزع");
    setAlloc((a) => (a ? { ...a, allocs: (a.allocs ?? []).filter((x: Row) => x.id !== id) } : a));
    inv();
  }
  async function savePrice() {
    if (!price) return;
    const v = Number(price.value);
    if (!(v > 0)) return void toast.error("اكتب سعرًا أكبر من صفر");
    const { error } = await db.from("trip_financials").upsert({ trip_id: price.trip.id, revenue: v }, { onConflict: "trip_id" });
    if (error) return void toast.error(errMsg(error));
    toast.success("تم حفظ سعر الرحلة");
    setPrice(null);
    inv();
  }
  async function allocate() {
    if (!alloc) return;
    const { error } = await db.rpc("allocate_payment", { p_payment_id: alloc.id, p_invoice_id: allocInv, p_amount: Number(allocAmt) });
    if (error) return void toast.error(errMsg(error));
    toast.success("تم توزيع الدفعة");
    setAlloc(null);
    inv();
  }

  return (
    <>
      <PageHeader title="المالية والفوترة والتحصيل" subtitle="فوترة الرحلات المسلّمة، اعتماد الفواتير، وتسجيل الدفعات وتوزيعها." icon={<Landmark />} />
      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="رحلات تنتظر الفوترة" value={unbilled.length} tone="info" icon={<Truck />} />
        <Kpi label="مستحق على العملاء" value={fmtSAR(outstanding)} tone="warning" icon={<Banknote />} />
        <Kpi label="فواتير تأخر سدادها" value={overdue.length} tone={overdue.length ? "danger" : undefined} icon={<CalendarClock />} />
      </div>
      <div className="mb-5 rounded-xl border bg-gold-soft p-4 text-sm text-primary">PDF أو QR وحده لا يعني توافق ZATCA — حالة مزود الفوترة تُعرض كما هي لكل فاتورة.</div>
      <div className="mb-5"><FinanceAutomation canEdit={isAcc} /></div>
      <Tabs defaultValue="unbilled" dir="rtl">
        <TabsList><TabsTrigger value="unbilled">1. رحلات للفوترة</TabsTrigger><TabsTrigger value="inv">2. الفواتير ({all.filter((i) => i.status === "draft").length} مسودة)</TabsTrigger><TabsTrigger value="pay">3. الدفعات</TabsTrigger><TabsTrigger value="acct">ملخص المحاسبة</TabsTrigger></TabsList>
        <TabsContent value="acct"><AccountingSummary /></TabsContent>
        <TabsContent value="unbilled">
          <Panel title="رحلات مسلّمة غير مفوترة" icon={<FileSpreadsheet />} actions={isAcc && <Button size="sm" variant="gold" disabled={!selTrips.length} onClick={() => void createInvoice()}><Plus /> إنشاء مسودة فاتورة ({selTrips.length})</Button>}>
            <DataTable rows={unbilled} loading={billable.isLoading} searchKeys={["number", "order.customer.name"]} cols={[
              { key: "sel", label: "", render: (r) => <input type="checkbox" className="size-4 accent-primary" checked={selTrips.includes(r.id)} onChange={(e) => setSelTrips((s) => (e.target.checked ? [...s, r.id] : s.filter((x) => x !== r.id)))} /> },
              { key: "number", label: "الرحلة", render: (r) => <span className="num font-semibold">{r.number}</span> },
              { key: "customer", label: "العميل", render: (r) => r.order?.customer?.name ?? "—" },
              { key: "route", label: "المسار", render: (r) => `${r.origin_city} ← ${r.dest_city}` },
              { key: "end", label: "التسليم", render: (r) => <span className="num">{fmtDate(r.actual_end)}</span> },
              { key: "rev", label: "الإيراد", render: (r) => <span className="flex items-center gap-1">{Number(r.fin?.revenue ?? 0) > 0 ? <span className="num">{fmtSAR(r.fin?.revenue)}</span> : <Badge tone="danger">بدون سعر</Badge>}{isAcc && <Button size="icon" variant="ghost" className="size-7" aria-label="تعديل سعر الرحلة" title="تعديل سعر الرحلة" onClick={() => setPrice({ trip: r, value: String(r.fin?.revenue ?? "") })}><Pencil className="size-4" /></Button>}</span> },
              { key: "status", label: "الحالة", render: (r) => <Status kind="trip" value={r.status} /> },
            ]} />
          </Panel>
        </TabsContent>
        <TabsContent value="inv">
          <div className="split-layout min-w-0">
          <div className="min-w-0">
          <Panel title="الفواتير" icon={<Receipt />} actions={isAcc && <Button size="sm" variant="gold" onClick={() => setEditor({ invoice: null })}><Plus /> فاتورة يدوية</Button>}>
            <DataTable rows={all} loading={invoices.isLoading} error={invoices.error} selectedId={selectedInvoice?.id} onRowClick={(r) => setSelectedInvoiceId(r.id)} searchKeys={["number", "customer.name"]} cols={[
              { key: "number", label: "الرقم", render: (r) => <span className="num font-semibold">{r.number}</span> },
              { key: "customer", label: "العميل", render: (r) => r.customer?.name },
              { key: "lines", label: "الرحلات", render: (r) => <span className="num">{r.lines?.length}</span> },
              { key: "subtotal", label: "قبل الضريبة", render: (r) => <span className="num">{fmtSAR(r.subtotal)}</span> },
              { key: "vat", label: "الضريبة", render: (r) => <span className="num">{fmtSAR(r.vat)} ({r.vat_rate}%)</span> },
              { key: "total", label: "الإجمالي", render: (r) => <b className="num">{fmtSAR(r.total)}</b> },
              { key: "paid", label: "المحصل", render: (r) => <span className="num">{fmtSAR(paidOf(r))}</span> },
              { key: "due", label: "الاستحقاق", render: (r) => <span className="num">{fmtDate(r.due_at)} {r.status === "approved" && Number(r.total) - paidOf(r) > 0.01 && (daysUntil(r.due_at) ?? 1) < 0 && <Badge tone="danger">متأخرة</Badge>}</span> },
              { key: "status", label: "الحالة", render: (r) => <Status kind="invoice" value={r.status} /> },
              { key: "prov", label: "مزود الفوترة", render: (r) => <Status kind="provider" value={r.provider_status} /> },
              { key: "act", label: "", render: (r) => isAcc && <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                {r.status === "draft" && <Button size="sm" onClick={() => void approve(r.id)}>اعتماد</Button>}
                {r.status === "draft" && <Button size="icon" variant="ghost" className="size-8" aria-label="تعديل الفاتورة" title="تعديل" onClick={() => setEditor({ invoice: r })}><Pencil className="size-4" /></Button>}
                {r.status === "approved" && !official(r) && <Button size="icon" variant="ghost" className="size-8" aria-label="إرجاع لمسودة" title="إرجاع لمسودة للتعديل" onClick={() => void unapprove(r.id)}><Undo2 className="size-4" /></Button>}
                {!official(r) && <Button size="icon" variant="ghost" className="size-8" aria-label="حذف الفاتورة" title="حذف" onClick={() => setDel({ kind: "invoice", row: r })}><Trash2 className="size-4 text-danger" /></Button>}
              </div> },
            ]} />
          </Panel>
          </div>
          <Panel className="record-preview side-detail" title="معاينة الفاتورة" icon={<Receipt />} actions={selectedInvoice && <Status kind="invoice" value={selectedInvoice.status} />}>
            {selectedInvoice ? (
              <div className="space-y-4">
                <div><p className="num text-lg font-semibold text-primary">{selectedInvoice.number}</p><p className="mt-1 text-sm">{selectedInvoice.customer?.name ?? "—"}</p></div>
                <KV items={[
                  ["عدد الرحلات", <span className="num">{selectedInvoice.lines?.length ?? 0}</span>],
                  ["قبل الضريبة", <span className="num">{fmtSAR(selectedInvoice.subtotal)}</span>],
                  ["الضريبة", <span className="num">{fmtSAR(selectedInvoice.vat)}</span>],
                  ["الإجمالي", <span className="num font-semibold">{fmtSAR(selectedInvoice.total)}</span>],
                  ["المحصل", <span className="num">{fmtSAR(paidOf(selectedInvoice))}</span>],
                  ["الاستحقاق", <span className="num">{fmtDate(selectedInvoice.due_at)}</span>],
                  ["مزود الفوترة", <Status kind="provider" value={selectedInvoice.provider_status} />],
                ]} />
                {isAcc && selectedInvoice.status === "draft" && <Button variant="gold" className="w-full" onClick={() => void approve(selectedInvoice.id)}>اعتماد الفاتورة</Button>}
                {isAcc && selectedInvoice.status === "draft" && <Button variant="outline" className="w-full" onClick={() => setEditor({ invoice: selectedInvoice })}><Pencil /> تعديل البنود والخصم</Button>}
                {isAcc && selectedInvoice.status === "approved" && !official(selectedInvoice) && <Button variant="outline" className="w-full" onClick={() => void unapprove(selectedInvoice.id)}><Undo2 /> إرجاع لمسودة للتعديل</Button>}
                <Button variant="outline" className="w-full" disabled={!seller.data} onClick={() => setPrintInvoice(selectedInvoice)}><Printer /> معاينة / طباعة الفاتورة</Button>
              </div>
            ) : <Empty text="لا توجد فواتير بعد" />}
          </Panel>
          </div>
        </TabsContent>
        <TabsContent value="pay">
          <Panel title="الدفعات الفعلية" icon={<Banknote />} actions={isAcc && <Button size="sm" variant="gold" onClick={() => { setPayRecord(null); setPayOpen(true); }}><Plus /> تسجيل دفعة</Button>}>
            <DataTable rows={payments.data} loading={payments.isLoading} cols={[
              { key: "paid_at", label: "التاريخ", render: (r) => <span className="num">{fmtDate(r.paid_at)}</span> },
              { key: "customer", label: "العميل", render: (r) => r.customer?.name },
              { key: "amount", label: "المبلغ", render: (r) => <span className="num">{fmtSAR(r.amount)}</span> },
              { key: "method", label: "الطريقة", render: (r) => ({ bank_transfer: "تحويل بنكي", cheque: "شيك", cash: "نقدًا" })[r.method as "cash"] ?? r.method },
              { key: "reference", label: "المرجع" },
              { key: "alloc", label: "موزع على", render: (r) => (r.allocs ?? []).map((a: Row) => `${a.invoice?.number}: ${fmtSAR(a.amount)}`).join("، ") || "—" },
              { key: "un", label: "غير موزع", render: (r) => <span className="num">{fmtSAR(Number(r.amount) - (r.allocs ?? []).reduce((s: number, a: Row) => s + Number(a.amount), 0))}</span> },
              { key: "act", label: "", render: (r) => isAcc && <div className="flex items-center gap-1">
                <Button size="sm" variant="soft" onClick={() => { setAlloc(r); setAllocInv(""); setAllocAmt(""); }}>توزيع</Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label="توزيع تلقائي" title="توزيع تلقائي على أقدم الفواتير" onClick={() => void autoAllocate(r.id)}><Wand2 className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label="تعديل الدفعة" title="تعديل" onClick={() => { setPayRecord(r); setPayOpen(true); }}><Pencil className="size-4" /></Button>
                <Button size="icon" variant="ghost" className="size-8" aria-label="حذف الدفعة" title="حذف" onClick={() => setDel({ kind: "payment", row: r })}><Trash2 className="size-4 text-danger" /></Button>
              </div> },
            ]} />
          </Panel>
        </TabsContent>
      </Tabs>
      <EntityDialog open={payOpen} onOpenChange={setPayOpen} title={payRecord ? "تعديل الدفعة" : "تسجيل دفعة عميل"} table="payments" record={payRecord} invalidate={["payments", "invoices", "acct"]} fields={[
        { name: "customer_id", label: "العميل", type: "ref", required: true, ref: { table: "customers", label: "name" } },
        { name: "amount", label: "المبلغ", type: "number", required: true },
        { name: "paid_at", label: "تاريخ الاستلام", type: "date", required: true },
        { name: "method", label: "الطريقة", type: "select", default: "bank_transfer", options: [["bank_transfer", "تحويل بنكي"], ["cheque", "شيك"], ["cash", "نقدًا"]] },
        { name: "reference", label: "المرجع البنكي" },
      ]} />
      <Dialog open={!!alloc} onOpenChange={(o) => !o && setAlloc(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>توزيع دفعة {alloc && fmtSAR(alloc.amount)}</DialogTitle></DialogHeader>
          <select className="h-9 w-full rounded-md border bg-card px-2 text-sm" value={allocInv} onChange={(e) => setAllocInv(e.target.value)}>
            <option value="">اختر فاتورة معتمدة…</option>
            {approved.filter((i) => i.customer_id === alloc?.customer_id && Number(i.total) - paidOf(i) > 0.01).map((i) => <option key={i.id} value={i.id}>{i.number} — متبقٍ {fmtSAR(Number(i.total) - paidOf(i))}</option>)}
          </select>
          <Input type="number" placeholder="المبلغ" value={allocAmt} onChange={(e) => setAllocAmt(e.target.value)} />
          <Button variant="gold" onClick={() => void allocate()}>توزيع</Button>
          {(alloc?.allocs ?? []).length > 0 && <div className="space-y-1 border-t pt-3 text-sm">
            <p className="font-semibold">الموزع حاليًا</p>
            {(alloc?.allocs ?? []).map((a: Row) => <div key={a.id} className="flex items-center justify-between gap-2"><span className="num">{a.invoice?.number}: {fmtSAR(a.amount)}</span><Button size="sm" variant="ghost" onClick={() => void removeAllocation(a.id)}><X className="size-4 text-danger" /> إلغاء التوزيع</Button></div>)}
          </div>}
        </DialogContent>
      </Dialog>
      <InvoiceEditor open={!!editor} onOpenChange={(o) => !o && setEditor(null)} invoice={editor?.invoice ?? null} vatRate={Number(seller.data?.vat_rate ?? 15)} />
      <DeleteConfirmation open={!!del} onOpenChange={(o) => { if (!delBusy && !o) setDel(null); }} busy={delBusy} onConfirm={() => void confirmDelete()}
        title={del?.kind === "invoice" ? `حذف الفاتورة ${del.row.number}؟` : "حذف الدفعة؟"}
        description={del?.kind === "invoice" ? "ترجع رحلاتها لقائمة «رحلات للفوترة»، وأي دفعات موزعة عليها ترجع غير موزعة. يبقى أثر الحذف في سجل التدقيق." : "تُحذف الدفعة وكل توزيعاتها، وترجع الفواتير غير مسددة بقيمتها. يبقى أثر الحذف في سجل التدقيق."} />
      <Dialog open={!!price} onOpenChange={(o) => !o && setPrice(null)}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>سعر الرحلة {price?.trip.number}</DialogTitle></DialogHeader>
          <Input type="number" min="0" step="any" placeholder="السعر قبل الضريبة (ر.س)" value={price?.value ?? ""} onChange={(e) => setPrice((p) => (p ? { ...p, value: e.target.value } : p))} />
          <p className="text-xs text-muted-foreground">يُستخدم عند الفوترة. الفواتير المعتمدة لا تتغير؛ عدّل المسودة إذا كانت الرحلة عليها.</p>
          <Button variant="gold" onClick={() => void savePrice()}>حفظ السعر</Button>
        </DialogContent>
      </Dialog>
      {printInvoice && seller.data && <InvoiceDocument invoice={printInvoice} seller={seller.data} onClose={() => setPrintInvoice(null)} />}
    </>
  );
}
