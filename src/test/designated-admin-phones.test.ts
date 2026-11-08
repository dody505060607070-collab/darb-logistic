import { describe, expect, it } from 'vitest';
import { normalizePhone } from '@/lib/phone';
describe('designated administrator phone identities', () => {
  it('normalizes the first number supplied by the owner', () => {
    expect(normalizePhone('+966', '+966 59 355 5506')).toBe('+966593555506');
  });
  it('normalizes the second Saudi local number supplied by the owner', () => {
    expect(normalizePhone('+966', '0580333363')).toBe('+966580333363');
  });
});