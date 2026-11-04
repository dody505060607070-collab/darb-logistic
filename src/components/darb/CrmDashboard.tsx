import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Building2, Plus, Phone, Target, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DataTable, Kpi, ErrorBox } from './ui';
import { EntityDialog, type Field } from './EntityDialog';
import { db, useRows, useAction, type Row } from '@/lib/db';
import { CRM_STAGES, crmMetrics } from '@/lib/crm';
import { fmtSAR, fmtTime } from '@/lib/format';

const customerFields: Field[] = [
  {name:'name',label:'اسم العميل',required:true,full:true}, {name:'phone',label:'رقم الجوال الدولي',required:true}, {name:'email',label:'البريد الإلكتروني (اختياري)'}, {name:'contact_name',label:'جهة الاتصال'}, {name:'city',label:'المدينة'}, {name:'payment_terms_days',label:'مدة السداد (يوم)',type:'number',default:30},
];
const opportunityFields: Field[] = [
  {name:'customer_id',label:'العميل',type:'ref',required:true,ref:{table:'customers',label:'name'}}, {name:'title',label:'اسم الفرصة',required:true}, {name:'stage',label:'المرحلة',type:'select',options:CRM_STAGES,default:'new',required:true}, {name:'value',label:'القيمة المتوقعة (ر.س)',type:'number',default:0,required:true}, {name:'probability',label:'احتمال الإغلاق (%)',type:'number',default:0,required:true}, {name:'expected_close',label:'الإغلاق المتوقع',type:'date'}, {name:'next_follow_up',label:'المتابعة القادمة',type:'datetime'}, {name:'notes',label:'ملاحظات',type:'textarea'},
];
const activityFields: Field[] = [
  {name:'customer_id',label:'العميل',type:'ref',required:true,ref:{table:'customers',label:'name'}}, {name:'kind',label:'النوع',type:'select',default:'call',options:[['call','مكالمة'],['meeting','اجتماع'],['note','ملاحظة'],['follow_up','متابعة']]}, {name:'summary',label:'تفاصيل التواصل',required:true,full:true,type:'textarea'}, {name:'due_at',label:'موعد المتابعة',type:'datetime'}, {name:'completed',label:'مكتملة',type:'checkbox'},
];
export function CrmDashboard() {
  const customers = useRows(['customers','crm'], () => db.from('customers').select('*').order('name'));
  const opportunities = useRows(['crm_opportunities'], () => db.from('crm_opportunities').select('*, customer:customers(name,phone)').order('created_at',{ascending:false}));
  const activities = useRows(['crm_activities'], () => db.from('crm_activities').select('*, customer:customers(name,phone)').order('created_at',{ascending:false}));
  const [dialog,setDialog] = useState<'customer'|'opportunity'|'activity'|null>(null);
  const [record,setRecord] = useState<Row|null>(null);
  const [selected,setSelected] = useState('');
  const open = (kind: typeof dialog, row: Row|null = null) => { setRecord(row); setDialog(kind); };
  const complete = useAction((r: Row) => db.from('crm_activities').update({completed:!r.completed}).eq('id',r.id), {success:'تم تحديث المتابعة',invalidate:['crm_activities']});
  const metric = crmMetrics(opportunities.data ?? []);
  const customerRows = customers.data ?? [];
  const filter = (rows: Row[]) => selected ? rows.filter(r => r.customer_id === selected) : rows;
  const error = customers.error || opportunities.error || activities.error;
  const loading = customers.isLoading || opportunities.isLoading || activities.isLoading;
  return <section className="space-y-4 border-t py-6" aria-label="إدارة علاقات العملاء">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-xl font-bold text-primary"><Building2 /> إدارة علاقات العملاء</h2>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => open('customer')}><Plus />عميل</Button><Button size="sm" variant="gold" onClick={() => open('opportunity')}><Plus />فرصة بيع</Button><Button size="sm" variant="outline" onClick={() => open('activity')}><Phone />تواصل</Button></div>
    </header>
    {error ? <ErrorBox error={error} /> : <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Kpi label="العملاء" value={loading ? '—' : customerRows.length} />
      <Kpi label="الفرص المفتوحة" value={loading ? '—' : metric.openCount} hint={loading ? '' : fmtSAR(metric.openValue)} tone="info" />
      <Kpi label="القيمة المرجحة المتوقعة" value={loading ? '—' : fmtSAR(metric.weightedValue)} hint="توقع مبيعات، وليس إيرادًا محققًا" tone="success" />
      <Kpi label="معدل الفوز بالفرص المغلقة" value={loading || metric.winRate === null ? '—' : `${metric.winRate}%`} hint={loading ? '' : `متابعات فرص متأخرة: ${metric.overdue}`} tone="warning" />
    </div>}
    <div className="flex flex-wrap items-center gap-3"><select aria-label="تصفية حسب العميل" value={selected} onChange={e => setSelected(e.target.value)} className="h-10 max-w-full rounded-md border border-input bg-card px-3 text-sm"><option value="">جميع العملاء</option>{customerRows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select><Button variant="link" asChild><Link to="/customers">العقود والمواقع والناقلون</Link></Button></div>
    <Tabs defaultValue="pipeline" dir="rtl">
      <TabsList className="max-w-full flex-wrap h-auto"><TabsTrigger value="pipeline">مسار المبيعات</TabsTrigger><TabsTrigger value="activities">التواصل والمتابعات</TabsTrigger><TabsTrigger value="customers">دليل العملاء</TabsTrigger></TabsList>
      <TabsContent value="pipeline">
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6">{CRM_STAGES.map(([stage,label]) => <div key={stage} className="border-t-2 border-primary/40 pt-3"><h3 className="mb-2 flex justify-between text-sm font-semibold">{label}<span>{filter(opportunities.data ?? []).filter(r => r.stage===stage).length}</span></h3>{filter(opportunities.data ?? []).filter(r => r.stage===stage).map(r => <Button key={r.id} variant="outline" className="mb-2 h-auto w-full flex-col items-start gap-1 whitespace-normal py-3 text-right" onClick={() => open('opportunity',r)}><span className="break-words">{r.title}</span><span className="text-xs text-muted-foreground">{r.customer?.name}</span><span className="num text-sm">{fmtSAR(r.value)}</span></Button>)}</div>)}</div>
        <DataTable rows={filter(opportunities.data ?? [])} loading={opportunities.isLoading} error={opportunities.error} searchKeys={['title','customer.name']} onRowClick={r => open('opportunity',r)} cols={[{key:'title',label:'الفرصة'},{key:'customer',label:'العميل',render:r=>r.customer?.name},{key:'stage',label:'المرحلة',render:r=>CRM_STAGES.find(s=>s[0]===r.stage)?.[1]},{key:'value',label:'القيمة',render:r=>fmtSAR(r.value)},{key:'probability',label:'الاحتمال',render:r=>`${r.probability}%`},{key:'next_follow_up',label:'المتابعة القادمة',render:r=>fmtTime(r.next_follow_up)}]} />
      </TabsContent>
      <TabsContent value="activities"><DataTable rows={filter(activities.data ?? [])} loading={activities.isLoading} error={activities.error} searchKeys={['summary','customer.name']} onRowClick={r=>open('activity',r)} cols={[{key:'customer',label:'العميل',render:r=>r.customer?.name},{key:'summary',label:'التواصل'},{key:'due_at',label:'الموعد',render:r=>fmtTime(r.due_at)},{key:'completed',label:'الحالة',render:r=><Button variant="ghost" size="sm" disabled={complete.isPending} onClick={e=>{e.stopPropagation();complete.mutate(r);}}><Check />{r.completed?'مكتملة':'إنهاء المتابعة'}</Button>}]} /></TabsContent>
      <TabsContent value="customers"><DataTable rows={selected ? customerRows.filter(r=>r.id===selected) : customerRows} loading={customers.isLoading} error={customers.error} searchKeys={['name','phone','contact_name','city']} onRowClick={r=>open('customer',r)} cols={[{key:'name',label:'العميل'},{key:'contact_name',label:'جهة الاتصال'},{key:'phone',label:'الجوال'},{key:'city',label:'المدينة'},{key:'email',label:'البريد (اختياري)'}]} /></TabsContent>
    </Tabs>
    <EntityDialog open={dialog==='customer'} onOpenChange={o=>!o&&setDialog(null)} title="بيانات العميل" table="customers" fields={customerFields} record={record} invalidate={['customers']} />
    <EntityDialog open={dialog==='opportunity'} onOpenChange={o=>!o&&setDialog(null)} title="فرصة بيع" table="crm_opportunities" fields={opportunityFields} record={record} invalidate={['crm_opportunities']} />
    <EntityDialog open={dialog==='activity'} onOpenChange={o=>!o&&setDialog(null)} title="تواصل ومتابعة" table="crm_activities" fields={activityFields} record={record} invalidate={['crm_activities']} />
  </section>;
}