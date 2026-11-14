import { LanguageToggle } from './LanguageLayer';
import { ThemeToggle } from './ThemeToggle';
import { cn } from '@/lib/utils';

export function DisplayControls({ className }: { className?: string }) {
  return <div className={cn('flex shrink-0 items-center gap-1 rounded-lg border bg-card p-1', className)} role="group" aria-label="اللغة والمظهر"><LanguageToggle /><span className="h-5 border-s" aria-hidden /><ThemeToggle /></div>;
}