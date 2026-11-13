import { flushWhatsApp } from "./whatsapp.functions";
/** Fire-and-forget: send queued WhatsApp notices now (the 1-minute schedule is the fallback). */
export function flushWa() { setTimeout(() => { void flushWhatsApp().catch(() => undefined); }, 400); }
