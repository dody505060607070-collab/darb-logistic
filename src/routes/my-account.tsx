import { createFileRoute } from '@tanstack/react-router';
import MyAccountScreen from '@/components/screens/MyAccountScreen';

export const Route = createFileRoute("/my-account")({
  head: () => ({
    meta: [
      { title: "حسابي | Shata" },
      { name: "description", content: "بياناتك الشخصية ووظيفتك ورقم جوالك ومستنداتك في نظام Shata." },
      { property: "og:title", content: "حسابي | Shata" },
      { property: "og:description", content: "عرض بيانات الحساب وتغيير رقم الجوال." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyAccountScreen,
});
