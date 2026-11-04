type InstanceRow = { name?: string; instanceName?: string; ownerJid?: string | null; owner?: string | null; instance?: { instanceName?: string; owner?: string | null; ownerJid?: string | null } };
export function linkedWhatsAppNumber(payload: unknown, instanceName: string): string | null {
  const rows = (Array.isArray(payload) ? payload : [payload]) as (InstanceRow | null)[];
  const matches = rows.filter(r => r && (r.name === instanceName || r.instanceName === instanceName || r.instance?.instanceName === instanceName));
  if (matches.length !== 1) return null;
  const row = matches[0];
  const jid = row?.ownerJid ?? row?.instance?.ownerJid ?? row?.instance?.owner ?? row?.owner;
  if (typeof jid !== 'string' || !/^\d{9,15}(?::\d+)?@s\.whatsapp\.net$/.test(jid)) return null;
  const number = jid.split('@')[0]?.split(':')[0];
  return number && /^\d{9,15}$/.test(number) ? `+${number}` : null;
}