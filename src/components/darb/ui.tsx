import { useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, Inbox, Loader2, Pencil, Printer, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS, errMsg, type Tone } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useArrangedCard } from './CardArrangement';
import { RecordActions } from './RecordActions';
import { displayValue, downloadSheets } from '@/lib/excel';

const TONES: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-muted text-muted-foreground",
  gold: "bg-gold-soft text-primary",
};

export function Badge({ tone = "neutral", children, dot = true }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", TONES[tone])}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Status({ kind, value }: { kind: keyof typeof STATUS | string; value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  const s = STATUS[kind]?.[value];
  return <Badge tone={s?.[1] ?? "neutral"}>{s?.[0] ?? value}</Badge>;
}

export function Panel({
  title,
  icon,
  actions,
  children,
  className,
  bodyClass,
  tone,
}: {
  tone?: "blue" | "graph" | "pink" | "copper" | "green" | "lime" | "glass";
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  const arrangement = useArrangedCard(typeof title === 'string' ? title : 'panel');
  return (
    <section ref={arrangement.ref} style={arrangement.style} className={cn("panel flex flex-col", tone && `bento bento-${tone} bento-panel`, arrangement.className, className)}>
      {(title || actions) && (
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-3 sm:flex sm:justify-between">
          <h2 className="flex min-w-0 items-center gap-2 text-base font-bold text-primary">
            {icon && <span className="text-gold [&_svg]:size-5">{icon}</span>}
            {title}
          </h2>
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}{arrangement.handle}</div>
        </header>
      )}
      <div className={cn("flex-1 p-4", bodyClass)}>{children}</div>
      {tone && tone !== "glass" && <span className="rim" />}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="page-heading mb-5 grid grid-cols-1 items-end gap-3 sm:flex sm:justify-between">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-[28px] font-bold text-primary">
          {icon && <span className="text-gold [&_svg]:size-7">{icon}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

const BENTO: Record<Tone, string> = {
  success: "bento-green",
  info: "bento-blue",
  warning: "bento-copper",
  danger: "bento-pink",
  gold: "bento-solid",
  neutral: "bento-graph",
};

export function Kpi({
  label,
  value,
  hint,
  tone,
  icon,
  variant,
  onOpen,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  variant?: "glass" | "solid";
  onOpen?: () => void;
}) {
  const cls = variant === "glass" ? "bento-glass" : variant === "solid" ? "bento-solid" : tone ? BENTO[tone] : "bento-auto";
  const arrangement = useArrangedCard(label);
  return (
    <div ref={arrangement.ref} style={arrangement.style} className={cn("bento kpi-tile flex min-h-[132px] flex-col justify-between px-5 py-4", cls, arrangement.className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="cap">{label}</span>
        <div className="flex shrink-0 items-center gap-1">{icon && <span className="kpi-icon grid size-8 place-items-center rounded-full bg-gold-soft text-gold [&_svg]:size-4">{icon}</span>}{arrangement.handle}</div>
      </div>
      <div className="big num mt-3 break-words text-right text-[32px]"><CountUp value={value} /></div>
      {hint && <div className="hint mt-1 text-xs opacity-75">{hint}</div>}
      {onOpen && <Button variant="link" size="sm" className="h-auto justify-start px-0 text-xs" onClick={onOpen}>عرض التفاصيل</Button>}
      <span className="rim" />
    </div>
  );
}

/** Tick-mark progress bar from the bento design (goals / runway). */
export function Ticks({ value, count = 40, className }: { value: number; count?: number; className?: string }) {
  const f = Math.max(0, Math.min(1, value));
  return (
    <div className={cn("flex h-3 items-end justify-between", className)} dir="ltr" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={cn("w-[1.6px] rounded-full", i / (count - 1) <= f ? "bg-primary" : "bg-foreground/25")}
          style={{ height: i % 8 === 0 ? 12 : 8 }}
        />
      ))}
    </div>
  );
}

export function Empty({ text = "لا توجد بيانات بعد", action }: { text?: string; action?: ReactNode }) {
  return (
    <div className="empty-state flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
      <Inbox className="size-8 opacity-50" />
      <p>{text}</p>
      {action}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
    </div>
  );
}

export function ErrorBox({ error }: { error: unknown }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-danger-soft p-4 text-sm text-danger">
      <AlertTriangle className="size-4" />
      {errMsg(error)}
    </div>
  );
}

export type Col<T> = { key: string; label: string; render?: (r: T) => ReactNode; className?: string };

export function DataTable<T extends Record<string, unknown>>({
  rows,
  cols,
  loading,
  error,
  searchKeys,
  pageSize = 10,
  onRowClick,
  filters,
  empty,
  selectedId,
  onEdit,
  entityTable,
}: {
  rows?: T[];
  cols: Col<T>[];
  loading?: boolean;
  error?: unknown;
  searchKeys?: string[];
  pageSize?: number;
  onRowClick?: (r: T) => void;
  filters?: ReactNode;
  empty?: ReactNode;
  selectedId?: string | null;
  onEdit?: (r: T) => void;
  entityTable?: string;
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => {
    const list = rows ?? [];
    if (!q || !searchKeys) return list;
    const s = q.toLowerCase();
    return list.filter((r) =>
      searchKeys.some((k) => {
        const v = k.split(".").reduce<unknown>((o, p) => (o as Record<string, unknown> | null)?.[p], r);
        return String(v ?? "").toLowerCase().includes(s);
      }),
    );
  }, [rows, q, searchKeys]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages - 1);
  const view = filtered.slice(cur * pageSize, cur * pageSize + pageSize);

  return (
    <div className="data-table flex flex-col gap-3">
      {(searchKeys || filters || filtered.length > 0) && (
        <div className="table-tools flex flex-wrap items-center gap-2">
          {searchKeys && (
            <div className="relative min-w-56 flex-1">
              <Search className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(0);
                }}
                placeholder="بحث…"
                className="pr-9"
              />
            </div>
          )}
          {filters}
          {filtered.length > 0 && (
            <div className="mr-auto flex gap-1">
              <Button size="sm" variant="ghost" title="تصدير Excel" onClick={() => exportExcel(filtered, cols)}><Download /> Excel</Button>
              <Button size="sm" variant="ghost" title="طباعة / PDF" onClick={() => printTable(filtered, cols)}><Printer /> PDF</Button>
            </div>
          )}
        </div>
      )}
      {error ? (
        <ErrorBox error={error} />
      ) : loading ? (
        <Loading />
      ) : filtered.length === 0 ? (
        (empty ?? <Empty />)
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/70 text-xs text-muted-foreground">
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className={cn("px-3 py-2.5 text-right font-semibold whitespace-nowrap", c.className)}>
                    {c.label}
                  </th>
                ))}
                {(onEdit || entityTable) && <th className="px-3 py-2.5 text-right">الإجراءات</th>}
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => (
                <tr
                  key={String(r["id"] ?? i)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onRowClick(r); } } : undefined}
                  className={cn(
                    "border-t transition-colors",
                    onRowClick && "cursor-pointer hover:bg-accent/60",
                    selectedId && r["id"] === selectedId && "bg-gold-soft",
                  )}
                >
                  {cols.map((c) => (
                    <td key={c.key} className={cn("px-3 py-2.5 whitespace-nowrap", c.className)}>
                      {c.render ? c.render(r) : String(r[c.key] ?? "—")}
                    </td>
                  ))}
                  {(onEdit || entityTable) && <td className="px-3 py-2.5">{entityTable ? <RecordActions table={entityTable} id={r.id} onEdit={onEdit ? () => onEdit(r) : undefined} /> : <Button variant="ghost" size="icon" title="تعديل السجل" aria-label="تعديل السجل" onClick={e => { e.stopPropagation(); onEdit?.(r); }}><Pencil className="size-4" /></Button>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {filtered.length > pageSize && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            عرض {cur * pageSize + 1}–{Math.min(filtered.length, (cur + 1) * pageSize)} من {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="outline" aria-label="الصفحة السابقة" className="size-7" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
              <ChevronRight />
            </Button>
            <span className="num px-2">
              {cur + 1} / {pages}
            </span>
            <Button size="icon" variant="outline" aria-label="الصفحة التالية" className="size-7" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
              <ChevronLeft />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function KV({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="divide-y text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-3 py-2">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-left font-medium">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn("h-9 rounded-md border border-input bg-card px-3 text-sm", className)}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

/** Animates numeric KPI values from 0; non-numeric values render as-is. */
function CountUp({ value }: { value: ReactNode }) {
  const target = typeof value === "number" ? value : null;
  const [n, setN] = useState(target ?? 0);
  useEffect(() => {
    if (target == null) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(target); return; }
    const start = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 900);
      setN(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (target == null) return <>{value}</>;
  return <>{Number.isInteger(target) ? Math.round(n).toLocaleString("en-US") : n.toFixed(1)}</>;
}

function cellText<T extends Record<string, unknown>>(r: T, c: Col<T>) {
  return String(displayValue(c.key, r[c.key]));
}
function exportExcel<T extends Record<string, unknown>>(rows: T[], cols: Col<T>[]) {
  const columns = cols.filter(c => c.key !== 'actions').map(c => ({ header: c.label, key: c.key }));
  void downloadSheets([{ name: 'البيانات', columns, rows: rows.map(r => Object.fromEntries(columns.map(c => [c.key, displayValue(c.key, r[c.key])]))) }], 'table')
    .catch(() => window.alert('تعذر إنشاء ملف Excel'));
}
function printTable<T extends Record<string, unknown>>(rows: T[], cols: Col<T>[]) {
  const w = window.open("", "_blank");
  if (!w) return;
  const h = (x: string) => x.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch] as string);
  w.document.write(`<html dir="rtl"><head><meta charset="utf-8"><title>Shata — تقرير</title><style>body{font-family:'IBM Plex Sans Arabic',sans-serif;padding:24px;color:#111}header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #a3c400;padding-bottom:10px;margin-bottom:16px}h1{margin:0;font-size:22px}table{width:100%;border-collapse:collapse;font-size:12px}th{background:#f4ffb8;text-align:right}th,td{border:1px solid #ddd;padding:6px 8px}</style></head><body><header><h1>Shata — تقرير</h1><span>${new Date().toLocaleString("ar-SA-u-nu-latn", { timeZone: "Asia/Riyadh" })}</span></header><table><thead><tr>${cols.map((c) => `<th>${h(c.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${h(cellText(r, c))}</td>`).join("")}</tr>`).join("")}</tbody></table><script>setTimeout(()=>print(),300)</script></body></html>`);
  w.document.close();
}
