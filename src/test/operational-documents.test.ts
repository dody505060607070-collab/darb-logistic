import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { operationalDocuments } from '@/lib/operational-documents';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-27T12:00:00Z')); });
afterEach(() => vi.useRealTimers());
const doc = (id: string, expiry_date: string, entity_type = 'asset') => ({ id, expiry_date, entity_type, entity_id: 'a', doc_type: 'استمارة' });
describe('manager operational expiry priorities', () => {
  it('expired comes first, seven-day expiry is critical and thirty-day expiry warns', () => {
    const rows = operationalDocuments([doc('soon', '2026-12-27'), doc('critical', '2026-12-04'), doc('expired', '2026-11-26')], [], [], []);
    expect(rows.map(x => x.document.id)).toEqual(['expired', 'critical', 'soon']);
    expect(rows.map(x => x.tone)).toEqual(['danger', 'danger', 'warning']);
    expect(rows.map(x => x.filter)).toEqual(['expired', 'soon', 'soon']);
  });
  it('uses configured windows and excludes undated, future and non-operational documents', () => {
    expect(operationalDocuments([doc('8-days', '2026-12-05'), doc('future', '2027-01-01'), doc('undated', ''), doc('company', '2026-11-01', 'company')], [], [], [], [7]).map(x => x.document.id)).toEqual([]);
  });
  it('maps the asset and real open custody holder, never a closed holder', () => {
    const row = operationalDocuments([doc('expired', '2026-11-26')], [{ id: 'a', code: 'TRK-014' }], [{ id: 'd', full_name: 'Actual holder' }], [{ asset_id: 'a', driver_id: 'wrong', closed_at: '2026-11-01' }, { asset_id: 'a', driver_id: 'd', closed_at: null }])[0];
    expect(row?.related).toBe('TRK-014'); expect(row?.person).toBe('Actual holder'); expect(row?.role).toBe('مشرف الأسطول');
  });
  it('maps driver documents to their owner without inventing an assigned person', () => {
    const row = operationalDocuments([doc('driver-license', '2026-11-26', 'driver')], [], [{ id: 'a', full_name: 'Actual driver' }], [])[0];
    expect(row?.related).toBe('Actual driver'); expect(row?.person).toBe('Actual driver');
    expect(operationalDocuments([doc('unmapped', '2026-11-26')], [], [], [])[0]?.person).toBeUndefined();
  });
});