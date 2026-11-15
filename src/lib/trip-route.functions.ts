import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Dispatch plans (or re-plans) the road route of a trip through its drop-off points. */
export const planTripRoute = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ tripId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc('has_any_role', { _user_id: context.userId, _roles: ['owner', 'ops_manager', 'dispatcher'] });
    if (error || !allowed) throw new Error('ليست لديك صلاحية تخطيط المسار');
    const { data: trip, error: tripError } = await context.supabase.from('trips').select('id').eq('id', data.tripId).maybeSingle();
    if (tripError || !trip) throw new Error('الرحلة غير موجودة');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { computeTripRoute } = await import('@/lib/trip-monitor.server');
    return computeTripRoute(supabaseAdmin, data.tripId);
  });
