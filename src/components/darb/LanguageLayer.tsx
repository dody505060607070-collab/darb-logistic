import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLang, setLang, type Lang } from "@/lib/i18n/lang";

const AR = /[\u0600-\u06FF]/;
const ATTRS = ["placeholder", "aria-label", "title"];
type Dict = Record<string, string>;

/** Whole-site English mode: translates rendered Arabic UI text in place and restores originals when switched back. */
export function LanguageLayer() {
  useEffect(() => {
    let dict: Dict | null = null, keys: string[] = [], obs: MutationObserver | null = null;
    const orig = new WeakMap<Node, string>();
    const origAttr = new WeakMap<Element, Record<string, string>>();
    const tr = (s: string) => {
      const t = s.trim();
      if (!t || !AR.test(t) || !dict) return s;
      if (dict[t]) return s.replace(t, dict[t]);
      let out = s;
      for (const k of keys) if (out.includes(k)) { out = out.split(k).join(dict[k]!); if (!AR.test(out)) break; }
      return out;
    };
    const walk = (root: Node) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n: Node | null = root;
      while (n) {
        if (n.nodeType === 3) {
          const v = n.nodeValue ?? "";
          if (AR.test(v) && !(n.parentElement?.closest("[data-no-translate],textarea,script,style"))) {
            if (!orig.has(n)) orig.set(n, v);
            const nv = tr(v); if (nv !== v) n.nodeValue = nv;
          }
        } else if (n.nodeType === 1) {
          const el = n as Element;
          for (const a of ATTRS) {
            const v = el.getAttribute(a);
            if (v && AR.test(v)) { const m = origAttr.get(el) ?? {}; m[a] ??= v; origAttr.set(el, m); el.setAttribute(a, tr(v)); }
          }
        }
        n = w.nextNode();
      }
    };
    const restore = () => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      let n: Node | null = w.nextNode();
      while (n) {
        if (n.nodeType === 3 && orig.has(n)) n.nodeValue = orig.get(n)!;
        if (n.nodeType === 1 && origAttr.has(n as Element)) for (const [a, v] of Object.entries(origAttr.get(n as Element)!)) (n as Element).setAttribute(a, v);
        n = w.nextNode();
      }
    };
    const apply = async (l: Lang) => {
      document.documentElement.lang = l;
      document.documentElement.dir = l === "en" ? "ltr" : "rtl";
      document.body.dataset.lang = l;
      obs?.disconnect(); obs = null;
      if (l === "ar") return restore();
      if (!dict) { dict = (await import("@/lib/i18n/en.json")).default as Dict; keys = Object.keys(dict).sort((a, b) => b.length - a.length); }
      walk(document.body);
      obs = new MutationObserver((ms) => {
        obs?.disconnect();
        for (const m of ms) {
          if (m.type === "characterData") { orig.set(m.target, m.target.nodeValue ?? ""); walk(m.target); }
          else if (m.type === "attributes") walk(m.target);
          else m.addedNodes.forEach(walk);
        }
        obs?.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
      });
      obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
    };
    void apply(getLang());
    const on = (e: Event) => void apply((e as CustomEvent<Lang>).detail);
    window.addEventListener("shata-lang", on);
    return () => { window.removeEventListener("shata-lang", on); obs?.disconnect(); };
  }, []);
  return null;
}

export function LanguageToggle({ className }: { className?: string }) {
  const [l, setL] = useState<Lang>("ar");
  useEffect(() => { setL(getLang()); const on = (e: Event) => setL((e as CustomEvent<Lang>).detail); window.addEventListener("shata-lang", on); return () => window.removeEventListener("shata-lang", on); }, []);
  return (
    <Button type="button" variant="outline" size="sm" className={className} data-no-translate onClick={() => setLang(l === "ar" ? "en" : "ar")} aria-label="Language / اللغة">
      <Languages /> {l === "ar" ? "English" : "العربية"}
    </Button>
  );
}
