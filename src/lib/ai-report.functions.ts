import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Owner/ops manager can generate the AI summary on demand. */
export const runDailyReportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: ok } = await context.supabase.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["owner", "ops_manager"],
    });
    if (!ok) throw new Error("غير مصرح");
    const { generateDailyReport } = await import("./ai-report.server");
    const body = await generateDailyReport("manual");
    return { body };
  });
