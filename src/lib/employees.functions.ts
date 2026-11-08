import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { employeeSchema } from './employees';

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