import { cn } from "@/lib/utils";
import { BRAND } from '@/lib/brand';
import logoAsset from '@/assets/shata-original.png.asset.json';

export function Logo({ className, light = false }: { className?: string; light?: boolean }) {
  return (
    <div className={cn("flex min-w-0 items-center", light && 'text-sidebar-foreground', className)}>
      <img src={logoAsset.url} alt={BRAND.name} width={196} height={143} className="company-logo max-w-full" />
    </div>
  );
}
