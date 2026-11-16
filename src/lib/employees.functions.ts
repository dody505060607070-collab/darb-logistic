import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { employeeSchema, newEmployeeSchema, assertEmployeeDeletion } from './employees';
import { z } from 'zod';

export const createEmployee = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => newEmployeeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: owner, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'owner' });
    if (error || !owner) throw new Error('إضافة الموظفين متاحة للمدير العام فقط');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { provisionEmployee } = await import('./employee-provision.server');
    const { id } = await provisionEmployee(supabaseAdmin, data);
    return { id };
  });

export const updateEmployee = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => employeeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: owner, error: roleError } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'owner' });
    if (roleError || !owner) throw new Error('تعديل الموظفين متاح للمدير العام فقط');
    // Profiles.phone is the verified-code account lookup, not auth.users.phone.
    const { data: saved, error } = await context.supabase.from('profiles')
      .update({ full_name: data.fullName, phone: data.phone, branch_id: data.branchId })
      .eq('id', data.id).select('id, full_name, phone, branch_id').single();
    if (error) throw new Error(error.code === '23505' ? 'رقم الجوال مرتبط بموظف آخر' : 'تعذر حفظ بيانات الموظف');
    return saved;
  });

export const deleteEmployee = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid(), confirmed: z.literal(true) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: owner, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'owner' });
    if (error || !owner) throw new Error('حذف الموظفين متاح للمدير العام فقط');
    assertEmployeeDeletion(context.userId, data.id, data.confirmed);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: target, error: targetError } = await supabaseAdmin.from('profiles').select('id').eq('id', data.id).single();
    if (targetError || !target) throw new Error('الموظف غير موجود');
    // Keep the driver file and workshop for history, but never leave them pointing at a deleted login.
    const { error: unlinkError } = await supabaseAdmin.from('drivers').update({ user_id: null }).eq('user_id', data.id);
    if (unlinkError) throw new Error('تعذر فصل ملف السائق عن الحساب');
    const { error: memberError } = await supabaseAdmin.from('workshop_members').delete().eq('user_id', data.id);
    if (memberError) throw new Error('تعذر إلغاء ربط الحساب بالورشة');
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (deleteError) throw new Error('تعذر حذف الحساب؛ قد تكون له ملفات مملوكة أو ارتباطات يجب معالجتها أولًا');
    return { deleted: true };
  });