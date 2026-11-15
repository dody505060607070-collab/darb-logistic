import { describe, expect, it } from 'vitest';
import { plainDailyReport } from '@/lib/daily-report';
import { canDeleteWorkOrder, canEditWorkOrder } from '@/lib/maintenance-flow';
import { alertLink } from '@/lib/alert-links';
import { guideFor } from '@/components/darb/page-guides';

describe('morning report fallback', () => {
  it('lists the stored figures without AI', () => {
    const text = plainDailyReport({ date: '2026-11-15', active_trips: 3, late_trips: [{ number: 'TRP-1', origin_city: 'الرياض', dest_city: 'الدمام' }], expiring_documents: [], pending_expenses: { count: 2, total_sar: 150.5 }, open_work_orders: [{ number: 'WO-1' }], open_incidents: [{ number: 'INC-1', severity: 'critical' }], open_tasks: [] });
    expect(text).toContain('الرحلات النشطة: 3');
    expect(text).toContain('TRP-1');
    expect(text).toContain('150.5 ر.س');
    expect(text).toContain('منها 1 عالية الخطورة');
  });
});

describe('maintenance order edit/delete rules', () => {
  const manager = { manager: true, mine: false }; const reporter = { manager: false, mine: true }; const other = { manager: false, mine: false };
  it('reporter edits and deletes own request only before approval', () => {
    expect(canEditWorkOrder('review', reporter)).toBe(true);
    expect(canDeleteWorkOrder('review', reporter)).toBe(true);
    expect(canEditWorkOrder('approved', reporter)).toBe(false);
    expect(canDeleteWorkOrder('assigned', reporter)).toBe(false);
    expect(canEditWorkOrder('review', other)).toBe(false);
  });
  it('managers cannot delete once repair has started or the order is closed', () => {
    expect(canDeleteWorkOrder('assigned', manager)).toBe(true);
    expect(canDeleteWorkOrder('repairing', manager)).toBe(false);
    expect(canDeleteWorkOrder('closed', manager)).toBe(false);
    expect(canEditWorkOrder('closed', manager)).toBe(false);
  });
});

describe('alert links and page guides', () => {
  it('a maintenance alert opens that order', () => {
    expect(alertLink('work_orders', 'abc')).toEqual({ to: '/repair-center', search: { order: 'abc' } });
    expect(alertLink('incident', 'x')).toEqual({ to: '/incidents', search: { id: 'x' } });
    expect(alertLink('unknown', 'x')).toBeNull();
  });
  it('detail pages reuse their section guide', () => {
    expect(guideFor('/trips/123')?.what).toBe(guideFor('/trips')?.what);
    expect(guideFor('/repair-center')?.steps).toHaveLength(3);
  });
});
