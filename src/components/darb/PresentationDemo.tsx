import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, ClipboardList, FileText, LogOut, MessageSquare, Pencil, Plus, RotateCcw, Search, ShieldCheck, Trash2, Truck, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Logo } from './Logo';
import { DisplayControls } from './DisplayControls';
import { DEMO_ROLES, SECTION_LABELS, canCreateDemo, demoSections, demoStorageKey, findDemoRole, loadDemo, recordActions, seedDemo, updateDemo, type DemoCommand, type DemoRecord, type DemoRole, type DemoSection } from '@/lib/presentation-demo';

const MONEY_SECTIONS: DemoSection[] = ['invoices', 'expenses', 'work'];
const CREATE_LABELS: Partial<Record<DemoSection, string>> = { trips: 'إنشاء رحلة', tasks: 'تكليف بمهمة', requests: 'طلب نقل جديد', work: 'بلاغ صيانة', expenses: 'إضافة مصروف', invoices: 'إنشاء فاتورة', clients: 'إضافة عميل', documents: 'رفع مستند' };
const SECTION_ICONS: Partial<Record<DemoSection, typeof Truck>> = { trips: Truck, fleet: Truck, work: Wrench, tasks: ClipboardList, approvals: ShieldCheck, documents: FileText, messages: MessageSquare };
type Editor = { kind: 'create' } | { kind: 'edit'; row: DemoRecord } | { kind: 'action'; row: DemoRecord; label: string; next: string } | { kind: 'delete'; row: DemoRecord } | { kind: 'reset' };
const emptyRecord = (): DemoRecord => ({ id: '', title: '', detail: '', status: '', amount: 0, assignee: 'موظف العرض', attachment: '' });
const numberFormat = new Intl.NumberFormat('ar-SA', { maximumFractionDigits: 2 });

export function PresentationDemo({ number }: { number: string }) {
  const role = findDemoRole(number);
  if (!role) return <div dir="rtl" className="mx-auto max-w-xl space-y-6 px-6 py-16 text-center"><Logo className="justify-center" /><h1 className="text-2xl font-bold">رقم تجربة غير صحيح</h1><p className="text-muted-foreground">استخدم رقم الشرح الذي أُرسل لك، وليس رقم حساب حقيقي.</p><Button asChild><Link to="/login">العودة للدخول</Link></Button></div>;
  return <RoleExperience key={role.code} role={role} />;
}

function RoleExperience({ role }: { role: DemoRole }) {
  const [state, setState] = useState(() => loadDemo(window.sessionStorage, role));
  const sections = demoSections(role);
  const [section, setSection] = useState<DemoSection>(sections[0] ?? 'tasks');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [draft, setDraft] = useState<DemoRecord>(emptyRecord);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    try { window.sessionStorage.setItem(demoStorageKey(role.code), JSON.stringify(state)); }
    catch { setStorageWarning(true); }
  }, [state, role.code]);
  const rows = state.records[section];
  const filtered = rows.filter(row => `${row.title} ${row.detail} ${row.status}`.includes(query));
  const reviewCount = sections.reduce((sum, s) => sum + state.records[s].filter(r => r.status.includes('بانتظار')).length, 0);
  const finished = sections.reduce((sum, s) => sum + state.records[s].filter(r => ['مكتملة', 'مسلمة', 'مغلق', 'مسددة'].includes(r.status)).length, 0);
  const Icon = SECTION_ICONS[section] ?? FileText;
  const money = MONEY_SECTIONS.includes(section);
  function open(next: Editor) {
    setDraft(next.kind === 'edit' ? { ...next.row } : emptyRecord());
    setEditor(next); setError(''); setNote('');
  }
  function apply(command: DemoCommand) {
    try { setState(updateDemo(state, role, command)); setEditor(null); toast.success('تم تحديث التجربة فقط'); return true; }
    catch (e) { setError(e instanceof Error ? e.message : 'تعذر تنفيذ الإجراء'); return false; }
  }
  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editor) return;
    if (editor.kind === 'reset') { setState(seedDemo(role)); setEditor(null); setQuery(''); toast.success('أُعيدت بيانات العرض الأصلية'); return; }
    if (editor.kind === 'delete') { apply({ type: 'delete', section, id: editor.row.id }); return; }
    if (editor.kind === 'action') {
      if (['إثبات التسليم', 'إتمام الفحص', 'إقرار الاستلام'].includes(editor.label) && !note.trim()) { setError('وثّق الفحص أو الاستلام أو التسليم قبل التأكيد'); return; }
      apply({ type: 'transition', section, id: editor.row.id, next: editor.next, note }); return;
    }
    const row = { ...draft, id: editor.kind === 'edit' ? draft.id : `sample-${crypto.randomUUID()}` };
    if (section === 'documents' && !row.attachment) { setError('اختر ملف المستند'); return; }
    apply({ type: editor.kind, section, row });
  }
  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    const sent = apply({ type: 'create', section: 'messages', row: { ...emptyRecord(), id: `sample-${crypto.randomUUID()}`, title: role.name, detail: message.trim() } });
    if (sent) setMessage('');
  }
  return <div dir="rtl" className="min-h-svh bg-background text-foreground">
    <div className="border-b border-gold bg-gold-soft px-4 py-3 text-center text-sm font-semibold text-foreground" role="status">تجربة شرح مستقلة · جميع الأشخاص والبيانات أمثلة · لا تُحفظ في الشركة ولا تُرسل رسائل خارجية</div>
    <div className="grid min-h-[calc(100svh-48px)] grid-cols-[minmax(0,1fr)] lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="min-w-0 border-b border-border bg-sidebar p-4 lg:border-b-0 lg:border-l">
        <Logo className="justify-center [&_img]:h-[100px] [&_img]:w-[138px]" />
        <div className="my-4 border-y border-border py-4 text-center"><div className="font-semibold text-primary">{role.name}</div><div className="mt-1 text-sm text-muted-foreground">{role.label} · <span dir="ltr" className="num">{role.code}</span></div></div>
        <nav aria-label="أقسام تجربة الشرح" className="flex gap-2 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
          {sections.map(s => { const ItemIcon = SECTION_ICONS[s] ?? FileText; return <Button key={s} variant={section === s ? 'default' : 'ghost'} className="shrink-0 justify-start gap-3 lg:w-full" onClick={() => { setSection(s); setQuery(''); setError(''); }}><ItemIcon />{SECTION_LABELS[s]}</Button>; })}
        </nav>
        <div className="mt-5 flex gap-2 lg:flex-col"><Button variant="outline" onClick={() => open({ kind: 'reset' })}><RotateCcw />إعادة ضبط التجربة</Button><Button variant="ghost" asChild><Link to="/login"><LogOut />الخروج من التجربة</Link></Button></div>
      </aside>
      <main className="min-w-0 px-4 py-5 sm:px-7 lg:px-9">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5"><div><p className="mb-2 text-sm text-muted-foreground">Shata / {role.label}</p><h1 className="flex items-center gap-3 text-3xl font-bold text-primary"><Icon className="size-7" />{SECTION_LABELS[section]}</h1></div><DisplayControls /></header>
        {storageWarning && <p role="alert" className="mb-4 text-sm text-warning">حفظ التجربة في هذا المتصفح غير متاح؛ ستُمسح التغييرات عند إعادة تحميل الصفحة.</p>}
        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[{ label: 'سجلات هذا القسم', value: rows.length, Icon }, { label: 'بانتظار إجراء', value: reviewCount, Icon: ClipboardList }, { label: 'إجراءات مكتملة', value: finished, Icon: CheckCircle2 }, { label: 'رقم الشرح', value: role.code, Icon: ShieldCheck }].map(item => <div key={item.label} className="panel flex min-h-[106px] items-start justify-between gap-2 p-4"><div><div className="text-xs text-muted-foreground sm:text-sm">{item.label}</div><div className="num mt-2 text-2xl font-semibold text-primary">{item.value}</div></div><item.Icon className="size-5 shrink-0 text-gold" /></div>)}
        </div>
        {section === 'messages' ? <section aria-label="محادثة العرض" className="mx-auto max-w-3xl">
          <div className="mb-5 min-h-[280px] space-y-4 border-y border-border py-5">{[...rows].reverse().map(row => <article key={row.id} className="max-w-xl rounded-2xl border border-border bg-card p-4"><h2 className="text-sm font-semibold text-primary">{row.title}</h2><p className="mt-2 whitespace-pre-wrap break-words">{row.detail}</p><p className="mt-2 text-xs text-muted-foreground">محاكاة محلية فقط</p></article>)}</div>
          <form onSubmit={sendMessage} className="flex gap-2"><Input aria-label="نص الرسالة" value={message} onChange={e => setMessage(e.target.value)} placeholder="اكتب رسالة" maxLength={2000} required /><Button type="submit"><MessageSquare />إرسال</Button></form>
        </section> : <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="relative w-full sm:max-w-sm"><Search className="absolute right-3 top-3 size-4 text-muted-foreground" /><Input aria-label="بحث في التجربة" value={query} onChange={e => setQuery(e.target.value)} placeholder="بحث" className="pr-9" /></div>{canCreateDemo(role, section) && <Button onClick={() => open({ kind: 'create' })}><Plus />{CREATE_LABELS[section] ?? 'إضافة سجل'}</Button>}</div>
          <div className="space-y-3">
            {filtered.map(row => { const actions = recordActions(role, section, row); const editable = canCreateDemo(role, section) && ['مسودة', 'جديد', 'قيد التنفيذ', 'بانتظار المراجعة', 'نشط', 'مخططة'].includes(row.status); return <article key={row.id} className="panel flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h2 className="break-words text-lg font-semibold text-primary">{row.title}</h2><span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-foreground">{row.status}</span></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">{row.detail}</p>{section === 'tasks' && <p className="mt-1 text-xs text-muted-foreground">المكلّف: {row.assignee}</p>}{row.attachment && <p className="mt-1 break-all text-xs text-info">المرفق المحلي: {row.attachment}</p>}{money && <div className="mt-2 font-semibold text-primary">{numberFormat.format(row.amount)} ر.س {section === 'invoices' && <span className="text-xs font-normal text-muted-foreground">· مثال قبل الضريبة · الإجمالي: {numberFormat.format(row.amount * 1.15)} ر.س</span>}</div>}</div>
              <div className="flex flex-wrap items-center gap-2 xl:max-w-sm xl:justify-end">{actions.map(action => <Button key={action.next} size="sm" variant={action.next === 'معاد للمراجعة' ? 'outline' : 'default'} onClick={() => open({ kind: 'action', row, ...action })}>{action.label}</Button>)}{editable && <><Button variant="ghost" size="icon" title="تعديل" aria-label={`تعديل ${row.title}`} onClick={() => open({ kind: 'edit', row })}><Pencil /></Button><Button variant="ghost" size="icon" title="حذف" aria-label={`حذف ${row.title}`} onClick={() => open({ kind: 'delete', row })}><Trash2 className="text-danger" /></Button></>}</div>
            </article>; })}
            {!filtered.length && <div className="border-y border-border py-12 text-center text-muted-foreground">{query ? 'لا توجد نتائج مطابقة' : 'لا توجد سجلات'}</div>}
          </div>
        </>}
        <section className="mt-8 border-t border-border pt-5" aria-label="سجل التجربة"><h2 className="mb-3 font-semibold text-primary">آخر الإجراءات في التجربة</h2><ol className="space-y-2 text-sm text-muted-foreground">{state.activity.slice(0, 5).map((entry, i) => <li key={`${i}-${entry}`} className="break-words">{entry}</li>)}</ol></section>
        <div className="mt-7 border-t border-border pt-5"><Label htmlFor="demo-role-switch">تبديل وظيفة العرض</Label><select id="demo-role-switch" value={role.code} onChange={e => { window.location.assign(`/demo?number=${e.target.value}`); }} className="mt-2 h-10 w-full max-w-xs border px-3">{DEMO_ROLES.map(r => <option key={r.code} value={r.code}>{r.label} — {r.code}</option>)}</select></div>
      </main>
    </div>
    <Dialog open={!!editor} onOpenChange={v => { if (!v) setEditor(null); }}><DialogContent dir="rtl" className="max-h-[88svh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl">
      <DialogTitle className="pr-5">{editor?.kind === 'reset' ? 'إعادة ضبط التجربة' : editor?.kind === 'delete' ? 'حذف السجل التجريبي' : editor?.kind === 'action' ? editor.label : editor?.kind === 'edit' ? 'تعديل السجل' : CREATE_LABELS[section] ?? 'إضافة سجل'}</DialogTitle>
      <DialogDescription>هذه العملية تخص بيانات العرض فقط، ولا تؤثر على الشركة.</DialogDescription>
      <form onSubmit={save} className="space-y-4">
        {(editor?.kind === 'create' || editor?.kind === 'edit') && <>
          <div><Label htmlFor="demo-title">{section === 'clients' ? 'اسم العميل' : section === 'documents' ? 'نوع المستند' : 'العنوان'}</Label><Input id="demo-title" className="mt-2" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} required maxLength={180} /></div>
          <div><Label htmlFor="demo-detail">{section === 'requests' || section === 'trips' ? 'الاستلام والتسليم والحمولة' : section === 'documents' ? 'رقم المستند وتاريخ الانتهاء' : 'التفاصيل'}</Label><Textarea id="demo-detail" className="mt-2" value={draft.detail} onChange={e => setDraft({ ...draft, detail: e.target.value })} required maxLength={2000} /></div>
          {section === 'tasks' && <div><Label htmlFor="demo-assignee">الموظف المكلّف</Label><select id="demo-assignee" value={draft.assignee} onChange={e => setDraft({ ...draft, assignee: e.target.value })} className="mt-2 h-10 w-full border px-3">{['موظف العرض', 'سائق العرض', 'مندوب العرض', 'فني الميدان التجريبي'].map(name => <option key={name}>{name}</option>)}</select></div>}
          {money && <div><Label htmlFor="demo-amount">المبلغ {section === 'invoices' ? 'قبل الضريبة' : ''} (ر.س)</Label><Input id="demo-amount" dir="ltr" className="mt-2" type="number" min={section === 'invoices' ? '0.01' : '0'} step="0.01" value={draft.amount} onChange={e => setDraft({ ...draft, amount: e.target.valueAsNumber })} required /></div>}
          {['documents', 'expenses', 'work'].includes(section) && <div><Label htmlFor="demo-file">{section === 'documents' ? 'ملف المستند' : 'المرفق (اختياري)'}</Label><Input id="demo-file" type="file" className="mt-2" accept="image/*,.pdf" required={section === 'documents' && !draft.attachment} onChange={e => setDraft({ ...draft, attachment: e.target.files?.[0]?.name ?? '' })} /><p className="mt-1 text-xs text-muted-foreground">اسم الملف يُحفظ في التجربة فقط؛ الملف لا يُرفع إلى الشركة.</p></div>}
        </>}
        {editor?.kind === 'action' && <><p className="font-semibold">{editor.row.title}</p><div><Label htmlFor="demo-note">{editor.label === 'إتمام الفحص' ? 'نتيجة فحص الإطارات والفرامل والسلامة' : editor.label === 'إثبات التسليم' ? 'اسم المستلم وملاحظة التسليم' : 'ملاحظة الإجراء'}</Label><Textarea id="demo-note" className="mt-2" value={note} onChange={e => setNote(e.target.value)} required maxLength={1000} /></div></>}
        {editor?.kind === 'delete' && <p>هل تريد حذف «{editor.row.title}» من التجربة؟</p>}
        {editor?.kind === 'reset' && <p>ستُمسح تغييرات هذه الوظيفة فقط، وتعود أمثلة العرض الأصلية.</p>}
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditor(null)}>إلغاء</Button><Button type="submit" variant={editor?.kind === 'delete' ? 'destructive' : 'default'}>{editor?.kind === 'reset' ? 'تأكيد إعادة الضبط' : editor?.kind === 'delete' ? 'تأكيد الحذف' : editor?.kind === 'action' ? 'تأكيد الإجراء' : 'حفظ في التجربة'}</Button></div>
      </form>
    </DialogContent></Dialog>
  </div>;
}