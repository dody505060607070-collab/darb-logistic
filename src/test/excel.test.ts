import { describe, expect, it } from 'vitest';
import { displayValue, xlsxCell, buildWorkbook } from '@/lib/excel';
import { toSheet } from '@/components/darb/DataExports';

describe('Excel downloads', () => {
  it('keeps amounts as numbers so Excel can sum them', () => {
    expect(displayValue('amount', '1250.50')).toBe(1250.5);
    expect(xlsxCell(42)).toBe(42);
  });
  it('keeps phone and ID numbers with leading zero as text', () => {
    expect(displayValue('phone', '0501234567')).toBe('0501234567');
  });
  it('shows linked records by name instead of leaving them blank', () => {
    expect(displayValue('customer', { name: 'شركة النقل' })).toBe('شركة النقل');
    expect(displayValue('trips', [{ number: 'TRP-1' }, { number: 'TRP-2' }])).toBe('TRP-1، TRP-2');
  });
  it('removes characters that would corrupt the file', () => {
    expect(xlsxCell('a\u0001b')).toBe('ab');
  });
  it('produces a real xlsx file (zip signature), not a CSV', async () => {
    const blob = await buildWorkbook([toSheet({ label: 'الفواتير', fields: [['الإجمالي', 'total']] }, [{ total: 115 }])]);
    const buf = await new Promise<ArrayBuffer>(res => { const fr = new FileReader(); fr.onload = () => res(fr.result as ArrayBuffer); fr.readAsArrayBuffer(blob); });
    const head = new Uint8Array(buf).slice(0, 2);
    expect(String.fromCharCode(...head)).toBe('PK');
  }, 30000); // the Excel library's first load is slow when every test file runs at once
});
