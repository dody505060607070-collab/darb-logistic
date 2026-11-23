import { useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Pencil, Search, Trash2, Truck, UserRound, Users } from 'lucide-react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteEmployee } from '@/lib/employees.functions';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/format';
import { DeleteConfirmation } from './DeleteConfirmation';
import { AddEmployee } from './AddEmployee';
import { PersonIntake } from './PersonIntake';
import { DriverLoginStatus } from './DriverLoginAccess';
import { useRows, db } from '@/lib/db';
import { ROLE_LABELS, type AppRole } from '@/lib/auth';
import { buildPeople, PERSON_ACCESS_LABEL, type PersonDriver, type PersonProfile, type PersonRole, type PersonRow } from '@/lib/people-directory';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge, DataTable, KV, Loading, Panel } from './ui';

const ACCESS_TONE = { active: 'success', awaiting_login: 'warning', no_phone: 'danger' } as const;
type Filter = '' | 'active' | 'waiting' | 'drivers';

export function EmployeeDirectory() {
  const auth = useAuth();
  const remove = useServerFn(deleteEmployee);
  const qc = useQueryClient();
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function confirmDelete() {
    if (!target) return;
    setBusy(true);
    try { await remove({ data: { id: target.id, confirmed: true } }); await qc.invalidateQueries(); setTarget(null); toast.success('تم حذف حساب الموظف'); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  }
  const profiles = useRows<PersonProfile>(['profiles'], () => db.from('profiles').select('id,full_name,phone,branch_id,created_at').order('created_at'));
  const roles = useRows<PersonRole & { id: string }>(['user_roles'], () => db.from('user_roles').select('*'));
  const drivers = useRows<PersonDriver>(['drivers', 'people'], () => db.from('drivers').select('id,code,full_name,phone,user_id').order('created_at'));
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (profiles.isLoading || roles.isLoading || drivers.isLoading) return <Loading />;
  if (profiles.error || roles.error || drivers.error) return <p role="alert" className="text-danger">تعذر تحميل الموظفين</p>;
  const people = buildPeople(profiles.data ?? [], roles.data ?? [], drivers.data ?? []);
  const waiting = people.filter(p => p.kind === 'driver_file').length;
  const rows = people
    .filter(p => !filter || (filter === 'active' ? p.kind === 'account' : filter === 'waiting' ? p.kind === 'driver_file' : p.roles.includes('driver')))
    .filter(p => `${p.full_name} ${p.phone ?? ''} ${p.driverCode ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  const selected = rows.find(p => p.id === selectedId) ?? rows[0];
  const roleBadges = (p: PersonRow) => p.roles.map(r => <Badge key={r} tone={r === 'owner' ? 'gold' : 'neutral'}>{ROLE_LABELS[r as AppRole] ?? r}</Badge>);
  const filters: [Filter, string][] = [['', `الكل ${people.length}`], ['active', `لهم حساب ${people.length - waiting}`], ['waiting', `ينتظرون الدخول ${waiting}`], ['drivers', 'السائقون']];
  return <section className="employee-workspace grid min-w-0 items-start gap-5">
    <div className="employee-directory min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Users className="text-primary" /> الموظفون <span className="num text-muted-foreground">{people.length}</span></h2>
      {auth.can('owner') && <div className="flex flex-wrap gap-2"><PersonIntake /><AddEmployee /></div>}
      <div className="relative w-full sm:w-72"><Search className="absolute right-3 top-3 size-4 text-muted-foreground" /><Input aria-label="البحث عن موظف" placeholder="اسم الموظف أو رقم الجوال" value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
    </div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="تصفية الموظفين">{filters.map(([k, label]) => <Button key={k || 'all'} size="sm" variant={filter === k ? 'gold' : 'outline'} aria-pressed={filter === k} onClick={() => setFilter(k)}><span className="num">{label}</span></Button>)}</div>
    {waiting > 0 && <p className="text-sm text-muted-foreground">السائقون المضافون من صفحة السائقين يظهرون هنا تلقائيًا، ويتفعل حسابهم عند أول دخول برقم جوالهم.</p>}
    <DataTable rows={rows} pageSize={10} selectedId={selected?.id} onRowClick={p => setSelectedId(p.id)} cols={[
      {key:'full_name',label:'الموظف',render:p=><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-primary">{p.kind==='driver_file'?<Truck className="size-4"/>:<UserRound className="size-4"/>}</span><b>{p.full_name || 'موظف دون اسم'}</b></div>},
      {key:'roles',label:'الوظيفة والصلاحيات',render:p=><div className="flex flex-wrap gap-1">{roleBadges(p)}</div>},
      {key:'phone',label:'رقم الجوال',render:p=>p.phone?<span className="num">{p.phone}</span>:<Badge tone="warning">رقم الجوال غير مضاف</Badge>},
      {key:'access',label:'الدخول',render:p=><Badge tone={ACCESS_TONE[p.access]}>{PERSON_ACCESS_LABEL[p.access]}</Badge>},
      {key:'actions',label:'الإجراءات',render:p=>p.kind==='driver_file'
        ? <Button asChild variant="outline" size="sm"><Link to="/drivers/$id" params={{id:p.driverId!}}>ملف السائق <ArrowLeft/></Link></Button>
        : <div className="flex items-center gap-1"><Button asChild variant="outline" size="sm"><Link to="/settings/employees/$id" params={{id:p.id}} search={{tab:undefined}}>ملف الموظف <ArrowLeft/></Link></Button><Button asChild variant="ghost" size="icon" title="تعديل الموظف"><Link aria-label={`تعديل ${p.full_name || 'الموظف'}`} to="/settings/employees/$id" params={{id:p.id}}><Pencil className="size-4"/></Link></Button>{p.id!==auth.session?.user.id&&<Button variant="ghost" size="icon" title="حذف الحساب" aria-label={`حذف ${p.full_name || 'الموظف'}`} onClick={()=>setTarget({id:p.id,name:p.full_name||'الموظف'})}><Trash2 className="size-4 text-danger"/></Button>}</div>}
    ]}/>
    </div>
    {selected && <Panel className="record-preview side-detail" title="ملخص الموظف" icon={<UserRound />}>
      <div className="mb-4 flex items-center gap-3 border-b pb-4"><span className="grid size-14 shrink-0 place-items-center rounded-full bg-accent text-primary"><UserRound className="size-7" /></span><h3 className="text-lg font-bold">{selected.full_name || 'موظف دون اسم'}</h3></div>
      <KV items={[
        ['الأدوار', <div className="flex flex-wrap justify-end gap-1">{roleBadges(selected)}</div>],
        ['رقم الجوال', selected.phone ? <span className="num">{selected.phone}</span> : <Badge tone="warning">رقم الجوال غير مضاف</Badge>],
        ['الدخول', selected.kind === 'driver_file' ? <DriverLoginStatus driver={{ id: selected.driverId!, phone: selected.phone, user_id: null }} canActivate={auth.can('owner')} /> : <Badge tone="success">{PERSON_ACCESS_LABEL.active}</Badge>],
        ...(selected.driverCode ? [['ملف السائق', <Link className="num text-primary underline" to="/drivers/$id" params={{ id: selected.driverId! }}>{selected.driverCode}</Link>] as [string, ReactNode]] : []),
      ]} />
      {selected.kind === 'driver_file'
        ? <Button asChild variant="outline" className="mt-5 w-full"><Link to="/drivers/$id" params={{id:selected.driverId!}}>إكمال ملف السائق <Pencil className="size-4" /></Link></Button>
        : <Button asChild variant="outline" className="mt-5 w-full"><Link to="/settings/employees/$id" params={{id:selected.id}}>تعديل بيانات الموظف <Pencil className="size-4" /></Link></Button>}
    </Panel>}
    <DeleteConfirmation open={!!target} onOpenChange={open => { if (!open && !busy) setTarget(null); }} title={`حذف حساب ${target?.name ?? ''}؟`} description="سيُحذف الحساب وتُلغى صلاحية رقمه للدخول. لن يتمكن من العودة إلا إذا أضافته الإدارة مجددًا، وتبقى السجلات التاريخية." busy={busy} onConfirm={() => void confirmDelete()} />
  </section>;
}
