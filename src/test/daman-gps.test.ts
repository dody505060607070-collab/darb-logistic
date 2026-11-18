import { describe, it, expect } from 'vitest';
import { parseDamanTime, parseDamanVehicles, plateKey } from '@/lib/daman-gps';

describe('ضمان المهندس feed', () => {
  it('reads the provider local Saudi time as UTC (Riyadh is UTC+3)', () => {
    expect(parseDamanTime('2026/11/18 06:15:14 PM')).toBe('2026-11-18T15:15:14.000Z');
    expect(parseDamanTime('2025/05/09 12:24:56 AM')).toBe('2025-05-08T21:24:56.000Z');
    expect(parseDamanTime('garbage')).toBeNull();
  });
  it('matches plates regardless of spaces and dashes', () => {
    expect(plateKey('1071 - أ ط ل')).toBe(plateKey('1071أطل'));
    expect(plateKey('7069 - B H D')).toBe('7069bhd');
  });
  it('drops positions outside Saudi Arabia (no fix) but keeps the vehicle', () => {
    const v = parseDamanVehicles({ isSuccess: true, data: [
      { vehicleId: 1, plate: '1071 - أ ط ل', latitude: 26.05, longitude: 44.95, gpsDate: '2026/11/18 06:15:14 PM', vehicleState: 'moving', speed: 40 },
      { vehicleId: 2, plate: 'X', latitude: 0, longitude: 0, gpsDate: '2026/11/18 06:15:14 PM', vehicleState: 'disconnected' },
    ] });
    expect(v).toHaveLength(2);
    expect(v[0]).toMatchObject({ provider_vehicle_id: '1', lat: 26.05, speed_kmh: 40 });
    expect(v[1]?.lat).toBeNull();
  });
  it('rejects a failed provider response', () => {
    expect(() => parseDamanVehicles({ isSuccess: false })).toThrow();
  });
});
