import { describe, expect, it } from 'vitest';
import { distanceToRouteM, googleMapsDirections, offRouteState, orderNearestFirst, stoppedMinutes } from '@/lib/route-plan';
import { withWhatsAppLinks } from '@/lib/wa-links';

const riyadh = { lat: 24.7136, lng: 46.6753 };
const kharj = { id: 'kharj', lat: 24.1556, lng: 47.3346 };
const dammam = { id: 'dammam', lat: 26.4207, lng: 50.0888 };
const jubail = { id: 'jubail', lat: 27.0046, lng: 49.6460 };

describe('multi-stop ordering', () => {
  it('visits drop-offs nearest first from the pickup', () => {
    expect(orderNearestFirst(riyadh, [jubail, dammam, kharj]).map((s) => s.id)).toEqual(['kharj', 'dammam', 'jubail']);
  });
  it('google maps link passes the stops in order with the last as destination', () => {
    const url = new URL(googleMapsDirections(null, [kharj, dammam])!);
    expect(url.searchParams.get('destination')).toBe('26.420700,50.088800');
    expect(url.searchParams.get('waypoints')).toBe('24.155600,47.334600');
  });
});

describe('off-route alert', () => {
  const road: [number, number][] = [[24.7136, 46.6753], [26.4207, 50.0888]];
  it('opens beyond 3 km from the planned road', () => expect(offRouteState(3100, false)).toBe('open'));
  it('clears once back within 1.5 km', () => expect(offRouteState(1400, true)).toBe('clear'));
  it('keeps an open alert between 1.5 and 3 km', () => expect(offRouteState(2000, true)).toBe('keep'));
  it('a point on the road is 0 km away', () => expect(distanceToRouteM(riyadh, road)).toBeLessThan(1));
});

describe('stopped vehicle alert', () => {
  const now = Date.parse('2026-11-15T12:00:00Z');
  const at = (minAgo: number) => new Date(now - minAgo * 60000).toISOString();
  it('25 minutes in the same spot counts as stopped', () => {
    const pts = [0, 5, 10, 15, 20, 25].map((m) => ({ lat: 25.0, lng: 46.0 + m * 0.000001, at: at(m), speed: 0 }));
    expect(stoppedMinutes(pts, now)).toBe(25);
  });
  it('a moving truck is not stopped', () => {
    const pts = [0, 5, 10, 15, 20, 25].map((m) => ({ lat: 25.0 + m * 0.01, lng: 46.0, at: at(m), speed: 80 }));
    expect(stoppedMinutes(pts, now)).toBe(0);
  });
  it('10 minutes still is not yet an alert', () => {
    const pts = [{ lat: 25, lng: 46, at: at(0) }, { lat: 25, lng: 46, at: at(10) }, { lat: 25.1, lng: 46, at: at(12) }];
    expect(stoppedMinutes(pts, now)).toBe(0);
  });
});

describe('WhatsApp tap-to-chat links', () => {
  it('adds a wa.me link for the driver phone in a notice', () => {
    expect(withWhatsAppLinks('السائق: خالد\nجوال السائق: +966546466858', '966500000000')).toContain('https://wa.me/966546466858');
  });
  it('turns a Saudi 05 number into an international link', () => {
    expect(withWhatsAppLinks('اتصل على 0546466858')).toContain('https://wa.me/966546466858');
  });
  it('does not link the recipient to themselves', () => {
    expect(withWhatsAppLinks('جوالك +966546466858', '966546466858')).toBe('جوالك +966546466858');
  });
});
