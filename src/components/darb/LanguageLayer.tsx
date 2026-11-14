import { useEffect, useState } from "react";
import { Check, ChevronDown, Languages } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getLang, LANGS, setLang, type Lang } from "@/lib/i18n/lang";
import { loadCatalog, translateUi, type TargetLang } from '@/lib/i18n/translate';
import { cn } from "@/lib/utils";

const AR = /[\u0600-\u06FF]/;
const ATTRS = ["placeholder", "aria-label", "title", "alt"];
const OBSERVE = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS, "dir"] };

/** Whole-site English/Urdu mode: translates rendered Arabic UI text in place after hydration. */
export function LanguageLayer() {
  useEffect(() => {
    let obs: MutationObserver | null = null;
    let target: TargetLang = 'en';
    // remembers what we wrote, so Urdu output (also Arabic script) is never translated twice
    const written = new WeakMap<Node, string>();
    const writtenAttr = new WeakMap<Element, Record<string, string>>();
    const tr = (s: string) => translateUi(s, target);
    const walk = (root: Node) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n: Node | null = root;
      while (n) {
        if (n.nodeType === 3) {
          const v = n.nodeValue ?? "";
          if (AR.test(v) && written.get(n) !== v && !(n.parentElement?.closest("[data-no-translate],textarea,script,style"))) {
            const nv = tr(v); written.set(n, nv); if (nv !== v) n.nodeValue = nv;
          }
        } else if (n.nodeType === 1) {
          const el = n as Element;
          if (target === 'en' && el.getAttribute("dir") === "rtl") el.setAttribute("dir", "ltr");
          for (const a of el.closest('[data-no-translate]') ? [] : ATTRS) {
            const v = el.getAttribute(a);
            const m = writtenAttr.get(el) ?? {};
            if (v && AR.test(v) && m[a] !== v) { const nv = tr(v); m[a] = nv; writtenAttr.set(el, m); if (nv !== v) el.setAttribute(a, nv); }
          }
        }
        n = w.nextNode();
      }
    };
    let pending = 0;
    const queueWalk = () => {
      window.clearTimeout(pending);
      pending = window.setTimeout(() => {
        obs?.disconnect();
        walk(document.body);
        const t = document.querySelector('title'); if (t) walk(t);
        obs?.observe(document.documentElement, OBSERVE);
      }, 120);
    };
    const apply = async (l: Lang) => {
      const meta = LANGS.find(x => x.id === l) ?? LANGS[0]!;
      document.documentElement.lang = l;
      document.documentElement.dir = meta.dir;
      document.body.dataset.lang = l;
      obs?.disconnect(); obs = null;
      if (l === "ar") return;
      target = l;
      await loadCatalog(l);
      obs = new MutationObserver(queueWalk);
      obs.observe(document.documentElement, OBSERVE);
      queueWalk();
    };
    void apply(getLang());
    const on = (e: Event) => void apply((e as CustomEvent<Lang>).detail);
    window.addEventListener("shata-lang", on);
    return () => { window.clearTimeout(pending); window.removeEventListener("shata-lang", on); obs?.disconnect(); };
  }, []);
  return null;
}

const SWITCH_LABEL: Record<Lang, string> = { ar: 'تغيير اللغة', en: 'Change language', ur: 'زبان تبدیل کریں' };

/** Glass pill language picker: Arabic, English and Urdu. */
export function LanguageToggle({ className }: { className?: string }) {
  const [l, setL] = useState<Lang>("ar");
  useEffect(() => { setL(getLang()); const on = (e: Event) => setL((e as CustomEvent<Lang>).detail); window.addEventListener("shata-lang", on); return () => window.removeEventListener("shata-lang", on); }, []);
  const current = LANGS.find(x => x.id === l) ?? LANGS[0]!;
  return (
    <DropdownMenu dir={current.dir}>
      <DropdownMenuTrigger data-no-translate aria-label={SWITCH_LABEL[l]} title={SWITCH_LABEL[l]}
        className={cn("glass-chip inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-gold", className)}>
        <Languages className="size-4 text-brand-red-ink" aria-hidden />
        <span>{current.label}</span>
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-no-translate className="min-w-40 rounded-3xl p-1.5">
        {LANGS.map(o => (
          <DropdownMenuItem key={o.id} dir={o.dir} lang={o.id} onSelect={() => { if (o.id !== l) setLang(o.id); }} className="cursor-pointer justify-between gap-3 rounded-full px-3 py-2">
            <span>{o.label}</span>{o.id === l && <Check className="size-4 text-brand-red-ink" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
