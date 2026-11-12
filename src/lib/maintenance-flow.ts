export const MAINTENANCE_STATES: Record<string, string> = {
  review: 'قيد المراجعة', returned: 'معاد للاستكمال', rejected: 'مرفوض', approved: 'معتمد',
  assigned: 'موجه للورشة / الموظف', waiting: 'قيد الانتظار', repairing: 'تحت الصيانة',
  waiting_parts: 'بانتظار قطع غيار', additional_review: 'بانتظار اعتماد إضافي',
  ready_delivery: 'جاهزة للتسليم', closed: 'مستلمة ومغلقة',
};
export const MAINTENANCE_TRANSITIONS: Record<string, string[]> = {
  review: ['returned','rejected','approved'], returned: ['review'], approved: ['assigned'],
  assigned: ['waiting','repairing','waiting_parts','additional_review'],
  waiting: ['repairing','waiting_parts','additional_review'], repairing: ['waiting_parts','ready_delivery','additional_review'],
  waiting_parts: ['repairing','additional_review'], additional_review: ['repairing','returned','rejected'],
  ready_delivery: ['closed','repairing'], closed: [], rejected: [],
};
export function maintenanceActions(state: string, manager: boolean): string[] {
  return (MAINTENANCE_TRANSITIONS[state] ?? []).filter(s => manager || (!['approved','returned','rejected','assigned','closed'].includes(s) && state !== 'additional_review'));
}