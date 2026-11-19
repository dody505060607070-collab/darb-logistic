import { useState } from "react";
import { cn } from "@/lib/utils";
import { BRAND } from '@/lib/brand';
import logoAsset from '@/assets/shata-original.png.asset.json';

/** Company logo; if the image briefly fails (e.g. while the server restarts) it retries once, then shows the name. */
export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  const [tries, setTries] = useState(0);
  return (
    <div className={cn("flex min-w-0 items-center", light && 'text-sidebar-foreground', className)}>
      {tries < 2 ? (
        <img key={tries} src={tries ? `${logoAsset.url}?r=1` : logoAsset.url} alt={BRAND.name} width={196} height={143} className="company-logo max-w-full"
          onError={() => { if (tries === 0) window.setTimeout(() => setTries(1), 1500); else setTries(2); }} />
      ) : (
        <span className="text-lg font-bold text-primary">{BRAND.name}</span>
      )}
    </div>
  );
}
