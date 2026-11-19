import type { SupabaseClient } from '@supabase/supabase-js';
import { phoneIdentityVariants } from './phone-account';

export type ProvisionInput = {
  fullName: string;
  phone: string;
  role: string;
  branchId: string | null;
  workshopId?: string | null;
  workshopName?: string | undefined;
  driver?: { national_id?: string | null; nationality?: string | null; license_no?: string | null; license_expiry?: string | null };
};

/**
 * Creates the login, profile, role and driver/workshop link together; undoes everything if any step fails.
 * Caller must already have verified the actor is the owner.
 */
export async function provisionEmployee(admin: SupabaseClient<any>, data: ProvisionInput) {
  const { data: existing, error: lookupError } = await admin.from('profiles').select('id').in('phone', phoneIdentityVariants(data.phone));
  if (lookupError) throw new Error('تعذر التحقق من الرقم');
  if (existing?.length) throw new Error('رقم الجوال مرتبط بموظف موجود');
  const { data: created, error: createError } = await admin.auth.admin.createUser({ email: `${data.phone.slice(1)}@phone.darb.app`, email_confirm: true, phone: data.phone, phone_confirm: true, user_metadata: { full_name: data.fullName } });
  if (createError || !created.user) throw new Error('تعذر إضافة الموظف؛ تحقق أن الرقم غير مستخدم');
  const id = created.user.id;
  let createdWorkshopId: string | null = null;
  let driverId: string | null = null;
  let reusedDriverId: string | null = null;
  try {
    const { error: profileError } = await admin.from('profiles').update({ full_name: data.fullName, phone: data.phone, branch_id: data.branchId }).eq('id', id);
    if (profileError) throw profileError;
    if (data.role === 'driver') {
      // Reuse the driver file already made in the drivers page for this phone instead of a blank duplicate.
      const { findUnlinkedDriverByPhone } = await import('./driver-access.server');
      const existingFile = await findUnlinkedDriverByPhone(admin, data.phone);
      if (existingFile) {
        const { data: current } = await admin.from('drivers').select('national_id, nationality, license_no, license_expiry, branch_id').eq('id', existingFile).single();
        const fill: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(data.driver ?? {})) if (v != null && current?.[k as keyof typeof current] == null) fill[k] = v;
        const { data: linked, error: linkError } = await admin.from('drivers').update({ ...fill, user_id: id, phone: data.phone, branch_id: current?.branch_id ?? data.branchId }).eq('id', existingFile).is('user_id', null).select('id');
        if (linkError || !linked?.length) throw linkError ?? new Error('تعذر ربط ملف السائق');
        driverId = existingFile; reusedDriverId = existingFile;
      } else {
        const { data: driver, error: driverError } = await admin.from('drivers').insert({ code: `DRV-${id.slice(0, 8)}`, full_name: data.fullName, phone: data.phone, user_id: id, branch_id: data.branchId, ...(data.driver ?? {}) }).select('id').single();
        if (driverError || !driver) throw driverError ?? new Error('تعذر حفظ ملف السائق');
        driverId = driver.id;
      }
    }
    if (data.role === 'workshop') {
      let workshopId = data.workshopId ?? null;
      if (data.workshopName) {
        const { data: workshop, error: workshopError } = await admin.from('workshops').insert({ name: data.workshopName, phone: data.phone, branch_id: data.branchId }).select('id').single();
        if (workshopError || !workshop) throw workshopError ?? new Error('تعذر حفظ الورشة');
        workshopId = workshop.id; createdWorkshopId = workshop.id;
      }
      if (!workshopId) throw new Error('الورشة مطلوبة');
      const { error: memberError } = await admin.from('workshop_members').insert({ workshop_id: workshopId, user_id: id });
      if (memberError) throw memberError;
    }
    const { error: roleError } = await admin.from('user_roles').insert({ user_id: id, role: data.role });
    if (roleError) throw roleError;
    return { id, driverId };
  } catch {
    // A pre-existing driver file is only unlinked, never deleted with the failed account.
    if (reusedDriverId) await admin.from('drivers').update({ user_id: null }).eq('id', reusedDriverId);
    await rollbackEmployee(admin, id, createdWorkshopId);
    throw new Error('تعذر حفظ وظيفة الموظف؛ لم يتم تفعيل الدخول');
  }
}

export async function rollbackEmployee(admin: SupabaseClient<any>, id: string, createdWorkshopId: string | null = null) {
  await admin.from('documents').delete().eq('entity_type', 'driver').in('entity_id', ((await admin.from('drivers').select('id').eq('user_id', id)).data ?? []).map(d => d.id));
  await admin.from('user_roles').delete().eq('user_id', id);
  await admin.from('workshop_members').delete().eq('user_id', id);
  await admin.from('drivers').delete().eq('user_id', id);
  await admin.auth.admin.deleteUser(id);
  if (createdWorkshopId) await admin.from('workshops').delete().eq('id', createdWorkshopId);
}
