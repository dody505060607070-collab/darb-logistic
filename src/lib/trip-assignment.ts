/** Mirrors the checks in the assign_trip_resources RPC so a trip is never saved with a driver choice that will be refused. */
type R = Record<string, any> | null | undefined;

export function assignmentProblem(p: { driver: R; tractor: R; trailer: R; endIso: string | null; isEmpty?: boolean; weightTons?: number | null }): string | null {
  const { driver, tractor, trailer, endIso } = p;
  if (!driver) return null;
  if (driver.status === "suspended") return `السائق ${driver.full_name} موقوف`;
  const endDate = endIso ? endIso.slice(0, 10) : null;
  if (!driver.license_expiry) return `رخصة السائق ${driver.full_name} غير مسجلة — أضف تاريخ انتهاء الرخصة من صفحة السائق أولًا`;
  if (endDate && String(driver.license_expiry) < endDate) return `رخصة السائق ${driver.full_name} تنتهي قبل نهاية الرحلة`;
  if (!tractor) return "اختر رأس القاطرة أو الشاحنة مع السائق، وإلا لن تُسند الرحلة له";
  if (!["tractor", "rigid"].includes(tractor.kind)) return "يجب اختيار رأس قاطرة أو شاحنة منفردة";
  if (["maintenance", "stopped"].includes(tractor.status)) return `المركبة ${tractor.code} غير جاهزة حاليًا`;
  if (trailer) {
    if (tractor.kind === "rigid") return "الشاحنة المنفردة لا تقطر مقطورة";
    if (["maintenance", "stopped"].includes(trailer.status)) return `المقطورة ${trailer.code} غير جاهزة حاليًا`;
    if (p.weightTons != null && trailer.capacity_tons != null && p.weightTons > Number(trailer.capacity_tons)) return "الحمولة تتجاوز سعة المقطورة";
  } else if (tractor.kind === "tractor" && !p.isEmpty) return "رأس القاطرة يحتاج مقطورة لرحلة محمّلة";
  return null;
}
