export type TaskEvent = 'assigned' | 'submitted' | 'returned' | 'approved' | 'reminder';

export function canNotifyTask(event: TaskEvent, status: string, manager: boolean, assignee: boolean) {
  if (event === 'submitted') return status === 'submitted' && assignee;
  return manager && ((event === 'assigned' || event === 'returned' || event === 'reminder') ? status === 'assigned' : status === 'completed');
}

export function taskMessage(task: Record<string, any>, event: TaskEvent) {
  const headings = { assigned: 'تم تكليفك بمهمة جديدة', returned: 'أُعيدت المهمة لاستكمالها', submitted: 'مهمة بانتظار المراجعة', approved: 'تم اعتماد المهمة', reminder: 'تذكير بمهمة قيد التنفيذ' };
  return [
    `Shata — ${headings[event]}`, task.title, task.description,
    `الأولوية: ${task.priority === 'urgent' ? 'عاجلة' : 'عادية'}`,
    task.due_at ? `الموعد: ${new Date(task.due_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })}` : '',
    task.location_text ? `الموقع: ${task.location_text}` : '',
    task.lat != null && task.lng != null ? `https://maps.google.com/?q=${task.lat},${task.lng}` : '',
    event === 'returned' ? task.review_note : '', event === 'submitted' ? task.done_note : '',
    'https://darb.website/tasks',
  ].filter(Boolean).join('\n');
}