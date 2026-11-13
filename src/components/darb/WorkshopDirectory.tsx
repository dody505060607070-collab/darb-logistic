import { Link } from '@tanstack/react-router';
import { Wrench } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { db, useRows } from '@/lib/db';
import { AddEmployee } from './AddEmployee';
import { Badge, DataTable } from './ui';
import { Button } from '@/components/ui/button';

export function WorkshopDirectory() {
 const auth=useAuth();const owner=auth.can('owner');
 const workshops=useRows(['workshops','directory'],()=>db.from('workshops').select('id,name,phone').order('name'),owner);
 const members=useRows(['workshop_members','directory'],()=>db.from('workshop_members').select('workshop_id,user_id,profile:profiles(full_name,phone)'),owner);
 if(!owner)return null;
 return <section className="mt-6 space-y-4 border-t pt-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold"><Wrench className="size-5 text-primary"/> الورش وحسابات الدخول</h2><AddEmployee workshopMode/></div>
  <DataTable rows={workshops.data} loading={workshops.isLoading||members.isLoading} error={workshops.error||members.error} searchKeys={['name','phone']} cols={[
   {key:'name',label:'الورشة'},
   {key:'accounts',label:'مسؤول الورشة',render:w=><div className="space-y-1">{(members.data??[]).filter(m=>m.workshop_id===w.id).map(m=><p key={m.user_id}>{m.profile?.full_name||'—'}</p>)}</div>},
   {key:'phone',label:'رقم الدخول وواتساب',render:w=><div className="space-y-1">{(members.data??[]).filter(m=>m.workshop_id===w.id).map(m=><p key={m.user_id} className="num">{m.profile?.phone||'—'}</p>)}</div>},
   {key:'access',label:'الحساب',render:w=>(members.data??[]).some(m=>m.workshop_id===w.id)?<Badge tone="success">مضاف</Badge>:<Badge tone="warning">بدون حساب دخول</Badge>},
   {key:'actions',label:'',render:w=><div className="flex flex-wrap gap-2">{(members.data??[]).filter(m=>m.workshop_id===w.id).map(m=><Button key={m.user_id} size="sm" variant="outline" asChild><Link to="/settings/employees/$id" params={{id:m.user_id}}>تعديل الحساب</Link></Button>)}</div>},
  ]}/>
 </section>;
}