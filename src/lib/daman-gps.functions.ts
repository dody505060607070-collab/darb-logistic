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

/** One device's stops and movements for a Riyadh calendar day, read live from ضمان المهندس. */
export const damanVehicleStops = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; day: string }) => {
    if (!/^\d{1,12}$/.test(String(d?.id ?? '')) || !/^\d{4}-\d{2}-\d{2}$/.test(String(d?.day ?? ''))) throw new Error('طلب غير صالح');
    return { id: String(d.id), day: String(d.day) };
  })
  .handler(async ({ data, context }) => {
    const { data: allowed, error } = await context.supabase.rpc('has_any_role', { _user_id: context.userId, _roles: ['owner', 'ops_manager', 'dispatcher', 'fleet_supervisor'] });
    if (error || !allowed) throw new Error('ليست لديك صلاحية عرض التتبع');
    // Only devices of this fleet (already synced and visible to the caller) can be asked about.
    const { data: own } = await context.supabase.from('gps_provider_vehicles').select('id').eq('provider', 'daman').eq('provider_vehicle_id', data.id).maybeSingle();
    if (!own) throw new Error('جهاز التتبع غير موجود');
    const key = process.env.DAMAN_GPS_API_KEY?.trim();
    if (!key) throw new Error('لم يتم الربط');
    const { DAMAN_API_BASE, parseDamanStops } = await import('@/lib/daman-gps');
    const q = new URLSearchParams({ fromDate: `${data.day}T00:00:00`, toDate: `${data.day}T23:59:59`, isEnglish: 'true' });
    try {
      const res = await fetch(`${DAMAN_API_BASE}/api/v1/history/report/vehicle/${data.id}/stops/grouped?${q}`, { headers: { 'X-Api-Key': key, ApiKey: key, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`http ${res.status}`);
      return parseDamanStops(await res.json());
    } catch (e) {
      console.error('Daman stops failed', e instanceof Error ? e.message : e);
      throw new Error('تعذر جلب توقفات المركبة من ضمان المهندس');
    }
  });
