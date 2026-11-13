import { z } from 'zod';
import { normalizePhone } from './phone';

export const employeeSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().min(1, 'أدخل اسم الموظف').max(160),
  phone: z.string().trim().transform((value, ctx) => {
    if (!value) return null;
    try { return normalizePhone('+966', value); }
    catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'أدخل رقم الجوال بالصيغة الدولية الصحيحة' }); return z.NEVER; }
  }),
  branchId: z.string().uuid().nullable(),
});

export function canRemoveEmployeeRole(actorId: string, employeeId: string, role: string) {
  return !(actorId === employeeId && role === 'owner');
}

export const newEmployeeSchema = employeeSchema.omit({ id: true }).extend({
  phone: z.string().trim().min(1).transform(value => normalizePhone('+966', value)),
  role: z.enum(['owner', 'ops_manager', 'dispatcher', 'fleet_supervisor', 'accountant', 'maintenance', 'driver', 'field_maintenance', 'workshop', 'representative']),
  workshopId: z.string().uuid().nullable().default(null),
}).refine(value => value.role !== 'workshop' || !!value.workshopId, { message: 'اختر ورشة الموظف', path: ['workshopId'] });

export function assertEmployeeDeletion(actorId: string, employeeId: string, confirmed: boolean) {
  if (!confirmed) throw new Error('يجب تأكيد حذف الحساب');
  if (actorId === employeeId) throw new Error('لا يمكنك حذف حسابك أثناء استخدامه');
}