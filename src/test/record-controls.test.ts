import { describe, expect, it } from 'vitest';
import { canDeleteEntity } from '@/lib/record-controls';
describe('record deletion permissions', () => {
  it('only owners can delete supported reference records', () => {
    expect(canDeleteEntity('customers', true, 'id')).toBe(true);
    expect(canDeleteEntity('customers', false, 'id')).toBe(false);
  });
  it('preserves audit, events and financial documents', () => {
    for (const table of ['audit_log', 'activity_events', 'trip_events', 'invoices', 'payments', 'payment_allocations', 'stock_moves', 'tasks']) expect(canDeleteEntity(table, true, 'id')).toBe(false);
  });
});