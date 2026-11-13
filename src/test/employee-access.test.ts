import { describe, it, expect } from 'vitest';
import { assertApprovedPhone } from '@/lib/employee-access';
import { newEmployeeSchema } from '@/lib/employees';
describe('closed employee access', () => {
  it('rejects an unknown phone even with an arbitrary code', () => { expect(() => assertApprovedPhone(0, 0, false)).toThrow(); });
  it('rejects an account without an assigned job', () => { expect(() => assertApprovedPhone(1, 0, false)).toThrow(); });
  it('allows an employee with an assigned job', () => { expect(() => assertApprovedPhone(1, 1, false)).not.toThrow(); });
  it('preserves a reserved administrator after account reset', () => { expect(() => assertApprovedPhone(0, 0, true)).not.toThrow(); });
  it('rejects ambiguous phone identity', () => { expect(() => assertApprovedPhone(2, 2, true)).toThrow(); });
  it('does not default a new employee to owner', () => { expect(newEmployeeSchema.safeParse({ fullName: 'موظف', phone: '+966501234567', branchId: null }).success).toBe(false); });
  it('requires workshop assignment for a workshop employee', () => { expect(newEmployeeSchema.safeParse({ fullName: 'موظف', phone: '+966501234567', branchId: null, role: 'workshop' }).success).toBe(false); });
});