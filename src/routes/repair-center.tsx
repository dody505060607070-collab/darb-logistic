import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '@/components/darb/AppShell';
import { MaintenanceWorkflow } from '@/components/darb/MaintenanceWorkflow';
import { runShitaaAcceptance } from '@/lib/acceptance.functions';
import { useServerFn } from '@tanstack/react-start';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import { errMsg } from '@/lib/format';
export const Route=createFileRoute('/repair-center')({head:()=>({meta:[{title:'مركز الصيانة والورش — شركة شتاء'},{name:'description',content:'بلاغات الصيانة واعتمادها وتوجيه الأعمال للورش والفنيين ومتابعة الإصلاح والاستلام.'},{property:'og:title',content:'مركز الصيانة — شركة شتاء'},{property:'og:description',content:'الأعمال المسندة ومراحل الصيانة والموافقات وفحص الاستلام.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),component:()=> <AppShell><MaintenanceWorkflow/><Acceptance/></AppShell>});
function Acceptance(){const auth=useAuth();const run=useServerFn(runShitaaAcceptance);const [busy,setBusy]=useState(false);const [result,setResult]=useState<unknown>(null);if(!auth.can('owner'))return null;return <section className="mt-8 border-t pt-4"><Button variant="outline" disabled={busy} onClick={async()=>{setBusy(true);try{setResult(await run());}catch(e){toast.error(errMsg(e));}finally{setBusy(false);}}}>اختبار الصيانة والعهدة المعزول</Button>{result!==null&&<pre aria-label="نتائج اختبارات القبول" className="mt-3 overflow-auto whitespace-pre-wrap text-xs" dir="ltr">{JSON.stringify(result,null,2)}</pre>}</section>;}