/** Date locale follows the chosen site language (Arabic default). */
function loc(cal: string) {
  let en = false;
  try { en = typeof localStorage !== "undefined" && localStorage.getItem("shata-lang") === "en"; } catch { /* ssr */ }
  return `${en ? "en-GB" : "ar-SA"}-u${cal ? `-ca-${cal}` : ""}-nu-latn`;
}
const TZ = "Asia/Riyadh";

export function fmtDateTime(v?: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat(loc("gregory"), {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(v));
}
export function fmtDate(v?: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat(loc("gregory"), {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(v));
}
export function fmtTime(v?: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat(loc(""), { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(
    new Date(v),
  );
}
export function fmtHijri(d = new Date()) {
  return new Intl.DateTimeFormat(loc("islamic-umalqura"), {
    timeZone: TZ,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
export function fmtNum(v?: number | string | null, digits = 0) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}
export function fmtSAR(v?: number | string | null) {
  if (v === null || v === undefined) return "—";
  return `${fmtNum(v, 2)} ر.س`;
}
export function daysUntil(d?: string | null) {
  if (!d) return null;
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}
/** datetime-local input value (Riyadh wall-clock) from ISO */
export function toLocalInput(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 3 * 3600000);
  return d.toISOString().slice(0, 16);
}
/** ISO (UTC) from Riyadh wall-clock datetime-local value */
export function fromLocalInput(v: string) {
  if (!v) return null;
  return new Date(`${v}:00+03:00`).toISOString();
}

export type Tone = "success" | "info" | "warning" | "danger" | "neutral" | "gold";

export const STATUS: Record<string, Record<string, [string, Tone]>> = {
  trip: {
    draft: ["مسودة", "neutral"],
    planned: ["مخططة", "info"],
    ready: ["جاهزة", "info"],
    in_progress: ["قيد التنفيذ", "success"],
    delivered: ["تم التسليم", "gold"],
    closed: ["مغلقة تشغيليًا", "neutral"],
    cancelled: ["ملغاة", "danger"],
  },
  order: {
    draft: ["مسودة", "neutral"],
    confirmed: ["مؤكد", "info"],
    in_progress: ["قيد التنفيذ", "success"],
    completed: ["مكتمل", "gold"],
    cancelled: ["ملغى", "danger"],
  },
  asset: {
    available: ["متاحة", "info"],
    active: ["تعمل", "success"],
    maintenance: ["تحت الصيانة", "warning"],
    stopped: ["متوقفة", "danger"],
  },
  driver: {
    available: ["متاح", "info"],
    on_trip: ["في رحلة", "success"],
    off: ["إجازة", "neutral"],
    suspended: ["موقوف", "danger"],
  },
  review: {
    pending: ["بانتظار المراجعة", "warning"],
    approved: ["معتمد", "success"],
    rejected: ["مرفوض", "danger"],
  },
  wo: {
    open: ["مفتوح", "info"],
    diagnosis: ["تشخيص", "info"],
    waiting_parts: ["انتظار قطع", "warning"],
    in_progress: ["جارٍ", "success"],
    completed: ["مكتمل", "gold"],
    closed: ["مغلق", "neutral"],
  },
  incident: {
    reported: ["مُبلغ", "warning"],
    investigating: ["قيد التحقيق", "info"],
    claim: ["مطالبة تأمين", "gold"],
    resolved: ["تمت المعالجة", "success"],
    closed: ["مغلق", "neutral"],
  },
  severity: {
    low: ["منخفضة", "info"],
    medium: ["متوسطة", "warning"],
    high: ["عالية", "danger"],
    critical: ["حرجة", "danger"],
    info: ["معلومة", "info"],
    warning: ["تنبيه", "warning"],
  },
  invoice: {
    draft: ["مسودة", "neutral"],
    approved: ["معتمدة", "success"],
    cancelled: ["ملغاة", "danger"],
  },
  provider: {
    not_configured: ["مزود الفوترة غير مهيأ", "neutral"],
    sending: ["جارٍ الإرسال", "info"],
    failed: ["فشل", "danger"],
    accepted: ["مقبولة", "success"],
    issued: ["صادرة", "success"],
  },
  advance: { open: ["مفتوحة", "warning"], settled: ["مسواة", "success"] },
  tire: { in_stock: ["بالمخزن", "info"], mounted: ["مركب", "success"], retired: ["مستبعد", "neutral"] },
};

export const EVENT_LABELS: Record<string, string> = {
  pending: "بانتظار الانطلاق",
  arrived_pickup: "الوصول لموقع التحميل",
  loading_start: "بداية التحميل",
  loading_end: "نهاية التحميل",
  departed: "الانطلاق",
  arrived_delivery: "الوصول لموقع التسليم",
  unloading_start: "بداية التفريغ",
  unloading_end: "نهاية التفريغ",
  delivered: "تم التسليم",
  suspended: "تعليق الرحلة",
  breakdown: "عطل",
  resumed: "استئناف الرحلة",
  fuel_stop: "توقف للتزود بالوقود",
  rest_stop: "استراحة",
  note: "ملاحظة",
};

export const ASSET_KIND: Record<string, string> = { tractor: "رأس", trailer: "مقطورة", rigid: "شاحنة منفردة" };

export const CITY_COORDS: Record<string, [number, number]> = {
  الرياض: [24.7136, 46.6753],
  جدة: [21.4858, 39.1925],
  الدمام: [26.4207, 50.0888],
  "مكة المكرمة": [21.3891, 39.8579],
  مكة: [21.3891, 39.8579],
  "المدينة المنورة": [24.5247, 39.5692],
  بريدة: [26.326, 43.975],
  القصيم: [26.326, 43.975],
  تبوك: [28.3835, 36.5662],
  أبها: [18.2164, 42.5053],
  الطائف: [21.2703, 40.4158],
  حائل: [27.5114, 41.7208],
  جازان: [16.8892, 42.5511],
  نجران: [17.4924, 44.1277],
  الجبيل: [27.0046, 49.646],
  الخبر: [26.2172, 50.1971],
};

export function errMsg(e: unknown): string {
  if (!e) return "حدث خطأ غير متوقع";
  const m = (e as { message?: string }).message ?? String(e);
  if (m.includes("duplicate key")) return "سجل مكرر — القيمة مستخدمة مسبقًا";
  if (m.includes("row-level security")) return "ليست لديك صلاحية لهذه العملية";
  if (m.includes("custody_one_open_per_asset")) return "توجد عهدة مفتوحة لهذا الأصل";
  if (m.includes("tire_one_active_mount")) return "الإطار مركب في موقع آخر";
  if (m.includes("tire_position_one_active")) return "هذا الموضع مشغول بإطار آخر";
  if (m.includes("qty_on_hand")) return "الرصيد غير كافٍ — لا يُسمح بالرصيد السالب";
  return m;
}
