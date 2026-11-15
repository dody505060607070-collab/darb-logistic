import { describe, expect, it } from 'vitest';
import { normalizePhone, optionalPhone, tryNormalizePhone, whatsappNumber } from '../lib/phone';

const SA = '+966501234567';
describe('phone numbers are understood however they are typed', () => {
  it.each(['0501234567', '501234567', '966501234567', '+966501234567', '00966501234567', '9660501234567', '+9660501234567', '050 123 4567', '+966 50-123-4567', '٠٥٠١٢٣٤٥٦٧'])('%s → +966501234567', v => {
    expect(normalizePhone('+966', v)).toBe(SA);
  });
  it('understands another country written with its code, with or without +', () => {
    expect(normalizePhone('+966', '201222576172')).toBe('+201222576172');
    expect(normalizePhone('+966', '00201222576172')).toBe('+201222576172');
    expect(normalizePhone('+966', '+20 122 257 6172')).toBe('+201222576172');
  });
  it('uses the chosen country for local numbers', () => expect(normalizePhone('+20', '01222576172')).toBe('+201222576172'));
  it('rejects numbers that cannot be a phone', () => {
    expect(() => normalizePhone('+966', '123')).toThrow();
    expect(tryNormalizePhone('qfeqefqef')).toBeNull();
  });
  it('gives WhatsApp the digits without +', () => expect(whatsappNumber('0566099774')).toBe('966566099774'));
});

describe('optional phone boxes (customers, workshops, representative requests)', () => {
  it('leave an empty box empty', () => expect(optionalPhone('  ')).toBeNull());
  it('save a typed Saudi number in one form', () => expect(optionalPhone('966 55 865 4332')).toBe('+966558654332'));
  it('refuse a number that cannot be understood', () => expect(() => optionalPhone('qfeqefqef')).toThrow());
});
