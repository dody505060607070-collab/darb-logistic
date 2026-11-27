import { createFileRoute } from "@tanstack/react-router";
import TripsScreen from "@/components/screens/TripsScreen";

export const Route = createFileRoute("/trips/")({
  validateSearch: (s: Record<string, unknown>): { status?: string; scope?: string } => ({ ...(typeof s.status === "string" ? { status: s.status } : {}), ...(typeof s.scope === "string" ? { scope: s.scope } : {}) }),
  head: () => ({
    meta: [
      { title: "الرحلات | Shata" },
      { name: "description", content: "قائمة الرحلات وحالاتها ومراحلها والموارد المخصصة." },
      { property: "og:title", content: "الرحلات | Shata" },
      { property: "og:description", content: "قائمة الرحلات وحالاتها والموارد المخصصة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TripsScreen,
});
