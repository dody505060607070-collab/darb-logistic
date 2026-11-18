import { DAMAN_API_BASE, isDamanTruck, parseDamanDetails, parseDamanVehicles, plateKey, type DamanDetails } from '@/lib/daman-gps';

/** Device details (driver, odometer, battery…) change slowly: refresh a few devices per run, trucks first. */
const DETAILS_PER_RUN = 8;
const DETAILS_MAX_AGE_MS = 30 * 60000;

type Admin = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type DamanSyncResult = { state: 'missing' | 'connected' | 'error'; vehicles: number; linked: number; newReadings: number; detail: string; trucksAdded?: number };

/** Reads the fleet's latest positions from ضمان المهندس and stores them; linked vehicles also get history readings. */
export async function syncDamanGps(db: Admin): Promise<DamanSyncResult> {
  const fleet = process.env.DAMAN_GPS_FLEET_ID?.trim();
  const key = process.env.DAMAN_GPS_API_KEY?.trim();
  if (!fleet || !key) return { state: 'missing', vehicles: 0, linked: 0, newReadings: 0, detail: 'لم يتم الربط' };
  let vehicles;
  try {
    const url = `${DAMAN_API_BASE}/api/v1/vehicles/report/last-online-history-state?fleetId=${encodeURIComponent(fleet)}&isEnglish=true`;
    const res = await fetch(url, { headers: { 'X-Api-Key': key, ApiKey: key, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`http ${res.status}`);
    vehicles = parseDamanVehicles(await res.json());
  } catch (e) {
    console.error('Daman GPS fetch failed', e instanceof Error ? e.message : e);
    return { state: 'error', vehicles: 0, linked: 0, newReadings: 0, detail: 'تعذر الاتصال بخادم ضمان المهندس' };
  }
  if (vehicles.length === 0) return { state: 'error', vehicles: 0, linked: 0, newReadings: 0, detail: 'الخادم متصل لكن لم يُرجع أي مركبة لرقم الأسطول' };

  const now = new Date().toISOString();
  const { error: upErr } = await db.from('gps_provider_vehicles').upsert(
    vehicles.map((v) => ({ provider: 'daman', ...v, synced_at: now })),
    { onConflict: 'provider,provider_vehicle_id' },
  );
  if (upErr) { console.error('Daman GPS store failed', upErr.message); return { state: 'error', vehicles: vehicles.length, linked: 0, newReadings: 0, detail: 'وصلت البيانات لكن تعذر حفظها' }; }

  // Auto-link unlinked devices to Shata vehicles with the same plate (only when unambiguous).
  const [{ data: rowsData }, { data: assets }] = await Promise.all([
    db.from('gps_provider_vehicles').select('id, plate_key, asset_id, lat, lng, gps_time, speed_kmh, provider_vehicle_id, icon, vehicle_type, details_synced_at').eq('provider', 'daman'),
    db.from('assets').select('id, plate, code'),
  ]);
  const rows: any[] = rowsData ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const taken = new Set((rows ?? []).map((r: { asset_id: string | null }) => r.asset_id).filter(Boolean));
  const byPlate = new Map<string, string[]>();
  for (const a of assets ?? []) {
    for (const k of new Set([plateKey(a.plate), plateKey(a.code)])) if (k) byPlate.set(k, [...(byPlate.get(k) ?? []), a.id]);
  }
  for (const r of rows ?? []) {
    if (r.asset_id || !r.plate_key) continue;
    const ids = [...new Set(byPlate.get(r.plate_key) ?? [])];
    const only = ids.length === 1 ? ids[0]! : null;
    if (only && !taken.has(only)) {
      const { error } = await db.from('gps_provider_vehicles').update({ asset_id: only }).eq('id', r.id).is('asset_id', null);
      if (!error) { r.asset_id = only; taken.add(only); }
    }
  }

  // Driver name, vehicle type, odometer, battery… for the stalest devices (unlinked trucks first).
  const due = [...(rows ?? [])]
    .filter((r: { details_synced_at: string | null }) => !r.details_synced_at || Date.now() - Date.parse(r.details_synced_at) > DETAILS_MAX_AGE_MS)
    .sort((a: Row, b: Row) => rank(a) - rank(b) || (a.details_synced_at ?? '').localeCompare(b.details_synced_at ?? ''))
    .slice(0, DETAILS_PER_RUN);
  const details = (await Promise.all(due.map((r: Row) => fetchDetails(r.provider_vehicle_id, key)))).filter((d): d is DamanDetails => !!d);
  if (details.length) {
    const { error } = await db.rpc('gps_store_details', { p_provider: 'daman', p_rows: details });
    if (error) console.error('Daman GPS details store failed', error.message);
  }
  // Trucks join the Shata fleet automatically once their type is known.
  let trucksAdded = 0;
  const { data: added, error: addErr } = await db.rpc('gps_auto_add_trucks', { p_provider: 'daman' });
  if (addErr) console.error('Daman GPS auto-add failed', addErr.message); else trucksAdded = added ?? 0;
  if (trucksAdded) {
    const { data: fresh } = await db.from('gps_provider_vehicles').select('id, plate_key, asset_id, lat, lng, gps_time, speed_kmh, provider_vehicle_id').eq('provider', 'daman');
    if (fresh) rows.splice(0, rows.length, ...fresh);
  }

  const readings = (rows ?? []).filter((r: { asset_id: string | null; lat: number | null; gps_time: string | null }) => r.asset_id && r.lat != null && r.gps_time).map((r: { asset_id: string; provider_vehicle_id: string; gps_time: string; lat: number; lng: number; speed_kmh: number | null }) => ({
    asset_id: r.asset_id,
    reading_id: `daman-${r.provider_vehicle_id}-${Math.floor(new Date(r.gps_time).getTime() / 1000)}`,
    event_time: new Date(Math.min(new Date(r.gps_time).getTime(), Date.now())).toISOString(),
    lat: r.lat, lng: r.lng, speed_kmh: r.speed_kmh, source: 'gps_daman',
  }));
  let newReadings = 0;
  if (readings.length) {
    const { data: ins, error } = await db.from('gps_readings').upsert(readings, { onConflict: 'reading_id', ignoreDuplicates: true }).select('id');
    if (error) console.error('Daman GPS readings failed', error.message); else newReadings = ins?.length ?? 0;
  }
  const linked = readings.length;
  return { state: 'connected', vehicles: vehicles.length, linked, newReadings, trucksAdded, detail: `${vehicles.length} مركبة من ضمان المهندس، ${linked} منها مربوطة بمركبات شتاء${trucksAdded ? ` (أُضيفت ${trucksAdded} شاحنة جديدة للأسطول)` : ''}` };
}

type Row = { provider_vehicle_id: string; asset_id: string | null; icon: string | null; vehicle_type: string | null; details_synced_at: string | null };
const rank = (r: Row) => (isDamanTruck(r) && !r.asset_id ? 0 : r.asset_id ? 1 : 2);

async function fetchDetails(vehicleId: string, key: string): Promise<DamanDetails | null> {
  try {
    const res = await fetch(`${DAMAN_API_BASE}/api/v1/online-history/vehicle/${encodeURIComponent(vehicleId)}?isEnglish=true`, { headers: { 'X-Api-Key': key, ApiKey: key, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    return parseDamanDetails(await res.json());
  } catch { return null; }
}
