/** Reminder cadence for open tasks: urgent every 12h, normal every 24h. */
export const REMINDER_HOURS = { urgent: 12, normal: 24 } as const;

export function nextReminderAt(priority: string, createdAt: string, now: Date): Date {
  const h = priority === "urgent" ? REMINDER_HOURS.urgent : REMINDER_HOURS.normal;
  const step = h * 3600e3;
  const start = new Date(createdAt).getTime();
  const n = Math.max(1, Math.ceil((now.getTime() - start) / step));
  return new Date(start + n * step);
}
