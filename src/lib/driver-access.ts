/**
 * Browser-safe rules for turning a driver file (صفحة السائقين) into a phone login.
 * A driver file with a valid phone is the administration's approval; the account it gets is driver-only.
 */
export type DriverLinkActor = 'owner' | 'staff' | 'login';
export type DriverLinkProfile = { id: string; roles: string[]; linkedDriverId: string | null };
export type DriverLinkRefusal = 'no_phone' | 'duplicate' | 'other_file' | 'staff_number' | 'no_job';
export type DriverLinkDecision =
  | { kind: 'create' }
  | { kind: 'link'; userId: string; addRole: boolean }
  | { kind: 'refuse'; reason: DriverLinkRefusal };

export function driverLinkDecision(input: { hasPhone: boolean; profiles: DriverLinkProfile[]; actor: DriverLinkActor }): DriverLinkDecision {
  if (!input.hasPhone) return { kind: 'refuse', reason: 'no_phone' };
  if (input.profiles.length > 1) return { kind: 'refuse', reason: 'duplicate' };
  const p = input.profiles[0];
  if (!p) return { kind: 'create' };
  if (p.linkedDriverId) return { kind: 'refuse', reason: 'other_file' };
  const isDriver = p.roles.includes('driver');
  // Signing in never grants a new job to an existing employee; it only repairs a missing link.
  if (input.actor === 'login') return isDriver ? { kind: 'link', userId: p.id, addRole: false } : { kind: 'refuse', reason: 'no_job' };
  // Only the general manager may give a driver job to someone who already has another job.
  if (input.actor === 'staff' && p.roles.some(r => r !== 'driver')) return { kind: 'refuse', reason: 'staff_number' };
  return { kind: 'link', userId: p.id, addRole: !isDriver };
}

/** Ways a driver file phone may have been stored (+9665…, 9665…, 05…). */
export function driverPhoneVariants(phone: string): string[] {
  const digits = phone.replace(/^\+/, '');
  const out = [phone, digits];
  if (digits.startsWith('966')) out.push(`0${digits.slice(3)}`);
  return out;
}

export const DRIVER_LOGIN_MESSAGE: Record<string, string> = {
  created: 'تم تفعيل دخول السائق برقم جواله',
  linked: 'تم ربط ملف السائق بحساب الدخول',
  already: 'دخول السائق مفعّل',
  no_phone: 'أضف رقم جوال صحيح للسائق ليتمكن من الدخول',
  duplicate: 'الرقم مسجل لأكثر من حساب؛ راجع صفحة الموظفين',
  other_file: 'الرقم مرتبط بملف سائق آخر',
  staff_number: 'الرقم لموظف له وظيفة أخرى؛ يربطه المدير العام فقط',
  no_job: 'الرقم لموظف بدون وظيفة سائق',
};
