import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { employeeSchema, newEmployeeSchema, assertEmployeeDeletion } from './employees';
import { phoneIdentityVariants } from './phone-account';
import { z } from 'zod';

export const createEmployee = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => newEmployeeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: owner, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'owner' });
    if (error || !owner) throw new Error('إضافة الموظفين متاحة للمدير العام فقط');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: existing, error: lookupError } = await supabaseAdmin.from('profiles').select('id').in('phone', phoneIdentityVariants(data.phone));
    if (lookupError) throw new Error('تعذر التحقق من الرقم');
    if (existing?.length) throw new Error('رقم الجوال مرتبط بموظف موجود');
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({ email: `${data.phone.slice(1)}@phone.darb.app`, email_confirm: true, phone: data.phone, phone_confirm: true, user_metadata: { full_name: data.fullName } });
    if (createError || !created.user) throw new Error('تعذر إضافة الموظف؛ تحقق أن الرقم غير مستخدم');
    const id = created.user.id;
    let createdWorkshopId: string | null = null;
    try {
      const { error: profileError } = await supabaseAdmin.from('profiles').update({ full_name: data.fullName, phone: data.phone, branch_id: data.branchId }).eq('id', id);
      if (profileError) throw profileError;
      if (['driver', 'representative'].includes(data.role)) {
        const { error: driverError } = await supabaseAdmin.from('drivers').insert({ code: `DRV-${id.slice(0, 8)}`, full_name: data.fullName, phone: data.phone, user_id: id, branch_id: data.branchId });
        if (driverError) throw driverError;
      }
      if (data.role === 'workshop') {
        let workshopId = data.workshopId;
        if (data.workshopName) {
          const { data: workshop, error: workshopError } = await supabaseAdmin.from('workshops').insert({ name: data.workshopName, phone: data.phone, branch_id: data.branchId }).select('id').single();
          if (workshopError || !workshop) throw workshopError ?? new Error('تعذر حفظ الورشة');
          workshopId = workshop.id; createdWorkshopId = workshop.id;
        }
        if (!workshopId) throw new Error('الورشة مطلوبة');
        const { error: memberError } = await supabaseAdmin.from('workshop_members').insert({ workshop_id: workshopId, user_id: id });
        if (memberError) throw memberError;
      }
      const { error: roleError } = await supabaseAdmin.from('user_roles').insert({ user_id: id, role: data.role });
      if (roleError) throw roleError;
      return { id };
    } catch {
      await supabaseAdmin.from('workshop_members').delete().eq('user_id', id);
      await supabaseAdmin.from('drivers').delete().eq('user_id', id);
      await supabaseAdmin.auth.admin.deleteUser(id);
      if (createdWorkshopId) await supabaseAdmin.from('workshops').delete().eq('id', createdWorkshopId);
      throw new Error('تعذر حفظ وظيفة الموظف؛ لم يتم تفعيل الدخول');
    }
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
    const { data: identity } = await supabaseAdmin.from('profiles').select('phone').eq('id', data.id).single();
    if (identity?.phone) {
      const { error: reservationError } = await supabaseAdmin.from('admin_phone_reservations').delete().in('phone', phoneIdentityVariants(identity.phone));
      if (reservationError) throw new Error('تعذر إلغاء صلاحية الرقم');
    }
    // Keep the driver file and workshop for history, but never leave them pointing at a deleted login.
    const { error: unlinkError } = await supabaseAdmin.from('drivers').update({ user_id: null }).eq('user_id', data.id);
    if (unlinkError) throw new Error('تعذر فصل ملف السائق عن الحساب');
    const { error: memberError } = await supabaseAdmin.from('workshop_members').delete().eq('user_id', data.id);
    if (memberError) throw new Error('تعذر إلغاء ربط الحساب بالورشة');
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (deleteError) throw new Error('تعذر حذف الحساب؛ قد تكون له ملفات مملوكة أو ارتباطات يجب معالجتها أولًا');
    return { deleted: true };
  });