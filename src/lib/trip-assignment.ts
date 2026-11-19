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
  const tNotReady = vehicleNotReady(tractor);
  if (tNotReady) return tNotReady;
  if (trailer) {
    if (tractor.kind === "rigid") return "الشاحنة المنفردة لا تقطر مقطورة";
    const trNotReady = vehicleNotReady(trailer);
    if (trNotReady) return trNotReady;
    if (p.weightTons != null && trailer.capacity_tons != null && p.weightTons > Number(trailer.capacity_tons)) return "الحمولة تتجاوز سعة المقطورة";
  } else if (tractor.kind === "tractor" && !p.isEmpty) return "رأس القاطرة يحتاج مقطورة لرحلة محمّلة";
  return null;
}

/** Vehicles in maintenance or stopped cannot be booked; returns the reason shown next to the vehicle, or null when it can drive. */
export function vehicleNotReady(v: R): string | null {
  if (!v) return null;
  if (v.status === "stopped") return `${v.code} متوقفة حتى تُغلق الصيانة المفتوحة عليها`;
  if (v.status === "maintenance") return `${v.code} في الصيانة حاليًا`;
  return null;
}

export type OpenCustody = { asset_id: string; driver_id: string };
type Pair = { driver_id?: string; tractor_id?: string };

/** Choosing a truck fills its custody driver (and vice versa) only when the other choice is still empty. */
export function pairFromCustody(custody: OpenCustody[], current: Pair, changed: keyof Pair, value: string): Pair {
  if (!value) return {};
  if (changed === "tractor_id") {
    if (current.driver_id) return {};
    const c = custody.find((x) => x.asset_id === value);
    return c ? { driver_id: c.driver_id } : {};
  }
  if (current.tractor_id) return {};
  const held = custody.filter((x) => x.driver_id === value);
  return held.length === 1 ? { tractor_id: held[0]!.asset_id } : {};
}
