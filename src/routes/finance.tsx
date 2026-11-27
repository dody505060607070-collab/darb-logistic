import { createFileRoute } from "@tanstack/react-router";
import FinanceScreen from "@/components/screens/FinanceScreen";

export const Route = createFileRoute("/finance")({
  validateSearch: (s: Record<string, unknown>): { tab?: string; id?: string } => ({ ...(typeof s.tab === "string" ? { tab: s.tab } : {}), ...(typeof s.id === "string" ? { id: s.id } : {}) }),
  head: () => ({
    meta: [
      { title: "المالية والفوترة والتحصيل | Shata" },
      { name: "description", content: "مسودات الفواتير من الرحلات المسلّمة والدفعات والتحصيل والمتأخرات." },
      { property: "og:title", content: "المالية والفوترة | Shata" },
      { property: "og:description", content: "الفواتير والدفعات والتحصيل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FinanceScreen,
});
