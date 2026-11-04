import { describe, expect, it } from 'vitest';
import { normalizePhone } from '../lib/phone';
describe('phone-first identity', () => {
  it('stores a Saudi mobile in international form with country selection', () => expect(normalizePhone('+966', '0501234567')).toBe('+966501234567'));
  it('accepts Arabic digits', () => expect(normalizePhone('+966', '٠٥٠١٢٣٤٥٦٧')).toBe('+966501234567'));
  it('rejects an invalid number before requesting a code', () => expect(() => normalizePhone('+966', '123')).toThrow());
});