import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export type ThemeMode = "dark" | "light";
const KEY = "darb-theme";

/** Inline script for <head>: applies the saved mode before paint. */
export const THEME_BOOT_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="light")document.documentElement.classList.add("light")}catch(e){}`;

export function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>("dark");
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
  const label = mode === "dark" ? "الوضع الفاتح" : "الوضع الغامق";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className={cn("inline-flex size-9 items-center justify-center rounded-full border bg-card text-foreground transition-colors hover:bg-muted", className)}
    >
      {mode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
