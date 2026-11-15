import { useMemo, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileScan, FileUp, Loader2, MessageCircle, Plus, Save, Sparkles, Trash2, TriangleAlert, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { analyzePersonIntake, completePersonIntake, requestIntakeMissing } from '@/lib/person-intake.functions';
import { INTAKE_DOC_TYPES, INTAKE_ROLES, intakeMissing, type IntakeDoc, type IntakeRole } from '@/lib/person-intake';
import { ROLE_LABELS } from '@/lib/auth';
import { db, uploadFile, useOne, useRows, type Row } from '@/lib/db';
import { errMsg, fmtDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from './ui';
import { openFile } from './shared';

type Form = { role: IntakeRole; full_name: string; phone: string; national_id: string; nationality: string; license_no: string; license_expiry: string; documents: IntakeDoc[] };
const EMPTY: Form = { role: 'driver', full_name: '', phone: '', national_id: '', nationality: '', license_no: '', license_expiry: '', documents: [] };
const STATUS_LABEL: Record<string, [string, 'neutral' | 'warning' | 'success']> = { draft: ['مسودة', 'neutral'], awaiting_documents: ['بانتظار النواقص', 'warning'], completed: ['تم الترحيل', 'success'] };
const fileName = (p: string) => p.split('/').pop()!.replace(/^[0-9a-f-]{36}-/, '');
const nul = (v: string) => (v.trim() ? v.trim() : null);

function formFrom(row: Row): Form {
  const x = row.extracted?.reviewed ?? row.extracted ?? {};
  return {
    role: (INTAKE_ROLES as readonly string[]).includes(row.role) ? row.role : 'driver',
    full_name: x.full_name ?? row.full_name ?? '', phone: x.phone ?? row.phone ?? '', national_id: x.national_id ?? '', nationality: x.nationality ?? '',
    license_no: x.license_no ?? '', license_expiry: x.license_expiry ?? '', documents: Array.isArray(x.documents) ? x.documents : [],
  };
}

/** Upload a person's files, let the AI read them, review, then request missing items or create the account. */
export function PersonIntake() {
  const [open, setOpen] = useState(false);
  const intakes = useRows(['person_intakes'], () => db.from('person_intakes').select('*').neq('status', 'completed').order('created_at', { ascending: false }), open);
  const [active, setActive] = useState<Row | null>(null);
  return <>
    <Button variant="outline" onClick={() => setOpen(true)}><FileScan /> ترحيل ملف شخص</Button>
    <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setActive(null); }}>
      <DialogContent dir="rtl" className="max-h-[92svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="size-5 text-primary" /> ترحيل ملف شخص تلقائيًا</DialogTitle>
          <DialogDescription>ارفع السيرة الذاتية وصور الهوية والرخصة؛ يقرأها النظام ويحدد هل هو سائق أم موظف، ثم يطلب النواقص على واتساب أو ينشئ حسابه.</DialogDescription>
        </DialogHeader>
        {active ? <IntakeEditor key={active.id} row={active} onDone={() => setActive(null)} /> : <>
          <NewIntake onCreated={setActive} />
          {(intakes.data ?? []).length > 0 && <div className="mt-5 space-y-2">
            <h3 className="text-sm font-semibold">ملفات لم يكتمل ترحيلها</h3>
            {(intakes.data ?? []).map(r => <button type="button" key={r.id} onClick={() => setActive(r)} className="flex w-full items-center justify-between gap-3 rounded-2xl border bg-card p-3 text-right hover:bg-accent">
              <span><b>{r.full_name || 'بدون اسم بعد'}</b> <span className="num text-xs text-muted-foreground">{r.phone ?? ''}</span><span className="block text-xs text-muted-foreground">{ROLE_LABELS[r.role as IntakeRole] ?? r.role} • {r.missing?.length ? `${r.missing.length} نواقص` : 'لا نواقص مسجلة'} • {fmtDate(r.created_at)}</span></span>
              <Badge tone={STATUS_LABEL[r.status]?.[1] ?? 'neutral'}>{STATUS_LABEL[r.status]?.[0] ?? r.status}</Badge>
            </button>)}
          </div>}
        </>}
      </DialogContent>
    </Dialog>
  </>;
}

function NewIntake({ onCreated }: { onCreated: (r: Row) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState('');
  const analyze = useServerFn(analyzePersonIntake);
  async function start() {
    if (!files.length) return void toast.error('اختر ملفًا واحدًا على الأقل');
    try {
      setBusy('جارٍ رفع الملفات…');
      const paths: string[] = [];
      for (const f of files) paths.push(await uploadFile(f, 'onboarding'));
      const { data: row, error } = await db.from('person_intakes').insert({ file_paths: paths }).select('*').single();
      if (error || !row) throw error ?? new Error('تعذر حفظ الملف');
      setBusy('جارٍ قراءة الملفات وتحليلها… قد يستغرق دقيقة');
      try { await analyze({ data: { intakeId: row.id } }); }
      catch (e) { toast.error(errMsg(e)); }
      const { data: fresh } = await db.from('person_intakes').select('*').eq('id', row.id).single();
      onCreated(fresh ?? row);
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  }
  return <div className="space-y-3 rounded-2xl border border-dashed p-4">
    <Label htmlFor="intake-files" className="flex items-center gap-2"><FileUp className="size-4" /> ملفات الشخص (PDF أو صور، حتى 8 ملفات)</Label>
    <Input id="intake-files" type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setFiles(Array.from(e.target.files ?? []).slice(0, 8))} />
    {files.length > 0 && <ul className="text-xs text-muted-foreground">{files.map(f => <li key={f.name}>{f.name}</li>)}</ul>}
    <Button variant="gold" disabled={!!busy || !files.length} onClick={() => void start()}>{busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy || 'رفع وتحليل تلقائي'}</Button>
  </div>;
}

function IntakeEditor({ row: initial, onDone }: { row: Row; onDone: () => void }) {
  const qc = useQueryClient();
  const [row, setRow] = useState(initial);
  const [form, setForm] = useState<Form>(() => formFrom(initial));
  const [busy, setBusy] = useState('');
  const more = useRef<HTMLInputElement>(null);
  const analyze = useServerFn(analyzePersonIntake);
  const request = useServerFn(requestIntakeMissing);
  const complete = useServerFn(completePersonIntake);
  const settings = useOne(['company_settings', 'required-driver'], () => db.from('company_settings').select('doc_required_driver').eq('id', 1).maybeSingle());
  const required: string[] = settings.data?.doc_required_driver?.length ? settings.data.doc_required_driver : ['إقامة', 'رخصة قيادة', 'بطاقة سائق'];
  const payload = () => ({ intakeId: row.id, role: form.role, full_name: nul(form.full_name), phone: nul(form.phone), national_id: nul(form.national_id), nationality: nul(form.nationality), license_no: nul(form.license_no), license_expiry: nul(form.license_expiry), documents: form.documents });
  const missing = useMemo(() => intakeMissing(form.role, { ...payload(), documents: form.documents }, required), [form, required.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const paths: string[] = row.file_paths ?? [];
  const driver = form.role === 'driver';
  const set = (k: keyof Form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const setDoc = (i: number, patch: Partial<IntakeDoc>) => setForm(f => ({ ...f, documents: f.documents.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));

  async function reload() { const { data } = await db.from('person_intakes').select('*').eq('id', row.id).single(); if (data) { setRow(data); return data; } return row; }
  async function addFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    if (!picked.length) return;
    if (paths.length + picked.length > 8) return void toast.error('الحد الأقصى 8 ملفات للشخص');
    try {
      setBusy('جارٍ رفع الملفات الجديدة…');
      const added: string[] = [];
      for (const f of picked) added.push(await uploadFile(f, 'onboarding'));
      const { error } = await db.from('person_intakes').update({ file_paths: [...paths, ...added] }).eq('id', row.id);
      if (error) throw error;
      setBusy('جارٍ إعادة التحليل…');
      const res = await analyze({ data: { intakeId: row.id } });
      const x = res.extracted;
      setForm(f => ({ role: (INTAKE_ROLES as readonly string[]).includes(res.role) ? res.role as IntakeRole : f.role, full_name: x.full_name ?? f.full_name, phone: x.phone ?? f.phone, national_id: x.national_id ?? f.national_id, nationality: x.nationality ?? f.nationality, license_no: x.license_no ?? f.license_no, license_expiry: x.license_expiry ?? f.license_expiry, documents: x.documents }));
      await reload();
      toast.success('تمت قراءة الملفات الجديدة');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); if (more.current) more.current.value = ''; }
  }
  async function reanalyze() {
    try {
      setBusy('جارٍ قراءة الملفات وتحليلها…');
      const res = await analyze({ data: { intakeId: row.id } });
      setForm(formFrom({ ...(await reload()), extracted: res.extracted, role: res.role }));
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  }
  async function save(send: boolean) {
    try {
      setBusy(send ? 'جارٍ إرسال النواقص…' : 'جارٍ الحفظ…');
      const res = await request({ data: { ...payload(), send } });
      await qc.invalidateQueries({ queryKey: ['person_intakes'] });
      if (send) res.sent ? toast.success('أُرسلت قائمة النواقص على واتساب') : toast.error(res.reason || 'لم تُرسل الرسالة');
      else toast.success('تم حفظ الملف');
      await reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  }
  async function finish() {
    try {
      setBusy('جارٍ إنشاء الحساب ونقل البيانات…');
      await complete({ data: payload() });
      await qc.invalidateQueries();
      toast.success(driver ? 'تم إنشاء حساب السائق وملفه ومستنداته' : 'تم إنشاء حساب الموظف');
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  }
  async function remove() {
    if (!window.confirm('حذف ملف الترحيل هذا؟ لن يُنشأ أي حساب.')) return;
    const { error } = await db.from('person_intakes').delete().eq('id', row.id);
    if (error) return void toast.error(errMsg(error));
    await qc.invalidateQueries({ queryKey: ['person_intakes'] });
    onDone();
  }

  const summary: string | undefined = row.extracted?.summary;
  return <div className="space-y-4">
    {busy && <div role="status" className="flex items-center gap-2 rounded-2xl bg-accent p-3 text-sm"><Loader2 className="size-4 animate-spin" /> {busy}</div>}
    {summary && <p className="rounded-2xl bg-muted p-3 text-sm"><Sparkles className="ml-1 inline size-4 text-primary" />{summary}</p>}
    {!row.extracted?.person_type && !busy && <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm"><TriangleAlert className="size-4" /> لم يكتمل التحليل التلقائي بعد. <Button size="sm" variant="outline" onClick={() => void reanalyze()}>إعادة التحليل</Button></div>}

    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor="pi-role">النوع والوظيفة</Label><select id="pi-role" className="h-10 w-full rounded-full border bg-card px-3" value={form.role} onChange={e => set('role', e.target.value)}>{INTAKE_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
      <div><Label htmlFor="pi-name">الاسم الكامل</Label><Input id="pi-name" value={form.full_name} onChange={e => set('full_name', e.target.value)} /></div>
      <div><Label htmlFor="pi-phone">رقم الجوال</Label><Input id="pi-phone" dir="ltr" type="tel" placeholder="+966" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
      <div><Label htmlFor="pi-nid">رقم الهوية أو الإقامة</Label><Input id="pi-nid" dir="ltr" value={form.national_id} onChange={e => set('national_id', e.target.value)} /></div>
      <div><Label htmlFor="pi-nat">الجنسية</Label><Input id="pi-nat" value={form.nationality} onChange={e => set('nationality', e.target.value)} /></div>
      {driver && <><div><Label htmlFor="pi-lic">رقم رخصة القيادة</Label><Input id="pi-lic" dir="ltr" value={form.license_no} onChange={e => set('license_no', e.target.value)} /></div>
        <div><Label htmlFor="pi-lexp">تاريخ انتهاء الرخصة</Label><Input id="pi-lexp" type="date" value={form.license_expiry} onChange={e => set('license_expiry', e.target.value)} /></div></>}
    </div>

    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">المستندات المقروءة من الملفات</h3>
        <div className="flex gap-2"><input ref={more} type="file" multiple hidden accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => void addFiles(e.target.files)} />
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => more.current?.click()}><Plus /> إضافة ملفات</Button>
          <Button size="sm" variant="ghost" disabled={!!busy || !paths.length} onClick={() => setForm(f => ({ ...f, documents: [...f.documents, { file_index: 0, doc_type: 'أخرى', number: null, issue_date: null, expiry_date: null }] }))}><Plus /> مستند يدويًا</Button></div></div>
      {form.documents.length === 0 && <p className="text-xs text-muted-foreground">لم يُتعرف على مستندات بعد.</p>}
      {form.documents.map((d, i) => <div key={i} className="grid gap-2 rounded-2xl border p-3 sm:grid-cols-[1.2fr_1fr_1fr_1fr_auto] sm:items-end">
        <div><Label className="text-xs">الملف</Label><select className="h-9 w-full rounded-full border bg-card px-2 text-xs" value={d.file_index} onChange={e => setDoc(i, { file_index: Number(e.target.value) })}>{paths.map((p, j) => <option key={p} value={j}>{fileName(p)}</option>)}</select>
          <button type="button" className="mt-1 text-xs text-primary underline" onClick={() => void openFile(paths[d.file_index])}>فتح الملف</button></div>
        <div><Label className="text-xs">نوع المستند</Label><select className="h-9 w-full rounded-full border bg-card px-2 text-xs" value={d.doc_type} onChange={e => setDoc(i, { doc_type: e.target.value })}>{INTAKE_DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
        <div><Label className="text-xs">الرقم</Label><Input className="h-9" dir="ltr" value={d.number ?? ''} onChange={e => setDoc(i, { number: nul(e.target.value) })} /></div>
        <div><Label className="text-xs">تاريخ الانتهاء</Label><Input className="h-9" type="date" value={d.expiry_date ?? ''} onChange={e => setDoc(i, { expiry_date: nul(e.target.value) })} /></div>
        <Button size="icon" variant="ghost" aria-label="إزالة المستند" onClick={() => setForm(f => ({ ...f, documents: f.documents.filter((_, j) => j !== i) }))}><Trash2 className="size-4 text-danger" /></Button>
      </div>)}
    </div>

    {missing.length ? <div role="alert" className="rounded-2xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
      <div className="mb-1 flex items-center gap-2 font-semibold"><TriangleAlert className="size-4" /> ناقص قبل الترحيل ({missing.length})</div>
      <ul className="list-inside list-disc">{missing.map(m => <li key={m}>{m}</li>)}</ul>
      {row.notified_at && <p className="mt-2 text-xs">أُرسلت النواقص على واتساب في {fmtDate(row.notified_at)}</p>}
    </div> : <div className="flex items-center gap-2 rounded-2xl bg-success-soft p-3 text-sm text-success"><CheckCircle2 className="size-4" /> الملف مكتمل ويمكن ترحيله الآن.</div>}

    <div className="flex flex-wrap gap-2">
      {missing.length ? <Button variant="gold" disabled={!!busy} onClick={() => void save(true)}><MessageCircle /> إرسال النواقص له على واتساب</Button>
        : <Button variant="gold" disabled={!!busy} onClick={() => void finish()}><UserPlus /> ترحيل وإنشاء الحساب</Button>}
      <Button variant="outline" disabled={!!busy} onClick={() => void save(false)}><Save /> حفظ</Button>
      <Button variant="ghost" disabled={!!busy} onClick={onDone}>رجوع للقائمة</Button>
      <Button variant="ghost" className="mr-auto text-danger" disabled={!!busy} onClick={() => void remove()}><Trash2 /> حذف الملف</Button>
    </div>
  </div>;
}
