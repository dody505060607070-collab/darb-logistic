import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

export const Route = createFileRoute('/api/public/jobs/whatsapp-outbox')({
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    try {
      const { processWhatsAppOutbox } = await import('@/lib/whatsapp-outbox.server');
      return Response.json(await processWhatsAppOutbox());
    } catch (e) {
      console.error('WhatsApp outbox failed', e);
      return Response.json({ error: 'تعذر إرسال رسائل واتساب' }, { status: 500 });
    }
  } } },
});
