/** Browser-safe helpers for the live fleet map (no map library imports). */
import type { Row } from "./db";
import { isDamanTruck } from "./daman-gps";

export type VehicleState = "moving" | "stopped" | "disconnected" | "unknown";

export type FleetVehicle = {
  /** Shata asset id when linked, otherwise `gps:<provider row id>`. */
  key: string;
  assetId: string | null;
  plate: string;
  code: string | null;
  state: VehicleState;
  speed: number | null;
  ignition: boolean | null;
  lat: number;
  lng: number;
  at: string | null;
  driver: string | null;
  truck: boolean;
  live: boolean;
  tripId: string | null;
  tripNumber: string | null;
  tripRoute: string | null;
  assetStatus: string | null;
  assetKind: string | null;
  providerId: string | null;
};

/** A reading older than this is treated as a lost signal even if the provider still says "stopped". */
export const LOST_AFTER_MIN = 24 * 60;
/** Speed above which the map flags a vehicle (km/h). */
export const HIGH_SPEED_KMH = 120;
/** Same fresh window as the tracking page; older fixes cannot prove movement now. */
export const FRESH_AFTER_MIN = 15;

export function freshReading(at: string | null | undefined, now = Date.now()) {
  const m = minutesSince(at, now);
  return m !== null && m < FRESH_AFTER_MIN && Date.parse(at ?? '') <= now + 60000;
}

export function minutesSince(at: string | null | undefined, now = Date.now()): number | null {
  if (!at) return null;
  const t = Date.parse(at);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 60000)) : null;
}

export function vehicleState(providerState: string | null | undefined, at: string | null | undefined, now = Date.now()): VehicleState {
  const m = minutesSince(at, now);
  if (m === null) return "unknown";
  if (m != null && m > LOST_AFTER_MIN) return "disconnected";
  if (providerState === "moving" && !freshReading(at, now)) return "unknown";
  if (providerState === "moving" || providerState === "stopped" || providerState === "disconnected") return providerState;
  return "unknown";
}

/** "الآن" / "قبل 5 د" / "قبل 3 س" / "قبل 2 يوم". */
export function agoLabel(at: string | null | undefined, now = Date.now()): string {
  const m = minutesSince(at, now);
  if (m == null) return "لا توجد قراءة";
  if (m < 1) return "الآن";
  if (m < 60) return `قبل ${m} د`;
  if (m < 48 * 60) return `قبل ${Math.floor(m / 60)} س`;
  return `قبل ${Math.floor(m / 1440)} يوم`;
}

/** Joins provider devices with Shata vehicles and running trips into one list. */
export function buildFleetVehicles(provider: Row[], assets: Row[], trips: Row[], now = Date.now()): FleetVehicle[] {
  const byAsset = new Map(assets.map((a) => [a.id, a]));
  const tripOf = (assetId: string | null) => (assetId ? trips.find((t) => t.status === "in_progress" && t.tractor_id === assetId) ?? null : null);
  const out: FleetVehicle[] = [];
  const seen = new Set<string>();
  for (const p of provider) {
    if (p.lat == null || p.lng == null) continue;
    const a = p.asset_id ? byAsset.get(p.asset_id) : null;
    const t = tripOf(a?.id ?? null);
    const key = a?.id ?? `gps:${p.id}`;
    seen.add(key);
    out.push({
      key, assetId: a?.id ?? null, plate: p.plate ?? a?.code ?? "GPS", code: a?.code ?? null,
      assetStatus: a?.status ?? null, assetKind: a?.kind ?? null, providerId: p.id,
      state: vehicleState(p.vehicle_state, p.gps_time, now), speed: p.speed_kmh ?? null, ignition: p.ignition ?? null,
      lat: Number(p.lat), lng: Number(p.lng), at: p.gps_time ?? null,
      driver: t?.driver?.full_name ?? p.driver_name ?? null, truck: isDamanTruck(p) || (a ? a.kind !== "trailer" : false), live: true,
      tripId: t?.id ?? null, tripNumber: t?.number ?? null, tripRoute: t ? `${t.origin_city} ← ${t.dest_city}` : null,
    });
  }
  for (const a of assets) {
    if (a.kind === "trailer" || a.last_lat == null || a.last_lng == null || seen.has(a.id)) continue;
    const t = tripOf(a.id);
    out.push({
      key: a.id, assetId: a.id, plate: a.code, code: a.code, state: vehicleState(null, a.last_position_at, now), speed: null, ignition: null,
      assetStatus: a.status ?? null, assetKind: a.kind ?? null, providerId: null,
      lat: Number(a.last_lat), lng: Number(a.last_lng), at: a.last_position_at ?? null, driver: t?.driver?.full_name ?? null,
      truck: true, live: false, tripId: t?.id ?? null, tripNumber: t?.number ?? null, tripRoute: t ? `${t.origin_city} ← ${t.dest_city}` : null,
    });
  }
  const order: Record<VehicleState, number> = { moving: 0, stopped: 1, unknown: 2, disconnected: 3 };
  return out.sort((x, y) => order[x.state] - order[y.state] || x.plate.localeCompare(y.plate, "ar"));
}

export type Insight = "idling" | "speeding" | "lost" | "on_trip" | "moving_without_trip";
export const INSIGHT_LABEL: Record<Insight, string> = {
  idling: "واقفة والمحرك يعمل",
  speeding: `سرعة أعلى من ${HIGH_SPEED_KMH} كم/س`,
  lost: "إشارة منقطعة",
  on_trip: "في رحلة الآن",
  moving_without_trip: "مركبات مرتبطة تتحرك بدون رحلة جارية",
};

export function hasInsight(v: FleetVehicle, i: Insight, now = Date.now()): boolean {
  if (i === 'moving_without_trip') return !!v.assetId && v.live && v.state === 'moving' && !v.tripId && freshReading(v.at, now);
  if (i === "idling") return v.state === "stopped" && v.ignition === true;
  if (i === "speeding") return v.state === "moving" && (v.speed ?? 0) > HIGH_SPEED_KMH;
  if (i === "lost") return v.state === "disconnected";
  return !!v.tripId;
}

/** Straight-line distance in km (haversine). */
export function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const dLat = r(bLat - aLat), dLng = r(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(aLat)) * Math.cos(r(bLat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Closest vehicles to a point; vehicles with a lost signal are excluded (their position is stale). */
export function nearestVehicles(list: FleetVehicle[], lat: number, lng: number, n = 5) {
  return list
    .filter((v) => v.state !== "disconnected")
    .map((v) => ({ v, km: distanceKm(lat, lng, v.lat, v.lng) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, n);
}
