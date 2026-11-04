import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Owner/ops manager can generate the AI summary on demand. */
export const runDailyReportNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "owner" || r.role === "ops_manager")) throw new Error("غير مصرح");
    const { generateDailyReport } = await import("./ai-report.server");
    const body = await generateDailyReport("manual");
    return { body };
  });
