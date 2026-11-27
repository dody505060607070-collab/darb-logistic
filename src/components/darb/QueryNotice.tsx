import { Button } from '@/components/ui/button';
import { queryState } from '@/lib/query-state';

export function QueryNotice({ query, label }: { query: { data?: unknown; error?: unknown; isFetching: boolean; refetch: () => unknown }; label: string }) {
  const state = queryState(query);
  if (state.failed) return <div role="alert" className="flex flex-wrap items-center gap-2 py-2 text-sm text-danger"><span>تعذر تحميل {label}.{state.loaded ? ' المعروض آخر بيانات ناجحة؛ قد لا يكون محدثًا.' : ' البيانات غير متاحة، وليس العدد صفرًا.'}</span><Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>إعادة المحاولة · {label}</Button></div>;
  if (state.pending || state.refreshing) return <p role="status" className="py-2 text-sm text-muted-foreground">{state.refreshing ? `جارٍ تحديث ${label}؛ المعروض آخر بيانات ناجحة…` : `جارٍ تحميل ${label}…`}</p>;
  return null;
}