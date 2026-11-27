import { findDemoRole, type DemoRole } from './presentation-demo';

export type SampleRow = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export const presentationHome = (role: DemoRole): string => role.role === 'driver' ? '/driver' : role.role === 'representative' ? '/representative' : ['workshop', 'field_maintenance'].includes(role.role) ? '/repair-center' : role.role === 'employee' ? '/tasks' : '/';
export const presentationKey = (code: string) => `shata-real-screens-v1:${code}`;
let active: PresentationRuntime | null = null;
export function isPresentationLocation() { return typeof window !== 'undefined' && window.location.pathname === '/demo'; }
export function getPresentationRuntime() {
  if (!isPresentationLocation()) return null;
  const raw = new URLSearchParams(window.location.search).get('number') ?? '';
  let number = raw;
  try { const parsed = JSON.parse(raw); if (typeof parsed === 'string' || typeof parsed === 'number') number = String(parsed); } catch { /* plain identifier */ }
  const role = findDemoRole(number);
  return role && active?.role.code === role.code ? active : null;
}
export function activatePresentation(runtime: PresentationRuntime) { active = runtime; return () => { if (active === runtime) active = null; }; }

function seed(role: DemoRole): Record<string, SampleRow[]> {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);
  const uid = `sample-user-${role.code}`;
  const driver = { id: 'sample-driver', user_id: role.role === 'driver' ? uid : null, code: 'DRV-001', full_name: 'سائق العرض', status: 'available', national_id: 'مثال توضيحي', license_no: 'مثال توضيحي', license_expiry: '2027-12-31', nationality: 'السعودية', phone: null };
  const customer = { id: 'sample-customer', name: 'عميل العرض الأول', city: 'الرياض', contact_name: 'مسؤول العرض', phone: null, created_by: uid, created_at: now, payment_terms_days: 30 };
  const tractor = { id: 'sample-tractor', code: 'TRK-014', plate: 'مثال ١٤', kind: 'tractor', status: 'available', make_model: 'شاحنة العرض', location_text: 'الرياض', last_lat: 24.7136, last_lng: 46.6753, odometer_km: 45000, last_position_at: now };
  const trailer = { ...tractor, id: 'sample-trailer', code: 'TRL-022', kind: 'trailer', plate: 'مثال ٢٢' };
  const order = { id: 'sample-order', number: 'ORD-TEST-001', customer_id: customer.id, customer, cargo_type: 'مواد بناء', quantity: 12, unit: 'طن', weight_kg: 12000, status: 'confirmed', delivery_due_at: `${today}T23:00:00Z`, origin_city: 'الرياض', dest_city: 'الدمام' };
  const trip = { id: 'sample-trip', number: 'TRP-TEST-001', driver_id: driver.id, driver, tractor_id: tractor.id, tractor, trailer_id: trailer.id, trailer, order_id: order.id, order, status: 'in_progress', stage: 'departed', origin_city: 'الرياض', dest_city: 'الدمام', pickup_name: 'مستودع العرض', delivery_name: 'موقع التسليم', distance_km: 410, cargo_type: order.cargo_type, quantity: 12, unit: 'طن', tractor_code: tractor.code, trailer_code: trailer.code, consignee: customer.name, order_number: order.number, planned_start: now, planned_end: `${today}T23:00:00Z`, actual_start: now, created_at: now };
  const profile = { id: uid, full_name: role.name, phone: null, created_at: now, branch: { name: 'فرع العرض' } };
  return {
    profiles: [profile, { id: 'sample-colleague', full_name: 'موظف العرض', phone: null, created_at: now }],
    user_roles: [{ user_id: uid, role: role.role }, { user_id: 'sample-colleague', role: 'field_maintenance' }],
    drivers: [driver], customers: [customer], assets: [tractor, trailer], transport_orders: [order], trips: [trip],
    locations: [{ id: 'sample-pickup', name: 'مستودع العرض', city: 'الرياض', customer_id: customer.id, lat: 24.7136, lng: 46.6753 }, { id: 'sample-delivery', name: 'موقع التسليم', city: 'الدمام', lat: 26.4207, lng: 50.0888 }],
    customer_requests: [{ id: 'sample-request', number: 'REQ-TEST-001', customer_id: customer.id, pickup_location_id: 'sample-pickup', cargo_type: 'مواد بناء', quantity: 12, unit: 'طن', status: 'new', created_by: uid, created_at: now }],
    tasks: [{ id: 'sample-task', title: 'مراجعة مستندات المركبة', description: 'تكليف توضيحي للشرح', assignee_id: uid, assigned_by: 'sample-colleague', status: 'assigned', priority: 'normal', created_at: now, due_at: `${today}T23:00:00Z` }, { id: 'sample-review-task', title: 'فحص المركبة', assignee_id: 'sample-colleague', assigned_by: uid, status: 'submitted', priority: 'urgent', created_at: now }],
    custody: [{ id: 'sample-custody', asset_id: tractor.id, asset: tractor, driver_id: driver.id, driver, acknowledged: false, closed_at: null, created_at: now }],
    expenses: [{ id: 'sample-expense', driver_id: driver.id, driver, trip_id: trip.id, category: 'رسوم طرق', description: 'مصروف العرض', amount: 35, status: 'pending', spent_at: now }],
    invoices: [{ id: 'sample-invoice', number: 'INV-TEST-001', customer_id: customer.id, customer, total: 5750, subtotal: 5000, vat_amount: 750, status: 'approved', issued_at: today, due_at: today, alloc: [] }],
    payments: [{ id: 'sample-payment', customer_id: customer.id, customer, amount: 1000, paid_at: today }], advances: [{ id: 'sample-advance', driver, driver_id: driver.id, amount: 500, balance: 500, status: 'open', issued_at: now }],
    work_orders: [{ id: 'sample-work', number: 'WO-TEST-001', asset_id: tractor.id, asset: tractor, description: 'فحص الإطارات والفرامل', status: 'open', workflow_status: 'assigned', workshop_id: 'sample-workshop', assignee_id: uid, approved_budget: 750, estimate: 750, opened_at: now, photo_paths: [] }],
    workshops: [{ id: 'sample-workshop', name: 'ورشة العرض', user_id: uid, archived_at: null, phone: null }],
    parts: [{ id: 'sample-part', name: 'إطار شاحنة', qty_on_hand: 2, reorder_level: 3 }],
    maintenance_plans: [], inspections: [], documents: [], notifications: [], task_notifications: [], maintenance_history: [], trip_events: [{ id: 'sample-event', trip_id: trip.id, event_type: 'departed', occurred_at: now }],
    trip_financials: ['owner', 'ops_manager', 'accountant'].includes(role.role) ? [{ trip_id: trip.id, revenue: 5000, est_cost: 1500, carrier_cost: 0 }] : [],
    chat_messages: [{ id: 'sample-message', sender_id: 'sample-colleague', sender_name: 'موظف العرض', recipient_id: null, body: 'مرحبًا، يرجى مراجعة التكليفات الجديدة.', created_at: now }],
    trip_stops: [{ id: 'sample-stop', trip_id: trip.id, seq: 1, name: 'موقع التسليم', city: 'الدمام', lat: 26.4207, lng: 50.0888, notes: null, status: 'pending', done_at: null }],
    company_settings: [{ id: 1, name: 'Shata', doc_required_driver: ['الإقامة', 'رخصة القيادة', 'بطاقة السائق'] }],
  };
}

/** Browser-only synthetic store. It has no network, credentials or production clients. */
export class PresentationRuntime {
  tables: Record<string, SampleRow[]>;
  readonly uid: string;
  readonly files = new Map<string, string>();
  constructor(readonly role: DemoRole, private storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.uid = `sample-user-${role.code}`;
    this.tables = seed(role);
    try { const saved = JSON.parse(storage?.getItem(presentationKey(role.code)) ?? 'null'); if (saved?.code === role.code && saved.version === 1 && saved.tables && Object.values(saved.tables).every(Array.isArray)) this.tables = saved.tables; } catch { /* fresh examples */ }
  }
  persist() { try { this.storage?.setItem(presentationKey(this.role.code), JSON.stringify({ version: 1, code: this.role.code, tables: this.tables })); } catch { /* memory remains usable */ } }
  reset() { this.files.forEach(url => URL.revokeObjectURL(url)); this.files.clear(); this.tables = seed(this.role); this.persist(); }
  from(table: string) { return new SampleQuery(this, table); }
  rows(table: string) { return this.tables[table] ?? []; }
  join(row: SampleRow) {
    const find = (table: string, id: unknown) => this.rows(table).find(x => x.id === id);
    return { ...row, ...(row.customer_id ? { customer: find('customers', row.customer_id) } : {}), ...(row.pickup_location_id ? { pickup: find('locations', row.pickup_location_id) } : {}), ...(row.workshop_id ? { workshop_entity: find('workshops', row.workshop_id) } : {}) };
  }
  async rpc(name: string, p: SampleRow = {}) {
    const ok = (data: unknown = null) => { this.persist(); return { data, error: null }; };
    const fail = (message: string) => ({ data: null, error: { message } });
    if (name === 'driver_my_trips' || name === 'driver_trips_for') return ok(this.rows('trips'));
    if (name === 'driver_trip_plan') {
      const trip = this.rows('trips').find(x => x.id === p.p_trip_id);
      if (!trip) return fail('الرحلة غير موجودة');
      return ok({ origin: { name: 'مستودع العرض', city: 'الرياض', lat: 24.7136, lng: 46.6753 }, dest: { name: 'موقع التسليم', city: 'الدمام', lat: 26.4207, lng: 50.0888 }, origin_city: trip.origin_city, dest_city: trip.dest_city, stops: this.rows('trip_stops').filter(x => x.trip_id === trip.id), alerts: [], route: { points: [[24.7136, 46.6753], [26.4207, 50.0888]], distance_km: 410, duration_min: 300, provider: 'straight', computed_at: new Date().toISOString() } });
    }
    if (name === 'driver_stop_update') { const stop = this.rows('trip_stops').find(x => x.id === p.p_stop_id); if (!stop) return fail('النقطة غير موجودة'); stop.status = p.p_status; stop.done_at = p.p_status === 'done' ? new Date().toISOString() : null; return ok(); }
    if (name === 'chat_directory') return ok(this.rows('profiles').map(x => ({ ...x, role: this.rows('user_roles').find(r => r.user_id === x.id)?.role ?? 'employee' })));
    if (name === 'record_trip_event') {
      const trip = this.rows('trips').find(x => x.id === p.p_trip_id);
      if (!trip) return fail('الرحلة غير موجودة في التجربة');
      trip.stage = p.p_event_type;
      this.tables['trip_events'] = [{ id: crypto.randomUUID(), trip_id: trip.id, event_type: p.p_event_type, occurred_at: new Date().toISOString() }, ...this.rows('trip_events')];
      return ok();
    }
    if (name === 'task_submit' || name === 'task_review') {
      const task = this.rows('tasks').find(x => x.id === p.p_id);
      if (!task) return fail('المهمة غير موجودة');
      if (name === 'task_submit') { if (task.assignee_id !== this.uid || task.status !== 'assigned') return fail('المهمة ليست مكلّفة لك'); task.status = 'submitted'; task.done_note = p.p_note; }
      else { if (!['owner', 'ops_manager'].includes(this.role.role) || task.assignee_id === this.uid || task.status !== 'submitted') return fail('لا يمكن اعتماد المهمة'); task.status = p.p_approve ? 'completed' : 'assigned'; task.review_note = p.p_note; }
      return ok();
    }
    if (name === 'maintenance_request') {
      const id = crypto.randomUUID(); this.tables['work_orders'] = [{ id, number: `WO-TEST-${this.rows('work_orders').length + 1}`, asset_id: p.p_asset_id, asset: this.rows('assets').find(x => x.id === p.p_asset_id), description: p.p_description, workflow_status: 'new', status: 'open', opened_at: new Date().toISOString(), photo_paths: [] }, ...this.rows('work_orders')]; return ok(id);
    }
    if (name === 'maintenance_details' || name === 'maintenance_transition') {
      const row = this.rows('work_orders').find(x => x.id === p.p_id); if (!row) return fail('الأمر غير موجود');
      if (name === 'maintenance_details') Object.assign(row, { diagnosis: p.p_diagnosis, estimate: p.p_estimate, labor_cost: p.p_labor, vendor_invoice_ref: p.p_invoice });
      else { row.workflow_status = p.p_target; this.tables['maintenance_history'] = [{ id: crypto.randomUUID(), work_order_id: row.id, to_status: p.p_target, note: p.p_note, at: new Date().toISOString() }, ...this.rows('maintenance_history')]; }
      return ok();
    }
    if (name === 'submit_delivery') { const trip = this.rows('trips').find(x => x.id === p.p_trip_id); if (!trip) return fail('الرحلة غير موجودة'); trip.status = 'delivered'; trip.stage = 'delivered'; return ok(); }
    // Unimplemented operations fail closed; never report a fictitious successful service call.
    return fail('هذا الإجراء غير متاح في تجربة الشرح؛ لم يتغير أي سجل حقيقي');
  }
}

class SampleQuery implements PromiseLike<{ data: any; error: unknown; count: number }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  private filters: ((row: SampleRow) => boolean)[] = [];
  private mode = 'read'; private payload: SampleRow[] = []; private one = false; private max = Infinity; private head = false;
  constructor(private runtime: PresentationRuntime, private table: string) {}
  select(_columns = '*', options?: { head?: boolean }) { this.head = !!options?.head; return this; }
  insert(value: SampleRow | SampleRow[]) { this.mode = 'insert'; this.payload = Array.isArray(value) ? value : [value]; return this; }
  update(value: SampleRow) { this.mode = 'update'; this.payload = [value]; return this; }
  delete() { this.mode = 'delete'; return this; }
  upsert(value: SampleRow | SampleRow[]) { return this.insert(value); }
  eq(k: string, v: unknown) { this.filters.push(r => r[k] === v); return this; }
  neq(k: string, v: unknown) { this.filters.push(r => r[k] !== v); return this; }
  is(k: string, v: unknown) { this.filters.push(r => (r[k] ?? null) === v); return this; }
  in(k: string, v: unknown[]) { this.filters.push(r => v.includes(r[k])); return this; }
  not(k: string, _op: string, v: string) { return this.invert(k, v.replace(/[()]/g, '').split(',')); }
  private invert(k: string, values: string[]) { this.filters.push(r => !values.includes(r[k])); return this; }
  lte(k: string, v: any) { this.filters.push(r => r[k] != null && r[k] <= v); return this; }
  gte(k: string, v: any) { this.filters.push(r => r[k] != null && r[k] >= v); return this; }
  lt(k: string, v: any) { this.filters.push(r => r[k] != null && r[k] < v); return this; }
  gt(k: string, v: any) { this.filters.push(r => r[k] != null && r[k] > v); return this; }
  order(_key: string, _options?: unknown) { return this; }
  limit(n: number) { this.max = n; return this; }
  range(_start: number, end: number) { this.max = end + 1; return this; }
  or(_filter: string) { return this; }
  single() { this.one = true; return this; }
  maybeSingle() { this.one = true; return this; }
  then<TResult1 = { data: any; error: unknown; count: number }, TResult2 = never>(onfulfilled?: ((value: { data: any; error: unknown; count: number }) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> {
    const all = this.runtime.rows(this.table);
    let rows = all.filter(r => this.filters.every(f => f(r)));
    if (this.mode === 'insert') { rows = this.payload.map(p => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), created_by: this.runtime.uid, sender_id: this.runtime.uid, assigned_by: this.runtime.uid, number: `TEST-${all.length + 1}`, status: this.table === 'tasks' ? 'assigned' : this.table === 'customer_requests' ? 'new' : 'pending', ...p, ...(this.table === 'documents' ? { review_status: 'pending' } : {}) })); this.runtime.tables[this.table] = [...rows, ...all]; }
    if (this.mode === 'update') rows.forEach(r => Object.assign(r, this.payload[0]));
    if (this.mode === 'delete') this.runtime.tables[this.table] = all.filter(r => !rows.includes(r));
    if (this.mode !== 'read') this.runtime.persist();
    const count = rows.length; const result = rows.slice(0, this.max).map(r => this.runtime.join(r));
    return Promise.resolve({ data: this.head ? null : this.one ? result[0] ?? null : result, error: null, count }).then(onfulfilled, onrejected);
  }
}