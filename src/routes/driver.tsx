import { createFileRoute } from '@tanstack/react-router';
import DriverScreen from '@/components/screens/DriverScreen';

export const Route = createFileRoute("/driver")({
  head: () => ({
    meta: [
      { title: "صفحة السائق | Shata" },
      { name: "description", content: "تكليفات السائق ومواعيد التحميل والتسليم والطلبات وإثبات الاستلام." },
      { property: "og:title", content: "صفحة السائق | Shata" },
      { property: "og:description", content: "التكليفات الحالية والطلبات والفحص وإثبات التسليم." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DriverScreen,
});
