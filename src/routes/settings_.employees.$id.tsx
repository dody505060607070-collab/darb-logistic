import { useEffect, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Save, ShieldCheck, Trash2, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { AppShell, NAV } from '@/components/darb/AppShell';
import { Badge, DataTable, Loading, PageHeader } from '@/components/darb/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { db, useOne, useRows } from '@/lib/db';
import { ASSIGNABLE_ROLES, ROLE_LABELS, useAuth, type AppRole } from '@/lib/auth';
import { updateEmployee, deleteEmployee } from '@/lib/employees.functions';
import { DeleteConfirmation } from '@/components/darb/DeleteConfirmation';
import { ChoiceInput } from '@/components/darb/ChoiceInput';
import { canRemoveEmployeeRole } from '@/lib/employees';
import { errMsg, fmtDateTime } from '@/lib/format';

export const Route = createFileRoute('/settings_/employees/$id')({
  head: () => ({ meta: [
    { title: 'ملف الموظف وصلاحياته | Shata' },
    { name: 'description', content: 'بيانات الموظف ورقم جواله وفرعه وصلاحياته ومهامه ونشاطه في Shata.' },
    { property: 'og:title', content: 'ملف الموظف | Shata' },
    { property: 'og:description', content: 'إدارة بيانات الموظف وصلاحياته ومهامه ونشاطه.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary' },
  ] }),
  component: () => <AppShell><EmployeePage /></AppShell>,
});

function EmployeePage() {
  const { id } = Route.useParams();
  const auth = useAuth();
  const owner = auth.can('owner');
  const qc = useQueryClient();
  const save = useServerFn(updateEmployee);
  const remove = useServerFn(deleteEmployee);
  const navigate = useNavigate();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const profile = useOne(['employee', id], () => db.from('profiles').select('id,full_name,phone,branch_id,created_at').eq('id', id).maybeSingle(), owner);
  const roles = useRows(['user_roles'], () => db.from('user_roles').select('*'), owner);
  const branches = useRows(['branches'], () => db.from('branches').select('id,name').order('name'), owner);
  const workshops = useRows(['workshops'],()=>db.from('workshops').select('id,name').order('name'),owner);
  const [workshopId,setWorkshopId]=useState('');
  const drivers = useRows(['drivers', 'employee-link'], () => db.from('drivers').select('id,full_name,user_id').or(`user_id.is.null,user_id.eq.${id}`), owner);
  const tasks = useRows(['employee-tasks', id], () => db.from('tasks').select('id,title,status,due_at').eq('assignee_id', id).order('created_at', { ascending: false }).limit(30), owner);
  const activity = useRows(['employee-activity', id], () => db.from('activity_events').select('id,kind,detail,at').eq('user_id', id).order('at', { ascending: false }).limit(30), owner);
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [branch, setBranch] = useState('');
  const [role, setRole] = useState(''); const [driver, setDriver] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (profile.data) { setName(profile.data.full_name ?? ''); setPhone(profile.data.phone ?? ''); setBranch(profile.data.branch_id ?? ''); } }, [profile.data]);
  if (!owner) return <p role="alert">هذه الصفحة متاحة للمدير العام فقط</p>;
  if (profile.isLoading || roles.isLoading) return <Loading />;
  if (profile.error || !profile.data) return <p role="alert" className="text-danger">تعذر العثور على الموظف</p>;
  const employeeRoles = (roles.data ?? []).filter(r => r.user_id === id);
  async function saveProfile() {
    setBusy(true);
    try {
      let branchId: string | null = branch || null;
      if (branchId && !(branches.data ?? []).some(b => b.id === branchId)) {
        const { data: made, error } = await db.from('branches').insert({ name: branchId, city: 'غير محدد' }).select('id').single();
        if (error) throw error;
        branchId = made.id; await qc.invalidateQueries({ queryKey: ['branches'] });
      }
      await save({ data: { id, fullName: name, phone, branchId } }); await Promise.all([qc.invalidateQueries({ queryKey: ['employee', id] }), qc.invalidateQueries({ queryKey: ['profiles'] }), auth.refresh()]); toast.success('تم حفظ بيانات الموظف'); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function grantRole() {
    if (!role) return;
    if(role==='workshop'&&!workshopId)return void toast.error('اختر الورشة');
    setBusy(true);
    try {
      if (['driver'].includes(role) && driver) { const { error } = await db.from('drivers').update({ user_id: id }).eq('id', driver); if (error) throw error; }
      if(role==='workshop'){const {error}=await db.from('workshop_members').upsert({workshop_id:workshopId,user_id:id},{onConflict:'workshop_id,user_id'});if(error)throw error;}
      const { error } = await db.from('user_roles').insert({ user_id: id, role }); if (error) throw error;
      await Promise.all([qc.invalidateQueries({ queryKey: ['user_roles'] }), qc.invalidateQueries({ queryKey: ['drivers'] })]); if (id === auth.session?.user.id) await auth.refresh();
      toast.success(role === 'driver' && !driver && !(drivers.data ?? []).some(d => d.user_id === id) ? 'تم منح وظيفة سائق وإنشاء ملف سائق له؛ أكمل بياناته الناقصة من صفحة السائقين' : 'تم منح الصلاحية'); setRole(''); setDriver('');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function linkDriver() {
    if (!driver) return;
    setBusy(true);
    try { const { error } = await db.from('drivers').update({ user_id: id }).eq('id', driver).is('user_id', null); if (error) throw error; await qc.invalidateQueries({ queryKey: ['drivers'] }); setDriver(''); toast.success('تم ربط ملف السائق بالحساب'); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function revokeRole(roleId: string, value: string) {
    if (!canRemoveEmployeeRole(auth.session?.user.id ?? '', id, value)) return;
    const { error } = await db.from('user_roles').delete().eq('id', roleId);
    if (error) return void toast.error(errMsg(error));
    await qc.invalidateQueries({ queryKey: ['user_roles'] }); if (id === auth.session?.user.id) await auth.refresh();
  }
  async function confirmDelete() {
    setBusy(true);
    try { await remove({ data: { id, confirmed: true } }); await qc.invalidateQueries(); toast.success('تم حذف حساب الموظف'); await navigate({ to: '/settings', search: { tab: 'users' } }); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  return <>
    <Button asChild variant="ghost" className="mb-4"><Link to="/settings" search={{ tab: 'users' }}><ArrowRight /> الموظفون</Link></Button>
    <PageHeader title={profile.data.full_name || 'ملف الموظف'} icon={<UserRound />} actions={id !== auth.session?.user.id && <Button variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 /> حذف الحساب</Button>} />
    <DeleteConfirmation open={deleteOpen} onOpenChange={setDeleteOpen} title="حذف حساب الموظف؟" description="سيُحذف الحساب وتُلغى صلاحية رقمه للدخول. لا يمكنه العودة إلا بعد أن تضيفه الإدارة مجددًا. تبقى السجلات التاريخية." busy={busy} onConfirm={() => void confirmDelete()} />
    <div className="grid gap-8 xl:grid-cols-2">
      <section className="space-y-4"><h2 className="text-lg font-bold">بيانات الموظف</h2>
        <div><Label htmlFor="employee-name">الاسم</Label><Input id="employee-name" value={name} onChange={e => setName(e.target.value)} /></div>
        <div><Label htmlFor="employee-phone">رقم الجوال</Label><Input id="employee-phone" type="tel" dir="ltr" placeholder="+966" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        <div><Label htmlFor="employee-branch">الفرع</Label><ChoiceInput id="employee-branch" value={branch} onChange={setBranch} options={(branches.data ?? []).map(b => [b.id, b.name] as [string, string])} placeholder="اختر الفرع أو اكتب اسمه" /><p className="mt-1 text-xs text-muted-foreground">{branch && !(branches.data ?? []).some(b => b.id === branch) ? `سيُضاف «${branch}» كفرع جديد عند الحفظ` : 'اكتب «لا يوجد فرع» إذا لم يكن له فرع'}</p></div>
        <Button variant="gold" disabled={busy} onClick={() => void saveProfile()}><Save /> حفظ البيانات</Button>
      </section>
      <section className="space-y-4"><h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="text-info" /> الصلاحيات</h2>
        <div className="flex flex-wrap gap-2">{employeeRoles.map(r => <div key={r.id} className="flex items-center gap-1"><Badge tone="gold">{ROLE_LABELS[r.role as AppRole]}</Badge>{canRemoveEmployeeRole(auth.session?.user.id ?? '', id, r.role) && <Button size="icon" variant="ghost" aria-label={`إزالة ${ROLE_LABELS[r.role as AppRole]}`} title={`إزالة ${ROLE_LABELS[r.role as AppRole]}`} onClick={() => void revokeRole(r.id, r.role)}><Trash2 className="size-4 text-danger" /></Button>}</div>)}</div>
        {(() => { const own = (drivers.data ?? []).find(d => d.user_id === id); return own ? <Button asChild variant="outline" size="sm"><Link to="/drivers/$id" params={{ id: own.id }}>ملف السائق المرتبط: {own.full_name}</Link></Button> : null; })()}
        {employeeRoles.some(r => ['driver'].includes(r.role)) && !drivers.isLoading && !(drivers.data ?? []).some(d => d.user_id === id) && <div role="alert" className="space-y-2 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-sm">
          <p className="font-semibold">الحساب دوره سائق لكنه غير مربوط بملف سائق، فلن يرى رحلاته عند الدخول.</p>
          <p className="text-muted-foreground">الحل: اختر ملفه ثم اضغط «ربط الملف».</p>
          <div className="flex flex-wrap gap-2"><select aria-label="ملف السائق للربط" value={driver} onChange={e => setDriver(e.target.value)} className="h-10 flex-1 rounded-full border bg-card px-3"><option value="">اختر ملف السائق</option>{(drivers.data ?? []).map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select><Button variant="outline" disabled={busy || !driver} onClick={() => void linkDriver()}>ربط الملف</Button></div>
        </div>}
        <div className="flex flex-wrap gap-2"><select aria-label="إضافة صلاحية" className="h-10 rounded-md border bg-card px-3" value={role} onChange={e => setRole(e.target.value)}><option value="">اختر الصلاحية</option>{ASSIGNABLE_ROLES.filter(key => !employeeRoles.some(r => r.role === key)).map(key => <option key={key} value={key}>{ROLE_LABELS[key]}</option>)}</select><Button variant="outline" disabled={busy || !role} onClick={() => void grantRole()}>منح الصلاحية</Button></div>
        {['driver'].includes(role) && <select aria-label="ملف السائق" value={driver} onChange={e => setDriver(e.target.value)} className="h-10 w-full rounded-md border bg-card px-3"><option value="">إنشاء ملف سائق جديد تلقائيًا</option>{(drivers.data ?? []).filter(d => !d.user_id).map(d => <option key={d.id} value={d.id}>ربط ملف موجود: {d.full_name}</option>)}</select>}
        {role==='workshop'&&<select aria-label="ورشة الموظف" value={workshopId} onChange={e=>setWorkshopId(e.target.value)} className="h-10 w-full border bg-card px-3"><option value="">اختر الورشة</option>{(workshops.data??[]).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>}
        <h3 className="text-sm font-semibold">الصفحات المتاحة</h3><div className="flex flex-wrap gap-2">{NAV.filter(n => !n.roles || employeeRoles.some(r => r.role === 'owner' || n.roles?.includes(r.role))).map(n => <Badge key={n.to} tone="info">{n.label}</Badge>)}</div>
      </section>
    </div>
    <div className="mt-8 grid gap-8 xl:grid-cols-2"><section><h2 className="mb-3 text-lg font-bold">المهام</h2><DataTable rows={tasks.data} loading={tasks.isLoading} cols={[{ key: 'title', label: 'المهمة' }, { key: 'status', label: 'الحالة' }, { key: 'due_at', label: 'الموعد', render: r => fmtDateTime(r.due_at) }]} /></section><section><h2 className="mb-3 text-lg font-bold">آخر النشاطات</h2><DataTable rows={activity.data} loading={activity.isLoading} cols={[{ key: 'kind', label: 'النشاط' }, { key: 'detail', label: 'التفاصيل' }, { key: 'at', label: 'الوقت', render: r => fmtDateTime(r.at) }]} /></section></div>
  </>;
}