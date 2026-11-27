import { FileWarning } from 'lucide-react';
import { Badge } from './ui';
import { Button } from '@/components/ui/button';
import { QueryNotice } from './QueryNotice';
import { db, useOne, useRows } from '@/lib/db';
import { fetchAssets, fetchDrivers } from '@/lib/queries';
import { operationalDocuments } from '@/lib/operational-documents';
import { DEFAULT_ALERT_DAYS } from '@/lib/doc-alerts';
import { queryState } from '@/lib/query-state';
import { useScreenNavigate } from '@/lib/screen-navigation';
import { fmtDate } from '@/lib/format';

export function OperationalDocuments() {
  const nav = useScreenNavigate();
  const docs = useRows(['documents'], () => db.from('documents').select('*').order('expiry_date'));
  const assets = useRows(['assets'], fetchAssets);
  const drivers = useRows(['drivers'], fetchDrivers);
  const custody = useRows(['custody', 'open'], () => db.from('custody').select('*, driver:drivers(full_name)').is('closed_at', null));
  const settings = useOne(['company_settings'], () => db.from('company_settings').select('doc_alert_days, doc_required_driver, doc_required_asset').eq('id', 1).maybeSingle());
  const ready = queryState(docs).loaded && queryState(settings).loaded;
  const rows = ready ? operationalDocuments(docs.data ?? [], assets.data ?? [], drivers.data ?? [], custody.data ?? [], settings.data?.doc_alert_days?.length ? settings.data.doc_alert_days : DEFAULT_ALERT_DAYS) : [];
  return <section aria-label="وثائق التشغيل ذات الأولوية" className="space-y-2 border-y py-3">
    <h2 className="flex items-center gap-2 font-bold text-primary"><FileWarning className="size-5 shrink-0 text-danger" />وثائق التشغيل ذات الأولوية{ready && <span className="num">({rows.length})</span>}</h2>
    <QueryNotice query={docs} label="وثائق التشغيل" /><QueryNotice query={settings} label="مواعيد تنبيه المستندات" />
    {[{ query: assets, label: 'الأصول المرتبطة' }, { query: drivers, label: 'أصحاب المستندات' }, { query: custody, label: 'أصحاب العهد' }].map(({ query, label }) => <QueryNotice key={label} query={query} label={label} />)}
    {ready && !rows.length && <p className="text-sm text-muted-foreground">لا توجد وثائق تشغيل منتهية أو ضمن نافذة التنبيه</p>}
    {rows.slice(0, 3).map(({ document: d, stage, tone, related, person, personLabel, role, filter }) => <div key={d.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-b py-2 last:border-0">
      <div className="min-w-0 space-y-1 text-sm"><p className="break-words font-semibold">{related} · {d.doc_type} {d.number ?? ''}</p><Badge tone={tone}>{stage.kind === 'expired' ? `منتهٍ منذ ${Math.abs(stage.days)} يوم` : `باقي ${stage.days} يوم · تنبيه ${stage.threshold}`}</Badge><p className="text-xs">الانتهاء: {fmtDate(d.expiry_date)}</p><p className="text-xs text-muted-foreground">{person ? `${personLabel}: ${person} · ` : ''}مسؤول المتابعة: {role} (دور، لا إسناد لشخص محدد)</p></div>
      <Button size="sm" variant="outline" className="shrink-0" onClick={() => void nav({ to: '/documents', search: { id: d.id, filter, entity: d.entity_id } })}>فتح المستند</Button>
    </div>)}
    {rows.length > 3 && <Button size="sm" variant="link" onClick={() => void nav({ to: '/documents', search: { filter: 'operational' } })}>كل وثائق التشغيل ذات الأولوية ({rows.length})</Button>}
  </section>;
}