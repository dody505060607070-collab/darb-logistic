import { normalizePhone } from './phone';

/** Person-file intake rules (browser-safe, also used by the server before creating an account). */
export const INTAKE_DOC_TYPES = ['هوية وطنية', 'إقامة', 'رخصة قيادة', 'بطاقة سائق', 'جواز سفر', 'سيرة ذاتية', 'شهادة', 'أخرى'] as const;
export type IntakeDocType = (typeof INTAKE_DOC_TYPES)[number];
export const INTAKE_ROLES = ['driver', 'dispatcher', 'fleet_supervisor', 'accountant', 'maintenance', 'field_maintenance', 'ops_manager'] as const;
export type IntakeRole = (typeof INTAKE_ROLES)[number];
/** National ID and iqama both prove identity. */
export const IDENTITY_DOCS = ['هوية وطنية', 'إقامة'];

export type IntakeDoc = { file_index: number; doc_type: string; number: string | null; issue_date: string | null; expiry_date: string | null };
export type IntakeFields = {
  full_name: string | null;
  phone: string | null;
  national_id: string | null;
  nationality: string | null;
  license_no: string | null;
  license_expiry: string | null;
  documents: IntakeDoc[];
};

function blank(v: string | null | undefined) { return !v || !v.trim(); }
function validDate(v: string | null | undefined) { return !!v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)); }

export function intakePhone(raw: string | null | undefined): string | null {
  if (blank(raw)) return null;
  try { return normalizePhone('+966', raw as string); } catch { return null; }
}

/**
 * Everything still needed before the person can be created.
 * Drivers need identity, a valid licence and the company's required driver documents; employees need identity.
 */
export function intakeMissing(role: string, f: IntakeFields, requiredDriverDocs: string[] = ['إقامة', 'رخصة قيادة', 'بطاقة سائق'], today = new Date().toISOString().slice(0, 10)): string[] {
  const out: string[] = [];
  if (blank(f.full_name)) out.push('الاسم الكامل');
  if (!intakePhone(f.phone)) out.push('رقم جوال صحيح');
  if (blank(f.national_id)) out.push('رقم الهوية أو الإقامة');
  const usable = f.documents.filter(d => !(validDate(d.expiry_date) && (d.expiry_date as string) < today));
  const has = (types: string[]) => usable.some(d => types.includes(d.doc_type));
  const expired = (types: string[]) => f.documents.some(d => types.includes(d.doc_type) && validDate(d.expiry_date) && (d.expiry_date as string) < today);
  const requireDoc = (label: string, types: string[]) => { if (!has(types)) out.push(expired(types) ? `${label} (منتهية — مطلوب نسخة سارية)` : label); };
  requireDoc('صورة الهوية أو الإقامة', IDENTITY_DOCS);
  if (role === 'driver') {
    if (blank(f.license_no)) out.push('رقم رخصة القيادة');
    if (!validDate(f.license_expiry)) out.push('تاريخ انتهاء الرخصة');
    else if ((f.license_expiry as string) < today) out.push('رخصة القيادة منتهية — مطلوب تجديدها');
    for (const doc of requiredDriverDocs) {
      if (IDENTITY_DOCS.includes(doc)) continue;
      requireDoc(doc === 'رخصة قيادة' ? 'صورة رخصة القيادة' : `صورة ${doc}`, [doc]);
    }
  }
  return [...new Set(out)];
}

export function missingMessage(name: string | null, items: string[]) {
  return `مرحبًا ${name?.trim() || ''}\nلاستكمال تسجيلك في شركة Shata نحتاج منك:\n${items.map(i => `• ${i}`).join('\n')}\nأرسلها على هذا الرقم أو سلّمها للإدارة، وسيُفعَّل حسابك بعد اكتمالها.`;
}
