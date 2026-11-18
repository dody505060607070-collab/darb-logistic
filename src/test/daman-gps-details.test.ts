import { describe, it, expect } from 'vitest';
import { damanAssetKind, damanDurationMinutes, isDamanTruck, parseDamanDetails, parseDamanStops } from '@/lib/daman-gps';
import { stoppedMinutes, trackerLost, withProviderFix } from '@/lib/route-plan';

describe('ضمان المهندس device details', () => {
  it('reads driver, type, odometer in km and subscription end', () => {
    const d = parseDamanDetails({ isSuccess: true, data: { vehicleId: 43292, vehicleTypeName: 'Big Truck', icon: 'truck1', driver: 'نجيب', driverMobile: '', lastOdometer: 55317847, deviceBattery: 77, gsmSignalState: 'verygood', satelliteCount: 25, isLinkedWithWasl: true, accountExpDate: '2027-02-23T00:00:00', totalWeight: 6500 } });
    expect(d).toMatchObject({ provider_vehicle_id: '43292', vehicle_type: 'Big Truck', driver_name: 'نجيب', driver_phone: null, odometer_km: 55318, battery_pct: 77, wasl_linked: true, subscription_expires: '2027-02-23', load_kg: 6500 });
  });
  it('treats truck icons or truck types as trucks; big trucks become tractor heads', () => {
    expect(isDamanTruck({ icon: 'truck1', vehicle_type: 'Small Car' })).toBe(true);
    expect(isDamanTruck({ icon: 'car3', vehicle_type: 'Small Car' })).toBe(false);
    expect(damanAssetKind('Big Truck')).toBe('tractor');
    expect(damanAssetKind('Medium Truck')).toBe('rigid');
  });
  it('reads stop durations and keeps stops newest first', () => {
    expect(damanDurationMinutes('00h:06m:23s')).toBe(6);
    expect(damanDurationMinutes('1.00:33:42')).toBe(1474);
    const s = parseDamanStops({ isSuccess: true, data: { monthList: [{ dayList: [{ historyList: [
      { fromDate: '2026/11/18 06:09:14 PM', toDate: '2026/11/18 06:12:14 PM', duration: '00h:03m:00s', latitude: '26.05', longitude: '44.96', isStop: true, ignition: true },
      { fromDate: '2026/11/18 06:26:25 PM', toDate: '2026/11/18 06:32:48 PM', duration: '00h:06m:23s', latitude: '26.04', longitude: '44.92', isStop: true, ignition: false },
    ] }] }] } });
    expect(s.map((x) => x.minutes)).toEqual([6, 3]);
    expect(s[0]?.from).toBe('2026-11-18T15:26:25.000Z');
  });
});

describe('trip alerts with GPS trackers', () => {
  const now = Date.parse('2026-11-18T16:00:00Z');
  const parked = { lat: 26.05, lng: 44.95, speed_kmh: 0, vehicle_state: 'stopped', synced_at: '2026-11-18T15:59:30Z' };
  it('a truck parked 40 minutes whose device stopped reporting still counts as stopped', () => {
    const readings = [
      { lat: 26.05, lng: 44.95, speed: 0, at: '2026-11-18T15:20:00Z' },
      { lat: 26.10, lng: 44.99, speed: 70, at: '2026-11-18T15:15:00Z' },
    ];
    expect(stoppedMinutes(readings, now)).toBeNull();
    expect(stoppedMinutes(withProviderFix(readings, parked, now), now)).toBe(40);
  });
  it('an old provider confirmation or an offline device adds nothing', () => {
    expect(withProviderFix([], { ...parked, synced_at: '2026-11-18T15:40:00Z' }, now)).toHaveLength(0);
    expect(withProviderFix([], { ...parked, vehicle_state: 'disconnected' }, now)).toHaveLength(0);
  });
  it('signal lost only when a fresh sync says the device is disconnected', () => {
    expect(trackerLost({ ...parked, vehicle_state: 'disconnected' }, now)).toBe(true);
    expect(trackerLost(parked, now)).toBe(false);
    expect(trackerLost({ ...parked, vehicle_state: 'disconnected', synced_at: '2026-11-18T15:30:00Z' }, now)).toBe(false);
  });
});
