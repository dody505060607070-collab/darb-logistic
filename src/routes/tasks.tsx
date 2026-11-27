import { createFileRoute } from '@tanstack/react-router';
import TasksScreen from '@/components/screens/TasksScreen';

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "المهام | Shata" },
      { name: "description", content: "تكليف الموظفين بمهام، متابعة التذكير، ومراجعة الإنجاز واعتماده." },
      { property: "og:title", content: "المهام | Shata" },
      { property: "og:description", content: "تكليف ومتابعة واعتماد مهام الفريق." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TasksScreen,
});
