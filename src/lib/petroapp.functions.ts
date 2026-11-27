import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** PetroApp (read-only) through OUR RAE bridge. Every handler checks the fuel-review roles server-side. */
type Ctx = { supabase: any; userId: string };

async function requireReviewer(context: Ctx) {
  const { data, error } = await context.supabase.rpc("petroapp_can_review");
  if (error || !data) throw new Error("غير مصرح — PetroApp متاح للمدير العام ومدير التشغيل والمحاسب ومشرف الأسطول");
}

const windowSchema = z.object({
  from: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
  to: z.string().refine((v) => !Number.isNaN(Date.parse(v))),
}).refine((w) => Date.parse(w.to) > Date.parse(w.from) && Date.parse(w.to) - Date.parse(w.from) <= 31 * 86400000, "النطاق حتى 31 يومًا");

async function finish(context: Ctx, run: string, status: string, counts: Record<string, number>, error?: string, cursor?: string | null) {
  await context.supabase.rpc("petroapp_run_finish", { p_run: run, p_status: status === "connected" ? "ok" : status, p_counts: counts, p_error: error ?? null, p_cursor: cursor ?? null });
}

export const petroappHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requireReviewer(ctx);
    const { bridgeConfig, callBridge } = await import("./petroapp-bridge.server");
    if (!bridgeConfig().ready) return { state: "missing" as const, detail: "لم يتم إعداد جسر PetroApp بعد", checkedAt: new Date().toISOString() };
    const { data: run, error } = await ctx.supabase.rpc("petroapp_run_begin", { p_mode: "health" });
    if (error) return { state: "rate_limited" as const, detail: error.message, checkedAt: new Date().toISOString() };
    const r = await callBridge("/health", { method: "GET" });
    await finish(ctx, run, r.state, {}, r.state === "connected" ? undefined : r.detail);
    return { state: r.state, detail: r.detail, checkedAt: new Date().toISOString() };
  });

export const petroappPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => windowSchema.parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    await requireReviewer(ctx);
    const { bridgeConfig, callBridge } = await import("./petroapp-bridge.server");
    const { parsePage } = await import("./petroapp");
    if (!bridgeConfig().ready) return { state: "missing" as const, detail: "لم يتم إعداد جسر PetroApp بعد", rows: [], rejected: 0, unavailable: [] as string[] };
    const { data: run, error } = await ctx.supabase.rpc("petroapp_run_begin", { p_mode: "preview", p_from: data.from, p_to: data.to });
    if (error) return { state: "rate_limited" as const, detail: error.message, rows: [], rejected: 0, unavailable: [] as string[] };
    const r = await callBridge("/v1/petroapp/preview", { method: "POST", body: { from: data.from, to: data.to, limit: 50 } });
    if (r.state !== "connected") { await finish(ctx, run, r.state, {}, r.detail); return { state: r.state, detail: r.detail, rows: [], rejected: 0, unavailable: [] as string[] }; }
    const page = parsePage(r.body);
    if (!page.ok) { await finish(ctx, run, "error", {}, "رد الجسر لا يطابق العقد"); return { state: "error" as const, detail: "رد الجسر لا يطابق العقد", rows: [], rejected: 0, unavailable: [] as string[] }; }
    await finish(ctx, run, "ok", { fetched: page.rows.length });
    return { state: "connected" as const, detail: "معاينة فقط — لم يُحفظ شيء", rows: page.rows.slice(0, 50), rejected: page.rejected, unavailable: page.unavailable };
  });

export const petroappSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => windowSchema.parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    await requireReviewer(ctx);
    const { bridgeConfig, callBridge } = await import("./petroapp-bridge.server");
    const { parsePage } = await import("./petroapp");
    if (!bridgeConfig().ready) return { state: "missing" as const, detail: "لم يتم إعداد جسر PetroApp بعد", staged: 0, duplicates: 0, corrections: 0, cancellations: 0, unmatched: 0, rejected: 0 };
    const { data: run, error } = await ctx.supabase.rpc("petroapp_run_begin", { p_mode: "sync", p_from: data.from, p_to: data.to });
    if (error) return { state: "rate_limited" as const, detail: error.message, staged: 0, duplicates: 0, corrections: 0, cancellations: 0, unmatched: 0, rejected: 0 };
    const totals = { staged: 0, duplicates: 0, corrections: 0, cancellations: 0, unmatched: 0, rejected: 0 };
    let cursor: string | null = null;
    for (let pageNo = 0; pageNo < 10; pageNo++) {
      const r = await callBridge("/v1/petroapp/sync", { method: "POST", body: { from: data.from, to: data.to, cursor, limit: 200 } });
      if (r.state !== "connected") { await finish(ctx, run, r.state, {}, r.detail, cursor); return { state: r.state, detail: r.detail, ...totals }; }
      const page = parsePage(r.body);
      if (!page.ok) { await finish(ctx, run, "error", {}, "رد الجسر لا يطابق العقد", cursor); return { state: "error" as const, detail: "رد الجسر لا يطابق العقد", ...totals }; }
      totals.rejected += page.rejected;
      if (page.rows.length) {
        const { data: res, error: e } = await ctx.supabase.rpc("petroapp_stage", { p_run: run, p_rows: page.rows });
        if (e) { await finish(ctx, run, "error", {}, "تعذر حفظ دفعة في منطقة المراجعة", cursor); return { state: "error" as const, detail: "تعذر حفظ دفعة في منطقة المراجعة", ...totals }; }
        for (const k of ["staged", "duplicates", "corrections", "cancellations", "unmatched"] as const) totals[k] += Number(res?.[k] ?? 0);
      }
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    await finish(ctx, run, "ok", {}, totals.rejected ? `${totals.rejected} عملية رُفضت لعدم مطابقة العقد` : undefined, cursor);
    return { state: "connected" as const, detail: "تم جلب العمليات إلى منطقة المراجعة؛ لم يُعتمد أي شيء تلقائيًا", ...totals };
  });

export const petroappImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d))
  .handler(async ({ context, data }) => {
    const ctx = context as unknown as Ctx;
    await requireReviewer(ctx);
    const { data: res, error } = await ctx.supabase.rpc("petroapp_import", { p_ids: data.ids });
    if (error) throw new Error(error.message);
    return { imported: Number(res?.imported ?? 0), skipped: Number(res?.skipped ?? 0) };
  });

export const petroappOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const ctx = context as unknown as Ctx;
    await requireReviewer(ctx);
    const { bridgeConfig } = await import("./petroapp-bridge.server");
    const count = async (f: (q: any) => any) => { const { count: c } = await f(ctx.supabase.from("petroapp_transactions").select("id", { count: "exact", head: true })); return c ?? 0; };
    const [runs, imported, pending, unmatched, corrections] = await Promise.all([
      ctx.supabase.from("petroapp_sync_runs").select("id,mode,status,started_at,completed_at,fetched,staged,duplicates,corrections,cancellations,unmatched,error_summary").order("started_at", { ascending: false }).limit(20),
      count((q) => q.eq("review_state", "imported")),
      count((q) => q.in("review_state", ["pending", "approved"])),
      count((q) => q.neq("mapping_status", "matched").in("review_state", ["pending", "rejected"])),
      count((q) => q.in("review_state", ["correction_pending", "cancellation_pending"])),
    ]);
    const list = (runs.data ?? []) as { status: string; started_at: string; mode: string }[];
    const lastSuccess = list.find((r) => r.mode === "sync" && r.status === "ok")?.started_at ?? null;
    return { configured: bridgeConfig().ready, lastState: list[0]?.status ?? null, lastAttempt: list[0]?.started_at ?? null, lastSuccess, runs: runs.data ?? [], counts: { imported, pending, unmatched, corrections } };
  });
