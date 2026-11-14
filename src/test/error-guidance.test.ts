import { describe, expect, it } from 'vitest';
import { errorGuidance } from '@/lib/error-guidance';
describe('safe actionable errors', () => {
  it('preserves permission refusals and gives an administration remedy', () => {
    expect(errorGuidance(new Error('row-level security')).solution).toContain('الإدارة');
  });
  it('keeps linked financial history instead of recommending force deletion', () => {
    expect(errorGuidance({ code: '23503', message: 'foreign key' }).solution).toContain('احتفظ بالسجل');
  });
  it('never exposes raw SQL in a default error', () => {
    expect(errorGuidance(new Error('postgres insert token_hash')).problem).toBe('تعذر إتمام العملية.');
  });
});