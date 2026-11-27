import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { classifyBridge, isPetroReviewer, normalizedTxnSchema, parsePage, PETRO_REVIEWER_ROLES, safeSummary } from "@/lib/petroapp";
import { bridgeConfig, callBridge } from "@/lib/petroapp-bridge.server";

const env = { PETROAPP_RAE_BRIDGE_URL: "https://bridge.example.test", PETROAPP_RAE_BRIDGE_TOKEN: "tok-SECRET-123" };
const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const noWait = async () => {};
const sql = readFileSync("drizzle/migrations/0061_petroapp_foundation.sql", "utf8");
const safety = readFileSync("drizzle/migrations/0062_petroapp_safety_pass.sql", "utf8");
const integrity = readFileSync("drizzle/migrations/0063_petroapp_full_tank_strict_state.sql", "utf8");
const panel = readFileSync("src/components/darb/PetroAppPanel.tsx", "utf8");

describe("PetroApp bridge client", () => {
  const awakeFetcher = (handler: (url: string) => Response) => vi.fn(async (input: unknown, _init?: RequestInit) => {
    const url = String(input);
    return url.endsWith("/livez") ? res(200, { ok: true }) : handler(url);
  });

  it("returns missing without calling anything when config is absent", async () => {
    const fetcher = vi.fn();
    const r = await callBridge("/health", { method: "GET" }, { env: {}, fetcher: fetcher as any });
    expect(r.state).toBe("missing");
    expect(fetcher).not.toHaveBeenCalled();
    expect(bridgeConfig({ PETROAPP_RAE_BRIDGE_URL: "http://plain", PETROAPP_RAE_BRIDGE_TOKEN: "x" }).ready).toBe(false);
  });
  it("preflights an already-awake bridge once, then makes the requested call", async () => {
    const fetcher = awakeFetcher(() => res(200, { ok: true }));
    const r = await callBridge("/health", { method: "GET" }, { env, fetcher: fetcher as any });
    expect(r.state).toBe("connected");
    expect(fetcher.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://bridge.example.test/livez",
      "https://bridge.example.test/health",
    ]);
  });
  it("waits through a transient sleeping response and calls sync only after liveness recovers", async () => {
    let elapsed = 0;
    let livenessCalls = 0;
    const urls: string[] = [];
    const waits: number[] = [];
    const fetcher = vi.fn(async (input: unknown) => {
      const url = String(input);
      urls.push(url);
      if (url.endsWith("/livez")) {
        livenessCalls += 1;
        return livenessCalls === 1 ? res(503, {}) : res(200, { ok: true });
      }
      return res(200, { transactions: [], next_cursor: null });
    });
    const r = await callBridge("/v1/petroapp/sync", { method: "POST", body: {} }, {
      env,
      fetcher: fetcher as any,
      now: () => elapsed,
      wait: async (ms) => { waits.push(ms); elapsed += ms; },
    });
    expect(r.state).toBe("connected");
    expect(waits).toEqual([5000]);
    expect(urls).toEqual([
      "https://bridge.example.test/livez",
      "https://bridge.example.test/livez",
      "https://bridge.example.test/v1/petroapp/sync",
    ]);
  });
  it("stops at the 90-second liveness bound with a safe retry message and no requested call", async () => {
    let elapsed = 0;
    const urls: string[] = [];
    const fetcher = vi.fn(async (input: unknown) => {
      urls.push(String(input));
      return res(503, {});
    });
    const r = await callBridge("/health", { method: "GET" }, {
      env,
      fetcher: fetcher as any,
      now: () => elapsed,
      wait: async (ms) => { elapsed += ms; },
    });
    expect(elapsed).toBe(90000);
    expect(fetcher).toHaveBeenCalledTimes(18);
    expect(urls.every((url) => url.endsWith("/livez"))).toBe(true);
    expect(r.state).toBe("error");
    expect(r.body).toBeNull();
    expect(r.detail).toContain("90 ثانية");
    expect(r.detail).toContain("إعادة المحاولة");
    expect(r.detail).toContain("لم تُجلب أو تُحفظ أي بيانات");
  });
  it("never sends credentials to liveness, but retains bearer auth on the requested endpoint", async () => {
    const fetcher = awakeFetcher(() => res(200, { ok: true }));
    await callBridge("/health", { method: "GET" }, { env, fetcher: fetcher as any });
    const livezInit = fetcher.mock.calls[0]?.[1];
    const requestInit = fetcher.mock.calls[1]?.[1];
    expect(livezInit?.headers).toEqual({ Accept: "application/json" });
    expect(JSON.stringify(livezInit)).not.toContain(env.PETROAPP_RAE_BRIDGE_TOKEN);
    expect(requestInit?.headers).toMatchObject({ Authorization: `Bearer ${env.PETROAPP_RAE_BRIDGE_TOKEN}` });
  });
  it("stops immediately on HTTP 429 and on explicit security warning", async () => {
    for (const [status, body] of [[429, {}], [200, { error: "security_warning" }], [503, { error: "rate_limited" }]] as const) {
      const fetcher = awakeFetcher(() => res(status, body));
      const r = await callBridge("/v1/petroapp/sync", { method: "POST", body: {} }, { env, fetcher: fetcher as any, wait: noWait });
      expect(r.state).toBe("rate_limited");
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });
  it("reports auth expiry without retrying", async () => {
    const fetcher = awakeFetcher(() => res(401, {}));
    const r = await callBridge("/health", { method: "GET" }, { env, fetcher: fetcher as any, wait: noWait });
    expect(r.state).toBe("auth_expired");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retries only transient requested-endpoint failures, bounded with exponential backoff", async () => {
    const waits: number[] = [];
    const fetcher = awakeFetcher(() => res(503, {}));
    const r = await callBridge("/health", { method: "GET" }, { env, fetcher: fetcher as any, wait: async (ms) => { waits.push(ms); } });
    expect(r.state).toBe("error");
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(waits).toEqual([500, 1000]);
    const once = awakeFetcher(() => res(400, {}));
    await callBridge("/health", { method: "GET" }, { env, fetcher: once as any, wait: noWait });
    expect(once).toHaveBeenCalledTimes(2);
  });
  it("never leaks the token in results", async () => {
    const fetcher = awakeFetcher(() => res(500, { message: "failed with token tok-SECRET-123 card 4111111111111111" }));
    const r = await callBridge("/health", { method: "GET" }, { env, fetcher: fetcher as any, wait: noWait });
    expect(JSON.stringify(r)).not.toContain("tok-SECRET-123");
    expect(JSON.stringify(r)).not.toContain("4111111111111111");
    expect(safeSummary("Authorization: Bearer abc")).not.toContain("abc");
  });
  it("calls only the configured bridge, never a PetroApp host", async () => {
    const fetcher = awakeFetcher(() => res(200, { ok: true }));
    await callBridge("/health", { method: "GET" }, { env, fetcher: fetcher as any });
    expect(fetcher.mock.calls.map((call) => String(call[0]))).toEqual([
      "https://bridge.example.test/livez",
      "https://bridge.example.test/health",
    ]);
    expect(classifyBridge(200, {}).state).toBe("connected");
  });
});

describe("PetroApp normalized contract", () => {
  it("rejects full card numbers, missing IDs and unknown fields; keeps unavailable fields as null", () => {
    const p = parsePage({ transactions: [
      { provider_txn_id: "A1", occurred_at: "2026-11-01T08:00:00Z", liters: "50", unit_price: 2.33, amount: 116.5, station: null, provider_state: "completed" },
      { provider_txn_id: "A2", occurred_at: "2026-11-01T08:00:00Z", provider_card_ref: "4111 1111 1111 1111" },
      { occurred_at: "2026-11-01T08:00:00Z" },
      { provider_txn_id: "A4", occurred_at: "2026-11-01T08:00:00Z", guessed_field: 1 },
    ], unavailable_fields: ["odometer", "not_a_field"] });
    expect(p.rows.map((r) => r.provider_txn_id)).toEqual(["A1"]);
    expect(p.rows[0]?.liters).toBe(50);
    expect(p.rows[0]?.station).toBeNull();
    expect(p.rejected).toBe(3);
    expect(p.unavailable).toEqual(["odometer"]);
    expect(parsePage({ nope: 1 }).ok).toBe(false);
  });
});

describe("PetroApp database rules (migration)", () => {
  it("keeps idempotency, review gating and role checks in the database", () => {
    expect(sql).toContain("provider_txn_id text NOT NULL UNIQUE");
    expect(sql).toContain("'petroapp:' || ex.provider_txn_id");
    expect(sql).toContain("'petroapp', 'pending'");
    expect(sql).toContain("coalesce(odometer_km, 0) < ex.odometer");
    expect(sql).toContain("v_map := 'ambiguous'");
    expect(sql).toContain("'correction_pending'");
    expect(sql).toContain("status = 'rate_limited' AND started_at > now() - interval '30 minutes'");
    expect(sql).toContain("FROM PUBLIC, anon");
    expect(sql).not.toMatch(/token|cookie|password/i);
    expect(sql).not.toMatch(/driver'|workshop'/);
  });
});

describe("PetroApp safety pass", () => {
  const canAs = (roles: string[]) => (...need: string[]) => need.some((r) => roles.includes(r));
  it("authorizes the owner and the review roles, and nobody else", () => {
    expect(isPetroReviewer(canAs(["owner"]))).toBe(true);
    for (const r of ["ops_manager", "accountant", "fleet_supervisor"]) expect(isPetroReviewer(canAs([r]))).toBe(true);
    for (const r of ["driver", "workshop", "dispatcher", "representative", "maintenance"]) expect(isPetroReviewer(canAs([r]))).toBe(false);
    // Same set as the DB gate petroapp_can_review().
    expect(sql).toContain(`'{${PETRO_REVIEWER_ROLES.join(",")}}'`);
    expect(panel).toContain("isPetroReviewer(can)");
  });
  it("skips WhatsApp only for PetroApp fuel rows", () => {
    expect(safety).toContain("IF TG_TABLE_NAME='fuel_entries' AND NEW.source='petroapp' THEN RETURN NEW; END IF;");
    expect(safety).toContain("'fuel', NEW.id");
    expect(safety).toContain("'expense', NEW.id");
  });
  it("never copies the unproven odometer into fuel entries or assets", () => {
    const imp = safety.slice(safety.indexOf("FUNCTION public.petroapp_import"), safety.indexOf("FUNCTION public.petroapp_review"));
    expect(imp).not.toMatch(/UPDATE assets|odometer_km|ex\.odometer/);
    expect(safety.slice(safety.indexOf("FUNCTION public.petroapp_review"))).not.toContain("odometer = ex.odometer");
  });
  it("requires provider_state: missing and unknown are rejected, never assumed completed", () => {
    expect(integrity).toContain("IF v_state IS NULL OR v_state NOT IN ('completed','cancelled') THEN RAISE EXCEPTION");
    const base = { provider_txn_id: "T1", occurred_at: "2026-11-01T08:00:00Z" };
    expect(normalizedTxnSchema.safeParse({ ...base, provider_state: "reversed" }).success).toBe(false);
    expect(normalizedTxnSchema.safeParse(base).success).toBe(false);
    expect(normalizedTxnSchema.parse({ ...base, provider_state: "completed" }).provider_state).toBe("completed");
  });
  it("never guesses full_tank: null unless mapped, explicit before approve/import/correction", () => {
    const base = { provider_txn_id: "T1", occurred_at: "2026-11-01T08:00:00Z", provider_state: "completed" };
    expect(normalizedTxnSchema.parse(base).full_tank).toBeUndefined();
    expect(normalizedTxnSchema.safeParse({ ...base, full_tank: "yes" }).success).toBe(false);
    expect(integrity).not.toContain("false, 'petroapp'");
    expect(integrity).toContain("NULL, ex.full_tank, 'petroapp'");
    expect(integrity).toContain("full_tank = ex.full_tank, status = 'pending'");
    expect((integrity.match(/ex\.full_tank IS NULL/g) ?? []).length).toBe(3);
    expect(integrity).toMatch(/petroapp_set_full_tank[\s\S]*petroapp_can_review\(\)/);
    expect(integrity).toContain("petroapp_set_full_tank(uuid, boolean) FROM PUBLIC, anon");
    expect(panel).toContain('aria-label="خزان ممتلئ"');
  });
  it("maps cards to drivers only explicitly and still requires a vehicle", () => {
    expect(panel).toContain('aria-label="السائق"');
    expect(panel).toContain('if (!f.provider_ref.trim() || !f.asset_id)');
  });
});
