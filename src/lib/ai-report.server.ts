import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { plainDailyReport, type DailyFacts } from "./daily-report";

/**
 * Builds the 8 AM Arabic operations summary from live data and stores it.
 * The plain figures are saved first so the report survives a scheduler cut-off; the AI wording then replaces it when it finishes in time.
 */
export async function generateDailyReport(source: "scheduled" | "manual") {
  const apiKey = process.env.LOVABLE_API_KEY;
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 864e5).toISOString().slice(0, 10);
  const [trips, docs, exp, wo, inc, tasks] = await Promise.all([
    db.from("trips").select("number,origin_city,dest_city,status,planned_end,exception").in("status", ["planned", "assigned", "in_progress"]).limit(200),
    db.from("documents").select("doc_type,number,expiry_date").lte("expiry_date", in30).limit(100),
    db.from("expenses").select("category,amount").eq("status", "pending").limit(200),
    db.from("work_orders").select("number,kind,workflow_status").not("workflow_status", "in", "(closed,rejected)").limit(100),
    db.from("incidents").select("number,kind,severity,status").not("status", "in", "(closed,resolved)").limit(50),
    db.from("tasks").select("title,priority,status,due_at").in("status", ["assigned", "submitted", "returned"]).limit(100),
  ]);
  const failed = [trips, docs, exp, wo, inc, tasks].find((r) => r.error);
  if (failed?.error) throw new Error(`تعذر قراءة بيانات التقرير: ${failed.error.message}`);
  const late = (trips.data ?? []).filter((t) => t.status === "in_progress" && t.planned_end && new Date(t.planned_end) < now);
  const facts: DailyFacts = {
    date: now.toISOString().slice(0, 10),
    active_trips: (trips.data ?? []).length,
    late_trips: late,
    expiring_documents: docs.data ?? [],
    pending_expenses: { count: (exp.data ?? []).length, total_sar: (exp.data ?? []).reduce((s, e) => s + Number(e.amount), 0) },
    open_work_orders: wo.data ?? [],
    open_incidents: inc.data ?? [],
    open_tasks: tasks.data ?? [],
  };

  const plain = plainDailyReport(facts);
  const { data: saved, error } = await db.from("ai_reports").insert({ report_date: facts.date, body: plain, source }).select("id").single();
  if (error || !saved) throw new Error(error?.message ?? "تعذر حفظ التقرير");
  if (!apiKey) return plain;

  try {
    const provider = createOpenAI({ baseURL: "https://ai.gateway.lovable.dev/v1", apiKey, headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" } });
    const result = streamText({
      model: provider.responses("openai/gpt-6-astra"),
      system:
        "أنت مساعد عمليات لشركة نقل بري سعودية اسمها Shata. اكتب ملخصاً صباحياً بالعربية الفصحى المختصرة: عنوان، ثم أقسام قصيرة بنقاط: الرحلات المتأخرة، المستندات القريبة من الانتهاء، المصروفات المعلقة، الصيانة، الحوادث، المهام المفتوحة، ثم 3 توصيات عملية لليوم. لا تخترع أرقاماً غير موجودة في البيانات. العملة ر.س.",
      messages: [{ role: "user", content: "بيانات اليوم بصيغة JSON:\n" + JSON.stringify(facts) }],
      maxRetries: 0,
      // the scheduler disconnects after a few seconds; the plain report is already saved, so the AI wording only replaces it when it finishes in time
      abortSignal: AbortSignal.timeout(source === "scheduled" ? 3500 : 25000),
      providerOptions: { openai: { store: false, reasoningEffort: "low" } },
    });
    const text = await result.text;
    const body = text.trim();
    if (!body) return plain;
    await db.from("ai_reports").update({ body }).eq("id", saved.id);
    return body;
  } catch (e) {
    console.error("AI wording skipped; plain report kept", e);
    return plain;
  }
}
