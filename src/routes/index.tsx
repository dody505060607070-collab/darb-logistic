import { createFileRoute } from '@tanstack/react-router';
import HomeScreen from '@/components/screens/HomeScreen';

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "الصفحة الرئيسية وإدارة علاقات العملاء | Shata" },
      { name: "description", content: "مؤشرات تشغيل Shata وإدارة العملاء وفرص البيع والتواصل والمتابعات." },
      { property: "og:title", content: "الصفحة الرئيسية وإدارة علاقات العملاء | Shata" },
      { property: "og:description", content: "لوحات التشغيل والعملاء ومسار المبيعات والمتابعات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomeScreen,
});
