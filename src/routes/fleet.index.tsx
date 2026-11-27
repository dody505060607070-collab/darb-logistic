import { createFileRoute } from "@tanstack/react-router";
import FleetScreen from "@/components/screens/FleetScreen";

export const Route = createFileRoute("/fleet/")({
  validateSearch: (s: Record<string, unknown>): { status?: string; tab?: string } => ({ ...(typeof s.status === "string" ? { status: s.status } : {}), ...(s.tab === "trailer" || s.tab === "tractor" ? { tab: s.tab } : {}) }),
  head: () => ({
    meta: [
      { title: "الأسطول — الرؤوس والمقطورات | Shata" },
      { name: "description", content: "إدارة رؤوس الشاحنات والمقطورات وحالتها وربطها بالرحلات." },
      { property: "og:title", content: "الأسطول | Shata" },
      { property: "og:description", content: "إدارة رؤوس الشاحنات والمقطورات وحالتها." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FleetScreen,
});
