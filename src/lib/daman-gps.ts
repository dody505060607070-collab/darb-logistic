/** Browser-safe helpers for the ضمان المهندس (EWE Tracker) vehicle feed. */

export const DAMAN_API_BASE = 'https://v20api.ewe4tech.net';

export type DamanVehicle = {
  provider_vehicle_id: string;
  plate: string | null;
  plate_key: string | null;
  car_name: string | null;
  vehicle_state: 'moving' | 'stopped' | 'disconnected' | string | null;
  ignition: boolean | null;
  speed_kmh: number | null;
  lat: number | null;
  lng: number | null;
  gps_time: string | null;
  icon: string | null;
};

/** Plate comparison key: drops spaces/dashes and case so "1071 - أ ط ل" matches "1071أطل". */
export function plateKey(plate: string | null | undefined): string | null {
  if (!plate) return null;
  const k = plate.replace(/[\s\-_.]/g, '').toLowerCase();
  return k || null;
}

/**
 * The provider reports local Saudi time like "2026/11/18 06:15:14 PM" (no zone).
 * Returns ISO UTC, or null when unparseable.
 */
export function parseDamanTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[4]);
  const ap = m[7]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h > 23) return null;
  const utc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h - 3, Number(m[5]), Number(m[6]));
  return Number.isFinite(utc) ? new Date(utc).toISOString() : null;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Valid Saudi-region coordinate (the provider sends 0/0 for no fix). */
export function inSaudiRegion(lat: number | null, lng: number | null) {
  return lat != null && lng != null && lat > 15 && lat < 33 && lng > 34 && lng < 56;
}

export function parseDamanVehicles(body: unknown): DamanVehicle[] {
  const b = body as { isSuccess?: boolean; data?: unknown };
  if (!b || b.isSuccess === false || !Array.isArray(b.data)) throw new Error('format');
  return b.data.flatMap((x: Record<string, unknown>) => {
    if (x == null || x.vehicleId == null) return [];
    const lat = num(x.latitude), lng = num(x.longitude);
    const okPos = inSaudiRegion(lat, lng);
    const plate = typeof x.plate === 'string' && x.plate.trim() ? x.plate.trim() : null;
    return [{
      provider_vehicle_id: String(x.vehicleId),
      plate,
      plate_key: plateKey(plate),
      car_name: typeof x.carName === 'string' && x.carName.trim() ? x.carName.trim() : null,
      vehicle_state: typeof x.vehicleState === 'string' ? x.vehicleState : null,
      ignition: typeof x.ignition === 'boolean' ? x.ignition : null,
      speed_kmh: num(x.speed),
      lat: okPos ? lat : null,
      lng: okPos ? lng : null,
      gps_time: parseDamanTime(x.gpsDate),
      icon: typeof x.icon === 'string' && x.icon.trim() ? x.icon.trim() : null,
    }];
  });
}

export const DAMAN_STATE_LABEL: Record<string, string> = { moving: 'تتحرك', stopped: 'واقفة', disconnected: 'منقطعة' };

/** Per-device details from /online-history/vehicle/{id}. Odometer arrives in metres. */
export type DamanDetails = {
  provider_vehicle_id: string;
  vehicle_type: string | null;
  icon: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  odometer_km: number | null;
  battery_pct: number | null;
  gsm_state: string | null;
  satellites: number | null;
  wasl_linked: boolean | null;
  subscription_expires: string | null;
  load_kg: number | null;
  engine_on_today: string | null;
};

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function parseDamanDetails(body: unknown): DamanDetails | null {
  const b = body as { isSuccess?: boolean; data?: Record<string, unknown> | null };
  const x = b?.isSuccess !== false ? b?.data : null;
  if (!x || x.vehicleId == null) return null;
  const odo = num(x.lastOdometer);
  const exp = str(x.accountExpDate)?.slice(0, 10) ?? null;
  const battery = num(x.deviceBattery);
  return {
    provider_vehicle_id: String(x.vehicleId),
    vehicle_type: str(x.vehicleTypeName),
    icon: str(x.icon),
    driver_name: str(x.driver),
    driver_phone: str(x.driverMobile),
    odometer_km: odo != null && odo > 0 ? Math.round(odo / 1000) : null,
    battery_pct: battery != null && battery >= 0 && battery <= 100 ? Math.round(battery) : null,
    gsm_state: str(x.gsmSignalState),
    satellites: num(x.satelliteCount),
    wasl_linked: typeof x.isLinkedWithWasl === 'boolean' ? x.isLinkedWithWasl : null,
    subscription_expires: exp && /^\d{4}-\d{2}-\d{2}$/.test(exp) ? exp : null,
    load_kg: num(x.totalWeight),
    engine_on_today: str(x.totalEngineOnDuration),
  };
}

/** The provider marks trucks with a truck icon or a "... Truck" type; everything else is a small car. */
export function isDamanTruck(v: { icon?: string | null; vehicle_type?: string | null }) {
  return /^truck/i.test(v.icon ?? '') || /truck/i.test(v.vehicle_type ?? '');
}

/** Shata asset kind for a provider truck: big trucks are tractor heads, the rest rigid trucks. */
export function damanAssetKind(vehicleType: string | null | undefined): 'tractor' | 'rigid' {
  return /^big/i.test(vehicleType ?? '') ? 'tractor' : 'rigid';
}

export const DAMAN_TYPE_LABEL: Record<string, string> = { 'Big Truck': 'شاحنة كبيرة', 'Medium Truck': 'شاحنة متوسطة', 'Small Car': 'سيارة صغيرة' };
export const DAMAN_GSM_LABEL: Record<string, string> = { excellent: 'ممتازة', verygood: 'جيدة جدًا', good: 'جيدة', weak: 'ضعيفة', nosignal: 'لا توجد' };

/** "02h:29m:30s" or "1.00:33:42" → minutes. */
export function damanDurationMinutes(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  let m = raw.match(/^(\d+)h:(\d+)m:(\d+)s$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]) + Math.round(Number(m[3]) / 60);
  m = raw.match(/^(?:(\d+)\.)?(\d{1,2}):(\d{2}):(\d{2})$/);
  if (m) return Number(m[1] ?? 0) * 1440 + Number(m[2]) * 60 + Number(m[3]) + Math.round(Number(m[4]) / 60);
  return null;
}

export type DamanStop = { from: string | null; to: string | null; minutes: number | null; lat: number | null; lng: number | null; ignition: boolean | null; moving: boolean };

/** Stops and movements of one day from /history/report/vehicle/{id}/stops/grouped, newest first. */
export function parseDamanStops(body: unknown): DamanStop[] {
  const b = body as { isSuccess?: boolean; data?: { monthList?: { dayList?: { historyList?: Record<string, unknown>[] }[] }[] } };
  if (!b || b.isSuccess === false || !b.data) return [];
  const out: DamanStop[] = [];
  for (const mo of b.data.monthList ?? []) for (const d of mo.dayList ?? []) for (const h of d.historyList ?? []) {
    const lat = Number(h.latitude), lng = Number(h.longitude);
    const ok = inSaudiRegion(Number.isFinite(lat) ? lat : null, Number.isFinite(lng) ? lng : null);
    out.push({
      from: parseDamanTime(h.fromDate), to: parseDamanTime(h.toDate), minutes: damanDurationMinutes(h.duration),
      lat: ok ? lat : null, lng: ok ? lng : null,
      ignition: typeof h.ignition === 'boolean' ? h.ignition : null,
      moving: h.isStop === false,
    });
  }
  return out.sort((a, b) => (b.from ?? '').localeCompare(a.from ?? ''));
}
