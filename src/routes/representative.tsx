import { createFileRoute } from '@tanstack/react-router';
import RepresentativeScreen from '@/components/screens/RepresentativeScreen';

export const Route = createFileRoute("/representative")({
  head: () => ({
    meta: [
      { title: "صفحة المندوب | Shata" },
      { name: "description", content: "تسجيل زيارات العملاء ومواقع الاستلام وطلبات النقل من الميدان." },
      { property: "og:title", content: "صفحة المندوب | Shata" },
      { property: "og:description", content: "العملاء ومواقع الاستلام وطلبات النقل الميدانية." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RepresentativeScreen,
});
