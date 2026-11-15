import { createOpenAI } from '@ai-sdk/openai';
import { NoObjectGeneratedError, Output, streamText } from 'ai';
import { z } from 'zod';
import { INTAKE_DOC_TYPES, INTAKE_ROLES } from './person-intake';

const LOVABLE_AIG_RUN_ID_HEADER = 'X-Lovable-AIG-Run-ID';
function runIdFetch() {
  let runId: string | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
    const response = await fetch(input, { ...init, headers });
    runId ??= response.headers.get(LOVABLE_AIG_RUN_ID_HEADER)?.trim() || undefined;
    return response;
  };
}

const schema = z.object({
  person_type: z.enum(['driver', 'employee']),
  suggested_role: z.enum(INTAKE_ROLES),
  full_name: z.string().nullable(),
  phone: z.string().nullable(),
  national_id: z.string().nullable(),
  nationality: z.string().nullable(),
  license_no: z.string().nullable(),
  license_expiry: z.string().nullable(),
  job_title: z.string().nullable(),
  summary: z.string(),
  documents: z.array(z.object({
    file_index: z.number(),
    doc_type: z.enum(INTAKE_DOC_TYPES),
    number: z.string().nullable(),
    issue_date: z.string().nullable(),
    expiry_date: z.string().nullable(),
  })),
});
export type IntakeExtraction = z.infer<typeof schema>;

export type IntakeFile = { name: string; mediaType: string; base64: string };

const INSTRUCTIONS = `أنت موظف شؤون موظفين في شركة نقل سعودية اسمها Shata. ستصلك ملفات شخص واحد (سيرة ذاتية، هوية، إقامة، رخصة قيادة، بطاقة سائق، جواز...). الملفات مرقمة بالترتيب بدءًا من 0.
- اقرأ كل ملف واستخرج البيانات الموجودة فعلًا فقط. لا تخمّن ولا تخترع؛ أي معلومة غير موجودة اجعلها null.
- person_type: driver إذا كان الشخص سائقًا أو مندوب توصيل أو لديه خبرة قيادة شاحنات/نقل كوظيفته الأساسية، وإلا employee.
- suggested_role: driver للسائق؛ للموظف اختر الأقرب: dispatcher (حركة/تشغيل)، fleet_supervisor (مشرف أسطول)، accountant (محاسبة)، maintenance (مسؤول صيانة)، field_maintenance (فني/ميكانيكي)، ops_manager (مدير تشغيل).
- phone كما هو مكتوب. national_id رقم الهوية الوطنية أو الإقامة.
- كل التواريخ بصيغة YYYY-MM-DD ميلادي. إن كان التاريخ هجريًا فقط حوّله إلى الميلادي بدقة، وإن لم تتأكد اجعله null.
- documents: عنصر لكل ملف (file_index) يذكر نوعه ورقمه وتاريخ إصداره وانتهائه. إن احتوى الملف على أكثر من مستند أضف عنصرًا لكل مستند بنفس file_index.
- summary: سطران بالعربية عن الشخص وخبرته.`;

/** Reads the person's files with the AI and returns only the structured details found in them. */
export async function extractPerson(files: IntakeFile[]): Promise<IntakeExtraction> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error('خدمة التحليل غير مهيأة');
  const provider = createOpenAI({ baseURL: 'https://ai.gateway.lovable.dev/v1', apiKey, headers: { 'Lovable-API-Key': apiKey, 'X-Lovable-AIG-SDK': 'vercel-ai-sdk' }, fetch: runIdFetch() });
  const content: any[] = [{ type: 'text', text: `عدد الملفات: ${files.length}. أسماؤها بالترتيب: ${files.map((f, i) => `${i}) ${f.name}`).join('، ')}` }];
  files.forEach((f, i) => {
    content.push({ type: 'text', text: `الملف رقم ${i}: ${f.name}` });
    content.push({ type: 'file', filename: f.name, data: f.base64, mediaType: f.mediaType });
  });
  const result = streamText({
    model: provider.responses('openai/gpt-6-astra'),
    system: INSTRUCTIONS,
    messages: [{ role: 'user', content }],
    output: Output.object({ schema }),
    maxRetries: 0,
    providerOptions: { openai: { forceReasoning: true, reasoningEffort: 'low', reasoningSummary: 'auto', store: false, include: ['reasoning.encrypted_content'] } },
  });
  try {
    const out = await result.output;
    return { ...out, documents: out.documents.filter(d => Number.isInteger(d.file_index) && d.file_index >= 0 && d.file_index < files.length) };
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new Error('لم يتمكن التحليل من قراءة الملفات؛ ارفع صورًا أوضح أو ملف PDF');
    const status = (e as { statusCode?: number })?.statusCode;
    if (status === 402) throw new Error('رصيد الذكاء الاصطناعي غير كافٍ؛ أضف رصيدًا ثم أعد المحاولة');
    if (status === 429) throw new Error('ضغط مؤقت على خدمة التحليل؛ أعد المحاولة بعد دقيقة');
    if (status === 403) throw new Error('خدمة التحليل غير متاحة لهذا الحساب حاليًا');
    throw new Error('تعذر تحليل الملفات حاليًا؛ أعد المحاولة');
  }
}

export function toBase64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
