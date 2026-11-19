/** Time rules for sending queued WhatsApp messages inside a short scheduled run. */
export const SEND_TIMEOUT_MS = 3000;
/** Room for claiming the message and saving the result around the send itself. */
export const SEND_OVERHEAD_MS = 700;
/** The scheduler gives each run about 5 seconds; stay safely inside it. */
export const SCHEDULED_RUN_BUDGET_MS = 4300;

export function canStartSend(now: number, deadlineAt: number) {
  return now + SEND_TIMEOUT_MS + SEND_OVERHEAD_MS <= deadlineAt;
}
