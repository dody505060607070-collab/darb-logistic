import { DAMAN_API_BASE, parseDamanDetails, parseDamanVehicles, plateKey, type DamanDetails, type DamanVehicle } from '@/lib/daman-gps';


type Admin = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export type DamanSyncResult = { state: 'missing' | 'connected' | 'error'; vehicles: number; linked: number; newReadings: number; detail: string; trucksAdded?: number; driversLinked?: number };

/** Reads the fleet's latest positions from ضمان المهندس and stores them; linked vehicles also get history readings. */
export async function syncDamanGps(db: Admin): Promise<DamanSyncResult> {
  const fleet = process.env.DAMAN_GPS_FLEET_ID?.trim();
  const key = process.env.DAMAN_GPS_API_KEY?.trim();
  if (!fleet || !key) return { state: 'missing', vehicles: 0, linked: 0, newReadings: 0, detail: 'لم يتم الربط' };
  let vehicles: DamanVehicle[];
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

  // The fleet list always reports speed 0 / ignition off; each device's own record has the live values.
  const raw = await Promise.all(vehicles.map((v) => fetchVehicle(v.provider_vehicle_id, key)));
  vehicles = vehicles.map((v, i) => {
    const live = raw[i] ? parseDamanVehicles({ data: [raw[i]] })[0] : null;
    return live ? { ...v, ...live, plate: live.plate ?? v.plate, plate_key: live.plate_key ?? v.plate_key, lat: live.lat ?? v.lat, lng: live.lng ?? v.lng } : v;
  });
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
  const details = raw.map((x) => (x ? parseDamanDetails({ data: x }) : null)).filter((d): d is DamanDetails => !!d);
  if (details.length) {
    const { error } = await db.rpc('gps_store_details', { p_provider: 'daman', p_rows: details });
    if (error) console.error('Daman GPS details store failed', error.message);
  }
  // Trucks join the Shata fleet automatically once their type is known.
  let trucksAdded = 0;
  const { data: added, error: addErr } = await db.rpc('gps_auto_add_trucks', { p_provider: 'daman' });
  if (addErr) console.error('Daman GPS auto-add failed', addErr.message); else trucksAdded = added ?? 0;
  // The driver registered on each truck's device gets a driver file and the truck's custody.
  let driversLinked = 0;
  const { data: linkedDrivers, error: drvErr } = await db.rpc('gps_link_drivers', { p_provider: 'daman' });
  if (drvErr) console.error('Daman GPS driver link failed', drvErr.message); else driversLinked = linkedDrivers ?? 0;
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
  return { state: 'connected', vehicles: vehicles.length, linked, newReadings, trucksAdded, driversLinked, detail: `${vehicles.length} مركبة من ضمان المهندس، ${linked} منها مربوطة بمركبات شتاء${trucksAdded ? ` (أُضيفت ${trucksAdded} شاحنة جديدة للأسطول)` : ''}` };
}


async function fetchVehicle(vehicleId: string, key: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${DAMAN_API_BASE}/api/v1/online-history/vehicle/${encodeURIComponent(vehicleId)}?isEnglish=true`, { headers: { 'X-Api-Key': key, ApiKey: key, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const b = await res.json() as { isSuccess?: boolean; data?: Record<string, unknown> | null };
    return b?.isSuccess !== false && b?.data?.vehicleId != null ? b.data : null;
  } catch { return null; }
}
