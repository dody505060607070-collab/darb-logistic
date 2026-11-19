import { describe, expect, it } from "vitest";
import { agoLabel, buildFleetVehicles, distanceKm, hasInsight, nearestVehicles, vehicleState } from "@/lib/fleet-map";

const NOW = Date.parse("2026-11-19T21:00:00Z");
const iso = (minAgo: number) => new Date(NOW - minAgo * 60000).toISOString();

describe("fleet map", () => {
  it("treats a reading older than 24 hours as a lost signal", () => {
    expect(vehicleState("stopped", iso(25 * 60), NOW)).toBe("disconnected");
    expect(vehicleState("moving", iso(2), NOW)).toBe("moving");
  });

  it("uses the GPS device position for a linked Shata truck and keeps unlinked devices", () => {
    const provider = [
      { id: "p1", asset_id: "a1", plate: "1885 - أ ط م", lat: 24.7, lng: 46.7, vehicle_state: "moving", speed_kmh: 80, gps_time: iso(1), vehicle_type: "truck" },
      { id: "p2", asset_id: null, plate: "car 1", lat: 21.5, lng: 39.2, vehicle_state: "stopped", ignition: true, gps_time: iso(5) },
    ];
    const assets = [{ id: "a1", code: "1885 أ ط م", kind: "tractor", last_lat: 10, last_lng: 10, last_position_at: iso(60) }];
    const trips = [{ id: "t1", number: "TRP-1", status: "in_progress", tractor_id: "a1", origin_city: "الرياض", dest_city: "الدمام", driver: { full_name: "زين" } }];
    const list = buildFleetVehicles(provider, assets, trips, NOW);
    expect(list).toHaveLength(2);
    const truck = list.find((v) => v.key === "a1")!;
    expect([truck.lat, truck.lng]).toEqual([24.7, 46.7]);
    expect(truck.tripNumber).toBe("TRP-1");
    expect(truck.driver).toBe("زين");
    expect(list.find((v) => v.key === "gps:p2")?.assetId).toBeNull();
  });

  it("flags a stopped vehicle with the engine on as idling", () => {
    const v = buildFleetVehicles([{ id: "p", lat: 24, lng: 46, vehicle_state: "stopped", ignition: true, gps_time: iso(3) }], [], [], NOW)[0]!;
    expect(hasInsight(v, "idling")).toBe(true);
    expect(hasInsight(v, "speeding")).toBe(false);
  });

  it("measures Riyadh to Dammam at about 380 km straight-line", () => {
    expect(Math.round(distanceKm(24.7136, 46.6753, 26.4207, 50.0888))).toBeGreaterThan(370);
    expect(Math.round(distanceKm(24.7136, 46.6753, 26.4207, 50.0888))).toBeLessThan(395);
  });

  it("nearest vehicles skip lost-signal vehicles", () => {
    const list = buildFleetVehicles([
      { id: "near-lost", lat: 24.71, lng: 46.67, vehicle_state: "disconnected", gps_time: iso(3) },
      { id: "far", lat: 26.42, lng: 50.08, vehicle_state: "stopped", gps_time: iso(3) },
    ], [], [], NOW);
    expect(nearestVehicles(list, 24.7, 46.67).map((x) => x.v.key)).toEqual(["gps:far"]);
  });

  it("labels elapsed time in Arabic", () => {
    expect(agoLabel(iso(5), NOW)).toBe("قبل 5 د");
    expect(agoLabel(null, NOW)).toBe("لا توجد قراءة");
  });
});
