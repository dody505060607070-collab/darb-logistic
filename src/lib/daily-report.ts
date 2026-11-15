/** Plain daily summary built only from stored figures, so the morning report exists even when the AI writer is slow. */
export type DailyFacts = {
  date: string;
  active_trips: number;
  late_trips: { number: string; origin_city: string; dest_city: string }[];
  expiring_documents: { doc_type: string; number: string | null; expiry_date: string | null }[];
  pending_expenses: { count: number; total_sar: number };
  open_work_orders: { number: string }[];
  open_incidents: { number: string; severity: string }[];
  open_tasks: { title: string; priority: string }[];
};

const sar = (n: number) => `${(Math.round(n * 100) / 100).toLocaleString('en-US')} ر.س`;

export function plainDailyReport(f: DailyFacts): string {
  const lines = [`ملخص تشغيل Shata — ${f.date}`, ''];
  lines.push(`• الرحلات النشطة: ${f.active_trips}`);
  lines.push(`• الرحلات المتأخرة: ${f.late_trips.length}${f.late_trips.length ? ` (${f.late_trips.slice(0, 5).map(t => t.number).join('، ')})` : ''}`);
  lines.push(`• مستندات تنتهي خلال 30 يومًا: ${f.expiring_documents.length}`);
  lines.push(`• مصروفات بانتظار المراجعة: ${f.pending_expenses.count} بقيمة ${sar(f.pending_expenses.total_sar)}`);
  lines.push(`• أوامر صيانة مفتوحة: ${f.open_work_orders.length}`);
  const critical = f.open_incidents.filter(i => i.severity === 'critical' || i.severity === 'high').length;
  lines.push(`• بلاغات وحوادث مفتوحة: ${f.open_incidents.length}${critical ? ` (منها ${critical} عالية الخطورة)` : ''}`);
  lines.push(`• مهام لم تُعتمد بعد: ${f.open_tasks.length}`);
  return lines.join('\n');
}
