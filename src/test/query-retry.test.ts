import { expect, it } from 'vitest';
import { retryRead } from '@/lib/query-retry';
it('does not retry a permission refusal or validation failure', () => {
  expect(retryRead(0, { code: '42501', message: 'permission denied' })).toBe(false);
  expect(retryRead(0, { status: 400 })).toBe(false);
});
it('bounds retries for transient reads', () => {
  expect(retryRead(0, { status: 503 })).toBe(true);
  expect(retryRead(1, { status: 503 })).toBe(false);
});