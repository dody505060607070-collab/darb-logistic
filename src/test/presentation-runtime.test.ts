import { afterEach, describe, expect, it } from 'vitest';
import { activatePresentation, getPresentationRuntime, PresentationRuntime, presentationHome, presentationKey } from '../lib/presentation-runtime';
import { findDemoRole } from '../lib/presentation-demo';

function role(code: string) { const value = findDemoRole(code); if (!value) throw new Error('Unknown presentation code'); return value; }
afterEach(() => { window.history.replaceState({}, '', '/'); });
describe('real-screen presentation isolation', () => {
  it('maps all 11 codes to the actual role landing screens, with tasks for employee', () => {
    expect(Array.from({ length: 11 }, (_, i) => presentationHome(role(String(900001 + i))))).toEqual(['/', '/', '/', '/', '/', '/', '/repair-center', '/repair-center', '/driver', '/representative', '/tasks']);
  });
  it('handles both direct links and router-serialized quoted codes', () => {
    const runtime = new PresentationRuntime(role('900010')); const release = activatePresentation(runtime);
    window.history.replaceState({}, '', '/demo?number=900010'); expect(getPresentationRuntime()).toBe(runtime);
    window.history.replaceState({}, '', '/demo?number=%22900010%22'); expect(getPresentationRuntime()).toBe(runtime);
    window.history.replaceState({}, '', '/demo?number=900009'); expect(getPresentationRuntime()).toBeNull();
    window.history.replaceState({}, '', '/representative'); expect(getPresentationRuntime()).toBeNull(); release();
  });
  it('persists a representative request with the same related customer/location and restores only its code', async () => {
    const saved = new Map<string, string>(); const keys: string[] = [];
    const storage = { getItem: (key: string) => { keys.push(key); return saved.get(key) ?? null; }, setItem: (key: string, value: string) => { saved.set(key, value); } };
    const runtime = new PresentationRuntime(role('900010'), storage);
    await runtime.from('customer_requests').insert({ customer_id: 'sample-customer', pickup_location_id: 'sample-pickup', cargo_type: 'حديد', quantity: 12, unit: 'طن' });
    const restored = new PresentationRuntime(role('900010'), storage);
    const result = await restored.from('customer_requests').select('*').eq('created_by', restored.uid);
    expect(result.data).toHaveLength(2); expect(result.data[0]?.customer.name).toBe('عميل العرض الأول'); expect(result.data[0]?.pickup.name).toBe('مستودع العرض'); expect(result.data[0]?.quantity).toBe(12);
    expect(new PresentationRuntime(role('900009'), storage).rows('customer_requests')).toHaveLength(1);
    expect(keys).toEqual([presentationKey('900010'), presentationKey('900010'), presentationKey('900009')]);
    restored.reset(); expect(restored.rows('customer_requests')).toHaveLength(1);
  });
  it('self documents always wait for review', async () => {
    const runtime = new PresentationRuntime(role('900011'));
    await runtime.from('documents').insert({ doc_type: 'الإقامة', entity_id: runtime.uid, review_status: 'approved' });
    expect(runtime.rows('documents')[0]?.review_status).toBe('pending');
  });
  it('does not permit employee or self task approval', async () => {
    const runtime = new PresentationRuntime(role('900011'));
    expect((await runtime.rpc('task_submit', { p_id: 'sample-task', p_note: 'أنجزت' })).error).toBeNull();
    expect(runtime.rows('tasks')[0]?.status).toBe('submitted');
    expect((await runtime.rpc('task_review', { p_id: 'sample-task', p_approve: true })).error).not.toBeNull();
    const owner = new PresentationRuntime(role('900001'));
    expect((await owner.rpc('task_review', { p_id: 'sample-review-task', p_approve: true })).error).toBeNull();
    expect(owner.rows('tasks')[1]?.status).toBe('completed');
  });
  it('unsupported service actions fail without changing any local row', async () => {
    const runtime = new PresentationRuntime(role('900001')); const before = JSON.stringify(runtime.tables);
    const result = await runtime.rpc('delete_employee', { p_id: 'sample-colleague' });
    expect(result.error).not.toBeNull(); expect(JSON.stringify(runtime.tables)).toBe(before);
  });
});