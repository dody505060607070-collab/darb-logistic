import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
it('workshop pending intake no longer writes asset availability', () => {
  const sql = readFileSync('drizzle/migrations/0037_workshop_intake_pending_no_asset_mutation.sql', 'utf8');
  expect(sql).not.toMatch(/UPDATE\s+(public\.)?assets\s+SET/i);
});
it('both role helpers scope identity and deny anonymous execution', () => {
  const sql = readFileSync('drizzle/migrations/0038_role_helpers_scoped_identity_checks.sql', 'utf8');
  expect(sql.match(/_user_id=auth\.uid\(\)/g)).toHaveLength(2);
  expect(sql).toContain('FROM PUBLIC,anon');
});it('an unassigned field technician cannot stop a vehicle through a critical report', () => {
  const sql = readFileSync('drizzle/migrations/0039_maintenance_request_scoped_vehicle_stop.sql', 'utf8');
  expect(sql).toMatch(/p_severity='critical' AND \(v_staff OR v_driver OR v_field_assigned\)/);
  expect(sql).toMatch(/w\.assignee_id=auth\.uid\(\) AND w\.closed_at IS NULL/);
  expect(sql).toContain('FROM PUBLIC, anon');
});

describe('0040 maintenance controls and invoice guard', () => {
  const sql = readFileSync('drizzle/migrations/0040_maintenance_record_controls_and_invoice_guard.sql', 'utf8');
  it('refuses zero-price invoices and oversize discounts', () => {
    expect(sql).toContain('COALESCE(f.revenue,0) <= 0');
    expect(sql).toContain('الخصم أكبر من قيمة الفاتورة');
  });
  it('never deletes orders with costs, parts or custody entries', () => {
    expect(sql).toMatch(/work_order_lines[\s\S]*stock_moves[\s\S]*maintenance_wallet_entries/);
  });
  it('anonymous visitors cannot run the new functions', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.work_order_delete(uuid) FROM PUBLIC, anon');
  });
});
