import { createFileRoute } from '@tanstack/react-router';
import ChatScreen from '@/components/screens/ChatScreen';

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "المحادثات | Shata" },
      { name: "description", content: "محادثة جماعية للشركة ومحادثات خاصة بين الموظفين والسائقين." },
      { property: "og:title", content: "المحادثات | Shata" },
      { property: "og:description", content: "محادثة الشركة والمحادثات الخاصة." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatScreen,
});
