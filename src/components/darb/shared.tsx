import { toast } from "sonner";
import { Badge } from "./ui";
import type { Field } from "./EntityDialog";
import { signedUrl } from "@/lib/db";
import { ASSET_KIND, daysUntil, errMsg, fmtDate, STATUS } from "@/lib/format";

/** Branch picker: a typed name that is not listed is added as a new branch (city left «غير محدد»). */
export const BRANCH_REF: NonNullable<Field["ref"]> = { table: "branches", label: "name", create: (name) => ({ name, city: "غير محدد" }), createdNoun: "كفرع جديد" };

export const ASSET_FIELDS: Field[] = [
  { name: "code", label: "رقم الأصل", required: true },
  { name: "kind", label: "النوع", type: "select", required: true, options: Object.entries(ASSET_KIND) },
  { name: "plate", label: "اللوحة" },
  { name: "make_model", label: "الشركة والطراز" },
  { name: "year", label: "سنة الصنع", type: "number" },
  { name: "vin", label: "رقم الهيكل (VIN)" },
  { name: "trailer_type", label: "نوع المقطورة", hint: "للمقطورات فقط" },
  { name: "capacity_tons", label: "السعة (طن)", type: "number" },
  { name: "status", label: "الحالة التشغيلية", type: "select", required: true, default: "available", options: Object.entries(STATUS["asset"]!).map(([k, v]) => [k, v[0]]) },
  { name: "odometer_km", label: "العداد (كم)", type: "number" },
  { name: "location_text", label: "الموقع الحالي" },
  { name: "branch_id", label: "الفرع", type: "ref", ref: BRANCH_REF, hint: "اختر الفرع أو اكتب اسمه، أو اكتب «لا يوجد فرع»" },
  { name: "notes", label: "ملاحظات", type: "textarea" },
];

export const DRIVER_FIELDS: Field[] = [
  { name: "code", label: "رقم السائق", required: true },
  { name: "full_name", label: "الاسم الكامل", required: true },
  { name: "phone", label: "الجوال" },
  { name: "email", label: "البريد الإلكتروني", hint: "لربط السائق بتطبيق السائق عبر دعوة" },
  { name: "national_id", label: "رقم الهوية/الإقامة" },
  { name: "nationality", label: "الجنسية" },
  { name: "license_no", label: "رقم الرخصة" },
  { name: "license_expiry", label: "انتهاء الرخصة", type: "date" },
  { name: "status", label: "الحالة", type: "select", default: "available", options: Object.entries(STATUS["driver"]!).map(([k, v]) => [k, v[0]]) },
  { name: "branch_id", label: "الفرع", type: "ref", ref: BRANCH_REF, hint: "اختر الفرع أو اكتب اسمه، أو اكتب «لا يوجد فرع»" },
];

export const DOC_FIELDS: Field[] = [
  { name: "doc_type", label: "نوع المستند", required: true, type: "select", options: [["استمارة", "استمارة"], ["تأمين", "تأمين"], ["فحص دوري", "فحص دوري"], ["ترخيص وزارة النقل", "ترخيص وزارة النقل (بطاقة التشغيل)"], ["رخصة قيادة", "رخصة قيادة"], ["بطاقة سائق", "بطاقة سائق"], ["إقامة", "إقامة"], ["أخرى", "أخرى"]] },
  { name: "number", label: "الرقم" },
  { name: "issue_date", label: "تاريخ الإصدار", type: "date" },
  { name: "expiry_date", label: "تاريخ الانتهاء", type: "date" },
  { name: "review_status", label: "حالة المراجعة", type: "select", default: "pending", options: [["pending", "بانتظار المراجعة"], ["approved", "معتمد"], ["rejected", "مرفوض"]] },
  { name: "file_path", label: "المرفق", type: "file" },
  { name: "notes", label: "ملاحظات", type: "textarea" },
];

export function DocExpiry({ d }: { d?: string | null }) {
  const n = daysUntil(d);
  if (n === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex items-center gap-2">
      <span className="num">{fmtDate(d)}</span>
      <Badge tone={n < 0 ? "danger" : n <= 30 ? "warning" : "success"}>{n < 0 ? "منتهٍ" : n <= 30 ? `${n} يوم` : "ساري"}</Badge>
    </span>
  );
}

export async function openFile(path?: string | null) {
  if (!path) return;
  try {
    window.open(await signedUrl(path), "_blank", "noopener");
  } catch (e) {
    toast.error(errMsg(e));
  }
}
