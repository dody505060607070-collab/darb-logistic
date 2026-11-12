import { describe, expect, it } from 'vitest';
import { claimRouteReload, isStaleRouteError, ROUTE_RECOVERY_SCRIPT } from '@/lib/route-recovery';

describe('route import recovery', () => {
  it('recognizes the reported missing lazy route component', () => {
    const error = new TypeError("Cannot read properties of undefined (reading 'component')");
    error.stack = 'TypeError at /assets/lazyRouteComponent-B15VuXOF.js:1:5031';
    expect(isStaleRouteError(error)).toBe(true);
    error.stack = 'at expenseCalculation';
    expect(isStaleRouteError(error)).toBe(false);
  });
  it('allows one automatic recovery per page without a reload loop', () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    expect(claimRouteReload(storage, '/orders')).toBe(true);
    expect(claimRouteReload(storage, '/orders')).toBe(false);
    expect(claimRouteReload(storage, '/trips')).toBe(true);
  });
  it('handles inaccessible browser storage without triggering a loop', () => {
    expect(claimRouteReload({ getItem: () => { throw new Error('blocked'); }, setItem: () => {} }, '/orders')).toBe(false);
  });
  it('installs an executable early error handler for the reported trace', () => {
    const handlers: Record<string, (event: any) => void> = {};
    const values = new Map<string, string>();
    let reloads = 0;
    new Function('window', 'sessionStorage', 'location', ROUTE_RECOVERY_SCRIPT)(
      { addEventListener: (name: string, handler: (event: any) => void) => { handlers[name] = handler; } },
      { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) },
      { pathname: '/orders', reload: () => { reloads++; } },
    );
    const event = { error: { message: "Cannot read properties of undefined (reading 'component')", stack: 'at /assets/lazyRouteComponent-B15VuXOF.js:1:5031' } };
    handlers.error?.(event);
    handlers.error?.(event);
    expect(reloads).toBe(1);
  });
});