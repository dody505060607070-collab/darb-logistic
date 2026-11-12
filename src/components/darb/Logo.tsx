import { cn } from "@/lib/utils";
import { BRAND } from '@/lib/brand';

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <svg viewBox="0 0 64 40" className="h-10 w-16 shrink-0" aria-hidden>
        <path d="M4 36 C 18 30, 30 14, 60 6 L 60 12 C 36 18, 24 30, 14 36 Z" className="fill-gold" />
        <path d="M18 36 C 30 30, 40 20, 60 15 L 60 21 C 46 24, 38 31, 30 36 Z" className="fill-gold opacity-70" />
      </svg>
      <div className="leading-none">
        <div className={cn("text-2xl font-bold", light ? "text-sidebar-foreground" : "text-primary")}>{BRAND.name}</div>
        {BRAND.englishName && <div className="text-xs text-muted-foreground">{BRAND.englishName}</div>}
      </div>
    </div>
  );
}
