/** Public presentation identifiers, NOT phone numbers, credentials or application roles. */
export const DEMO_ROLES = [
  { code: '900001', role: 'owner', label: 'المدير العام', name: 'مدير العرض', sections: ['approvals', 'trips', 'tasks', 'fleet', 'invoices'] },
  { code: '900002', role: 'ops_manager', label: 'مدير التشغيل', name: 'مدير التشغيل التجريبي', sections: ['trips', 'requests', 'approvals', 'tasks'] },
  { code: '900003', role: 'dispatcher', label: 'موظف الحركة', name: 'موظف الحركة التجريبي', sections: ['trips', 'requests', 'fleet', 'tasks'] },
  { code: '900004', role: 'fleet_supervisor', label: 'مشرف الأسطول', name: 'مشرف الأسطول التجريبي', sections: ['fleet', 'custody', 'work', 'tasks'] },
  { code: '900005', role: 'accountant', label: 'المحاسب', name: 'المحاسب التجريبي', sections: ['invoices', 'expenses', 'approvals', 'tasks'] },
  { code: '900006', role: 'maintenance', label: 'مسؤول الصيانة', name: 'مسؤول الصيانة التجريبي', sections: ['work', 'approvals', 'fleet', 'tasks'] },
  { code: '900007', role: 'field_maintenance', label: 'الصيانة الميدانية', name: 'فني الميدان التجريبي', sections: ['work', 'expenses', 'tasks'] },
  { code: '900008', role: 'workshop', label: 'الورشة', name: 'مسؤول الورشة التجريبي', sections: ['work', 'expenses', 'tasks'] },
  { code: '900009', role: 'driver', label: 'السائق', name: 'سائق العرض', sections: ['trips', 'custody', 'expenses', 'tasks'] },
  { code: '900010', role: 'representative', label: 'المندوب', name: 'مندوب العرض', sections: ['requests', 'clients', 'tasks'] },
  { code: '900011', role: 'employee', label: 'الموظف', name: 'موظف العرض', sections: ['tasks', 'documents'] },
] as const;
export type DemoRole = typeof DEMO_ROLES[number];
export type DemoSection = 'approvals' | 'trips' | 'tasks' | 'fleet' | 'invoices' | 'requests' | 'custody' | 'work' | 'expenses' | 'clients' | 'documents' | 'messages';
export type DemoRecord = { id: string; title: string; detail: string; status: string; amount: number; assignee: string; attachment: string };
export type DemoState = { version: 1; code: string; records: Record<DemoSection, DemoRecord[]>; activity: string[] };
export const SECTION_LABELS: Record<DemoSection, string> = {
  approvals: 'الموافقات', trips: 'الرحلات', tasks: 'المهام', fleet: 'الأسطول', invoices: 'الفواتير',
  requests: 'طلبات النقل', custody: 'العهد', work: 'الصيانة', expenses: 'المصروفات', clients: 'العملاء', documents: 'مستنداتي', messages: 'المحادثة',
};
export function findDemoRole(number: string): DemoRole | undefined {
  const digits = number.trim().replace(/[٠-٩]/g, c => String(c.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, c => String(c.charCodeAt(0) - 1776));
  return DEMO_ROLES.find(r => r.code === digits);
}
export function demoSections(role: DemoRole): DemoSection[] {
  return [...new Set<DemoSection>([...role.sections, 'documents', 'messages'])];
}
export const demoStorageKey = (code: string) => `shata-presentation-v1:${code}`;
const record = (id: string, title: string, detail: string, status: string, amount = 0, assignee = 'موظف العرض'): DemoRecord => ({ id, title, detail, status, amount, assignee, attachment: '' });
export function seedDemo(role: DemoRole): DemoState {
  return { version: 1, code: role.code, activity: ['بدء تجربة جديدة'], records: {
    approvals: [record('approval-1', 'اعتماد طلب صيانة', 'تبديل إطار — مركبة عرض 014', 'بانتظار المراجعة', 750), record('approval-2', 'مراجعة مهمة مكتملة', 'فحص مستندات المركبات', 'بانتظار المراجعة')],
    trips: [record('trip-1', 'رحلة عرض 001 · الرياض ← الدمام', 'حمولة مواد بناء · مركبة عرض 014 · 410 كم', 'جاهزة للفحص', 0, 'سائق العرض'), record('trip-2', 'رحلة عرض 002 · جدة ← مكة', 'بضائع عامة · مركبة عرض 022 · 85 كم', 'مخططة', 0, 'سائق العرض')],
    tasks: [record('task-1', 'مراجعة مستندات المركبة', 'تكليف عادي · موعد التسليم اليوم', 'قيد التنفيذ'), record('task-2', 'رفع تقرير نهاية اليوم', 'تكليف عاجل · موعد التسليم اليوم', 'قيد التنفيذ')],
    fleet: [record('fleet-1', 'مركبة عرض 014', 'شاحنة · الرياض · موقع توضيحي وليس تتبعًا حيًا', 'متاحة'), record('fleet-2', 'مركبة عرض 022', 'دينا · الدمام · موقع توضيحي وليس تتبعًا حيًا', 'في الصيانة')],
    invoices: [record('invoice-1', 'فاتورة عرض 001', 'عميل العرض الأول · رحلة الرياض — الدمام', 'مسودة', 5000), record('invoice-2', 'فاتورة عرض 002', 'عميل العرض الثاني · رحلة جدة — مكة', 'معتمدة', 1800)],
    requests: [record('request-1', 'طلب نقل · الرياض ← الدمام', 'عميل العرض الأول · مواد بناء · 12 طن', 'جديد'), record('request-2', 'طلب نقل · جدة ← مكة', 'عميل العرض الثاني · بضائع عامة · 4 طن', 'محول لأمر')],
    custody: [record('custody-1', 'عهدة مركبة عرض 014', 'تسليم مركبة مع مفاتيح ومثلث سلامة وطفاية', 'بانتظار إقرار الاستلام'), record('custody-2', 'عهدة أدوات السلامة', 'سترة وخوذة وصندوق إسعافات', 'مستلمة')],
    work: [record('work-1', 'أمر صيانة عرض 001', 'مركبة عرض 022 · تبديل إطار · ورشة العرض', 'معتمد', 750), record('work-2', 'بلاغ فحص الفرامل', 'مركبة عرض 014 · فحص دوري', 'بانتظار المراجعة', 450)],
    expenses: [record('expense-1', 'وقود رحلة العرض', 'مركبة عرض 014 · 80 لتر', 'بانتظار المراجعة', 160), record('expense-2', 'موقف تحميل', 'رحلة عرض 001', 'معتمد', 35)],
    clients: [record('client-1', 'عميل العرض الأول', 'الرياض · مواد بناء · جهة اتصال توضيحية', 'نشط'), record('client-2', 'عميل العرض الثاني', 'جدة · بضائع عامة · جهة اتصال توضيحية', 'نشط')],
    documents: [record('document-1', 'رخصة القيادة — مثال', 'ملف توضيحي · انتهاء 2027/12/31', 'معتمد'), record('document-2', 'الهوية — مثال', 'ملف توضيحي · انتهاء 2028/12/31', 'بانتظار المراجعة')],
    messages: [record('message-1', 'مشرف العرض', 'مرحبًا، يرجى مراجعة التكليفات الجديدة.', 'محاكاة محلية')],
  } };
}
export function recordActions(role: DemoRole, section: DemoSection, row: DemoRecord): { label: string; next: string }[] {
  const manager = ['owner', 'ops_manager', 'maintenance', 'accountant'].includes(role.role);
  if (section === 'approvals' && manager && row.status === 'بانتظار المراجعة') return [{ label: 'اعتماد', next: 'معتمد' }, { label: 'إعادة للمراجعة', next: 'معاد للمراجعة' }];
  if (section === 'tasks' && ['قيد التنفيذ', 'معاد للمراجعة'].includes(row.status)) return [{ label: 'تقديم الإنجاز', next: 'بانتظار المراجعة' }];
  if (section === 'tasks' && manager && row.status === 'بانتظار المراجعة') return [{ label: 'اعتماد الإنجاز', next: 'مكتملة' }, { label: 'إعادة للمراجعة', next: 'معاد للمراجعة' }];
  if (section === 'trips') {
    const steps = [{ from: 'مخططة', label: 'تجهيز الرحلة', next: 'جاهزة للفحص' }, { from: 'جاهزة للفحص', label: 'إتمام الفحص', next: 'جاهزة للانطلاق' }, { from: 'جاهزة للانطلاق', label: 'بدء الرحلة', next: 'في الطريق' }, { from: 'في الطريق', label: 'تأكيد الوصول', next: 'وصلت' }, { from: 'وصلت', label: 'إثبات التسليم', next: 'مسلمة' }];
    return steps.filter(a => a.from === row.status).map(({ label, next }) => ({ label, next }));
  }
  if (section === 'work') {
    if (manager && row.status === 'بانتظار المراجعة') return [{ label: 'اعتماد الإصلاح', next: 'معتمد' }];
    if (row.status === 'معتمد') return [{ label: 'بدء الإصلاح', next: 'قيد الإصلاح' }];
    if (row.status === 'قيد الإصلاح') return [{ label: 'تقديم لإعادة الفحص', next: 'بانتظار إعادة الفحص' }];
    if (manager && row.status === 'بانتظار إعادة الفحص') return [{ label: 'اجتياز الفحص والإغلاق', next: 'مغلق' }];
  }
  if (section === 'invoices' && manager) {
    if (row.status === 'مسودة') return [{ label: 'اعتماد الفاتورة', next: 'معتمدة' }];
    if (row.status === 'معتمدة') return [{ label: 'تسجيل سداد كامل', next: 'مسددة' }];
  }
  if (section === 'expenses' && manager && row.status === 'بانتظار المراجعة') return [{ label: 'اعتماد المصروف', next: 'معتمد' }, { label: 'إعادة للمراجعة', next: 'معاد للمراجعة' }];
  if (section === 'requests' && row.status === 'جديد') return [{ label: 'تحويل لأمر نقل', next: 'محول لأمر' }];
  if (section === 'custody' && row.status === 'بانتظار إقرار الاستلام') return [{ label: 'إقرار الاستلام', next: 'مستلمة' }];
  if (section === 'custody' && row.status === 'مستلمة') return [{ label: 'طلب إعادة العهدة', next: 'بانتظار مراجعة الإعادة' }];
  return [];
}
export function canCreateDemo(role: DemoRole, section: DemoSection): boolean {
  if (!demoSections(role).includes(section)) return false;
  if (section === 'approvals' || section === 'fleet' || section === 'custody') return false;
  if (section === 'trips') return ['owner', 'ops_manager', 'dispatcher'].includes(role.role);
  if (section === 'tasks') return ['owner', 'ops_manager', 'maintenance', 'fleet_supervisor'].includes(role.role);
  return true;
}
export type DemoCommand = { type: 'create'; section: DemoSection; row: DemoRecord } | { type: 'transition'; section: DemoSection; id: string; next: string; note: string } | { type: 'edit'; section: DemoSection; row: DemoRecord } | { type: 'delete'; section: DemoSection; id: string };
export function updateDemo(state: DemoState, role: DemoRole, command: DemoCommand): DemoState {
  if (state.code !== role.code || !demoSections(role).includes(command.section)) throw new Error('هذه الصفحة ليست ضمن تجربة هذه الوظيفة');
  const section = command.section;
  let rows = state.records[section];
  let event = '';
  if (command.type === 'create' || command.type === 'edit') {
    if (!canCreateDemo(role, section)) throw new Error('هذا الإجراء غير متاح لهذه الوظيفة');
    if (!command.row.title.trim() || !command.row.detail.trim()) throw new Error('أكمل العنوان والتفاصيل');
    if (!Number.isFinite(command.row.amount) || command.row.amount < 0 || (section === 'invoices' && command.row.amount === 0)) throw new Error('أدخل مبلغًا صحيحًا');
    if (command.type === 'create') {
      if (rows.some(r => r.id === command.row.id)) throw new Error('السجل موجود بالفعل');
      const status = section === 'invoices' ? 'مسودة' : section === 'tasks' ? 'قيد التنفيذ' : section === 'requests' ? 'جديد' : section === 'clients' ? 'نشط' : section === 'trips' ? 'مخططة' : section === 'messages' ? 'محاكاة محلية' : 'بانتظار المراجعة';
      rows = [{ ...command.row, status }, ...rows];
    } else {
      const old = rows.find(r => r.id === command.row.id);
      if (!old || !['مسودة', 'جديد', 'قيد التنفيذ', 'بانتظار المراجعة', 'نشط', 'مخططة'].includes(old.status)) throw new Error('لا يمكن تعديل سجل بعد اعتماده أو بدء تنفيذه');
      rows = rows.map(r => r.id === old.id ? { ...command.row, status: old.status } : r);
    }
    event = `${command.type === 'create' ? 'إضافة' : 'تعديل'}: ${command.row.title}`;
  } else {
    const row = rows.find(r => r.id === command.id);
    if (!row) throw new Error('السجل غير موجود');
    if (command.type === 'delete') {
      if (!canCreateDemo(role, section) || !['مسودة', 'جديد', 'قيد التنفيذ', 'بانتظار المراجعة', 'نشط', 'مخططة'].includes(row.status)) throw new Error('لا يمكن حذف سجل بعد اعتماده أو بدء تنفيذه');
      rows = rows.filter(r => r.id !== row.id); event = `حذف: ${row.title}`;
    } else {
      if (!recordActions(role, section, row).some(a => a.next === command.next)) throw new Error('هذه الخطوة غير متاحة');
      if (!command.note.trim()) throw new Error('اكتب ملاحظة لتوثيق الإجراء');
      rows = rows.map(r => r.id === row.id ? { ...r, status: command.next, detail: `${r.detail}\n${command.note}` } : r);
      event = `${row.title}: ${command.next}`;
    }
  }
  return { ...state, records: { ...state.records, [section]: rows }, activity: [event, ...state.activity].slice(0, 30) };
}
/** Only synthetic data is restored. No production auth/session keys are read or written. */
export function loadDemo(storage: Pick<Storage, 'getItem'>, role: DemoRole): DemoState {
  try {
    const raw = storage.getItem(demoStorageKey(role.code));
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      const seed = seedDemo(role);
      if (parsed.version === 1 && parsed.code === role.code && Array.isArray(parsed.activity) && parsed.activity.every(x => typeof x === 'string') && Object.keys(seed.records).every(key => {
        const rows = parsed.records?.[key as DemoSection];
        return Array.isArray(rows) && rows.every(r => typeof r.id === 'string' && typeof r.title === 'string' && typeof r.detail === 'string' && typeof r.status === 'string' && typeof r.amount === 'number' && typeof r.assignee === 'string' && typeof r.attachment === 'string');
      })) return parsed;
    }
  } catch { /* Corrupted/blocked browser storage starts a fresh synthetic demo. */ }
  return seedDemo(role);
}