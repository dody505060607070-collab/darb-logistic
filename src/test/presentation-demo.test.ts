import { describe, expect, it } from 'vitest';
import { DEMO_ROLES, canCreateDemo, demoSections, demoStorageKey, findDemoRole, loadDemo, recordActions, seedDemo, updateDemo, type DemoRecord } from '../lib/presentation-demo';

const owner = DEMO_ROLES[0];
const driver = DEMO_ROLES[8];
const employee = DEMO_ROLES[10];
const row: DemoRecord = { id: 'new-record', title: 'مهمة العرض', detail: 'تجربة معزولة', status: 'مكتملة', amount: 0, assignee: 'موظف العرض', attachment: '' };
describe('isolated presentation experiences', () => {
  it('opens each public presentation identifier without matching real phones', () => {
    expect(DEMO_ROLES).toHaveLength(11);
    for (const role of DEMO_ROLES) expect(findDemoRole(role.code)).toEqual(role);
    expect(findDemoRole('٩٠٠٠٠٩')).toEqual(driver);
    expect(findDemoRole('+201222576172')).toBeUndefined();
    expect(findDemoRole('9000091')).toBeUndefined();
  });
  it('does not expose finance sections to the driver or representative', () => {
    expect(demoSections(driver)).not.toContain('invoices');
    expect(demoSections(DEMO_ROLES[9])).not.toContain('invoices');
    expect(() => updateDemo(seedDemo(driver), driver, { type: 'create', section: 'invoices', row })).toThrow();
  });
  it('keeps edited rows and reset seeds independent per presentation number', () => {
    const initial = seedDemo(owner);
    const changed = updateDemo(initial, owner, { type: 'create', section: 'tasks', row });
    expect(changed.records.tasks).toHaveLength(3);
    expect(initial.records.tasks).toHaveLength(2);
    expect(seedDemo(employee).records.tasks).toHaveLength(2);
    expect(seedDemo(owner).records.tasks).toHaveLength(2);
    expect(demoStorageKey(owner.code)).not.toBe(demoStorageKey(employee.code));
    expect(() => updateDemo(changed, employee, { type: 'create', section: 'tasks', row })).toThrow();
  });
  it('restores only the selected presentation storage key, never a real session', () => {
    const saved = updateDemo(seedDemo(owner), owner, { type: 'create', section: 'tasks', row });
    const keys: string[] = [];
    const storage = { getItem: (key: string) => { keys.push(key); return JSON.stringify(saved); } };
    expect(loadDemo(storage, owner).records.tasks).toHaveLength(3);
    expect(loadDemo(storage, driver).records.tasks).toHaveLength(2);
    expect(keys).toEqual([demoStorageKey('900001'), demoStorageKey('900009')]);
  });
  it('prevents employee self-approval while allowing submission', () => {
    const pending = updateDemo(seedDemo(employee), employee, { type: 'transition', section: 'tasks', id: 'task-1', next: 'بانتظار المراجعة', note: 'أُنجز الفحص' });
    expect(pending.records.tasks.find(r => r.id === 'task-1')?.status).toBe('بانتظار المراجعة');
    expect(() => updateDemo(pending, employee, { type: 'transition', section: 'tasks', id: 'task-1', next: 'مكتملة', note: 'اعتماد ذاتي' })).toThrow();
    expect(canCreateDemo(employee, 'tasks')).toBe(false);
  });
  it('requires inspection before starting the demo trip and delivery after arrival', () => {
    let state = seedDemo(driver);
    expect(() => updateDemo(state, driver, { type: 'transition', section: 'trips', id: 'trip-1', next: 'في الطريق', note: 'تجاوز الفحص' })).toThrow();
    for (const next of ['جاهزة للانطلاق', 'في الطريق', 'وصلت', 'مسلمة']) state = updateDemo(state, driver, { type: 'transition', section: 'trips', id: 'trip-1', next, note: 'تأكيد خطوة العرض' });
    expect(state.records.trips.find(r => r.id === 'trip-1')?.status).toBe('مسلمة');
    expect(recordActions(driver, 'trips', state.records.trips[0] ?? row)).toEqual([]);
  });
  it('forces self-uploaded documents to await review even if a caller supplies approved', () => {
    const state = updateDemo(seedDemo(employee), employee, { type: 'create', section: 'documents', row: { ...row, status: 'معتمد', attachment: 'sample.pdf' } });
    expect(state.records.documents.find(r => r.id === row.id)?.status).toBe('بانتظار المراجعة');
  });
  it('does not allow editing or deleting an approved demo invoice', () => {
    const state = seedDemo(DEMO_ROLES[4]);
    expect(() => updateDemo(state, DEMO_ROLES[4], { type: 'delete', section: 'invoices', id: 'invoice-2' })).toThrow();
    expect(() => updateDemo(state, DEMO_ROLES[4], { type: 'create', section: 'invoices', row })).toThrow('مبلغ');
  });
  it('records chat messages in the local presentation state only', () => {
    const initial = seedDemo(driver);
    const changed = updateDemo(initial, driver, { type: 'create', section: 'messages', row });
    expect(changed.records.messages[0]?.detail).toBe('تجربة معزولة');
    expect(initial.records.messages).toHaveLength(1);
  });
});