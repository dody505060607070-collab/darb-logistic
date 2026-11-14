import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { Logo } from './Logo';
import { DisplayControls } from './DisplayControls';
import { Button } from '@/components/ui/button';

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return <div className="min-h-screen bg-background px-4 py-6"><header className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-4 border-b pb-4"><Logo /><DisplayControls /></header><main className="mx-auto max-w-3xl space-y-6 py-8 text-sm leading-8"><h1 className="text-2xl font-bold text-primary">{title}</h1>{children}<Button variant="outline" asChild><Link to="/login">العودة لتسجيل الدخول</Link></Button></main></div>;
}