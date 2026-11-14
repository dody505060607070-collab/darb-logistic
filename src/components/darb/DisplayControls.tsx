import { LanguageToggle } from './LanguageLayer';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

/** Language picker and light/dark switch, always together as transparent glass pills. */
export function DisplayControls({ className }: { className?: string }) {
  return <div className={cn('flex shrink-0 items-center gap-2', className)} role="group" aria-label="اللغة والمظهر"><LanguageToggle /><span className="h-5 w-px bg-border" aria-hidden /><ThemeToggle /></div>;
}
