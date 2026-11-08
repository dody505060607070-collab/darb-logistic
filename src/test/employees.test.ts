import { describe, expect, it } from 'vitest';
import { canRemoveEmployeeRole, employeeSchema } from '@/lib/employees';
const id = '11111111-1111-4111-8111-111111111111';
describe('employee rules', () => {
  it('uses an international phone instead of email identity', () => {
    expect(employeeSchema.parse({ id, fullName: 'موظف', phone: '+966 50 123 4567', branchId: null }).phone).toBe('+966501234567');
  });
  it('rejects invalid phone numbers', () => {
    expect(employeeSchema.safeParse({ id, fullName: 'موظف', phone: '123', branchId: null }).success).toBe(false);
  });
  it('does not allow the administrator to remove their own owner role', () => {
    expect(canRemoveEmployeeRole(id, id, 'owner')).toBe(false);
    expect(canRemoveEmployeeRole(id, 'other', 'owner')).toBe(true);
  });
});