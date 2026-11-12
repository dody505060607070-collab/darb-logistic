import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Pencil, Search, Trash2, UserRound, Users } from 'lucide-react';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { deleteEmployee } from '@/lib/employees.functions';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/format';
import { DeleteConfirmation } from './DeleteConfirmation';
import { useRows, db } from '@/lib/db';
import { ROLE_LABELS, type AppRole } from '@/lib/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge, DataTable, Loading } from './ui';

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
  const profiles = useRows(['profiles'], () => db.from('profiles').select('id,full_name,phone,branch_id,created_at').order('created_at'));
  const roles = useRows(['user_roles'], () => db.from('user_roles').select('*'));
  const [search, setSearch] = useState('');
  if (profiles.isLoading || roles.isLoading) return <Loading />;
  if (profiles.error || roles.error) return <p role="alert" className="text-danger">تعذر تحميل الموظفين</p>;
  const rows = (profiles.data ?? []).filter(p => `${p.full_name ?? ''} ${p.phone ?? ''}`.includes(search));
  return <section className="employee-directory space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold"><Users className="text-primary" /> الموظفون <span className="num text-muted-foreground">{profiles.data?.length ?? 0}</span></h2>
      <div className="relative w-full sm:w-72"><Search className="absolute right-3 top-3 size-4 text-muted-foreground" /><Input aria-label="البحث عن موظف" placeholder="اسم الموظف أو رقم الجوال" value={search} onChange={e => setSearch(e.target.value)} className="pr-9" /></div>
    </div>
    <DataTable rows={rows} pageSize={8} cols={[
      {key:'full_name',label:'الموظف',render:p=><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-primary"><UserRound className="size-4"/></span><b>{p.full_name || 'موظف دون اسم'}</b></div>},
      {key:'roles',label:'الوظيفة والصلاحيات',render:p=><div className="flex flex-wrap gap-1">{(roles.data??[]).filter(r=>r.user_id===p.id).map(r=><Badge key={r.id} tone={r.role==='owner'?'gold':'neutral'}>{ROLE_LABELS[r.role as AppRole]}</Badge>)}</div>},
      {key:'phone',label:'رقم الجوال',render:p=>p.phone?<span className="num">{p.phone}</span>:<Badge tone="warning">رقم الجوال غير مضاف</Badge>},
      {key:'actions',label:'الإجراءات',render:p=><div className="flex items-center gap-1"><Button asChild variant="outline" size="sm"><Link to="/settings/employees/$id" params={{id:p.id}} search={{tab:undefined}}>ملف الموظف <ArrowLeft/></Link></Button><Button asChild variant="ghost" size="icon" title="تعديل الموظف"><Link aria-label={`تعديل ${p.full_name || 'الموظف'}`} to="/settings/employees/$id" params={{id:p.id}}><Pencil className="size-4"/></Link></Button>{p.id!==auth.session?.user.id&&<Button variant="ghost" size="icon" title="حذف الحساب" aria-label={`حذف ${p.full_name || 'الموظف'}`} onClick={()=>setTarget({id:p.id,name:p.full_name||'الموظف'})}><Trash2 className="size-4 text-danger"/></Button>}</div>}
    ]}/>
    <DeleteConfirmation open={!!target} onOpenChange={open => { if (!open && !busy) setTarget(null); }} title={`حذف حساب ${target?.name ?? ''}؟`} description="سيُحذف الحساب وصلاحياته نهائيًا، وتبقى السجلات التاريخية. يمكن لصاحب الرقم التسجيل من جديد لاحقًا بصلاحيات التسجيل الحالية." busy={busy} onConfirm={() => void confirmDelete()} />
  </section>;
}