import { describe, expect, it } from 'vitest';
import { driverScreenMode } from '@/lib/driver-preview';

describe('direct administrator preview', () => {
  it('opens directly without linking the administrator to a driver', () => {
    expect(driverScreenMode(true, null, null)).toEqual({ preview: true, blocked: false });
  });
  it('previews the driver screen without acting as a linked driver', () => {
    expect(driverScreenMode(true, 'real-driver', 'driver').preview).toBe(true);
  });
  it('never uses a view selection to grant a non-administrator preview', () => {
    expect(driverScreenMode(false, null, 'driver').blocked).toBe(true);
    expect(driverScreenMode(false, 'real-driver', null).preview).toBe(false);
  });
});
