import type { Row } from './db';
import type { AppRole } from './auth';

export function companyDay(at: string | number | Date = new Date()) {
  const d = new Date(at);
  if (!Number.isFinite(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function pendingCustody(rows: Row[]) {
  return rows.filter(r => !r.closed_at && r.acknowledged === false);
}

export function custodyResponsibility(row: Row, roles: AppRole[], driverId: string | null) {
  if (row.closed_at || row.acknowledged !== false) return 'none';
  if (roles.includes('driver') && driverId && row.driver_id === driverId) return 'mine';
  return roles.some(r => ['owner', 'ops_manager', 'fleet_supervisor'].includes(r)) ? 'others' : 'none';
}

/** Calendar month in Riyadh; actual_end is the stored delivery event, order due is the contract. */
export function punctuality(rows: Row[], now = new Date()) {
  const month = companyDay(now).slice(0, 7);
  const delivered = rows.filter(r => ['delivered', 'closed'].includes(r.status));
  const missingActual = delivered.filter(r => !r.actual_end || !companyDay(r.actual_end));
  const period = delivered.filter(r => companyDay(r.actual_end).startsWith(month));
  const excluded = period.filter(r => r.is_empty || !r.order?.delivery_due_at || !Number.isFinite(Date.parse(r.order.delivery_due_at)));
  const eligible = period.filter(r => !excluded.includes(r));
  const onTime = eligible.filter(r => Date.parse(r.actual_end) <= Date.parse(r.order.delivery_due_at));
  return { eligible, onTime, excluded, missingActual, month, percent: eligible.length ? Math.round(onTime.length / eligible.length * 100) : null };
}

export function tractorUtilization(assets: Row[]) {
  const total = assets.filter(a => a.kind !== 'trailer');
  const active = total.filter(a => a.status === 'active');
  return { total, active, percent: total.length ? Math.round(active.length / total.length * 100) : null };
}

export function tripScope(rows: Row[], scope: string | undefined, now = new Date()) {
  if (scope === 'today') return rows.filter(r => companyDay(r.actual_start ?? r.planned_start ?? '') === companyDay(now) || r.status === 'in_progress');
  if (scope === 'late') return rows.filter(r => r.status === 'in_progress' && r.planned_end && Date.parse(r.planned_end) < now.getTime());
  if (scope === 'waiting') return rows.filter(r => ['draft', 'planned'].includes(r.status) && (!r.driver_id || !r.tractor_id));
  if (scope === 'delivered') return rows.filter(r => ['delivered', 'closed'].includes(r.status));
  return rows;
}

export function custodyMessageState(row?: Row) {
  if (!row) return 'لا توجد محاولة إرسال متاحة';
  if (row.state === 'accepted') return 'تم الإرسال للمزوّد؛ التسليم غير مؤكد';
  if (row.state === 'sending') return 'جارٍ الإرسال';
  if (row.state === 'pending') return 'بانتظار الإرسال';
  if (row.state === 'unresolved') return 'نتيجة الإرسال غير مؤكدة';
  if (row.state === 'cancelled') return 'أُلغي الإرسال';
  return 'تعذر الإرسال';
}