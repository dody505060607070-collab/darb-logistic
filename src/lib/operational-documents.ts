import { docStage, DEFAULT_ALERT_DAYS } from './doc-alerts';
import { daysUntil } from './format';
import type { Row } from './db';

/** Operational expiry uses the document screen's configured windows, not an invented approval assignment. */
export function operationalDocuments(documents: Row[], assets: Row[], drivers: Row[], custody: Row[], thresholds = DEFAULT_ALERT_DAYS) {
  return documents.filter(d => ['asset', 'driver'].includes(d.entity_type)).flatMap(d => {
    const stage = docStage(daysUntil(d.expiry_date), thresholds);
    if (stage.kind !== 'expired' && stage.kind !== 'alert') return [];
    const entity = (d.entity_type === 'asset' ? assets : drivers).find(e => e.id === d.entity_id);
    const holder = d.entity_type === 'asset' ? custody.find(c => c.asset_id === d.entity_id && !c.closed_at) : undefined;
    const holderName = holder?.driver?.full_name ?? drivers.find(x => x.id === holder?.driver_id)?.full_name;
    return [{ document: d, stage, tone: stage.kind === 'expired' || stage.threshold === Math.min(...thresholds) ? 'danger' as const : 'warning' as const,
      related: entity?.code && d.entity_type === 'asset' ? entity.code : entity?.full_name ?? `${d.entity_type === 'asset' ? 'أصل' : 'سائق'} · ${d.entity_id ?? 'غير مربوط'}`,
      person: d.entity_type === 'driver' ? entity?.full_name : holderName,
      personLabel: d.entity_type === 'driver' ? 'صاحب المستند' : 'العهدة لدى',
      role: 'مشرف الأسطول', filter: stage.kind === 'expired' ? 'expired' : 'soon' }];
  }).sort((a, b) => a.stage.days - b.stage.days || String(a.document.id).localeCompare(String(b.document.id)));
}