import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhone } from './phone';
import { phoneIdentityVariants } from './phone-account';
import { driverLinkDecision, driverPhoneVariants, type DriverLinkActor, type DriverLinkRefusal } from './driver-access';

export type DriverLoginResult =
  | { status: 'created' | 'linked' | 'already'; userId: string }
  | { status: 'refused'; reason: DriverLinkRefusal };

function phoneOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try { return normalizePhone('+966', raw); } catch { return null; }
}

/** The single unlinked driver file carrying this phone, or null when none or several. */
export async function findUnlinkedDriverByPhone(admin: SupabaseClient<any>, phone: string): Promise<string | null> {
  const { data, error } = await admin.from('drivers').select('id').in('phone', driverPhoneVariants(phone)).is('user_id', null).limit(2);
  if (error) throw new Error('تعذر البحث في ملفات السائقين');
  return data?.length === 1 ? data[0]!.id : null;
}

/**
 * Gives a driver file its phone login: links an existing account with that phone or creates a driver-only one.
 * Never deletes the driver file; undoes the new account if any step fails.
 */
export async function ensureDriverLogin(admin: SupabaseClient<any>, driverId: string, actor: DriverLinkActor): Promise<DriverLoginResult> {
  const { data: d, error } = await admin.from('drivers').select('id, full_name, phone, user_id, branch_id').eq('id', driverId).maybeSingle();
  if (error || !d) throw new Error('ملف السائق غير موجود');
  if (d.user_id) return { status: 'already', userId: d.user_id };
  const phone = phoneOf(d.phone);
  let profiles: { id: string; roles: string[]; linkedDriverId: string | null }[] = [];
  if (phone) {
    const { data: found, error: pErr } = await admin.from('profiles').select('id').in('phone', phoneIdentityVariants(phone)).limit(2);
    if (pErr) throw new Error('تعذر التحقق من الرقم');
    for (const p of found ?? []) {
      const [{ data: roles }, { data: linked }] = await Promise.all([
        admin.from('user_roles').select('role').eq('user_id', p.id),
        admin.from('drivers').select('id').eq('user_id', p.id).maybeSingle(),
      ]);
      profiles.push({ id: p.id, roles: (roles ?? []).map((r: { role: string }) => r.role), linkedDriverId: linked?.id ?? null });
    }
  }
  const decision = driverLinkDecision({ hasPhone: !!phone, profiles, actor });
  if (decision.kind === 'refuse') return { status: 'refused', reason: decision.reason };

  if (decision.kind === 'link') {
    const { data: linked, error: linkErr } = await admin.from('drivers').update({ user_id: decision.userId, phone }).eq('id', d.id).is('user_id', null).select('id');
    if (linkErr) throw new Error('تعذر ربط ملف السائق بالحساب');
    if (!linked?.length) return { status: 'already', userId: decision.userId };
    if (decision.addRole) {
      const { error: roleErr } = await admin.from('user_roles').insert({ user_id: decision.userId, role: 'driver' });
      if (roleErr) {
        await admin.from('drivers').update({ user_id: null }).eq('id', d.id);
        throw new Error('تعذر منح وظيفة السائق');
      }
    }
    return { status: 'linked', userId: decision.userId };
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: `${phone!.slice(1)}@phone.darb.app`, email_confirm: true, phone: phone!, phone_confirm: true,
    user_metadata: { full_name: d.full_name },
  });
  if (createErr || !created.user) throw new Error('تعذر إنشاء حساب الدخول؛ قد يكون الرقم مستخدمًا');
  const id = created.user.id;
  try {
    const { error: profErr } = await admin.from('profiles').update({ full_name: d.full_name, phone, branch_id: d.branch_id }).eq('id', id);
    if (profErr) throw profErr;
    // Link first so the role trigger sees the existing file and never makes a second one.
    const { data: linked, error: linkErr } = await admin.from('drivers').update({ user_id: id, phone }).eq('id', d.id).is('user_id', null).select('id');
    if (linkErr || !linked?.length) throw linkErr ?? new Error('linked meanwhile');
    const { error: roleErr } = await admin.from('user_roles').insert({ user_id: id, role: 'driver' });
    if (roleErr) throw roleErr;
    return { status: 'created', userId: id };
  } catch {
    await admin.from('user_roles').delete().eq('user_id', id);
    await admin.from('drivers').update({ user_id: null }).eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
    throw new Error('تعذر تفعيل دخول السائق؛ لم يُنشأ أي حساب');
  }
}
