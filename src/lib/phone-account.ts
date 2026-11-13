import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function phoneIdentityVariants(phone: string): string[] {
  return [phone, phone.replace(/^\+/, '')];
}

export function matchesVerifiedPhone(account: { phone?: string | null; email?: string | null }, phone: string): boolean {
  const digits = phone.replace(/^\+/, '');
  const stored = account.phone?.replace(/\D/g, '');
  return stored === digits && account.email?.toLowerCase() === `${digits}@phone.darb.app`;
}

export function canRestoreProfilePhone(storedPhone: string | null, verifiedPhone: string): boolean {
  if (!storedPhone) return true;
  return parsePhoneNumberFromString(storedPhone.startsWith('+') ? storedPhone : `+${storedPhone}`)?.number === verifiedPhone;
}