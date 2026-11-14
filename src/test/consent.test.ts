import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canTrack, readChoice, saveChoices } from '@/lib/consent';
describe('analytics consent', () => {
  beforeEach(() => { localStorage.clear(); Object.defineProperty(navigator, 'globalPrivacyControl', { value: false, configurable: true }); });
  it('reject stops optional analytics and does not answer advertising', async () => {
    saveChoices({ analytics: 'denied' });
    expect(await canTrack('analytics')).toBe(false);
    expect(readChoice('advertising')).toBeNull();
  });
  it('browser privacy signal overrides acceptance', async () => {
    saveChoices({ analytics: 'granted' });
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    expect(await canTrack('analytics')).toBe(false);
  });
  it('acceptance expires after 365 days', () => {
    localStorage.setItem('cookie_consent_analytics', JSON.stringify({ choice: 'granted', at: Date.now() - 366 * 86400000 }));
    expect(readChoice('analytics')).toBeNull();
  });
});