import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rows: [] as any[], writes: [] as any[], claimed: true, fetch: vi.fn() }));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: {
  from: (table: string) => {
    let update: any = null;
    const q: any = {
      select: () => q, update: (data: any) => { update = data; mocks.writes.push({ table, data }); return q; },
      eq: () => q, in: () => q, lt: () => q, lte: () => q, order: () => q, limit: () => q,
      maybeSingle: async () => ({ data: table === 'tasks' ? { status: 'assigned', assignee_id: 'employee' } : { phone: '+966500000001' }, error: null }),
      then: (resolve: any) => resolve({ data: update ? null : mocks.rows, error: null }),
    };
    return q;
  },
  rpc: async () => ({ data: mocks.claimed ? [{}] : [], error: null }),
} }));
import { processTaskNotifications } from '@/lib/task-notifications.server';
describe('durable task send', () => {
  beforeEach(() => {
    vi.stubEnv('WHATSAPP_SERVER_URL', 'https://test.invalid'); vi.stubEnv('WHATSAPP_INSTANCE', 'test'); vi.stubEnv('WHATSAPP_SERVER_KEY', 'test-key');
    mocks.rows = [{ id: 'notification', task_id: 'task', recipient_id: 'employee', event: 'assigned', payload: { title: 'Inspection', priority: 'urgent' } }];
    mocks.writes = []; mocks.claimed = true; mocks.fetch.mockReset(); vi.stubGlobal('fetch', mocks.fetch);
  });
  it('persists provider message ID before reporting acceptance', async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ key: { id: 'provider-123' } })));
    expect((await processTaskNotifications()).sent).toBe(1);
    expect(mocks.writes.some(w => w.table === 'task_notifications' && w.data.provider_id === 'provider-123' && w.data.state === 'accepted')).toBe(true);
  });
  it('does not send when another invocation already claimed the event', async () => {
    mocks.claimed = false;
    expect((await processTaskNotifications()).sent).toBe(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it('retains timeouts as unresolved instead of blindly retrying', async () => {
    mocks.fetch.mockRejectedValue(new Error('timeout'));
    expect((await processTaskNotifications()).sent).toBe(0);
    expect(mocks.writes.some(w => w.data.state === 'unresolved' && w.data.error === 'timeout')).toBe(true);
  });
});