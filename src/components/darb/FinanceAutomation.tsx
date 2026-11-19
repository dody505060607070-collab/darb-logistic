import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { db, useOne } from "@/lib/db";
import { errMsg } from "@/lib/format";
import { ChoiceInput } from "./ChoiceInput";
import { Panel } from "./ui";

export const AUTO_INVOICE_MODES: [string, string][] = [
  ["off", "يدوي فقط — أنا أنشئ الفواتير"],
  ["draft", "مسودة تلقائية عند تسليم الرحلة"],
  ["approve", "فاتورة معتمدة تلقائيًا عند تسليم الرحلة"],
];

/** Automatic and manual work side by side: settings switch automation on, buttons run it now. */
export function FinanceAutomation({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient();
  const settings = useOne(["company_settings", "finance-auto"], () => db.from("company_settings").select("auto_invoice,auto_allocate").eq("id", 1).maybeSingle());
  const [mode, setMode] = useState("off");
  const [alloc, setAlloc] = useState(false);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);
  useEffect(() => { if (settings.data) { setMode(settings.data.auto_invoice ?? "off"); setAlloc(!!settings.data.auto_allocate); } }, [settings.data]);

  async function save() {
    if (!AUTO_INVOICE_MODES.some(([m]) => m === mode)) return void toast.error("اختر طريقة الفوترة من القائمة");
    setBusy("save");
    const { error } = await db.rpc("finance_settings_update", { p_auto_invoice: mode, p_auto_allocate: alloc });
    setBusy(null);
    if (error) return void toast.error(errMsg(error));
    toast.success("تم حفظ إعدادات التشغيل التلقائي");
    void qc.invalidateQueries({ queryKey: ["company_settings"] });
  }
  async function runNow() {
    setBusy("run");
    const { data, error } = await db.rpc("invoice_unbilled_now");
    setBusy(null);
    if (error) return void toast.error(errMsg(error));
    toast.success(Number(data) ? `أُنشئت ${data} مسودة فاتورة (واحدة لكل عميل)` : "لا توجد رحلات مسلّمة بسعر تنتظر الفوترة");
    void qc.invalidateQueries();
  }

  return (
    <Panel title="التشغيل التلقائي واليدوي" icon={<Bot />}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className="mb-1.5 text-xs font-medium">الفوترة</p>
          <ChoiceInput value={mode} onChange={setMode} options={AUTO_INVOICE_MODES} ariaLabel="طريقة الفوترة" />
        </div>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={alloc} disabled={!canEdit} onChange={(e) => setAlloc(e.target.checked)} />
          توزيع الدفعات تلقائيًا على أقدم الفواتير
        </label>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="gold" disabled={busy !== null} onClick={() => void save()}>{busy === "save" && <Loader2 className="animate-spin" />} حفظ</Button>}
          {canEdit && <Button variant="outline" disabled={busy !== null} onClick={() => void runNow()}>{busy === "run" ? <Loader2 className="animate-spin" /> : <Zap />} فوترة كل الرحلات الجاهزة الآن</Button>}
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">التلقائي لا يمنع اليدوي: تقدر تنشئ أو تعدّل أو تحذف أي فاتورة أو دفعة أو توزيع بنفسك في أي وقت. الرحلة بلا سعر أو بلا عميل لا تُفوتر تلقائيًا ويصلك تنبيه لإكمالها.</p>
    </Panel>
  );
}
