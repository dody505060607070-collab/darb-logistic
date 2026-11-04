import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhone(countryCode: string, localNumber: string): string {
  const digits = localNumber.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776)).replace(/[\s()-]/g, '');
  const phone = parsePhoneNumberFromString(digits.startsWith('+') ? digits : `${countryCode}${digits.replace(/^0+/, '')}`);
  if (!phone?.isValid() || (phone.countryCallingCode !== countryCode.replace('+', '') && !digits.startsWith('+'))) throw new Error('أدخل رقم جوال صحيحًا مع رمز الدولة');
  return phone.number;
}