export function assertApprovedPhone(profileCount: number, roleCount: number, reserved: boolean) {
  if (profileCount > 1) throw new Error('هذا الرقم مرتبط بأكثر من حساب. تواصل مع المدير.');
  if (!reserved && (profileCount !== 1 || roleCount < 1)) {
    throw new Error('هذا الرقم غير مصرح له بالدخول. اطلب من الإدارة إضافة رقمك ووظيفتك.');
  }
}