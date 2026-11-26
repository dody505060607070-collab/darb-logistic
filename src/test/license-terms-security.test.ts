import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('drizzle/migrations/0060_approved_driver_license_and_customer_terms.sql', 'utf8');
describe('review security database enforcement', () => {
  it('guards both creation and updates of customer payment terms', () => {
    expect(sql).toContain('BEFORE INSERT OR UPDATE ON public.customers');
    expect(sql).toContain("TG_OP = 'INSERT'");
    expect(sql).toContain('NEW.payment_terms_days IS DISTINCT FROM 30');
    expect(sql).toContain('NEW.payment_terms_days IS DISTINCT FROM OLD.payment_terms_days');
    expect(sql).toContain("'{owner,ops_manager,accountant}'");
  });
  it('synchronizes expiry and number only from approved documents', () => {
    expect(sql).toContain("OLD.review_status = 'approved'");
    expect(sql).toContain("NEW.review_status = 'approved'");
    expect(sql).toContain("x.review_status = 'approved'");
    expect(sql).not.toContain("review_status<>'rejected'");
    expect(sql).toContain('license_expiry = exp');
    expect(sql).not.toContain('coalesce(exp, license_expiry)');
  });
});