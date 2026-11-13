import { describe, expect, it } from 'vitest';
import { canRestoreProfilePhone, matchesVerifiedPhone, phoneIdentityVariants } from '../lib/phone-account';

describe('existing WhatsApp account identity', () => {
  it('looks up the verified number in both legacy and E.164 forms', () => {
    expect(phoneIdentityVariants('+966591911949')).toEqual(['+966591911949', '966591911949']);
  });
  it('restores a missing profile only when the auth phone and synthetic address both match', () => {
    expect(matchesVerifiedPhone({ phone: '201222576172', email: '201222576172@phone.darb.app' }, '+201222576172')).toBe(true);
    expect(matchesVerifiedPhone({ phone: '201222576173', email: '201222576172@phone.darb.app' }, '+201222576172')).toBe(false);
    expect(matchesVerifiedPhone({ phone: '201222576172', email: 'someone@phone.darb.app' }, '+201222576172')).toBe(false);
  });
  it('never replaces a different existing profile identity', () => {
    expect(canRestoreProfilePhone(null, '+201222576172')).toBe(true);
    expect(canRestoreProfilePhone('201222576172', '+201222576172')).toBe(true);
    expect(canRestoreProfilePhone('+201222576173', '+201222576172')).toBe(false);
  });
});