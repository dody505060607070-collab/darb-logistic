import { createFileRoute } from "@tanstack/react-router";
import ExpensesScreen from "@/components/screens/ExpensesScreen";

export const Route = createFileRoute("/expenses")({
  validateSearch: (s: Record<string, unknown>): { id?: string; tab?: string; status?: string; filter?: string } => Object.fromEntries(Object.entries(s).filter(([k,v]) => ["id", "tab", "status", "filter"].includes(k) && typeof v === "string")),
  head: () => ({
    meta: [
      { title: "الوقود والمصروفات والسلف | Shata" },
      { name: "description", content: "تعبئة الديزل والمصروفات واعتمادها والسلف وتسويتها." },
      { property: "og:title", content: "الوقود والمصروفات | Shata" },
      { property: "og:description", content: "تعبئة الديزل والمصروفات والسلف." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesScreen,
});
