import { createFileRoute } from "@tanstack/react-router";
import DocumentsScreen from "@/components/screens/DocumentsScreen";

export const Route = createFileRoute("/documents")({
  validateSearch: (s: Record<string, unknown>): { id?: string; filter?: string; entity?: string } => Object.fromEntries(Object.entries(s).filter(([k, v]) => ["id", "filter", "entity"].includes(k) && typeof v === "string")),
  head: () => ({
    meta: [
      { title: "التفويضات وانتهاء المستندات | Shata" },
      { name: "description", content: "متابعة المستندات والتفويضات وتواريخ الانتهاء." },
      { property: "og:title", content: "المستندات والتفويضات | Shata" },
      { property: "og:description", content: "متابعة المستندات والتفويضات وتواريخ الانتهاء." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DocumentsScreen,
});
