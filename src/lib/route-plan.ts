/** Browser-safe route helpers shared by the order wizard, driver map and the tracking monitor. */
export type LatLng = { lat: number; lng: number };
export type GpsPoint = LatLng & { at: string; speed?: number | null };

/** Alert thresholds: a vehicle further than OFF_ROUTE_M from the planned road counts as off route; it is back once within BACK_ON_ROUTE_M. */
export const OFF_ROUTE_M = 3000;
export const BACK_ON_ROUTE_M = 1500;
/** A vehicle staying within STOP_RADIUS_M for STOP_MINUTES (outside planned stops) counts as stopped. */
export const STOP_MINUTES = 20;
export const STOP_RADIUS_M = 300;
/** Being this close to the pickup, a drop-off or the destination is an expected stop. */
export const EXPECTED_STOP_M = 1500;
/** Readings older than this are not used for live decisions. */
export const FRESH_MINUTES = 15;

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Orders drop-offs nearest-first: from the start, always go to the closest remaining stop. */
export function orderNearestFirst<T extends LatLng>(start: LatLng, stops: T[]): T[] {
  const left = [...stops];
  const out: T[] = [];
  let here = start;
  while (left.length) {
    let best = 0;
    for (let i = 1; i < left.length; i++) if (distanceM(here, left[i]!) < distanceM(here, left[best]!)) best = i;
    const next = left.splice(best, 1)[0]!;
    out.push(next);
    here = next;
  }
  return out;
}

/** Shortest distance in metres from a point to a polyline of [lat, lng] pairs. */
export function distanceToRouteM(p: LatLng, line: [number, number][]): number {
  if (!line.length) return Infinity;
  if (line.length === 1) return distanceM(p, { lat: line[0]![0], lng: line[0]![1] });
  // Local equirectangular projection around the point is accurate enough at these distances.
  const kx = Math.cos(rad(p.lat)) * R * (Math.PI / 180), ky = R * (Math.PI / 180);
  let best = Infinity;
  for (let i = 1; i < line.length; i++) {
    const ax = (line[i - 1]![1] - p.lng) * kx, ay = (line[i - 1]![0] - p.lat) * ky;
    const bx = (line[i]![1] - p.lng) * kx, by = (line[i]![0] - p.lat) * ky;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

/** Off-route state with hysteresis so a vehicle on the edge does not flap between alert and clear. */
export function offRouteState(distance: number, open: boolean): "open" | "clear" | "keep" {
  if (distance > OFF_ROUTE_M) return "open";
  if (distance <= BACK_ON_ROUTE_M) return "clear";
  return open ? "keep" : "clear";
}

/**
 * Stop detection from readings (any order). Returns the minutes stopped when every reading in the last
 * STOP_MINUTES stays within STOP_RADIUS_M of the latest one, the readings span the whole window and the latest is fresh.
 * Returns 0 when the vehicle is moving, and null when there is not enough data to decide.
 */
export function stoppedMinutes(points: GpsPoint[], now = Date.now()): number | null {
  const pts = [...points].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const latest = pts[0];
  if (!latest || now - Date.parse(latest.at) > FRESH_MINUTES * 60000) return null;
  if ((latest.speed ?? 0) > 10) return 0;
  let oldestStill = latest;
  for (const p of pts.slice(1)) {
    if (distanceM(latest, p) > STOP_RADIUS_M) {
      const minutes = (Date.parse(latest.at) - Date.parse(oldestStill.at)) / 60000;
      return minutes >= STOP_MINUTES ? Math.round((now - Date.parse(oldestStill.at)) / 60000) : 0;
    }
    oldestStill = p;
  }
  const span = (Date.parse(latest.at) - Date.parse(oldestStill.at)) / 60000;
  return span >= STOP_MINUTES ? Math.round((now - Date.parse(oldestStill.at)) / 60000) : null;
}

export function nearAny(p: LatLng, places: LatLng[], within = EXPECTED_STOP_M): boolean {
  return places.some((x) => distanceM(p, x) <= within);
}

/** Opens Google Maps turn-by-turn directions through every remaining stop in order. */
export function googleMapsDirections(origin: LatLng | null, stops: LatLng[]): string | null {
  if (!stops.length) return null;
  const f = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  const dest = stops[stops.length - 1]!;
  const params = new URLSearchParams({ api: "1", destination: f(dest), travelmode: "driving" });
  if (origin) params.set("origin", f(origin));
  const way = stops.slice(0, -1);
  if (way.length) params.set("waypoints", way.map(f).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Keeps at most `max` points of a long road geometry, always keeping the first and last. */
export function thinLine(line: [number, number][], max = 400): [number, number][] {
  if (line.length <= max) return line;
  const step = (line.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => line[Math.round(i * step)]!);
}

/** A tracker's live state as last confirmed by the provider sync. */
export type ProviderFix = { lat: number | null; lng: number | null; speed_kmh: number | null; vehicle_state: string | null; synced_at: string | null };
/** The provider sync must have confirmed the state this recently to count as live. */
export const PROVIDER_FRESH_MINUTES = 5;

/**
 * Parked trucks report rarely, so their last reading goes stale while they are still standing there.
 * When the provider confirmed the device online just now, its current position is added as a reading
 * "at now" so a long stop is still recognised. Disconnected devices add nothing.
 */
export function withProviderFix(points: GpsPoint[], fix: ProviderFix | null | undefined, now = Date.now()): GpsPoint[] {
  if (!fix || fix.lat == null || fix.lng == null || !fix.synced_at || fix.vehicle_state === 'disconnected') return points;
  if (now - Date.parse(fix.synced_at) > PROVIDER_FRESH_MINUTES * 60000) return points;
  return [{ lat: fix.lat, lng: fix.lng, speed: fix.speed_kmh, at: new Date(now).toISOString() }, ...points];
}

/** The trip's truck tracker is confirmed offline by a fresh provider sync. */
export function trackerLost(fix: ProviderFix | null | undefined, now = Date.now()): boolean {
  return !!fix && fix.vehicle_state === 'disconnected' && !!fix.synced_at && now - Date.parse(fix.synced_at) <= PROVIDER_FRESH_MINUTES * 60000;
}
