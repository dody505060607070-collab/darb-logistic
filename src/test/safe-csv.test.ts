import { expect, it } from 'vitest';
import { csvCell } from '@/lib/safe-csv';
it('neutralizes formulas and preserves quoted text', () => {
  for (const value of ['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)', '\t=1+1', '  =1+1']) expect(csvCell(value).startsWith('"\'')).toBe(true);
  expect(csvCell('TRK-014')).toBe('"TRK-014"');
  expect(csvCell('a"b')).toBe('"a""b"');
});