import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { INTAKE_DOC_TYPES, INTAKE_ROLES, intakeMissing, intakePhone, missingMessage } from './person-intake';

type Ctx = { supabase: any; userId: string };
async function requireOwner(context: Ctx) {
  const { data, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'owner' });
  if (error || !data) throw new Error('ترحيل ملفات الأشخاص متاح للمدير العام فقط');
}
const MAX_TOTAL = 25 * 1024 * 1024;
const uuid = z.string().uuid();

/** Read every file on the intake with the AI and store what was found. */
export const analyzePersonIntake = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ intakeId: uuid }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOwner(context as Ctx);
    const { data: intake, error } = await context.supabase.from('person_intakes').select('id,file_paths,status').eq('id', data.intakeId).maybeSingle();
    if (error || !intake) throw new Error('ملف الترحيل غير موجود');
    if (intake.status === 'completed') throw new Error('تم ترحيل هذا الشخص بالفعل');
    const paths: string[] = intake.file_paths ?? [];
    if (!paths.length) throw new Error('ارفع ملفًا واحدًا على الأقل');
    if (paths.length > 8) throw new Error('الحد الأقصى 8 ملفات للشخص');
    if (paths.some(p => !p.startsWith(`${context.userId}/onboarding/`))) throw new Error('ملفات غير مسموح بها');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { extractPerson, toBase64 } = await import('./person-intake-ai.server');
    let total = 0;
    const files = [];
    for (const path of paths) {
      const { data: blob, error: dlError } = await supabaseAdmin.storage.from('attachments').download(path);
      if (dlError || !blob) throw new Error('تعذر قراءة أحد الملفات المرفوعة');
      total += blob.size;
      if (total > MAX_TOTAL) throw new Error('حجم الملفات كبير؛ الحد 25 ميجابايت للشخص');
      const mediaType = blob.type || (path.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mediaType)) throw new Error('ارفع صورة أو PDF فقط');
      files.push({ name: path.split('/').pop()!.replace(/^[0-9a-f-]{36}-/, ''), mediaType, base64: toBase64(new Uint8Array(await blob.arrayBuffer())) });
    }
    const extracted = await extractPerson(files);
    const role = extracted.person_type === 'driver' ? 'driver' : extracted.suggested_role === 'driver' ? 'dispatcher' : extracted.suggested_role;
    const { error: saveError } = await context.supabase.from('person_intakes').update({
      extracted, full_name: extracted.full_name, phone: extracted.phone, person_type: extracted.person_type, role,
    }).eq('id', data.intakeId);
    if (saveError) throw new Error('تعذر حفظ نتيجة التحليل');
    return { extracted, role };
  });

const fieldsSchema = z.object({
  intakeId: uuid,
  role: z.enum(INTAKE_ROLES),
  full_name: z.string().trim().max(160).nullable(),
  phone: z.string().trim().max(40).nullable(),
  national_id: z.string().trim().max(40).nullable(),
  nationality: z.string().trim().max(80).nullable(),
  license_no: z.string().trim().max(60).nullable(),
  license_expiry: z.string().trim().max(10).nullable(),
  documents: z.array(z.object({
    file_index: z.number().int().min(0).max(7),
    doc_type: z.enum(INTAKE_DOC_TYPES),
    number: z.string().trim().max(60).nullable(),
    issue_date: z.string().trim().max(10).nullable(),
    expiry_date: z.string().trim().max(10).nullable(),
  })).max(20),
});
type Fields = z.infer<typeof fieldsSchema>;
const dateOrNull = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

async function requiredDriverDocs(supabase: any): Promise<string[]> {
  const { data } = await supabase.from('company_settings').select('doc_required_driver').eq('id', 1).maybeSingle();
  return data?.doc_required_driver?.length ? data.doc_required_driver : ['إقامة', 'رخصة قيادة', 'بطاقة سائق'];
}
async function saveReviewed(context: Ctx, d: Fields) {
  const missing = intakeMissing(d.role, d, await requiredDriverDocs(context.supabase));
  const { data: row, error } = await context.supabase.from('person_intakes').select('id,status,file_paths,extracted').eq('id', d.intakeId).maybeSingle();
  if (error || !row) throw new Error('ملف الترحيل غير موجود');
  if (row.status === 'completed') throw new Error('تم ترحيل هذا الشخص بالفعل');
  if (d.documents.some(doc => doc.file_index >= (row.file_paths?.length ?? 0))) throw new Error('مستند يشير إلى ملف غير موجود');
  const { error: saveError } = await context.supabase.from('person_intakes').update({
    full_name: d.full_name, phone: d.phone, role: d.role, person_type: d.role === 'driver' ? 'driver' : 'employee', missing,
    extracted: { ...(row.extracted ?? {}), reviewed: { ...d, intakeId: undefined } },
  }).eq('id', d.intakeId);
  if (saveError) throw new Error('تعذر حفظ البيانات');
  return { missing, row };
}

/** Save the reviewed details and send the person a WhatsApp list of what is still missing. */
export const requestIntakeMissing = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => fieldsSchema.extend({ send: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireOwner(context as Ctx);
    const { missing } = await saveReviewed(context as Ctx, data);
    if (!data.send) return { missing, sent: false, reason: '' };
    if (!missing.length) throw new Error('لا توجد نواقص؛ يمكنك الترحيل مباشرة');
    const phone = intakePhone(data.phone);
    if (!phone) return { missing, sent: false, reason: 'لا يوجد رقم جوال صحيح لإرسال النواقص' };
    const url = (process.env.WHATSAPP_SERVER_URL ?? '').trim().replace(/\/+$/, '');
    const instance = (process.env.WHATSAPP_INSTANCE ?? '').trim();
    const key = (process.env.WHATSAPP_SERVER_KEY ?? '').trim();
    if (!url || !instance || !key) return { missing, sent: false, reason: 'واتساب: لم يتم الربط' };
    const res = await fetch(`${url}/message/sendText/${encodeURIComponent(instance)}`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phone.slice(1), text: missingMessage(data.full_name, missing) }),
    });
    if (!res.ok) return { missing, sent: false, reason: `خادم واتساب رفض الإرسال [${res.status}]` };
    await context.supabase.from('person_intakes').update({ status: 'awaiting_documents', notified_at: new Date().toISOString() }).eq('id', data.intakeId);
    return { missing, sent: true, reason: '' };
  });

/** Create the account, role, driver file and documents only when nothing is missing. */
export const completePersonIntake = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => fieldsSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireOwner(context as Ctx);
    const { missing, row } = await saveReviewed(context as Ctx, data);
    if (missing.length) throw new Error(`لا يمكن الترحيل قبل استكمال: ${missing.join('، ')}`);
    const phone = intakePhone(data.phone)!;
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { provisionEmployee, rollbackEmployee } = await import('./employee-provision.server');
    const driver = data.role === 'driver'
      ? { national_id: data.national_id, nationality: data.nationality, license_no: data.license_no, license_expiry: dateOrNull(data.license_expiry) }
      : undefined;
    const { id, driverId } = await provisionEmployee(supabaseAdmin, { fullName: data.full_name!.trim(), phone, role: data.role, branchId: null, ...(driver ? { driver } : {}) });
    try {
      if (driverId && data.documents.length) {
        const docs = data.documents.filter(d => !['سيرة ذاتية'].includes(d.doc_type)).map(d => ({
          entity_type: 'driver', entity_id: driverId, doc_type: d.doc_type === 'هوية وطنية' ? 'إقامة' : d.doc_type,
          number: d.number, issue_date: dateOrNull(d.issue_date), expiry_date: dateOrNull(d.expiry_date),
          file_path: row.file_paths[d.file_index] ?? null, review_status: 'approved',
          notes: d.doc_type === 'هوية وطنية' ? 'هوية وطنية — من ملف الترحيل' : 'من ملف الترحيل',
        }));
        if (docs.length) { const { error } = await supabaseAdmin.from('documents').insert(docs); if (error) throw error; }
      }
      const { error } = await supabaseAdmin.from('person_intakes').update({ status: 'completed', completed_user_id: id, missing: [] }).eq('id', data.intakeId);
      if (error) throw error;
    } catch {
      await rollbackEmployee(supabaseAdmin, id);
      throw new Error('تعذر حفظ مستندات الشخص؛ لم يُنشأ الحساب');
    }
    return { id, driverId };
  });
