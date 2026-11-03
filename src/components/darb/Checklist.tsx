import { cn } from "@/lib/utils";

export const CHECK_ITEMS: { key: string; label: string; critical?: boolean }[] = [
  { key: "tires", label: "الإطارات", critical: true },
  { key: "brakes", label: "الفرامل", critical: true },
  { key: "lights", label: "الأنوار والإشارات" },
  { key: "mirrors", label: "المرايا" },
  { key: "fluids", label: "السوائل (زيت، ماء، فرامل)" },
  { key: "leaks", label: "التسريبات", critical: true },
  { key: "coupling", label: "الاقتران (الصحن والوصلات)", critical: true },
  { key: "safety", label: "معدات السلامة (طفاية، مثلث)" },
  { key: "securing", label: "تثبيت الحمولة" },
  { key: "damage", label: "التلفيات الظاهرة" },
];

export type CheckAnswer = { key: string; label: string; result: "ok" | "fail" | "na"; severity?: "minor" | "critical"; reason?: string };

export function Checklist({ value, onChange }: { value: CheckAnswer[]; onChange: (v: CheckAnswer[]) => void }) {
  const upd = (key: string, patch: Partial<CheckAnswer>) => onChange(value.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-2">
      {value.map((a) => (
        <div key={a.key} className={cn("rounded-lg border p-3", a.result === "fail" && "border-danger/40 bg-danger-soft")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{a.label}</span>
            <div className="flex gap-1">
              {(["ok", "fail", "na"] as const).map((r) => (
                <button type="button" key={r} onClick={() => upd(a.key, { result: r, severity: r === "fail" ? (a.severity ?? "minor") : undefined })}
                  className={cn("rounded-md border px-3 py-1 text-xs font-semibold", a.result === r ? (r === "ok" ? "border-success bg-success text-primary-foreground" : r === "fail" ? "border-danger bg-danger text-primary-foreground" : "border-muted-foreground bg-muted-foreground text-primary-foreground") : "bg-card")}>
                  {r === "ok" ? "سليم" : r === "fail" ? "غير سليم" : "لا ينطبق"}
                </button>
              ))}
            </div>
          </div>
          {a.result === "fail" && (
            <div className="mt-2 flex flex-wrap gap-2">
              <select value={a.severity} onChange={(e) => upd(a.key, { severity: e.target.value as "minor" })} className="h-8 rounded-md border bg-card px-2 text-xs">
                <option value="minor">عيب بسيط</option>
                <option value="critical">عيب حرج (يمنع الجاهزية)</option>
              </select>
              <input value={a.reason ?? ""} onChange={(e) => upd(a.key, { reason: e.target.value })} placeholder="السبب / الوصف" className="h-8 flex-1 rounded-md border bg-card px-2 text-xs" required />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export const freshChecklist = (): CheckAnswer[] => CHECK_ITEMS.map((i) => ({ key: i.key, label: i.label, result: "ok" }));
