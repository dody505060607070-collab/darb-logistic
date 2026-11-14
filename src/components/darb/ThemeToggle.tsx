import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { getLang, type Lang } from '@/lib/i18n/lang';

export type ThemeMode = "dark" | "light";
const KEY = "shitaa-theme";

/** Inline script for <head>: applies the saved mode before paint. */
export const THEME_BOOT_SCRIPT = `try{document.documentElement.classList.toggle("light",localStorage.getItem("${KEY}")!=="dark")}catch(e){document.documentElement.classList.add("light")}`;

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>("light");
  useEffect(() => {
    setMode(document.documentElement.classList.contains("light") ? "light" : "dark");
    const obs = new MutationObserver(() =>
      setMode(document.documentElement.classList.contains("light") ? "light" : "dark"),
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  const toggle = () => {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("light", next === "light");
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignore */
    }
  };
  return { mode, toggle };
}

const THEME_LABELS: Record<Lang, { light: string; dark: string; group: string }> = {
  ar: { light: 'الوضع النهاري', dark: 'الوضع الليلي', group: 'المظهر' },
  en: { light: 'Light mode', dark: 'Dark mode', group: 'Appearance' },
  ur: { light: 'دن کا موڈ', dark: 'رات کا موڈ', group: 'ظاہری شکل' },
};

/** Glass segmented control: sun (light) and moon (dark), the active one highlighted. */
export function ThemeToggle({ className }: { className?: string }) {
  const { mode, toggle } = useThemeMode();
  const [lang, setLangState] = useState<Lang>('ar');
  useEffect(() => { setLangState(getLang()); }, []);
  const t = THEME_LABELS[lang];
  const item = (m: ThemeMode, label: string, Icon: typeof Sun) => (
    <button type="button" role="radio" aria-checked={mode === m} aria-label={label} title={label}
      onClick={() => { if (mode !== m) toggle(); }}
      className={cn('grid size-8 place-items-center rounded-full transition-all', mode === m ? 'bg-brand-red-soft text-brand-red-ink shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
      <Icon className="size-4" aria-hidden />
    </button>
  );
  return (
    <div role="radiogroup" aria-label={t.group} data-no-translate className={cn('glass-chip inline-flex h-9 items-center gap-0.5 rounded-full p-0.5', className)}>
      {item('light', t.light, Sun)}{item('dark', t.dark, Moon)}
    </div>
  );
}
