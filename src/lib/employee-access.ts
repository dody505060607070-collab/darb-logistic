export const NOT_REGISTERED = 'أنت غير مسجل في النظام. تواصل مع الإدارة لإضافة رقمك.';
export const NO_JOB_YET = 'رقمك مسجل لكن لم تُحدد لك وظيفة بعد. تواصل مع الإدارة.';

export function assertApprovedPhone(profileCount: number, roleCount: number, reserved: boolean) {
  if (profileCount > 1) throw new Error('هذا الرقم مرتبط بأكثر من حساب. تواصل مع المدير.');
  if (reserved) return;
  if (profileCount !== 1) throw new Error(NOT_REGISTERED);
  if (roleCount < 1) throw new Error(NO_JOB_YET);
}
