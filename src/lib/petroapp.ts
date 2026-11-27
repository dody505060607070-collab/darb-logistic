import { z } from "zod";

/**
 * PetroApp normalized contract (OUR bridge's output, not PetroApp's format).
 * The RAE bridge maps only source fields observed in a permitted capture; anything it did not
 * observe is sent as null and listed in `unavailable_fields`. Nothing here guesses PetroApp names.
 */
const num = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]).transform(Number).pipe(z.number().finite()).nullable().optional();
const text = (max: number) => z.string().trim().max(max).nullable().optional();

export const PETRO_FIELDS = ["provider_vehicle_ref", "provider_card_ref", "card_last4", "station", "fuel_type", "liters", "unit_price", "amount", "odometer"] as const;

export const normalizedTxnSchema = z.object({
  provider_txn_id: z.string().trim().min(1).max(120),
  occurred_at: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "invalid timestamp"),
  provider_vehicle_ref: text(120),
  // Opaque card reference only; a full card number (12–19 digits) is rejected outright.
  provider_card_ref: text(120).refine((v) => !v || !/^\d{12,19}$/.test(v.replace(/[\s-]/g, "")), "full card number not allowed"),
  card_last4: z.string().regex(/^\d{4}$/).nullable().optional(),
  station: text(200),
  fuel_type: text(60),
  liters: num.refine((v) => v == null || v > 0, "liters must be > 0"),
  unit_price: num.refine((v) => v == null || v >= 0),
  amount: num.refine((v) => v == null || v >= 0),
  odometer: num.refine((v) => v == null || v >= 0),
  provider_state: z.enum(["completed", "cancelled"]).default("completed"),
}).strict();
export type NormalizedTxn = z.infer<typeof normalizedTxnSchema>;

export const bridgePageSchema = z.object({
  transactions: z.array(z.unknown()).max(500),
  next_cursor: z.string().max(200).nullable().optional(),
  unavailable_fields: z.array(z.string()).optional(),
});

/** Roles that may see and run the PetroApp panel; mirrors DB petroapp_can_review(). Owner included. */
export const PETRO_REVIEWER_ROLES = ["owner", "ops_manager", "accountant", "fleet_supervisor"] as const;
export const isPetroReviewer = (can: (...roles: any[]) => boolean) => can(...PETRO_REVIEWER_ROLES);

export type PetroState = "missing" | "connected" | "rate_limited" | "auth_expired" | "error";

/** Parses one bridge page; invalid rows are reported (by index only) and never staged. */
export function parsePage(body: unknown) {
  const page = bridgePageSchema.safeParse(body);
  if (!page.success) return { ok: false as const, rows: [] as NormalizedTxn[], rejected: 0, nextCursor: null, unavailable: [] as string[] };
  const rows: NormalizedTxn[] = [];
  let rejected = 0;
  for (const raw of page.data.transactions) {
    const r = normalizedTxnSchema.safeParse(raw);
    if (r.success) rows.push(r.data); else rejected++;
  }
  const unavailable = (page.data.unavailable_fields ?? []).filter((f) => (PETRO_FIELDS as readonly string[]).includes(f));
  return { ok: true as const, rows, rejected, nextCursor: page.data.next_cursor ?? null, unavailable };
}

/** Classifies a bridge HTTP result. 429 or an explicit rate-limit/security warning is a hard stop. */
export function classifyBridge(status: number, body: unknown): { state: PetroState; retry: boolean } {
  const err = body && typeof body === "object" ? String((body as Record<string, unknown>)["error"] ?? "") : "";
  if (status === 429 || err === "rate_limited" || err === "security_warning") return { state: "rate_limited", retry: false };
  if (status === 401 || status === 403 || err === "auth_expired") return { state: "auth_expired", retry: false };
  if (status >= 200 && status < 300) return { state: "connected", retry: false };
  if (status === 0 || status === 502 || status === 503 || status === 504) return { state: "error", retry: true };
  return { state: "error", retry: false };
}

export const RETRY = { attempts: 3, baseMs: 500, timeoutMs: 15000 } as const;
export const backoffMs = (attempt: number) => RETRY.baseMs * 2 ** attempt;

/** Removes anything that looks like a credential before text is stored or shown. */
export function safeSummary(text: string) {
  return text
    .replace(/bearer\s+\S+/gi, "Bearer [hidden]")
    .replace(/(bearer|token|cookie|authorization|password|secret)[^\s,;]*[\s:=]+\S+/gi, "$1=[hidden]")
    .replace(/\b\d{12,19}\b/g, "[card]")
    .slice(0, 300);
}

export const STATE_LABEL: Record<PetroState, string> = {
  missing: "لم يتم الإعداد",
  connected: "متصل",
  rate_limited: "موقوف مؤقتًا (حد الطلبات)",
  auth_expired: "انتهت صلاحية الدخول",
  error: "خطأ",
};
