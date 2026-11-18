import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Fleet staff pull the latest ضمان المهندس positions now instead of waiting for the per-minute job. */
export const damanSyncNow = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: allowed, error } = await context.supabase.rpc('has_any_role', { _user_id: context.userId, _roles: ['owner', 'ops_manager', 'dispatcher', 'fleet_supervisor'] });
    if (error || !allowed) throw new Error('ليست لديك صلاحية تحديث التتبع');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { syncDamanGps } = await import('@/lib/daman-gps.server');
    return syncDamanGps(supabaseAdmin);
  });
