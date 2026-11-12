import { describe, expect, it } from 'vitest';
import { arrangementKey, moveCard, reconcileCardOrder } from '@/lib/card-arrangement';

describe('card arrangement', () => {
  it('keeps saved arrangement while adding new cards and removing missing cards', () => {
    expect(reconcileCardOrder(['completed', 'total', 'removed'], ['total', 'draft', 'completed'])).toEqual(['completed', 'total', 'draft']);
  });
  it('moves a card without dropping or duplicating other cards', () => {
    expect(moveCard(['total', 'draft', 'confirmed'], 'total', 'confirmed')).toEqual(['draft', 'confirmed', 'total']);
    expect(moveCard(['total', 'draft'], 'unknown', 'draft')).toEqual(['total', 'draft']);
  });
  it('isolates saved layouts by account and page', () => {
    expect(arrangementKey('driver-1', '/orders')).not.toBe(arrangementKey('driver-2', '/orders'));
    expect(arrangementKey('driver-1', '/orders')).not.toBe(arrangementKey('driver-1', '/trips'));
  });
});