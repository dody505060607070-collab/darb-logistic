import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { db, useRows, type Row } from '@/lib/db';
import { errMsg } from '@/lib/format';
import { optionalPhone } from '@/lib/phone';
import { AddEmployee } from './AddEmployee';
import { Badge, DataTable } from './ui';
import { DeleteConfirmation } from './DeleteConfirmation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** Workshops list: the general manager and maintenance officer can rename, change the phone, or remove a workshop. */
export function WorkshopDirectory() {
 const auth=useAuth();const qc=useQueryClient();const owner=auth.can('owner');const manage=auth.can('maintenance');
 const workshops=useRows(['workshops','directory'],()=>db.from('workshops').select('id,name,phone').is('archived_at',null).order('name'),manage);
 const members=useRows(['workshop_members','directory'],()=>db.from('workshop_members').select('workshop_id,user_id,profile:profiles(full_name,phone)'),owner);
 const [edit,setEdit]=useState<Row|null>(null);const [name,setName]=useState('');const [phone,setPhone]=useState('');
 const [remove,setRemove]=useState<Row|null>(null);const [busy,setBusy]=useState(false);
 if(!manage)return null;
 async function save(){
  if(!edit||name.trim().length<2)return void toast.error('اكتب اسم الورشة');
  setBusy(true);
  try{const {error}=await db.from('workshops').update({name:name.trim(),phone:optionalPhone(phone)}).eq('id',edit.id);if(error)throw error;await qc.invalidateQueries({queryKey:['workshops']});setEdit(null);toast.success('تم حفظ بيانات الورشة');}
  catch(e){toast.error(errMsg(e));}finally{setBusy(false);}
 }
 async function confirmRemove(){
  if(!remove)return;setBusy(true);
  try{const {data,error}=await db.rpc('workshop_remove',{p_id:remove.id});if(error)throw error;await qc.invalidateQueries();setRemove(null);
   toast.success(data==='archived'?'أُخفيت الورشة من القوائم وحُفظ سجل أعمالها السابقة':'تم حذف الورشة');}
  catch(e){toast.error(errMsg(e));}finally{setBusy(false);}
 }
 const accounts=(id:string)=>(members.data??[]).filter(m=>m.workshop_id===id);
 return <section className="mt-6 space-y-4 border-t pt-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 font-bold"><Wrench className="size-5 text-primary"/> الورش وحسابات الدخول</h2>{owner&&<AddEmployee workshopMode/>}</div>
  <DataTable rows={workshops.data} loading={workshops.isLoading||(owner&&members.isLoading)} error={workshops.error||members.error} searchKeys={['name','phone']} cols={[
   {key:'name',label:'الورشة'},
   {key:'phone',label:'هاتف الورشة',render:w=><span className="num">{w.phone||'—'}</span>},
   ...(owner?[
    {key:'accounts',label:'حساب الدخول',render:(w:Row)=><div className="space-y-1">{accounts(w.id).map(m=><p key={m.user_id}>{m.profile?.full_name||'—'} <span className="num text-muted-foreground">{m.profile?.phone||''}</span></p>)}</div>},
    {key:'access',label:'الحالة',render:(w:Row)=>accounts(w.id).length?<Badge tone="success">له حساب</Badge>:<Badge tone="warning">بدون حساب دخول</Badge>},
   ]:[]),
   {key:'actions',label:'',render:w=><div className="flex flex-wrap gap-1">
    <Button size="icon" variant="ghost" aria-label={`تعديل ${w.name}`} title="تعديل" onClick={()=>{setEdit(w);setName(w.name??'');setPhone(w.phone??'');}}><Pencil className="size-4"/></Button>
    <Button size="icon" variant="ghost" aria-label={`حذف ${w.name}`} title="حذف" onClick={()=>setRemove(w)}><Trash2 className="size-4 text-danger"/></Button>
    {owner&&accounts(w.id).map(m=><Button key={m.user_id} size="sm" variant="outline" asChild><Link to="/settings/employees/$id" params={{id:m.user_id}}>حساب الدخول</Link></Button>)}
   </div>},
  ]}/>
  <Dialog open={!!edit} onOpenChange={o=>!o&&setEdit(null)}><DialogContent dir="rtl"><DialogHeader><DialogTitle>تعديل الورشة</DialogTitle></DialogHeader>
   <Label htmlFor="ws-name">اسم الورشة</Label><Input id="ws-name" value={name} onChange={e=>setName(e.target.value)}/>
   <Label htmlFor="ws-phone">هاتف الورشة</Label><Input id="ws-phone" type="tel" dir="ltr" value={phone} onChange={e=>setPhone(e.target.value)}/>
   <p className="text-xs text-muted-foreground">رقم دخول حساب الورشة يُعدّل من «حساب الدخول».</p>
   <Button disabled={busy} onClick={()=>void save()}>حفظ</Button>
  </DialogContent></Dialog>
  <DeleteConfirmation open={!!remove} onOpenChange={o=>!o&&setRemove(null)} title={`حذف ${remove?.name??'الورشة'}؟`} description="يُلغى ربط حساب الورشة بها فلا ترى أعمالًا جديدة. إذا كان لها أوامر صيانة سابقة تُخفى من القوائم ويبقى سجلها. لا يمكن الحذف وعليها أوامر مفتوحة." busy={busy} onConfirm={()=>void confirmRemove()}/>
 </section>;
}
