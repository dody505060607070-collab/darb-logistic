import { describe, it, expect } from 'vitest';
import { assertApprovedPhone, NOT_REGISTERED, NO_JOB_YET } from '@/lib/employee-access';
import { newEmployeeSchema } from '@/lib/employees';
describe('closed employee access', () => {
  it('rejects an unknown phone even with an arbitrary code', () => { expect(() => assertApprovedPhone(0, 0, false)).toThrow(); });
  it('rejects an account without an assigned job', () => { expect(() => assertApprovedPhone(1, 0, false)).toThrow(); });
  it('allows an employee with an assigned job', () => { expect(() => assertApprovedPhone(1, 1, false)).not.toThrow(); });
  it('preserves a reserved administrator after account reset', () => { expect(() => assertApprovedPhone(0, 0, true)).not.toThrow(); });
  it('rejects ambiguous phone identity', () => { expect(() => assertApprovedPhone(2, 2, true)).toThrow(); });
  it('does not default a new employee to owner', () => { expect(newEmployeeSchema.safeParse({ fullName: 'موظف', phone: '+966501234567', branchId: null }).success).toBe(false); });
  it('requires workshop assignment for a workshop employee', () => { expect(newEmployeeSchema.safeParse({ fullName: 'موظف', phone: '+966501234567', branchId: null, role: 'workshop' }).success).toBe(false); });
  it('creates a workshop account using its name and normalized login phone',()=>{
    const result=newEmployeeSchema.parse({fullName:'مسؤول الورشة',phone:'0501234567',branchId:null,role:'workshop',workshopName:'ورشة الاختبار'});
    expect(result.role).toBe('workshop');expect(result.phone).toBe('+966501234567');expect(result.workshopId).toBeNull();expect(result.workshopName).toBe('ورشة الاختبار');
  });
  it('does not create a workshop for a different employee role',()=>{
    expect(newEmployeeSchema.safeParse({fullName:'مسؤول',phone:'+966501234567',branchId:null,role:'driver',workshopName:'ورشة الاختبار'}).success).toBe(false);
  });
  it('rejects simultaneous existing and new workshop choices',()=>{
    expect(newEmployeeSchema.safeParse({fullName:'مسؤول',phone:'+966501234567',branchId:null,role:'workshop',workshopId:'11111111-1111-4111-8111-111111111111',workshopName:'ورشة الاختبار'}).success).toBe(false);
  });
});
describe('sign-in refusal tells the person what to do', () => {
  it('an unknown number is told it is not registered', () => expect(() => assertApprovedPhone(0, 0, false)).toThrow(NOT_REGISTERED));
  it('a registered number without a job is told to contact administration', () => expect(() => assertApprovedPhone(1, 0, false)).toThrow(NO_JOB_YET));
});
