import { flushWhatsApp } from "./whatsapp.functions";
import { isPresentationLocation } from './presentation-runtime';
/** Fire-and-forget: send queued WhatsApp notices now (the 1-minute schedule is the fallback). */
export function flushWa() { if (isPresentationLocation()) return; setTimeout(() => { if (!isPresentationLocation()) void flushWhatsApp().catch(() => undefined); }, 400); }
