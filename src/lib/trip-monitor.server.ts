import { distanceToRouteM, nearAny, offRouteState, stoppedMinutes, thinLine, tripStopMinutes, trackerLost, withProviderFix, FRESH_MINUTES, STOP_MINUTES, type GpsPoint, type LatLng, type ProviderFix } from '@/lib/route-plan';

type Admin = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Points the truck must pass: pickup, then drop-offs in their saved order, then the final destination. */
async function tripWaypoints(db: Admin, tripId: string): Promise<LatLng[]> {
  const { data: trip, error } = await db.from('trips').select('id, origin:locations!trips_origin_location_id_fkey(lat,lng), dest:locations!trips_dest_location_id_fkey(lat,lng)').eq('id', tripId).maybeSingle();
  if (error) throw new Error(error.message);
  const { data: stops, error: stopsError } = await db.from('trip_stops').select('lat,lng,seq,created_at').eq('trip_id', tripId).order('seq').order('created_at');
  if (stopsError) throw new Error(stopsError.message);
  const pts: LatLng[] = [];
  const ok = (p: { lat: number | null; lng: number | null } | null | undefined) => p && p.lat != null && p.lng != null;
  if (ok(trip?.origin)) pts.push({ lat: trip.origin.lat, lng: trip.origin.lng });
  for (const s of stops ?? []) pts.push({ lat: s.lat, lng: s.lng });
  if (ok(trip?.dest)) {
    const last = pts[pts.length - 1];
    if (!last || last.lat !== trip.dest.lat || last.lng !== trip.dest.lng) pts.push({ lat: trip.dest.lat, lng: trip.dest.lng });
  }
  return pts;
}

/** Builds the planned road through all waypoints (truck profile) and saves it; falls back to straight lines when the routing service is unavailable. */
export async function computeTripRoute(db: Admin, tripId: string) {
  const pts = await tripWaypoints(db, tripId);
  if (pts.length < 2) return { ok: false as const, reason: 'حدد موقع التحميل والتسليم على الخريطة أولًا' };
  let points: [number, number][] = pts.map((p) => [p.lat, p.lng]);
  let provider: 'ors' | 'straight' = 'straight';
  let distanceKm: number | null = null, durationMin: number | null = null;
  const key = process.env.ORS_API_KEY;
  if (key) {
    try {
      const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-hgv/geojson', {
        method: 'POST', headers: { Authorization: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ coordinates: pts.map((p) => [p.lng, p.lat]) }), signal: AbortSignal.timeout(12000),
      });
      const body = res.ok ? await res.json() : null;
      const f = body?.features?.[0];
      const coords: [number, number][] | undefined = f?.geometry?.coordinates;
      if (coords?.length) {
        points = thinLine(coords.map(([lng, lat]) => [lat, lng] as [number, number]));
        provider = 'ors';
        distanceKm = f.properties?.summary?.distance != null ? Math.round(f.properties.summary.distance / 100) / 10 : null;
        durationMin = f.properties?.summary?.duration != null ? Math.round(f.properties.summary.duration / 60) : null;
      } else if (!res.ok) console.error('Route service failed', res.status, (await res.text().catch(() => '')).slice(0, 200));
    } catch (e) { console.error('Route service error', (e as Error).message); }
  }
  const { error } = await db.from('trip_routes').upsert({ trip_id: tripId, points, provider, distance_km: distanceKm, duration_min: durationMin, computed_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return { ok: true as const, provider, distanceKm, durationMin };
}

/**
 * Runs every minute: plans missing routes for running trips, then opens or clears
 * "left the route" and "stopped" alerts from the latest truck readings. Alerts open once per episode.
 */
export async function monitorRunningTrips(now = Date.now()) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const db = supabaseAdmin as Admin;
  const { data: trips, error } = await db.from('trips').select('id, tractor_id, stage, actual_start').eq('status', 'in_progress').not('tractor_id', 'is', null).limit(200);
  if (error) throw new Error(error.message);
  const running = new Set<string>((trips ?? []).map((t: { id: string }) => t.id));

  // Alerts of trips that are no longer running are closed.
  const { data: openAlerts } = await db.from('trip_alerts').select('trip_id, kind').is('cleared_at', null);
  for (const a of openAlerts ?? []) if (!running.has(a.trip_id)) await db.rpc('clear_trip_alert', { p_trip_id: a.trip_id, p_kind: null });
  const isOpen = (trip: string, kind: string) => (openAlerts ?? []).some((a: { trip_id: string; kind: string }) => a.trip_id === trip && a.kind === kind);

  const ids = [...running];
  if (!ids.length) return { trips: 0, opened: 0 };
  const { data: routes } = await db.from('trip_routes').select('trip_id, points, provider').in('trip_id', ids);
  const routeOf = new Map<string, { points: [number, number][]; provider: string }>((routes ?? []).map((r: { trip_id: string; points: [number, number][]; provider: string }) => [r.trip_id, r]));
  let planned = 0;
  for (const id of ids) if (!routeOf.has(id) && planned < 3) { planned++; await computeTripRoute(db, id).catch((e) => console.error('Route planning failed', id, (e as Error).message)); }

  // Live tracker state of each trip's truck (ضمان المهندس), so parked or offline trucks are still judged.
  const { data: fixes } = await db.from('gps_provider_vehicles').select('asset_id, lat, lng, speed_kmh, vehicle_state, synced_at').in('asset_id', (trips ?? []).map((t: { tractor_id: string }) => t.tractor_id));
  const fixOf = new Map<string, ProviderFix>((fixes ?? []).map((f: ProviderFix & { asset_id: string }) => [f.asset_id, f]));
  // Latest driver update per trip: a stop is only counted after the trip got going.
  const { data: events } = await db.from('trip_events').select('trip_id, occurred_at').in('trip_id', ids).order('occurred_at', { ascending: false }).limit(1000);
  const lastEventOf = new Map<string, string>();
  for (const e of events ?? []) if (!lastEventOf.has(e.trip_id)) lastEventOf.set(e.trip_id, e.occurred_at);
  let opened = 0;
  for (const t of trips ?? []) {
    const fix = fixOf.get(t.tractor_id);
    if (trackerLost(fix, now)) {
      const { data } = await db.rpc('open_trip_alert', { p_trip_id: t.id, p_kind: 'gps_lost', p_lat: fix?.lat ?? null, p_lng: fix?.lng ?? null, p_distance_m: null, p_minutes: null });
      if (data) opened++;
      continue;
    }
    if (fix && isOpen(t.id, 'gps_lost')) await db.rpc('clear_trip_alert', { p_trip_id: t.id, p_kind: 'gps_lost' });
    const { data: readings } = await db.from('gps_readings').select('lat,lng,speed_kmh,event_time').eq('asset_id', t.tractor_id).order('event_time', { ascending: false }).limit(120);
    const pts: GpsPoint[] = withProviderFix((readings ?? []).map((r: { lat: number; lng: number; speed_kmh: number | null; event_time: string }) => ({ lat: r.lat, lng: r.lng, speed: r.speed_kmh, at: r.event_time })), fix, now);
    const latest = pts[0];
    if (!latest || now - Date.parse(latest.at) > FRESH_MINUTES * 60000) continue;
    const waypoints = await tripWaypoints(db, t.id);

    const route = routeOf.get(t.id);
    if (route && route.provider === 'ors') {
      const dist = distanceToRouteM(latest, route.points);
      const state = offRouteState(dist, isOpen(t.id, 'off_route'));
      if (state === 'open') { const { data } = await db.rpc('open_trip_alert', { p_trip_id: t.id, p_kind: 'off_route', p_lat: latest.lat, p_lng: latest.lng, p_distance_m: Math.round(dist), p_minutes: null }); if (data) opened++; }
      else if (state === 'clear' && isOpen(t.id, 'off_route')) await db.rpc('clear_trip_alert', { p_trip_id: t.id, p_kind: 'off_route' });
    }

    const minutes = tripStopMinutes(stoppedMinutes(pts, now), [t.actual_start, lastEventOf.get(t.id)], now);
    const expected = nearAny(latest, waypoints) || ['loading_start', 'unloading_start', 'arrived_pickup', 'arrived_delivery', 'fuel_stop', 'rest_stop', 'pending'].includes(t.stage);
    if (minutes && minutes >= STOP_MINUTES && !expected) {
      const { data } = await db.rpc('open_trip_alert', { p_trip_id: t.id, p_kind: 'stopped', p_lat: latest.lat, p_lng: latest.lng, p_distance_m: null, p_minutes: minutes });
      if (data) opened++;
    } else if (minutes === 0 && isOpen(t.id, 'stopped')) await db.rpc('clear_trip_alert', { p_trip_id: t.id, p_kind: 'stopped' });
  }
  return { trips: ids.length, opened };
}
