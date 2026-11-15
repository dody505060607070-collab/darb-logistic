import { useEffect, useState } from 'react';
import { CircleHelp, X } from 'lucide-react';
import { guideFor } from './page-guides';

const KEY = 'shata-guide-hidden';
/** One-line purpose plus three steps, shown on every internal page; each account can hide it per page. */
export function PageGuide({ path }: { path: string }) {
  const guide = guideFor(path);
  const [hidden, setHidden] = useState<boolean | null>(null);
  useEffect(() => { try { setHidden((JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]).includes(path)); } catch { setHidden(false); } }, [path]);
  if (!guide || hidden === null) return null;
  const toggle = (v: boolean) => {
    try { const list = new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]); if (v) list.add(path); else list.delete(path); localStorage.setItem(KEY, JSON.stringify([...list])); } catch { /* ignore */ }
    setHidden(v);
  };
  if (hidden) return <button type="button" onClick={() => toggle(false)} className="mb-3 inline-flex items-center gap-1.5 rounded-full border bg-card/70 px-3 py-1 text-xs text-muted-foreground hover:text-primary"><CircleHelp className="size-3.5" />شرح الصفحة</button>;
  return <aside aria-label="شرح الصفحة" className="page-guide mb-4 rounded-3xl border border-gold/30 bg-card/70 p-4 text-sm backdrop-blur">
    <div className="flex items-start gap-3">
      <CircleHelp className="mt-0.5 size-5 shrink-0 text-gold" />
      <div className="min-w-0 flex-1 space-y-2">
        <p><span className="font-bold text-primary">ما وظيفة هذه الصفحة؟</span> {guide.what}</p>
        <ol className="grid gap-1.5 text-muted-foreground md:grid-cols-3">{guide.steps.map((s, i) => <li key={s} className="flex gap-2"><span className="num flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">{i + 1}</span><span>{s}</span></li>)}</ol>
      </div>
      <button type="button" onClick={() => toggle(true)} aria-label="إخفاء الشرح" title="إخفاء الشرح" className="rounded-full p-1 text-muted-foreground hover:text-primary"><X className="size-4" /></button>
    </div>
  </aside>;
}
