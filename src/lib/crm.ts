export const CRM_STAGES: [string, string][] = [['new', 'جديدة'], ['qualified', 'مؤهلة'], ['proposal', 'عرض سعر'], ['negotiation', 'تفاوض'], ['won', 'مكتسبة'], ['lost', 'مفقودة']];
export type Opportunity = { stage: string; value: number | string; probability: number | string; next_follow_up?: string | null };
export function crmMetrics(rows: Opportunity[], now = new Date()) {
  const open = rows.filter(r => !['won', 'lost'].includes(r.stage));
  const cents = (v: number | string) => Math.round(Number(v) * 100);
  const won = rows.filter(r => r.stage === 'won');
  const closed = rows.filter(r => ['won', 'lost'].includes(r.stage));
  return {
    openCount: open.length,
    openValue: open.reduce((sum, r) => sum + cents(r.value), 0) / 100,
    weightedValue: open.reduce((sum, r) => sum + Math.round(cents(r.value) * Number(r.probability) / 100), 0) / 100,
    wonValue: won.reduce((sum, r) => sum + cents(r.value), 0) / 100,
    winRate: closed.length ? Math.round(won.length / closed.length * 100) : null,
    overdue: open.filter(r => r.next_follow_up && new Date(r.next_follow_up) < now).length,
  };
}