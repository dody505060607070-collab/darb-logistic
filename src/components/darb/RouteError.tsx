import { useEffect } from 'react';
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { claimRouteReload, isStaleRouteError } from '@/lib/route-recovery';
import { reportLovableError } from '@/lib/lovable-error-reporting';

/** Loaded eagerly so a broken lazy page cannot also break its fallback. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: 'route_error' });
    if (isStaleRouteError(error) && claimRouteReload(sessionStorage, location.pathname)) location.reload();
  }, [error]);
  return <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background px-4">
    <div className="max-w-md text-center">
      <h1 className="text-xl font-semibold text-foreground">تعذر تحميل الصفحة</h1>
      <p className="mt-2 text-sm text-muted-foreground">حاول تحديث الصفحة أو العودة للرئيسية.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button onClick={() => { if (isStaleRouteError(error)) location.reload(); else { void router.invalidate(); reset(); } }}>إعادة المحاولة</Button>
        <Button variant="outline" asChild><a href="/">الرئيسية</a></Button>
      </div>
    </div>
  </div>;
}