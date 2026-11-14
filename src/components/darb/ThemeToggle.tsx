import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from '@/components/ui/button';
import { getLang } from '@/lib/i18n/lang';

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

export function ThemeToggle({ className }: { className?: string }) {
  const { mode, toggle } = useThemeMode();
  const [english, setEnglish] = useState(false);
  useEffect(() => { setEnglish(getLang() === 'en'); }, []);
  const label = english ? (mode === 'dark' ? 'Light mode' : 'Dark mode') : mode === "dark" ? "الوضع الفاتح" : "الوضع الغامق";
  return (
    <Button variant="ghost" size="icon"
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      data-no-translate
      className={cn("inline-flex size-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted", className)}
    >
      {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
