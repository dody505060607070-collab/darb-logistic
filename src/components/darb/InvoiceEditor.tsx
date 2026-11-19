import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { db, useRows, type Row } from "@/lib/db";
import { errMsg, fmtSAR } from "@/lib/format";
import { draftProblem, draftTotals, type DraftLine } from "@/lib/invoice-draft";
import { ChoiceInput } from "./ChoiceInput";

let seq = 0;
const newLine = (l?: Partial<DraftLine>): DraftLine => ({ key: `l${++seq}`, description: "", amount: "", trip_id: null, ...l });

/** Create a manual invoice or edit any draft: customer, due date, discount and free lines. */
export function InvoiceEditor({ open, onOpenChange, invoice, vatRate }: { open: boolean; onOpenChange: (o: boolean) => void; invoice: Row | null; vatRate: number }) {
  const qc = useQueryClient();
  const customers = useRows(["customers", "invoice-editor"], () => db.from("customers").select("id,name").order("name"), open);
  const [customer, setCustomer] = useState("");
  const [due, setDue] = useState("");
  const [discount, setDiscount] = useState("0");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCustomer(invoice?.customer_id ?? "");
    setDue(invoice?.due_at ?? "");
    setDiscount(String(invoice?.discount ?? 0));
    setLines(invoice?.lines?.length
      ? invoice.lines.map((l: Row) => newLine({ trip_id: l.trip_id, description: l.description, amount: String(l.amount) }))
      : [newLine()]);
  }, [open, invoice]);

  const rate = Number(invoice?.vat_rate ?? vatRate);
  const t = draftTotals(lines, discount, rate);
  const customerOptions: [string, string][] = (customers.data ?? []).map((c) => [c.id, c.name]);
  const set = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  async function save() {
    const known = customerOptions.some(([id]) => id === customer);
    const problem = draftProblem(known ? customer : "", lines, discount);
    if (problem) return void toast.error(customer && !known ? "العميل غير موجود؛ اختره من القائمة أو أضفه من صفحة العملاء" : problem);
    setBusy(true);
    const { error } = await db.rpc("invoice_save", {
      p_id: invoice?.id ?? null, p_customer_id: customer, p_due_at: due || null, p_discount: Number(discount || 0),
      p_lines: lines.map((l) => ({ trip_id: l.trip_id ?? null, description: l.description.trim(), amount: Number(l.amount) })),
    });
    setBusy(false);
    if (error) return void toast.error(errMsg(error));
    toast.success(invoice ? "تم حفظ تعديل المسودة" : "أُنشئت فاتورة يدوية كمسودة");
    void qc.invalidateQueries();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle className="text-primary">{invoice ? `تعديل المسودة ${invoice.number}` : "فاتورة يدوية جديدة"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3"><Label className="mb-1.5 block text-xs">العميل <span className="text-danger">*</span></Label><ChoiceInput value={customer} onChange={setCustomer} options={customerOptions} ariaLabel="العميل" /></div>
          <div><Label className="mb-1.5 block text-xs">تاريخ الاستحقاق</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">فارغ = حسب مدة سداد العميل</p></div>
          <div><Label className="mb-1.5 block text-xs">الخصم (ر.س)</Label><Input type="number" min="0" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
          <div><Label className="mb-1.5 block text-xs">الضريبة</Label><Input value={`${rate}%`} disabled /></div>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-semibold">البنود</p>
          {lines.map((l, i) => (
            <div key={l.key} className="flex items-center gap-2">
              <Input aria-label={`وصف البند ${i + 1}`} placeholder="الوصف، مثل: نقل الرياض → الدمام" value={l.description} onChange={(e) => set(l.key, { description: e.target.value })} />
              <Input aria-label={`مبلغ البند ${i + 1}`} className="w-32" type="number" min="0" step="any" placeholder="المبلغ" value={l.amount} onChange={(e) => set(l.key, { amount: e.target.value })} />
              <Button type="button" size="icon" variant="ghost" aria-label="حذف البند" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}><Trash2 className="size-4 text-danger" /></Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="soft" onClick={() => setLines((ls) => [...ls, newLine()])}><Plus /> إضافة بند</Button>
          {lines.some((l) => l.trip_id) && <p className="text-xs text-muted-foreground">البنود المرتبطة برحلة تبقى مرتبطة بها؛ حذف البند يرجع الرحلة لقائمة «رحلات للفوترة».</p>}
        </div>
        <div className="rounded-lg border p-3 text-sm">
          <div className="flex justify-between"><span>قبل الضريبة</span><span className="num">{fmtSAR(t.subtotal)}</span></div>
          <div className="flex justify-between"><span>الخصم</span><span className="num">{fmtSAR(t.discount)}</span></div>
          <div className="flex justify-between"><span>الضريبة</span><span className="num">{fmtSAR(t.vat)}</span></div>
          <div className="flex justify-between font-bold"><span>الإجمالي</span><span className="num">{fmtSAR(t.total)}</span></div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
          <Button variant="gold" disabled={busy} onClick={() => void save()}>{busy && <Loader2 className="animate-spin" />} حفظ كمسودة</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
