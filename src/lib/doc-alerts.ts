/** Document expiry stages and missing-document detection (pure, browser-safe). */
export const DEFAULT_ALERT_DAYS = [30, 15, 7];
export const DEFAULT_REQUIRED_DRIVER = ["إقامة", "رخصة قيادة", "بطاقة سائق"];
export const DEFAULT_REQUIRED_ASSET = ["استمارة", "تأمين", "فحص دوري", "تصريح تشغيل"];

/** Parse "30, 15, 7" into a sorted unique list of 1..365 days (max 5). Returns null if invalid. */
export function parseAlertDays(input: string): number[] | null {
  const parts = input.split(/[,،\s]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const nums = parts.map((p) => Number(p.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))));
  if (nums.some((n) => !Number.isInteger(n) || n < 1 || n > 365)) return null;
  const uniq = [...new Set(nums)].sort((a, b) => b - a);
  return uniq.length > 5 ? null : uniq;
}

export type DocStage =
  | { kind: "undated" }
  | { kind: "expired"; days: number }
  | { kind: "alert"; days: number; threshold: number }
  | { kind: "valid"; days: number };

/** Classify by days remaining; the alert threshold is the smallest configured window still containing the date. */
export function docStage(daysLeft: number | null, thresholds: number[] = DEFAULT_ALERT_DAYS): DocStage {
  if (daysLeft === null) return { kind: "undated" };
  if (daysLeft < 0) return { kind: "expired", days: daysLeft };
  const hit = [...thresholds].sort((a, b) => a - b).find((t) => daysLeft <= t);
  return hit === undefined ? { kind: "valid", days: daysLeft } : { kind: "alert", days: daysLeft, threshold: hit };
}

export type MissingDoc = { entity_type: "driver" | "asset"; entity_id: string; doc_type: string };

/** Required doc types an entity has no non-rejected record for. */
export function missingDocs(
  entities: { type: "driver" | "asset"; id: string }[],
  docs: { entity_type: string; entity_id: string | null; doc_type: string; review_status?: string | null }[],
  required: { driver: string[]; asset: string[] },
): MissingDoc[] {
  const have = new Set(docs.filter((d) => d.review_status !== "rejected").map((d) => `${d.entity_type}:${d.entity_id}:${d.doc_type}`));
  const out: MissingDoc[] = [];
  for (const e of entities) for (const t of required[e.type]) if (!have.has(`${e.type}:${e.id}:${t}`)) out.push({ entity_type: e.type, entity_id: e.id, doc_type: t });
  return out;
}

/** Parse a comma/Arabic-comma separated list of document type names. */
export function parseDocTypes(input: string): string[] {
  return [...new Set(input.split(/[,،\n]+/).map((s) => s.trim()).filter(Boolean))];
}

/** A licence recorded on the driver profile counts as the "رخصة قيادة" document. */
export function driverProfileDocs(drivers: { id: string; license_no?: string | null; license_expiry?: string | null }[]) {
  return drivers.filter((d) => d.license_no || d.license_expiry).map((d) => ({ entity_type: "driver", entity_id: d.id, doc_type: "رخصة قيادة", review_status: "approved" }));
}
