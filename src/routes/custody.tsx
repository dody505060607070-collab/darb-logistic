import { createFileRoute } from "@tanstack/react-router";
import CustodyScreen from "@/components/screens/CustodyScreen";

export const Route = createFileRoute("/custody")({
  validateSearch: (s: Record<string, unknown>): { id?: string; tab?: string; status?: string; filter?: string } => Object.fromEntries(Object.entries(s).filter(([k,v]) => ["id", "tab", "status", "filter"].includes(k) && typeof v === "string")),
  head: () => ({
    meta: [
      { title: "العهد والفحص | Shata" },
      { name: "description", content: "محاضر استلام العهد وقوائم الفحص والعيوب." },
      { property: "og:title", content: "العهد والفحص | Shata" },
      { property: "og:description", content: "محاضر استلام العهد وقوائم الفحص." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CustodyScreen,
});
