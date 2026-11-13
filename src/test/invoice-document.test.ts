import { describe, expect, it } from 'vitest';
import { invoiceIssues } from '@/lib/invoice-document';
describe('invoice validation', () => {
  const seller = { company_name: 'Company', vat_number: '310000000000003', cr_number: '1234' };
  it('cannot treat missing legal seller identifiers as complete', () => {
    expect(invoiceIssues({ subtotal: 100, vat: 15, total: 115 }, { company_name: 'Company' })).toHaveLength(2);
  });
  it('rejects totals that do not match subtotal minus discount plus VAT', () => {
    expect(invoiceIssues({ subtotal: 100, discount: 10, vat: 13.5, total: 103.5 }, seller)).toHaveLength(0);
    expect(invoiceIssues({ subtotal: 100, discount: 10, vat: 13.5, total: 115 }, seller)).toHaveLength(1);
  });
});