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

export function assertEmployeeDeletion(actorId: string, employeeId: string, confirmed: boolean) {
  if (!confirmed) throw new Error('يجب تأكيد حذف الحساب');
  if (actorId === employeeId) throw new Error('لا يمكنك حذف حسابك أثناء استخدامه');
}