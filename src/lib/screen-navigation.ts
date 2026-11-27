import { useNavigate, useRouterState } from '@tanstack/react-router';
import { getPresentationRuntime, presentationHome } from './presentation-runtime';

export function useScreenPath() {
  return useRouterState({ select: s => {
    if (s.location.pathname !== '/demo') return s.location.pathname;
    const runtime = getPresentationRuntime();
    return String((s.location.search as Record<string, unknown>)['screen'] || (runtime ? presentationHome(runtime.role) : '/')).split('?')[0] ?? '/';
  } });
}
export function useScreenSearch(): Record<string, any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return useRouterState({ select: s => s.location.pathname === '/demo' ? Object.fromEntries(new URLSearchParams(String((s.location.search as Record<string, unknown>)['screen'] ?? '').split('?')[1] ?? '')) : s.location.search });
}
export function useScreenNavigate(): ReturnType<typeof useNavigate> {
  const navigate = useNavigate();
  return ((options: Parameters<typeof navigate>[0]) => {
    const runtime = getPresentationRuntime();
    if (!runtime || options.to === '/login') return navigate(options);
    let path = String(options.to ?? '/');
    for (const [key, value] of Object.entries(options.params ?? {})) path = path.replace(`$${key}`, String(value));
    const query = options.search && typeof options.search === 'object' ? new URLSearchParams(options.search as Record<string, string>).toString() : '';
    return navigate({ to: '/demo', search: { number: runtime.role.code, screen: `${path}${query ? `?${query}` : ''}` } });
  }) as ReturnType<typeof useNavigate>;
}