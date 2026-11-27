import { createFileRoute } from "@tanstack/react-router";
import TrackingScreen from "@/components/screens/TrackingScreen";

export const Route = createFileRoute("/tracking")({
  validateSearch: (s: Record<string, unknown>): { v?: string; insight?: string } => ({ ...(typeof s.v === "string" && s.v ? { v: s.v } : {}), ...(s.insight === "moving_without_trip" ? { insight: s.insight } : {}) }),
  head: () => ({
    meta: [
      { title: "التتبع وآخر المواقع | Shata" },
      { name: "description", content: "مواقع الرؤوس على خريطة المملكة وحالة الاتصال وآخر تحديث." },
      { property: "og:title", content: "التتبع وآخر المواقع | Shata" },
      { property: "og:description", content: "مواقع الرؤوس وحالة الاتصال وآخر تحديث." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TrackingScreen,
});
