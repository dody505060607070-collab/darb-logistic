import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { useAuth } from '@/lib/auth';
import { canDeleteEntity } from '@/lib/record-controls';
import { DeleteConfirmation } from './DeleteConfirmation';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { db, uploadFile, type Row } from "@/lib/db";
import { errMsg, fromLocalInput, toLocalInput } from "@/lib/format";
import { tryNormalizePhone } from "@/lib/phone";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime" | "textarea" | "select" | "ref" | "checkbox" | "file" | "tel";
  options?: [string, string][];
  ref?: { table: string; label: string | ((r: Row) => string); select?: string; filter?: (q: any) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  required?: boolean;
  default?: unknown;
  full?: boolean;
  hint?: string;
};

/** Phone fields are saved as +<country><number> whatever way they were typed (Saudi Arabia by default). */
const isPhoneField = (f: Field) => f.type === "tel" || f.name === "phone" || f.name.endsWith("_phone");

function PhoneHint({ value }: { value: string }) {
  const phone = tryNormalizePhone(value);
  return phone
    ? <p className="mt-1 text-xs text-success">سيُحفظ كـ <span dir="ltr" className="num">{phone}</span></p>
    : <p className="mt-1 text-xs text-danger">رقم غير مفهوم بعد — مثال: 0501234567</p>;
}

function RefSelect({ f, value, onChange }: { f: Field; value: string; onChange: (v: string) => void }) {
  const r = f.ref!;
  const { data } = useQuery({
    queryKey: ["ref", r.table, r.select ?? "*", String(r.filter)],
    queryFn: async () => {
      let q = db.from(r.table).select(r.select ?? "*");
      if (r.filter) q = r.filter(q);
      const { data, error } = await q.limit(500);
      if (error) throw error;
      return data as Row[];
    },
  });
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
      required={f.required}
    >
      <option value="">— اختر —</option>
      {(data ?? []).map((row) => (
        <option key={row["id"]} value={row["id"]}>
          {typeof r.label === "function" ? r.label(row) : row[r.label]}
        </option>
      ))}
    </select>
  );
}

export function EntityDialog({
  open,
  onOpenChange,
  title,
  table,
  fields,
  record,
  invalidate,
  extra,
  transform,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  table: string;
  fields: Field[];
  record?: Row | null;
  invalidate: string[];
  extra?: Row;
  transform?: (v: Row) => Row;
  onSaved?: (r: Row) => void;
}) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [vals, setVals] = useState<Row>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const init: Row = {};
    fields.forEach((f) => {
      const v = record?.[f.name] ?? f.default ?? (f.type === "checkbox" ? false : "");
      init[f.name] = f.type === "datetime" ? toLocalInput(v as string) : (v ?? "");
    });
    setVals(init);
  }, [open, record, fields]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Row = { ...(extra ?? {}) };
      for (const f of fields) {
        let v = vals[f.name];
        if (f.type === "file") {
          if (v instanceof File) v = await uploadFile(v, table);
          else if (!v) continue;
        }
        if (f.type === "number") v = v === "" || v === null ? null : Number(v);
        else if (f.type === "datetime") v = v ? fromLocalInput(v as string) : null;
        else if (f.type !== "checkbox" && v === "") v = null;
        if (isPhoneField(f) && v) {
          const phone = tryNormalizePhone(String(v));
          if (!phone) throw new Error(`${f.label}: رقم الجوال غير صحيح. اكتبه مثل 0501234567 أو 966501234567`);
          v = phone;
        }
        payload[f.name] = v;
      }
      const final = transform ? transform(payload) : payload;
      const q = record?.["id"]
        ? db.from(table).update(final).eq("id", record["id"]).select().single()
        : db.from(table).insert(final).select().single();
      const { data, error } = await q;
      if (error) throw error;
      toast.success("تم الحفظ");
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onSaved?.(data);
      onOpenChange(false);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const set = (n: string, v: unknown) => setVals((s) => ({ ...s, [n]: v }));
  async function remove() {
    if (!canDeleteEntity(table, can('owner'), record?.id)) return;
    setBusy(true);
    try {
      const { data, error } = await db.from(table).delete().eq('id', record?.id).select('id');
      if (error) throw error;
      if (!data?.length) throw new Error('لم يتم الحذف؛ تحقق من صلاحياتك');
      invalidate.forEach(k => void qc.invalidateQueries({ queryKey: [k] }));
      toast.success('تم حذف السجل'); setDeleteOpen(false); onOpenChange(false);
    } catch (e) { toast.error((e as { code?: string })?.code === '23503' ? 'لا يمكن حذف سجل مرتبط بعمليات أخرى؛ عالج الارتباطات أولًا' : errMsg(e)); }
    finally { setBusy(false); }
  }

  return (
    <><Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-primary">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => {
            let input: ReactNode;
            const v = vals[f.name] ?? "";
            if (f.type === "textarea")
              input = <Textarea value={v} onChange={(e) => set(f.name, e.target.value)} required={f.required} rows={3} />;
            else if (f.type === "select")
              input = (
                <select
                  value={v}
                  onChange={(e) => set(f.name, e.target.value)}
                  required={f.required}
                  className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
                >
                  <option value="">— اختر —</option>
                  {f.options?.map(([o, l]) => (
                    <option key={o} value={o}>
                      {l}
                    </option>
                  ))}
                </select>
              );
            else if (f.type === "ref") input = <RefSelect f={f} value={v} onChange={(x) => set(f.name, x)} />;
            else if (f.type === "checkbox")
              input = (
                <input type="checkbox" checked={!!v} onChange={(e) => set(f.name, e.target.checked)} className="size-4 accent-primary" />
              );
            else if (f.type === "file")
              input = (
                <Input type="file" accept="image/*,application/pdf" onChange={(e) => set(f.name, e.target.files?.[0] ?? null)} />
              );
            else
              input = (
                <Input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : isPhoneField(f) ? "tel" : "text"}
                  dir={isPhoneField(f) ? "ltr" : undefined}
                  inputMode={isPhoneField(f) ? "tel" : undefined}
                  step={f.type === "number" ? "any" : undefined}
                  value={v}
                  onChange={(e) => set(f.name, e.target.value)}
                  required={f.required}
                />
              );
            return (
              <div key={f.name} className={f.full || f.type === "textarea" ? "sm:col-span-2" : ""}>
                <Label className="mb-1.5 block text-xs">
                  {f.label} {f.required && <span className="text-danger">*</span>}
                </Label>
                {input}
                {f.hint && <p className="mt-1 text-xs text-muted-foreground">{f.hint}</p>}
                {isPhoneField(f) && v ? <PhoneHint value={String(v)} /> : null}
              </div>
            );
          })}
          <DialogFooter className="gap-2 sm:col-span-2">
            {canDeleteEntity(table, can('owner'), record?.id) && <Button type="button" variant="destructive" disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 /> حذف السجل</Button>}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              إلغاء
            </Button>
            <Button type="submit" variant="gold" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} حفظ
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog><DeleteConfirmation open={deleteOpen} onOpenChange={setDeleteOpen} title="حذف السجل نهائيًا؟" description="لا يمكن التراجع عن الحذف. السجلات المرتبطة بعمليات أخرى قد لا تقبل الحذف." busy={busy} onConfirm={() => void remove()} /></>
  );
}
