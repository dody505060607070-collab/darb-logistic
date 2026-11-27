import { describe, expect, it } from 'vitest';
import { companyDay, custodyMessageState, custodyResponsibility, pendingCustody, punctuality, tractorUtilization, tripScope } from '@/lib/home-summary';
import { buildFleetVehicles, freshReading, hasInsight } from '@/lib/fleet-map';
import type { Row } from '@/lib/db';

const NOW = new Date('2026-11-27T21:10:00Z');
const fix = (minutes = 1) => new Date(NOW.getTime() - minutes * 60000).toISOString();
const waiting = Array.from({ length: 17 }, (_, i) => ({ id: `c-${i}`, driver_id: `d-${i}`, acknowledged: false, closed_at: null }));
const delivery = (id: string, end: string): Row => ({ id, status: 'delivered', actual_end: end, order: { delivery_due_at: '2026-11-15T12:00:00Z' } });

describe('home action responsibility', () => {
  it('17 pending driver acknowledgements are follow-up, never owner approvals', () => {
    expect(pendingCustody(waiting)).toHaveLength(17);
    expect(waiting.filter(r => custodyResponsibility(r, ['owner'], null) === 'mine')).toHaveLength(0);
    expect(waiting.filter(r => custodyResponsibility(r, ['owner'], null) === 'others')).toHaveLength(17);
  });
  it('accountant has no operational custody action or follow-up', () => {
    expect(waiting.map(r => custodyResponsibility(r, ['accountant'], null))).toEqual(Array(17).fill('none'));
  });
  it('effective preview role cannot inherit the actual owners follow-up', () => {
    expect(custodyResponsibility(waiting[0] ?? {}, ['accountant'], null)).toBe('none');
  });
  it('only the assigned driver acknowledges their pending custody', () => {
    expect(waiting.filter(r => custodyResponsibility(r, ['driver'], 'd-5') === 'mine').map(r => r.id)).toEqual(['c-5']);
  });
  it('closed or acknowledged custody is absent from the pending destination', () => {
    expect(pendingCustody([...waiting, { id: 'closed', closed_at: fix(), acknowledged: false }, { id: 'done', acknowledged: true }]).map(r => r.id)).toEqual(waiting.map(r => r.id));
  });
  it('provider acceptance is not delivery or driver acknowledgement', () => {
    expect(custodyMessageState({ state: 'accepted' })).toBe('تم الإرسال للمزوّد؛ التسليم غير مؤكد');
    expect(custodyMessageState({ state: 'unresolved' })).toBe('نتيجة الإرسال غير مؤكدة');
  });
});

describe('verifiable operational metrics', () => {
  it('uses company local day at the Riyadh midnight boundary', () => {
    expect(companyDay('2026-11-27T21:00:00Z')).toBe('2026-11-28');
    expect(companyDay('2026-11-27T20:59:59Z')).toBe('2026-11-27');
  });
  it('has no percentage when no eligible completed trips exist', () => {
    expect(punctuality([], NOW).percent).toBeNull();
  });
  it('one eligible on-time trip displays 1/1 and 100 percent', () => {
    const result = punctuality([delivery('one', '2026-11-15T12:00:00Z')], NOW);
    expect([result.onTime.length, result.eligible.length, result.percent]).toEqual([1, 1, 100]);
  });
  it('two of three eligible trips display 2/3 and rounded 67 percent', () => {
    const result = punctuality([delivery('one', '2026-11-15T10:00:00Z'), delivery('two', '2026-11-15T12:00:00Z'), delivery('late', '2026-11-15T13:00:00Z')], NOW);
    expect([result.onTime.length, result.eligible.length, result.percent]).toEqual([2, 3, 67]);
  });
  it('excludes missing references, empty trips, incomplete trips and another month', () => {
    const result = punctuality([{ ...delivery('missing', '2026-11-15T10:00:00Z'), order: null }, { ...delivery('empty', '2026-11-15T10:00:00Z'), is_empty: true }, { ...delivery('no-end', ''), actual_end: null }, { ...delivery('running', '2026-11-15T10:00:00Z'), status: 'in_progress' }, delivery('old', '2026-10-15T10:00:00Z')], NOW);
    expect(result.eligible).toHaveLength(0); expect(result.excluded.map(r => r.id)).toEqual(['missing', 'empty']); expect(result.missingActual.map(r => r.id)).toEqual(['no-end']);
  });
  it('utilization counts active registered non-trailers, never devices', () => {
    const result = tractorUtilization([{ id: 'a', kind: 'tractor', status: 'active' }, { id: 'b', kind: 'tractor', status: 'available' }, { id: 'trailer', kind: 'trailer', status: 'active' }]);
    expect([result.active.length, result.total.length, result.percent]).toEqual([1, 2, 50]);
  });
  it('today and late destinations retain the same record IDs', () => {
    const rows = [{ id: 'riyadh-today', planned_start: '2026-11-27T21:05:00Z', status: 'planned' }, { id: 'running', status: 'in_progress', planned_end: '2026-11-27T20:00:00Z' }, { id: 'old', planned_start: '2026-11-27T20:00:00Z', status: 'planned' }];
    expect(tripScope(rows, 'today', NOW).map(r => r.id)).toEqual(['riyadh-today', 'running']);
    expect(tripScope(rows, 'late', NOW).map(r => r.id)).toEqual(['running']);
  });
});

describe('GPS is separate from readiness and trips', () => {
  const asset = { id: 'a', code: 'TRK-1', kind: 'tractor', status: 'maintenance' };
  const provider = { id: 'gps', asset_id: 'a', lat: 24, lng: 46, gps_time: fix(), vehicle_state: 'moving', speed_kmh: 60 };
  it('unlinked moving devices do not count as linked moving without a trip', () => {
    const list = buildFleetVehicles([{ ...provider, asset_id: null }], [asset], [], NOW.getTime());
    const v = list[0]; if (!v) throw new Error('No device');
    expect(v.assetId).toBeNull(); expect(hasInsight(v, 'moving_without_trip', NOW.getTime())).toBe(false);
  });
  it('fresh linked moving head without recorded trip qualifies independently of readiness', () => {
    const v = buildFleetVehicles([provider], [asset], [], NOW.getTime())[0]; if (!v) throw new Error('No device');
    expect(hasInsight(v, 'moving_without_trip', NOW.getTime())).toBe(true); expect(v.assetStatus).toBe('maintenance');
  });
  it('old or invalid fixes do not prove movement now', () => {
    for (const gps_time of [fix(15), fix(120), 'bad', null]) {
      const v = buildFleetVehicles([{ ...provider, gps_time }], [asset], [], NOW.getTime())[0]; if (!v) throw new Error('No device');
      expect(hasInsight(v, 'moving_without_trip', NOW.getTime())).toBe(false);
      expect(v.state).not.toBe('moving');
    }
    expect(freshReading(fix(14), NOW.getTime())).toBe(true);
  });
  it('ongoing empty or return trip excludes the vehicle from the no-trip filter', () => {
    const v = buildFleetVehicles([provider], [asset], [{ id: 'return', status: 'in_progress', is_empty: true, parent_trip_id: 'loaded', tractor_id: 'a' }], NOW.getTime())[0]; if (!v) throw new Error('No device');
    expect(v.tripId).toBe('return'); expect(hasInsight(v, 'moving_without_trip', NOW.getTime())).toBe(false);
  });
  it('dangling links do not become trusted asset links', () => {
    const v = buildFleetVehicles([provider], [], [], NOW.getTime())[0]; if (!v) throw new Error('No device');
    expect(v.key).toBe('gps:gps'); expect(v.assetId).toBeNull();
  });
});