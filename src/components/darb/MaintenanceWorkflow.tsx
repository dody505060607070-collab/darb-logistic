import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck, ClipboardList, Package, Plus, Save, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth';
import { db, useRows, type Row } from '@/lib/db';
import { errMsg, fmtDateTime, fmtSAR } from '@/lib/format';
import { MAINTENANCE_STATES, maintenanceActions } from '@/lib/maintenance-flow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge, DataTable, Kpi, PageHeader, Panel } from './ui';
import { WorkshopReport } from './WorkshopReport';
import { WorkshopIntake } from './WorkshopIntake';
import { openFile } from './shared';
import { flushWa } from '@/lib/wa-flush';
import { WorkshopDirectory } from './WorkshopDirectory';

export function MaintenanceWorkflow() {
 const auth=useAuth(); const qc=useQueryClient(); const manager=auth.can('maintenance','ops_manager');
 const orders=useRows(['work_orders','workflow'],()=>db.from('work_orders').select('*,asset:assets(code,plate),workshop_entity:workshops(name)').order('opened_at',{ascending:false}));
 const assets=useRows(['assets','maintenance'],()=>db.from('assets').select('id,code,plate').order('code'));
 const workshops=useRows(['workshops'],()=>db.from('workshops').select('*').order('name'));
 const staff=useRows(['profiles','maintenance-assign'],()=>db.from('profiles').select('id,full_name,phone'),manager);
 const roles=useRows(['user_roles','maintenance-assign'],()=>db.from('user_roles').select('user_id,role').eq('role','field_maintenance'),manager);
 const history=useRows(['maintenance_history'],()=>db.from('maintenance_history').select('*').order('at',{ascending:false}).limit(200));
 const [selected,setSelected]=useState<Row|null>(null); const [newOpen,setNewOpen]=useState(false);
 const [asset,setAsset]=useState(''); const [description,setDescription]=useState(''); const [severity,setSeverity]=useState('normal');
 const [target,setTarget]=useState(''); const [note,setNote]=useState(''); const [workshop,setWorkshop]=useState(''); const [employee,setEmployee]=useState(''); const [budget,setBudget]=useState('');
 const [diagnosis,setDiagnosis]=useState(''); const [estimate,setEstimate]=useState(''); const [labor,setLabor]=useState(''); const [invoice,setInvoice]=useState(''); const [busy,setBusy]=useState(false);
 async function run(fn:()=>Promise<{error:unknown}>,close=false){setBusy(true);try{const {error}=await fn();if(error)throw error;await qc.invalidateQueries();flushWa();toast.success('تم الحفظ');if(close){setNewOpen(false);setSelected(null);}}catch(e){toast.error(errMsg(e));}finally{setBusy(false);}}
 function open(r:Row){setSelected(r);setTarget('');setNote('');setWorkshop(r.workshop_id??'');setEmployee(r.assignee_id??'');setBudget(String(r.approved_budget??r.estimate??''));setDiagnosis(r.diagnosis??'');setEstimate(String(r.estimate??0));setLabor(String(r.labor_cost??0));setInvoice(r.vendor_invoice_ref??'');}
 const assignedStaff=(staff.data??[]).filter(p=>(roles.data??[]).some(r=>r.user_id===p.id));
 return <>
 <PageHeader title={auth.roles.includes('workshop')?'أعمال الورشة':auth.roles.includes('field_maintenance')?'أعمال الصيانة الميدانية':'بلاغات الصيانة والموافقات'} icon={<Wrench/>} actions={<div className="flex flex-wrap gap-2">{auth.roles.includes('workshop')&&<WorkshopIntake/>}{!auth.roles.includes('workshop')&&<Button onClick={()=>setNewOpen(true)}><Plus/> بلاغ صيانة</Button>}</div>}/>
 {(()=>{const o=orders.data??[];const n=(st:string[])=>orders.isLoading||orders.error?'—':o.filter(r=>st.includes(r.workflow_status)).length;return <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4"><Kpi label={auth.roles.includes('workshop')?'الأعمال المسندة':'أوامر مفتوحة'} value={orders.isLoading||orders.error?'—':o.filter(r=>!['closed','rejected'].includes(r.workflow_status)).length} icon={<ClipboardList/>}/><Kpi label="تحت الصيانة" value={n(['repairing'])} tone="info" icon={<Wrench/>}/><Kpi label="بانتظار قطع غيار" value={n(['waiting_parts'])} tone="warning" icon={<Package/>}/><Kpi label="جاهزة للتسليم" value={n(['ready_delivery'])} tone="success" icon={<CircleCheck/>}/></div>;})()}
 <Panel title={auth.roles.includes('workshop')?'الأعمال المسندة':'أوامر الصيانة'} icon={<Wrench/>}>
 <DataTable rows={orders.data} loading={orders.isLoading} error={orders.error} onRowClick={open} searchKeys={['number','description','asset.code']} cols={[
 {key:'number',label:'الأمر'},{key:'asset',label:'المركبة',render:r=>r.asset?.code??'غير متاح'},{key:'description',label:'البلاغ'},{key:'workflow_status',label:'الحالة',render:r=><Badge tone={r.workflow_status==='closed'?'success':r.workflow_status==='rejected'?'danger':'warning'}>{MAINTENANCE_STATES[r.workflow_status]??r.workflow_status}</Badge>},
 {key:'workshop',label:'الجهة',render:r=>r.workshop_entity?.name??(staff.data??[]).find(p=>p.id===r.assignee_id)?.full_name??'غير مسند'},{key:'approved_budget',label:'المعتمد',render:r=>fmtSAR(r.approved_budget)},{key:'action',label:'',render:r=><Button size="sm" variant="outline" onClick={()=>open(r)}>تفاصيل</Button>} ]}/>
 </Panel>
 <WorkshopDirectory/>
 <Dialog open={newOpen} onOpenChange={setNewOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>بلاغ صيانة جديد</DialogTitle></DialogHeader><Label>المركبة</Label><select aria-label="مركبة البلاغ" className="h-10 border bg-card px-2" value={asset} onChange={e=>setAsset(e.target.value)}><option value="">اختر المركبة</option>{(assets.data??[]).map(a=><option key={a.id} value={a.id}>{a.code} — {a.plate}</option>)}</select><Label>الوصف</Label><Textarea aria-label="وصف البلاغ" value={description} onChange={e=>setDescription(e.target.value)}/><Label>الخطورة</Label><select aria-label="خطورة البلاغ" className="h-10 border bg-card px-2" value={severity} onChange={e=>setSeverity(e.target.value)}><option value="normal">عادية</option><option value="urgent">عاجلة</option><option value="critical">حرجة — تمنع التشغيل</option></select><Button disabled={busy||!asset||description.trim().length<5} onClick={()=>void run(()=>db.rpc('maintenance_request',{p_asset_id:asset,p_description:description,p_severity:severity}),true)}><Save/> إرسال البلاغ</Button></DialogContent></Dialog>
 <Dialog open={!!selected} onOpenChange={o=>!o&&setSelected(null)}><DialogContent dir="rtl" className="max-h-[90svh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{selected?.number} — {MAINTENANCE_STATES[selected?.workflow_status??'']}</DialogTitle></DialogHeader>
 <p className="text-sm">{selected?.description}</p><p className="text-sm">{selected?.asset?.code} — {selected?.asset?.plate}</p><div className="flex flex-wrap gap-2">{(selected?.photo_paths??[]).map((path:string,i:number)=><Button key={path} size="sm" variant="outline" onClick={()=>void openFile(path)}>صورة {i+1}</Button>)}</div>{selected&&<WorkshopReport order={selected} onDone={()=>setSelected(null)}/>}<div className="grid gap-3 sm:grid-cols-2"><div><Label>التشخيص</Label><Textarea value={diagnosis} onChange={e=>setDiagnosis(e.target.value)}/></div><div><Label>التقدير الإجمالي (ر.س)</Label><Input type="number" min="0" value={estimate} onChange={e=>setEstimate(e.target.value)}/><Label>الأجور (ر.س)</Label><Input type="number" min="0" value={labor} onChange={e=>setLabor(e.target.value)}/></div><div><Label>مرجع فاتورة المورد</Label><Input value={invoice} onChange={e=>setInvoice(e.target.value)}/></div></div>
 <Button variant="outline" disabled={busy||diagnosis.trim().length<3||['closed','rejected'].includes(selected?.workflow_status??'')} onClick={()=>void run(()=>db.rpc('maintenance_details',{p_id:selected?.id,p_diagnosis:diagnosis,p_estimate:Number(estimate),p_labor:Number(labor),p_invoice:invoice}))}><Save/> حفظ التشخيص والتقدير</Button>
 <section className="space-y-3 border-t pt-4"><h3 className="font-bold">الإجراء التالي</h3><select aria-label="إجراء الصيانة" className="h-10 w-full border bg-card px-2" value={target} onChange={e=>setTarget(e.target.value)}><option value="">اختر الإجراء</option>{maintenanceActions(selected?.workflow_status??'',manager).map(s=><option key={s} value={s}>{MAINTENANCE_STATES[s]}</option>)}</select>
 {target==='assigned'&&<><Label>الورشة</Label><select aria-label="الورشة المسندة" className="h-10 w-full border bg-card px-2" value={workshop} onChange={e=>{setWorkshop(e.target.value);setEmployee('');}}><option value="">بدون ورشة</option>{(workshops.data??[]).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select><Label>أو موظف الصيانة</Label><select aria-label="موظف الصيانة" className="h-10 w-full border bg-card px-2" value={employee} onChange={e=>{setEmployee(e.target.value);setWorkshop('');}}><option value="">بدون موظف</option>{assignedStaff.map(p=><option key={p.id} value={p.id}>{p.full_name||p.phone}</option>)}</select></>}
 {(target==='approved'||selected?.workflow_status==='additional_review')&&<><Label>التكلفة المعتمدة (ر.س)</Label><Input aria-label="التكلفة المعتمدة" type="number" min="0" value={budget} onChange={e=>setBudget(e.target.value)}/></>}
 <Textarea aria-label="سبب القرار أو نتيجة الفحص" placeholder={target==='closed'?'نتيجة فحص الاستلام':'الملاحظات / سبب القرار'} value={note} onChange={e=>setNote(e.target.value)}/><Button disabled={busy||!target} onClick={()=>void run(()=>db.rpc('maintenance_transition',{p_id:selected?.id,p_target:target,p_note:note||null,p_workshop_id:workshop||null,p_assignee_id:employee||null,p_amount:budget===''?null:Number(budget)}),true)}>تأكيد الإجراء</Button></section>
 <section className="border-t pt-4"><h3 className="mb-3 font-bold">سجل الإجراءات</h3>{(history.data??[]).filter(h=>h.work_order_id===selected?.id).map(h=><div key={h.id} className="border-b py-2 text-sm"><b>{MAINTENANCE_STATES[h.to_status]}</b><p>{h.note}</p><span className="text-xs text-muted-foreground">{fmtDateTime(h.at)}</span></div>)}</section>
 </DialogContent></Dialog>
 </>;
}