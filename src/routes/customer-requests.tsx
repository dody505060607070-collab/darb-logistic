import { createFileRoute } from "@tanstack/react-router";
import CustomerRequestsScreen from "@/components/screens/CustomerRequestsScreen";

export const Route = createFileRoute("/customer-requests")({
  validateSearch: (s: Record<string, unknown>): { id?: string } => typeof s.id === "string" ? { id: s.id } : {},
  head: () => ({
    meta: [
      { title: "طلبات العملاء من المناديب | Shata" },
      { name: "description", content: "طلبات النقل التي سجلها المناديب من زيارات العملاء وتحويلها إلى أوامر نقل." },
      { property: "og:title", content: "طلبات العملاء | Shata" },
      { property: "og:description", content: "طلبات المناديب الميدانية وتحويلها لأوامر نقل." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustomerRequestsScreen,
});
