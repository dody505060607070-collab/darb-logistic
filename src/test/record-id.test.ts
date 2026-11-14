import { expect, it } from 'vitest';
import { isRecordId } from '@/lib/record-id';
it('rejects filter syntax and accepts UUID identifiers', () => {
  expect(isRecordId('00000000-0000-0000-0000-000000000001')).toBe(true);
  expect(isRecordId('id),status.eq.closed')).toBe(false);
  expect(isRecordId('')).toBe(false);
});