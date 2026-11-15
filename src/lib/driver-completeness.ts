import { tryNormalizePhone } from './phone';

/** What a driver file must have before the driver can be given trips and receive messages. */
export type DriverFile = {
  phone?: string | null;
  national_id?: string | null;
  nationality?: string | null;
  license_no?: string | null;
  license_expiry?: string | null;
  user_id?: string | null;
};

const blank = (v: unknown) => v == null || String(v).trim() === '';

export function driverMissing(d: DriverFile): string[] {
  const out: string[] = [];
  if (blank(d.phone)) out.push('رقم الجوال');
  else if (!tryNormalizePhone(d.phone)) out.push('رقم جوال صحيح');
  if (blank(d.national_id)) out.push('رقم الهوية/الإقامة');
  if (blank(d.nationality)) out.push('الجنسية');
  if (blank(d.license_no)) out.push('رقم الرخصة');
  if (blank(d.license_expiry)) out.push('تاريخ انتهاء الرخصة');
  if (blank(d.user_id)) out.push('ربط حساب الدخول');
  return out;
}
