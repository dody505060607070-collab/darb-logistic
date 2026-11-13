import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Search, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { db, uploadFile, useRows, type Row } from '@/lib/db';
import { errMsg, fmtSAR } from '@/lib/format';
import { flushWa } from '@/lib/wa-flush';

export function WorkshopIntake() {
 const qc=useQueryClient();
 const workshops=useRows(['workshops','intake'],()=>db.from('workshops').select('id,name').order('name'));
 const [open,setOpen]=useState(false); const [query,setQuery]=useState('');
 const [vehicle,setVehicle]=useState<Row|null>(null); const [workshop,setWorkshop]=useState('');
 const [description,setDescription]=useState(''); const [diagnosis,setDiagnosis]=useState('');
 const [severity,setSeverity]=useState('normal'); const [parts,setParts]=useState(''); const [labor,setLabor]=useState('');
 const [odometer,setOdometer]=useState(''); const [files,setFiles]=useState<File[]>([]);
 const [busy,setBusy]=useState(false); const [ref,setRef]=useState(''); const [paths,setPaths]=useState<string[]>([]);
 const total=Number(parts||0)+Number(labor||0);
 async function find(){
  setBusy(true); setVehicle(null);
  try{const {data,error}=await db.rpc('workshop_find_vehicle',{p_query:query});if(error)throw error;
   const result=data?.[0];if(!result)throw new Error('لا توجد مركبة بهذا الرقم أو اللوحة');setVehicle(result);setOdometer(String(result.odometer_km??''));
  }catch(e){toast.error(errMsg(e));}finally{setBusy(false);}
 }
 async function submit(){
  if(!vehicle)return;
  setBusy(true);
  try{
   const photos=[...paths];
   for(let i=photos.length;i<files.length;i++){const file=files[i];if(!file)continue;photos.push(await uploadFile(file,`workshop-intake/${ref}`));setPaths([...photos]);}
   const {error}=await db.rpc('workshop_intake',{p_ref:ref,p_workshop_id:workshop||workshops.data?.[0]?.id,p_asset_id:vehicle.id,p_description:description,p_diagnosis:diagnosis,p_severity:severity,p_parts:Number(parts),p_labor:Number(labor),p_photos:photos,p_odometer:odometer?Number(odometer):null});
   if(error)throw error;
   await qc.invalidateQueries();flushWa();toast.success('تم رفع طلب الورشة لمسؤول الصيانة للموافقة');setOpen(false);
  }catch(e){toast.error(errMsg(e));}finally{setBusy(false);}
 }
 function start(){setRef(crypto.randomUUID());setPaths([]);setFiles([]);setVehicle(null);setQuery('');setDescription('');setDiagnosis('');setParts('');setLabor('');setWorkshop('');setSeverity('normal');setOpen(true);}
 return <><Button onClick={start}><Camera/> استلام مركبة ورفع تقدير</Button>
  <Dialog open={open} onOpenChange={value=>!busy&&setOpen(value)}><DialogContent dir="rtl" className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
   <DialogHeader><DialogTitle>استلام مركبة بالورشة</DialogTitle></DialogHeader>
   <Label>الورشة</Label><select aria-label="ورشة الاستلام" className="h-10 rounded-md border bg-card px-2" value={workshop||workshops.data?.[0]?.id||''} onChange={e=>setWorkshop(e.target.value)}>{(workshops.data??[]).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
   <Label>رقم المركبة أو اللوحة</Label><div className="flex gap-2"><Input aria-label="رقم مركبة الاستلام" value={query} onChange={e=>{setQuery(e.target.value);setVehicle(null);}}/><Button variant="outline" disabled={busy||query.trim().length<3} onClick={()=>void find()}><Search/> بحث</Button></div>
   {vehicle&&<div className="border-y py-3 text-sm"><b>{vehicle.code} — {vehicle.plate}</b><p>{vehicle.make_model||'—'}</p></div>}
   <Label>المشكلة عند وصول المركبة</Label><Textarea aria-label="مشكلة مركبة الاستلام" value={description} onChange={e=>setDescription(e.target.value)} maxLength={1000}/>
   <Label>التشخيص والأعمال المقترحة</Label><Textarea aria-label="تشخيص الاستلام" value={diagnosis} onChange={e=>setDiagnosis(e.target.value)} maxLength={1000}/>
   <div className="grid gap-3 sm:grid-cols-2"><div><Label>تقدير القطع (ر.س)</Label><Input aria-label="تقدير قطع الاستلام" type="number" min="0" step="0.01" value={parts} onChange={e=>setParts(e.target.value)}/></div><div><Label>تقدير الأجور (ر.س)</Label><Input aria-label="تقدير أجور الاستلام" type="number" min="0" step="0.01" value={labor} onChange={e=>setLabor(e.target.value)}/></div><div><Label>العداد (كم)</Label><Input type="number" min="0" value={odometer} onChange={e=>setOdometer(e.target.value)}/></div><div><Label>الخطورة</Label><select aria-label="خطورة الاستلام" className="h-10 w-full rounded-md border bg-card px-2" value={severity} onChange={e=>setSeverity(e.target.value)}><option value="normal">عادية</option><option value="urgent">عاجلة</option><option value="critical">حرجة — تمنع التشغيل</option></select></div></div>
   <Label>صور المشكلة</Label><Input aria-label="صور مشكلة الاستلام" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={busy||paths.length>0} onChange={e=>{setFiles(Array.from(e.target.files??[]));setPaths([]);}}/>
   <p className="text-sm">إجمالي التقدير: <b className="num">{fmtSAR(total)}</b></p>
   <Button disabled={busy||!vehicle||!(workshop||workshops.data?.[0]?.id)||description.trim().length<5||diagnosis.trim().length<3||!parts||!labor||total<0||files.length>10} onClick={()=>void submit()}><Send/> إرسال لمسؤول الصيانة للموافقة</Button>
  </DialogContent></Dialog>
 </>;
}