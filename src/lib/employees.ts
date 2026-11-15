import { z } from 'zod';
import { normalizePhone } from './phone';

export const employeeSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().trim().min(1, 'أدخل اسم الموظف').max(160),
  phone: z.string().trim().transform((value, ctx) => {
    if (!value) return null;
    try { return normalizePhone('+966', value); }
    catch { ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'رقم الجوال غير صحيح. اكتبه مثل 0501234567 أو 966501234567' }); return z.NEVER; }
  }),
  branchId: z.string().uuid().nullable(),
});

export function canRemoveEmployeeRole(actorId: string, employeeId: string, role: string) {
  return !(actorId === employeeId && role === 'owner');
}

const newEmployeeFields = employeeSchema.omit({ id: true }).extend({
  phone: z.string().trim().min(1).transform(value => normalizePhone('+966', value)),
  role: z.enum(['owner', 'ops_manager', 'dispatcher', 'fleet_supervisor', 'accountant', 'maintenance', 'driver', 'representative', 'field_maintenance', 'workshop']),
  workshopId: z.string().uuid().nullable().default(null),
  workshopName: z.string().trim().min(2).max(160).optional(),
});
export const newEmployeeSchema = newEmployeeFields
 .refine(value => value.role !== 'workshop' || !!value.workshopId || !!value.workshopName, { message: 'اختر الورشة أو أدخل اسمها', path: ['workshopId'] })
 .refine(value => !(value.workshopId && value.workshopName), { message: 'اختر ورشة موجودة أو أنشئ ورشة جديدة فقط', path: ['workshopId'] })
 .refine(value => !value.workshopName || value.role === 'workshop', { message: 'إنشاء الورشة يتطلب حساب ورشة', path: ['role'] });

export function assertEmployeeDeletion(actorId: string, employeeId: string, confirmed: boolean) {
  if (!confirmed) throw new Error('يجب تأكيد حذف الحساب');
  if (actorId === employeeId) throw new Error('لا يمكنك حذف حسابك أثناء استخدامه');
}