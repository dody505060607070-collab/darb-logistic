import { useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { CheckCircle2, CircleAlert, ListChecks, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { integrationHealth } from '@/lib/integration-health.functions';
import { whatsappStatus } from '@/lib/whatsapp.functions';
import { Button } from '@/components/ui/button';
import { Badge } from './ui';
import { fmtDateTime } from '@/lib/format';

type Check = { label: string; ok: boolean; detail: string };
export function SystemChecklist() {
  const health = useServerFn(integrationHealth);
  const whatsapp = useServerFn(whatsappStatus);
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState('');
  async function run() {
    setBusy(true);
    const [session, data, gateway] = await Promise.allSettled([
      supabase.from('profiles').select('id').limit(1), health(), whatsapp(),
    ]);
    const next: Check[] = [{ label: 'الوصول إلى بيانات الشركة', ok: session.status === 'fulfilled' && !session.value.error, detail: session.status === 'fulfilled' && !session.value.error ? 'تمت قراءة البيانات بالحساب الحالي' : 'تعذر قراءة البيانات' }];
    if (data.status === 'fulfilled') {
      next.push({ label: 'خادم Traccar', ok: data.value.tracking.state === 'connected', detail: data.value.tracking.detail });
      next.push({ label: 'المواقع المباشرة من أجهزة التتبع', ok: false, detail: 'مزامنة أجهزة Traccar مع شاحنات دَرب غير مفعّلة' });
      next.push({ label: 'خدمة مسارات الشاحنات', ok: data.value.routing.state === 'connected', detail: data.value.routing.detail });
    } else next.push({ label: 'التتبع والمسارات', ok: false, detail: 'تعذر إجراء الفحص' });
    next.push({ label: 'اتصال واتساب', ok: gateway.status === 'fulfilled' && gateway.value.state === 'open', detail: gateway.status === 'fulfilled' && gateway.value.state === 'open' ? 'متصل؛ لم تُرسل رسالة اختبار' : 'غير متصل أو تعذر التحقق' });
    next.push({ label: 'الفوترة الإلكترونية لدى الهيئة', ok: false, detail: 'لم يتم الربط' });
    setChecks(next); setAt(new Date().toISOString()); setBusy(false);
  }
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-xl font-bold"><ListChecks className="text-primary" /> قائمة التحقق</h2><Button variant="gold" onClick={() => void run()} disabled={busy}><RefreshCw className={busy ? 'animate-spin' : ''} />{busy ? 'جارٍ الفحص…' : 'فحص الآن'}</Button></div>
    {at && <p className="text-xs text-muted-foreground">آخر فحص: <span className="num">{fmtDateTime(at)}</span></p>}
    <div className="divide-y">{checks.map(c => <div key={c.label} className="flex items-start gap-3 py-4">{c.ok ? <CheckCircle2 className="mt-1 size-5 shrink-0 text-success" /> : <CircleAlert className="mt-1 size-5 shrink-0 text-warning" />}<div className="flex-1"><h3 className="font-semibold">{c.label}</h3><p className="mt-1 text-sm text-muted-foreground">{c.detail}</p></div><Badge tone={c.ok ? 'success' : 'warning'}>{c.ok ? 'تم التحقق' : 'غير مكتمل'}</Badge></div>)}</div>
  </section>;
}