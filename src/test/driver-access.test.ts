import { describe, expect, it } from 'vitest';
import { driverLinkDecision, driverPhoneVariants } from '@/lib/driver-access';

const none = { hasPhone: true, profiles: [] };
describe('driver file → phone login', () => {
  it('a driver file with a phone and no account gets a new driver account (also at sign-in)', () => {
    expect(driverLinkDecision({ ...none, actor: 'staff' })).toEqual({ kind: 'create' });
    expect(driverLinkDecision({ ...none, actor: 'login' })).toEqual({ kind: 'create' });
  });
  it('a driver file without a phone cannot be activated', () => {
    expect(driverLinkDecision({ hasPhone: false, profiles: [], actor: 'owner' })).toEqual({ kind: 'refuse', reason: 'no_phone' });
  });
  it('a driver account without a file is linked to the file with its phone, without a second role', () => {
    const p = { id: 'u1', roles: ['driver'], linkedDriverId: null };
    expect(driverLinkDecision({ hasPhone: true, profiles: [p], actor: 'login' })).toEqual({ kind: 'link', userId: 'u1', addRole: false });
  });
  it('signing in never gives the driver job to an employee holding another job', () => {
    const p = { id: 'u1', roles: ['accountant'], linkedDriverId: null };
    expect(driverLinkDecision({ hasPhone: true, profiles: [p], actor: 'login' })).toEqual({ kind: 'refuse', reason: 'no_job' });
  });
  it('only the general manager may add the driver job to an employee with another job', () => {
    const p = { id: 'u1', roles: ['accountant'], linkedDriverId: null };
    expect(driverLinkDecision({ hasPhone: true, profiles: [p], actor: 'staff' })).toEqual({ kind: 'refuse', reason: 'staff_number' });
    expect(driverLinkDecision({ hasPhone: true, profiles: [p], actor: 'owner' })).toEqual({ kind: 'link', userId: 'u1', addRole: true });
  });
  it('a phone already used by another driver file or several accounts is refused', () => {
    expect(driverLinkDecision({ hasPhone: true, profiles: [{ id: 'u1', roles: ['driver'], linkedDriverId: 'd2' }], actor: 'owner' })).toEqual({ kind: 'refuse', reason: 'other_file' });
    const two = [{ id: 'a', roles: [], linkedDriverId: null }, { id: 'b', roles: [], linkedDriverId: null }];
    expect(driverLinkDecision({ hasPhone: true, profiles: two, actor: 'owner' })).toEqual({ kind: 'refuse', reason: 'duplicate' });
  });
  it('matches driver files stored as +966, 966 or 05 forms', () => {
    expect(driverPhoneVariants('+966578393155')).toEqual(['+966578393155', '966578393155', '0578393155']);
  });
});
