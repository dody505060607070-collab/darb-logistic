import { describe, expect, it } from 'vitest';
import { buildPeople } from '@/lib/people-directory';

const profiles = [{ id: 'u1', full_name: 'زين', phone: '+966578393155' }, { id: 'u2', full_name: 'أحمد', phone: '+966510977595' }];
const roles = [{ user_id: 'u1', role: 'driver' }, { user_id: 'u2', role: 'accountant' }];
const drivers = [
  { id: 'd1', code: 'DRV-1', full_name: 'زين', phone: '+966578393155', user_id: 'u1' },
  { id: 'd2', code: 'DRV-2', full_name: 'NAZIR AHMAD', phone: null, user_id: null },
  { id: 'd3', code: 'DRV-3', full_name: 'شادي', phone: '+966554953651', user_id: null },
  { id: 'd4', code: 'DRV-4', full_name: 'قديم', phone: null, user_id: 'deleted-account' },
];

describe('employee directory includes every driver', () => {
  const rows = buildPeople(profiles, roles, drivers);
  it('a driver added in the drivers page without an account appears among employees', () => {
    expect(rows.find(r => r.driverId === 'd2')?.kind).toBe('driver_file');
  });
  it('a driver file with a phone is ready and waits for first login', () => {
    expect(rows.find(r => r.driverId === 'd3')?.access).toBe('awaiting_login');
  });
  it('a driver file without a phone is flagged as missing the phone', () => {
    expect(rows.find(r => r.driverId === 'd2')?.access).toBe('no_phone');
  });
  it('a linked driver appears once, as his account, with his driver file', () => {
    expect(rows.filter(r => r.full_name === 'زين')).toHaveLength(1);
    expect(rows.find(r => r.id === 'u1')?.driverCode).toBe('DRV-1');
  });
  it('a driver file pointing to a deleted account still appears', () => {
    expect(rows.some(r => r.driverId === 'd4')).toBe(true);
  });
  it('counts every person exactly once', () => {
    expect(rows).toHaveLength(5);
  });
});
