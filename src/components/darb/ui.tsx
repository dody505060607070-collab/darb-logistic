import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Inbox, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS, type Tone } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
}: {
  title?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={cn("panel flex flex-col", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-bold text-primary">
            {icon && <span className="text-gold [&_svg]:size-5">{icon}</span>}
            {title}
          </h2>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("flex-1 p-4", bodyClass)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-primary">
          {icon && <span className="text-gold [&_svg]:size-7">{icon}</span>}
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Kpi({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border bg-card px-4 py-3", tone && TONES[tone], tone && "border-transparent")}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className={cn(tone && "text-current opacity-80")}>{label}</span>
        {icon && <span className="[&_svg]:size-4">{icon}</span>}
      </div>
      <div className="num mt-1 text-right text-2xl font-bold"><CountUp value={value} /></div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Empty({ text = "لا توجد بيانات بعد", action }: { text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
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
      تعذر تحميل البيانات: {(error as { message?: string })?.message ?? "خطأ"}
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
    <div className="flex flex-col gap-3">
      {(searchKeys || filters) && (
        <div className="flex flex-wrap items-center gap-2">
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
              </tr>
            </thead>
            <tbody>
              {view.map((r, i) => (
                <tr
                  key={String(r["id"] ?? i)}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
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
            <Button size="icon" variant="outline" className="size-7" disabled={cur === 0} onClick={() => setPage(cur - 1)}>
              <ChevronRight />
            </Button>
            <span className="num px-2">
              {cur + 1} / {pages}
            </span>
            <Button size="icon" variant="outline" className="size-7" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>
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
