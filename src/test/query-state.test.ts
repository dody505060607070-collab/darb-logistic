import { describe, expect, it } from 'vitest';
import { queryState } from '@/lib/query-state';
import { pendingCustody } from '@/lib/home-summary';

describe('custody and inspection query states', () => {
  it('initial custody and inspection results are unknown, not zero', () => {
    expect(queryState({ isFetching: true })).toEqual({ loaded: false, pending: true, failed: false, refreshing: false });
  });
  it('initial error cannot produce a successful empty state', () => {
    expect(queryState({ error: new Error('offline'), isFetching: false })).toEqual({ loaded: false, pending: false, failed: true, refreshing: false });
  });
  it('only a successful empty response establishes zero', () => {
    expect(queryState({ data: [], isFetching: false })).toEqual({ loaded: true, pending: false, failed: false, refreshing: false });
  });
  it('keeps the previous valid list during refresh and refresh failure', () => {
    const data = [{ id: 'pending', acknowledged: false, closed_at: null }, { id: 'done', acknowledged: true, closed_at: null }];
    expect(queryState({ data, isFetching: true }).refreshing).toBe(true);
    expect(queryState({ data, error: new Error('offline'), isFetching: false }).loaded).toBe(true);
    expect(pendingCustody(data).map(x => x.id)).toEqual(['pending']);
  });
  it('inspection success must not mark custody pending or failed as empty', () => {
    expect(queryState({ data: [], isFetching: false }).loaded).toBe(true);
    expect(queryState({ isFetching: true }).loaded).toBe(false);
    expect(queryState({ error: 'custody failed', isFetching: false }).loaded).toBe(false);
  });
});