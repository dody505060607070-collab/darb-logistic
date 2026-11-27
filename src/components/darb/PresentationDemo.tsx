import { lazy, Suspense, useEffect, useState, type MouseEvent } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session } from '@supabase/supabase-js';
import { LogOut, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AuthContext } from '@/lib/auth-context';
import type { AppRole, AuthState } from '@/lib/auth';
import { DEMO_ROLES, findDemoRole, type DemoRole } from '@/lib/presentation-demo';
import { activatePresentation, PresentationRuntime, presentationHome } from '@/lib/presentation-runtime';
import { Logo } from './Logo';

const Home = lazy(() => import('@/components/screens/HomeScreen'));
const Representative = lazy(() => import('@/components/screens/RepresentativeScreen'));
const Driver = lazy(() => import('@/components/screens/DriverScreen'));
const Repair = lazy(() => import('@/components/screens/RepairCenterScreen'));
const Tasks = lazy(() => import('@/components/screens/TasksScreen'));
const Account = lazy(() => import('@/components/screens/MyAccountScreen'));
const Documents = lazy(() => import('@/components/screens/MyDocumentsScreen'));
const Chat = lazy(() => import('@/components/screens/ChatScreen'));
const Custody = lazy(() => import('@/components/screens/CustodyScreen'));
const Expenses = lazy(() => import('@/components/screens/ExpensesScreen'));
const Tracking = lazy(() => import('@/components/screens/TrackingScreen'));
const Trips = lazy(() => import('@/components/screens/TripsScreen'));
const Fleet = lazy(() => import('@/components/screens/FleetScreen'));
const Finance = lazy(() => import('@/components/screens/FinanceScreen'));
const Requests = lazy(() => import('@/components/screens/CustomerRequestsScreen'));
const OperationalDocs = lazy(() => import('@/components/screens/DocumentsScreen'));
const SCREENS = { '/documents': OperationalDocs, '/tracking': Tracking, '/trips': Trips, '/fleet': Fleet, '/finance': Finance, '/customer-requests': Requests, '/custody': Custody, '/expenses': Expenses, '/': Home, '/representative': Representative, '/driver': Driver, '/repair-center': Repair, '/tasks': Tasks, '/my-account': Account, '/my-documents': Documents, '/chat': Chat };

export function PresentationDemo({ number, screen }: { number: string; screen: string }) {
  const role = findDemoRole(number);
  if (!role) return <div dir="rtl" className="mx-auto max-w-xl space-y-6 px-6 py-16 text-center"><Logo className="justify-center" /><h1 className="text-2xl font-bold">رقم تجربة غير صحيح</h1><Button asChild><Link to="/login">العودة للدخول</Link></Button></div>;
  return <RealScreenExperience key={role.code} role={role} screen={screen || presentationHome(role)} />;
}

function RealScreenExperience({ role, screen }: { role: DemoRole; screen: string }) {
  const navigate = useNavigate();
  const [runtime] = useState(() => { const store = new PresentationRuntime(role, window.sessionStorage); activatePresentation(store); return store; });
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5000 } } }));
  const [revision, setRevision] = useState(0);
  useEffect(() => { const release = activatePresentation(runtime); return () => { queryClient.clear(); release(); runtime.files.forEach(url => URL.revokeObjectURL(url)); }; }, [runtime, queryClient]);
  const roles: AppRole[] = role.role === 'employee' ? [] : [role.role];
  // Synthetic identity is confined to this provider. It has no tokens and is never stored as an auth session.
  const session: Session = { access_token: '', refresh_token: '', expires_in: 0, token_type: 'bearer', user: { id: runtime.uid, app_metadata: {}, user_metadata: {}, aud: 'presentation', created_at: '' } };
  const auth: AuthState = { ready: true, session, roles, fullName: role.name, driverId: role.role === 'driver' ? 'sample-driver' : null, isSuperAdmin: role.role === 'owner', isStaff: !['driver', 'representative'].includes(role.role), viewAs: null, can: (...allowed) => roles.includes('owner') || allowed.some(r => roles.includes(r)), refresh: async () => undefined, setViewAs: r => { const next = DEMO_ROLES.find(x => x.role === (r ?? 'owner')); if (next) void navigate({ to: '/demo', search: { number: next.code, screen: presentationHome(next) } }); }, signOut: async () => { await navigate({ to: '/login' }); } };
  const path = screen.split('?')[0] ?? '/';
  const Screen = SCREENS[path as keyof typeof SCREENS];
  function intercept(event: MouseEvent<HTMLDivElement>) {
    const target = event.target instanceof Element ? event.target.closest('a') : null;
    if (!target) return;
    const url = new URL(target.href, window.location.origin);
    if (url.pathname === '/login' && url.origin === window.location.origin) return;
    event.preventDefault(); event.stopPropagation();
    if (url.origin !== window.location.origin || !['http:', 'https:'].includes(url.protocol)) { toast.info('الاتصال والرسائل الخارجية متوقفة في تجربة الشرح'); return; }
    void navigate({ to: '/demo', search: { number: role.code, screen: `${url.pathname}${url.search}` } });
  }
  return <QueryClientProvider client={queryClient}><AuthContext.Provider value={auth}>
    <div dir="rtl" className="min-h-svh bg-background text-foreground" onClickCapture={intercept}>
      <div className="relative z-50 flex flex-wrap items-center justify-center gap-3 border-b border-gold bg-gold-soft px-3 py-2 text-xs font-semibold" role="status">
        <span>تجربة شرح · {role.label} · {role.code} · بيانات وهمية فقط</span>
        <select aria-label="تبديل وظيفة العرض" className="h-8 max-w-full rounded-full border border-border bg-card px-3" value={role.code} onChange={e => { const next = findDemoRole(e.target.value); if (next) void navigate({ to: '/demo', search: { number: next.code, screen: presentationHome(next) } }); }}>{DEMO_ROLES.map(r => <option key={r.code} value={r.code}>{r.label} — {r.code}</option>)}</select>
        <Button size="sm" variant="outline" onClick={() => { if (!window.confirm('مسح تغييرات هذه التجربة فقط؟')) return; runtime.reset(); queryClient.clear(); setRevision(n => n + 1); }}><RotateCcw />إعادة ضبط التجربة</Button>
        <Button size="sm" variant="ghost" onClick={() => void navigate({ to: '/login' })}><LogOut />خروج</Button>
      </div>
      <Suspense fallback={<div className="p-10 text-center text-muted-foreground">جارٍ فتح الصفحة…</div>}>
        {Screen ? <Screen key={`${path}-${revision}`} /> : <div className="space-y-4 p-8 text-center"><h1 className="text-xl font-bold">هذه الصفحة غير متاحة في تجربة الشرح بعد</h1><Button onClick={() => void navigate({ to: '/demo', search: { number: role.code, screen: presentationHome(role) } })}>الرجوع لصفحة الوظيفة</Button></div>}
      </Suspense>
    </div>
  </AuthContext.Provider></QueryClientProvider>;
}
