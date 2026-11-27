import { afterEach, describe, expect, it, vi } from 'vitest';
const real = vi.hoisted(() => ({ from: vi.fn(() => 'real-read'), rpc: vi.fn(() => 'real-rpc'), getUser: vi.fn(), storage: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: real.from, rpc: real.rpc, auth: { getUser: real.getUser }, storage: { from: real.storage } } }));
import { db, uploadFile, signedUrl } from '../lib/db';
import { activatePresentation, PresentationRuntime } from '../lib/presentation-runtime';
import { findDemoRole } from '../lib/presentation-demo';
afterEach(() => { window.history.replaceState({}, '', '/'); vi.clearAllMocks(); });
describe('data and file boundary for identical presentation screens', () => {
  it('forwards ordinary pages to the original client', () => {
    window.history.replaceState({}, '', '/representative');
    expect(db.from('customers')).toBe('real-read'); expect(db.rpc('chat_directory')).toBe('real-rpc');
  });
  it('uses only synthetic rows and local files on demo, even with a real client available', async () => {
    const role = findDemoRole('900010'); if (!role) throw new Error('Missing role');
    const runtime = new PresentationRuntime(role); const release = activatePresentation(runtime);
    window.history.replaceState({}, '', '/demo?number=%22900010%22');
    const result = await db.from('customers').select('*'); expect(result.data[0]?.name).toBe('عميل العرض الأول');
    await db.from('customer_requests').insert({ cargo_type: 'حديد', customer_id: 'sample-customer' });
    expect(runtime.rows('customer_requests')).toHaveLength(2);
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:local-presentation');
    const path = await uploadFile(new File(['%PDF-1.4'], 'sample.pdf', { type: 'application/pdf' }), 'my-documents');
    expect(await signedUrl(path)).toBe('blob:local-presentation');
    expect(real.from).not.toHaveBeenCalled(); expect(real.rpc).not.toHaveBeenCalled(); expect(real.getUser).not.toHaveBeenCalled(); expect(real.storage).not.toHaveBeenCalled();
    create.mockRestore(); release();
  });
  it('fails closed before runtime activation or for a different role code', () => {
    window.history.replaceState({}, '', '/demo?number=900003');
    expect(() => db.from('customers')).toThrow('تجربة الشرح غير جاهزة'); expect(real.from).not.toHaveBeenCalled();
  });
});