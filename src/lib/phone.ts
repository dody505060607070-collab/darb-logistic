import { parsePhoneNumberFromString } from 'libphonenumber-js';

const INVALID = 'رقم الجوال غير صحيح. اكتبه مثل 0501234567 أو 966501234567';

/** Arabic/Persian digits → Latin, and drop spaces, dashes, dots and brackets. */
function cleanDigits(raw: string): string {
  return String(raw ?? '')
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776))
    .replace(/[^\d+]/g, '')
    .replace(/(?!^)\+/g, '');
}

function valid(candidate: string): string | null {
  const p = parsePhoneNumberFromString(candidate);
  return p?.isValid() ? p.number : null;
}

/**
 * Understands a phone number however it was typed and returns it as +<country><number>.
 * Accepts: 05XXXXXXXX, 5XXXXXXXX, 9665XXXXXXXX, +9665XXXXXXXX, 009665XXXXXXXX, 96605XXXXXXXX,
 * and any other country written with its code (with or without + / 00).
 * `countryCode` is the default country (Saudi Arabia, +966) for numbers written without one.
 */
export function normalizePhone(countryCode: string, raw: string): string {
  let d = cleanDigits(raw);
  if (d.startsWith('00')) d = `+${d.slice(2)}`;
  const cc = countryCode.replace(/\D/g, '');
  const intl = d.startsWith('+') ? d.slice(1) : null;
  const body = intl ?? d;
  // Country code followed by a stray trunk 0 (e.g. 96605…): drop the 0.
  const fixTrunk = (s: string) => (s.startsWith(`${cc}0`) ? `${cc}${s.slice(cc.length + 1)}` : s);
  const tries = intl != null
    ? [`+${fixTrunk(intl)}`, `+${intl}`]
    : [`+${cc}${body.replace(/^0+/, '')}`, `+${fixTrunk(body)}`, `+${body}`];
  for (const t of tries) {
    const n = valid(t);
    if (n) return n;
  }
  throw new Error(INVALID);
}

/** Same as normalizePhone with Saudi Arabia as default, but returns null instead of throwing. */
export function tryNormalizePhone(raw: string | null | undefined, countryCode = '+966'): string | null {
  if (!raw || !String(raw).trim()) return null;
  try { return normalizePhone(countryCode, String(raw)); } catch { return null; }
}

/** Digits the WhatsApp gateway expects (no +), or null when the number can't be understood. */
export function whatsappNumber(raw: string | null | undefined): string | null {
  return tryNormalizePhone(raw)?.slice(1) ?? null;
}
