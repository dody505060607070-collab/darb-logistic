import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { PresentationDemo } from '@/components/darb/PresentationDemo';

export const Route = createFileRoute('/demo')({
  validateSearch: (search: Record<string, unknown>) => ({ number: typeof search['number'] === 'string' || typeof search['number'] === 'number' ? String(search['number']) : '', screen: typeof search['screen'] === 'string' ? search['screen'] : '' }),
  head: () => ({ meta: [
    { title: 'تجارب شرح الوظائف | Shata' },
    { name: 'description', content: 'تجارب Shata المعزولة للشرح ببيانات توضيحية مستقلة عن سجلات الشركة.' },
    { property: 'og:title', content: 'تجارب شرح الوظائف | Shata' },
    { property: 'og:description', content: 'عرض مستقل لوظائف الأسطول والسائقين والصيانة والمالية ببيانات توضيحية.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
    { name: 'robots', content: 'noindex, nofollow' },
  ] }),
  component: DemoPage,
});

function DemoPage() {
  const { number, screen } = Route.useSearch();
  return <ClientOnly fallback={<div className="min-h-svh bg-background p-10 text-center text-muted-foreground">تجهيز تجربة الشرح…</div>}><PresentationDemo number={number} screen={screen} /></ClientOnly>;
}