import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
import { SCHEDULED_RUN_BUDGET_MS } from '@/lib/outbox-budget';

export const Route = createFileRoute('/api/public/jobs/whatsapp-outbox')({
  server: { handlers: { POST: async ({ request }) => {
    const started = Date.now();
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    try {
      // Fresh ضمان المهندس positions first, then tracking alerts, so notices leave in the same run.
      let gps: unknown = null;
      try {
        const [{ syncDamanGps }, { supabaseAdmin }] = await Promise.all([import('@/lib/daman-gps.server'), import('@/integrations/supabase/client.server')]);
        gps = await syncDamanGps(supabaseAdmin);
      } catch (e) { console.error('Daman GPS sync failed', e); gps = { error: 'تعذر تحديث مواقع ضمان المهندس' }; }
      let tracking: unknown = null;
      try {
        const { monitorRunningTrips } = await import('@/lib/trip-monitor.server');
        tracking = await monitorRunningTrips();
      } catch (e) { console.error('Trip monitor failed', e); tracking = { error: 'تعذر فحص الرحلات الجارية' }; }
      const { processWhatsAppOutbox } = await import('@/lib/whatsapp-outbox.server');
      // Only sends that fit in what is left of this short run; the extra sender schedule handles the rest.
      return Response.json({ ...(await processWhatsAppOutbox({ deadlineAt: started + SCHEDULED_RUN_BUDGET_MS, limit: 12 })), tracking, gps });
    } catch (e) {
      console.error('WhatsApp outbox failed', e);
      return Response.json({ error: 'تعذر إرسال رسائل واتساب' }, { status: 500 });
    }
  } } },
});
