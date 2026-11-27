import { createFileRoute } from '@tanstack/react-router';
import MyDocumentsScreen from '@/components/screens/MyDocumentsScreen';

export const Route = createFileRoute("/my-documents")({
  head: () => ({
    meta: [
      { title: "مستنداتي | Shata" },
      { name: "description", content: "ارفع مستنداتك الناقصة بنفسك لتراجعها الإدارة وتعتمدها." },
      { property: "og:title", content: "مستنداتي | Shata" },
      { property: "og:description", content: "رفع المستندات الشخصية ومتابعة اعتمادها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyDocumentsScreen,
});
