import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
import { SCHEDULED_RUN_BUDGET_MS } from '@/lib/outbox-budget';

/** Extra per-minute sender so queued WhatsApp notices drain quickly; atomic claims keep parallel runs from double-sending. */
export const Route = createFileRoute('/api/public/jobs/whatsapp-send')({
  server: { handlers: { POST: async ({ request }) => {
    const started = Date.now();
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    try {
      const { processWhatsAppOutbox } = await import('@/lib/whatsapp-outbox.server');
      return Response.json(await processWhatsAppOutbox({ deadlineAt: started + SCHEDULED_RUN_BUDGET_MS, limit: 12, concurrency: 5 }));
    } catch (e) {
      console.error('WhatsApp send failed', e);
      return Response.json({ error: 'تعذر إرسال رسائل واتساب' }, { status: 500 });
    }
  } } },
});
