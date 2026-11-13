import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/jobs/task-reminders')({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    try {
      const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
      const { error } = await (supabaseAdmin as any).rpc('enqueue_due_task_reminders');
      if (error) throw error;
      const { processTaskNotifications } = await import('@/lib/task-notifications.server');
      return Response.json(await processTaskNotifications());
    } catch (e) {
      console.error('Task reminder processing failed', e);
      return Response.json({ error: 'تعذر معالجة التذكيرات' }, { status: 500 });
    }
  } } },
});