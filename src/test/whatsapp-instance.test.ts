import { describe, expect, it } from 'vitest';
import { linkedWhatsAppNumber } from '@/lib/whatsapp-instance';
describe('connected company WhatsApp number', () => {
  it('shows the configured v2 instance number, not another company number', () => expect(linkedWhatsAppNumber([{name:'other',ownerJid:'201001234567@s.whatsapp.net'},{name:'darb',ownerJid:'966501234567@s.whatsapp.net'}],'darb')).toBe('+966501234567'));
  it('reads the older nested instance response', () => expect(linkedWhatsAppNumber([{instance:{instanceName:'darb',owner:'966501234567:2@s.whatsapp.net'}}],'darb')).toBe('+966501234567'));
  it('does not invent a number for a disconnected or unknown instance', () => expect(linkedWhatsAppNumber([{name:'other',ownerJid:'966501234567@s.whatsapp.net'}],'darb')).toBeNull());
});