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
    }];
  });
}

export const DAMAN_STATE_LABEL: Record<string, string> = { moving: 'تتحرك', stopped: 'واقفة', disconnected: 'منقطعة' };
