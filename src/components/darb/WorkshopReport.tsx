import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { db, uploadFile, useRows, type Row } from "@/lib/db";
import { errMsg, fmtSAR } from "@/lib/format";
import { flushWa } from "@/lib/wa-flush";

type Line = { kind: "part" | "labor" | "other"; description: string; qty: string; unit_price: string };
const KIND = { part: "قطعة غيار", labor: "أجور", other: "أخرى" };

/** Workshop / technician: report what was actually done on a work order with parts, labour and photos. */
export function WorkshopReport({ order, onDone }: { order: Row; onDone?: () => void }) {
  const qc = useQueryClient();
  const saved = useRows(["work_order_lines", order.id], () => db.from("work_order_lines").select("*").eq("work_order_id", order.id).order("created_at"));
  const [tech, setTech] = useState(order.technician ?? "");
  const [done, setDone] = useState(order.work_done ?? "");
  const [odo, setOdo] = useState(order.odometer_km ? String(order.odometer_km) : "");
  const [warranty, setWarranty] = useState(order.warranty_days ? String(order.warranty_days) : "");
  const [invoice, setInvoice] = useState(order.vendor_invoice_ref ?? "");
  const [lines, setLines] = useState<Line[] | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const rows: Line[] = lines ?? ((saved.data ?? []).length ? (saved.data ?? []).map((l) => ({ kind: l.kind, description: l.description, qty: String(l.qty), unit_price: String(l.unit_price) })) : [{ kind: "part", description: "", qty: "1", unit_price: "" }]);
  const set = (i: number, p: Partial<Line>) => setLines(rows.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const total = rows.reduce((s, l) => s + Math.round(Number(l.qty || 0) * Number(l.unit_price || 0) * 100), 0) / 100;
  const over = total > Number(order.approved_budget ?? 0);
  const allowed = ["approved", "assigned", "repairing", "waiting_parts", "waiting"].includes(order.workflow_status);
  async function submit() {
    setBusy(true);
    try {
      const photos: string[] = [];
      for (const f of files) photos.push(await uploadFile(f, `work-orders/${order.id}`));
      const clean = rows.filter((l) => l.description.trim()).map((l) => ({ kind: l.kind, description: l.description.trim(), qty: Number(l.qty), unit_price: Number(l.unit_price || 0) }));
      const { data, error } = await db.rpc("workshop_job_report", { p_id: order.id, p_technician: tech, p_work_done: done, p_lines: clean as never, p_photos: photos, p_invoice: invoice, p_odometer: odo ? Number(odo) : null as never, p_warranty_days: warranty ? Number(warranty) : null as never });
      if (error) throw error;
      const next = (data as { next?: string } | null)?.next;
      toast.success(next === "ready_delivery" ? "تم تسجيل العمل وأصبحت المركبة جاهزة للاستلام" : next === "additional_review" ? "تم التسجيل — التكلفة تتجاوز المعتمد وأُرسلت للموافقة" : "تم حفظ تقرير العمل");
      flushWa(); setFiles([]); setLines(null); await qc.invalidateQueries(); onDone?.();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  if (!allowed) return null;
  return (
    <section className="space-y-3 rounded-lg border border-gold p-3">
      <h3 className="font-bold text-primary">🔧 تقرير العمل المنجز</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label className="text-xs">اسم الفني</Label><Input value={tech} onChange={(e) => setTech(e.target.value)} maxLength={80} /></div>
        <div><Label className="text-xs">قراءة العداد (كم)</Label><Input type="number" min="0" value={odo} onChange={(e) => setOdo(e.target.value)} /></div>
      </div>
      <div><Label className="text-xs">ما الذي تم عمله؟</Label><Textarea value={done} onChange={(e) => setDone(e.target.value)} maxLength={1000} placeholder="مثال: تغيير فحمات الفرامل الأمامية وضبط الهواء" /></div>
      <div className="space-y-2">
        <Label className="text-xs">القطع والأجور</Label>
        {rows.map((l, i) => (
          <div key={i} className="grid grid-cols-[100px_1fr_60px_90px_auto] gap-1">
            <select aria-label="النوع" className="h-9 rounded-md border bg-card px-1 text-xs" value={l.kind} onChange={(e) => set(i, { kind: e.target.value as Line["kind"] })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <Input aria-label="البيان" placeholder="البيان" value={l.description} onChange={(e) => set(i, { description: e.target.value })} />
            <Input aria-label="الكمية" type="number" min="0" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} />
            <Input aria-label="سعر الوحدة" type="number" min="0" placeholder="السعر" value={l.unit_price} onChange={(e) => set(i, { unit_price: e.target.value })} />
            <Button type="button" size="icon" variant="ghost" aria-label="حذف البند" onClick={() => setLines(rows.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" onClick={() => setLines([...rows, { kind: "part", description: "", qty: "1", unit_price: "" }])}><Plus /> إضافة بند</Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div><Label className="text-xs">رقم فاتورة الورشة</Label><Input value={invoice} onChange={(e) => setInvoice(e.target.value)} maxLength={60} /></div>
        <div><Label className="text-xs">الضمان (أيام)</Label><Input type="number" min="0" value={warranty} onChange={(e) => setWarranty(e.target.value)} /></div>
      </div>
      <div><Label className="text-xs">صور قبل وبعد الإصلاح</Label><Input type="file" accept="image/*" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} /></div>
      <div className={`rounded-md p-2 text-sm ${over ? "bg-warning-soft" : "bg-muted"}`}>
        الإجمالي: <b className="num">{fmtSAR(total)}</b> — المعتمد: <span className="num">{fmtSAR(order.approved_budget)}</span>
        {over && <div className="text-xs">⚠️ يتجاوز المبلغ المعتمد، سيُرسل لمسؤول الصيانة للموافقة على التكلفة الإضافية.</div>}
      </div>
      <Button className="w-full" disabled={busy || done.trim().length < 3} onClick={() => void submit()}><Send /> {["repairing", "waiting_parts"].includes(order.workflow_status) ? "تسجيل العمل وإنهاء الإصلاح" : "حفظ تقرير العمل"}</Button>
    </section>
  );
}
