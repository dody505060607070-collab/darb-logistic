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
import { ROLE_LABELS, useAuth, type AppRole } from '@/lib/auth';
import { updateEmployee, deleteEmployee } from '@/lib/employees.functions';
import { DeleteConfirmation } from '@/components/darb/DeleteConfirmation';
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
    try { await save({ data: { id, fullName: name, phone, branchId: branch || null } }); await Promise.all([qc.invalidateQueries({ queryKey: ['employee', id] }), qc.invalidateQueries({ queryKey: ['profiles'] }), auth.refresh()]); toast.success('تم حفظ بيانات الموظف'); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  async function grantRole() {
    if (!role) return;
    if (['driver','representative'].includes(role) && !driver && !(drivers.data ?? []).some(d => d.user_id === id)) return void toast.error('اختر ملف السائق أو المندوب');
    if(role==='workshop'&&!workshopId)return void toast.error('اختر الورشة');
    setBusy(true);
    try {
      if (['driver','representative'].includes(role) && driver) { const { error } = await db.from('drivers').update({ user_id: id }).eq('id', driver); if (error) throw error; }
      if(role==='workshop'){const {error}=await db.from('workshop_members').upsert({workshop_id:workshopId,user_id:id},{onConflict:'workshop_id,user_id'});if(error)throw error;}
      const { error } = await db.from('user_roles').insert({ user_id: id, role }); if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['user_roles'] }); if (id === auth.session?.user.id) await auth.refresh(); setRole(''); toast.success('تم منح الصلاحية');
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
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
    <DeleteConfirmation open={deleteOpen} onOpenChange={setDeleteOpen} title="حذف حساب الموظف؟" description="سيُحذف الحساب وصلاحياته نهائيًا، وتبقى السجلات التاريخية. يمكن لصاحب الرقم التسجيل من جديد لاحقًا بصلاحيات التسجيل الحالية." busy={busy} onConfirm={() => void confirmDelete()} />
    <div className="grid gap-8 xl:grid-cols-2">
      <section className="space-y-4"><h2 className="text-lg font-bold">بيانات الموظف</h2>
        <div><Label htmlFor="employee-name">الاسم</Label><Input id="employee-name" value={name} onChange={e => setName(e.target.value)} /></div>
        <div><Label htmlFor="employee-phone">رقم الجوال</Label><Input id="employee-phone" type="tel" dir="ltr" placeholder="+966" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        <div><Label htmlFor="employee-branch">الفرع</Label><select id="employee-branch" className="h-10 w-full rounded-md border bg-card px-3" value={branch} onChange={e => setBranch(e.target.value)}><option value="">بدون فرع</option>{(branches.data ?? []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
        <Button variant="gold" disabled={busy} onClick={() => void saveProfile()}><Save /> حفظ البيانات</Button>
      </section>
      <section className="space-y-4"><h2 className="flex items-center gap-2 text-lg font-bold"><ShieldCheck className="text-info" /> الصلاحيات</h2>
        <div className="flex flex-wrap gap-2">{employeeRoles.map(r => <div key={r.id} className="flex items-center gap-1"><Badge tone="gold">{ROLE_LABELS[r.role as AppRole]}</Badge>{canRemoveEmployeeRole(auth.session?.user.id ?? '', id, r.role) && <Button size="icon" variant="ghost" aria-label={`إزالة ${ROLE_LABELS[r.role as AppRole]}`} title={`إزالة ${ROLE_LABELS[r.role as AppRole]}`} onClick={() => void revokeRole(r.id, r.role)}><Trash2 className="size-4 text-danger" /></Button>}</div>)}</div>
        <div className="flex flex-wrap gap-2"><select aria-label="إضافة صلاحية" className="h-10 rounded-md border bg-card px-3" value={role} onChange={e => setRole(e.target.value)}><option value="">اختر الصلاحية</option>{Object.entries(ROLE_LABELS).filter(([key]) => !employeeRoles.some(r => r.role === key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><Button variant="outline" disabled={busy || !role} onClick={() => void grantRole()}>منح الصلاحية</Button></div>
        {['driver','representative'].includes(role) && <select aria-label="ملف السائق" value={driver} onChange={e => setDriver(e.target.value)} className="h-10 w-full rounded-md border bg-card px-3"><option value="">اختر ملف السائق أو المندوب</option>{(drivers.data ?? []).map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}</select>}
        {role==='workshop'&&<select aria-label="ورشة الموظف" value={workshopId} onChange={e=>setWorkshopId(e.target.value)} className="h-10 w-full border bg-card px-3"><option value="">اختر الورشة</option>{(workshops.data??[]).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>}
        <h3 className="text-sm font-semibold">الصفحات المتاحة</h3><div className="flex flex-wrap gap-2">{NAV.filter(n => !n.roles || employeeRoles.some(r => r.role === 'owner' || n.roles?.includes(r.role))).map(n => <Badge key={n.to} tone="info">{n.label}</Badge>)}</div>
      </section>
    </div>
    <div className="mt-8 grid gap-8 xl:grid-cols-2"><section><h2 className="mb-3 text-lg font-bold">المهام</h2><DataTable rows={tasks.data} loading={tasks.isLoading} cols={[{ key: 'title', label: 'المهمة' }, { key: 'status', label: 'الحالة' }, { key: 'due_at', label: 'الموعد', render: r => fmtDateTime(r.due_at) }]} /></section><section><h2 className="mb-3 text-lg font-bold">آخر النشاطات</h2><DataTable rows={activity.data} loading={activity.isLoading} cols={[{ key: 'kind', label: 'النشاط' }, { key: 'detail', label: 'التفاصيل' }, { key: 'at', label: 'الوقت', render: r => fmtDateTime(r.at) }]} /></section></div>
  </>;
}