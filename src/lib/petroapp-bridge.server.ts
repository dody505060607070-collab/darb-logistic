import { backoffMs, classifyBridge, RETRY, safeSummary, type PetroState } from "./petroapp";

/**
 * Client for OUR self-hosted RAE bridge (Python/FastAPI). Never calls PetroApp directly.
 * Secrets: PETROAPP_RAE_BRIDGE_URL, PETROAPP_RAE_BRIDGE_TOKEN (server environment only).
 */
export function bridgeConfig(env: Record<string, string | undefined> = process.env) {
  const url = (env["PETROAPP_RAE_BRIDGE_URL"] ?? "").trim().replace(/\/+$/, "");
  const token = (env["PETROAPP_RAE_BRIDGE_TOKEN"] ?? "").trim();
  return { url, token, ready: /^https:\/\//.test(url) && token.length > 0 };
}

export type BridgeResult = { state: PetroState; status: number; body: unknown; detail: string };
type Fetcher = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callBridge(path: string, init: { method: "GET" | "POST"; body?: unknown }, deps: { fetcher?: Fetcher; env?: Record<string, string | undefined>; wait?: (ms: number) => Promise<void> } = {}): Promise<BridgeResult> {
  const cfg = bridgeConfig(deps.env);
  if (!cfg.ready) return { state: "missing", status: 0, body: null, detail: "لم يتم إعداد جسر PetroApp (العنوان والرمز في أسرار الخادم)" };
  const fetcher = deps.fetcher ?? fetch;
  const wait = deps.wait ?? sleep;
  let last: BridgeResult = { state: "error", status: 0, body: null, detail: "تعذر الاتصال بالجسر" };
  for (let attempt = 0; attempt < RETRY.attempts; attempt++) {
    let status = 0; let body: unknown = null;
    try {
      const res = await fetcher(`${cfg.url}${path}`, {
        method: init.method,
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(RETRY.timeoutMs),
      });
      status = res.status;
      const raw = await res.text();
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    } catch { status = 0; }
    const c = classifyBridge(status, body);
    const msg = body && typeof body === "object" ? String((body as Record<string, unknown>)["message"] ?? "") : "";
    last = { state: c.state, status, body: c.state === "connected" ? body : null, detail: safeSummary((msg || detailFor(c.state, status)).split(cfg.token).join("[hidden]")) };
    if (!c.retry) return last;
    if (attempt < RETRY.attempts - 1) await wait(backoffMs(attempt));
  }
  return last;
}

function detailFor(state: PetroState, status: number) {
  if (state === "rate_limited") return "المصدر طلب التوقف (حد الطلبات أو تحذير أمني) — لن نعيد المحاولة تلقائيًا";
  if (state === "auth_expired") return "انتهت جلسة الجسر لدى المصدر؛ يلزم تحديثها على خادم الجسر";
  if (state === "connected") return "الجسر متصل";
  return status ? `الجسر أعاد الحالة ${status}` : "تعذر الوصول إلى الجسر";
}
