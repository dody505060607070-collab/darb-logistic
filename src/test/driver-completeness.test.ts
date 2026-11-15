import { describe, expect, it } from 'vitest';
import { driverMissing } from '../lib/driver-completeness';

const full = { phone: '0501234567', national_id: '2345678901', nationality: 'مصري', license_no: 'L-1', license_expiry: '2030-01-01', user_id: 'u1' };
describe('driver file completeness', () => {
  it('a complete driver file has nothing missing', () => expect(driverMissing(full)).toEqual([]));
  it('a driver added from employees with only a name and phone lists the missing items', () =>
    expect(driverMissing({ phone: '+966501234567', user_id: 'u1' })).toEqual(['رقم الهوية/الإقامة', 'الجنسية', 'رقم الرخصة', 'تاريخ انتهاء الرخصة']));
  it('flags a phone that cannot be understood', () => expect(driverMissing({ ...full, phone: '056609974' })).toEqual(['رقم جوال صحيح']));
  it('flags a driver file without a login account', () => expect(driverMissing({ ...full, user_id: null })).toEqual(['ربط حساب الدخول']));
});
