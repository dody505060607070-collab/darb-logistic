import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

/** Builds the 8 AM Arabic operations summary from live data and stores it. */
export async function generateDailyReport(source: "scheduled" | "manual") {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("LOVABLE_API_KEY is not configured");
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 864e5).toISOString().slice(0, 10);
  const since = new Date(now.getTime() - 864e5).toISOString();
  const [trips, docs, exp, wo, inc, tasks] = await Promise.all([
    db.from("trips").select("number,origin_city,dest_city,status,planned_end,exception").in("status", ["planned", "assigned", "in_progress"]).limit(200),
    db.from("documents").select("doc_type,number,expiry_date").lte("expiry_date", in30).limit(100),
    db.from("expenses").select("category,amount").eq("status", "pending").limit(200),
    db.from("work_orders").select("number,kind,status").not("status", "in", "(done,closed,cancelled,completed)").limit(100),
    db.from("incidents").select("number,kind,severity,status").not("status", "in", "(closed,resolved)").limit(50),
    db.from("tasks").select("title,priority,status,due_at").in("status", ["assigned", "submitted"]).limit(100),
  ]);
  const late = (trips.data ?? []).filter((t) => t.status === "in_progress" && t.planned_end && new Date(t.planned_end) < now);
  const facts = {
    date: now.toISOString().slice(0, 10),
    active_trips: (trips.data ?? []).length,
    late_trips: late,
    expiring_documents: docs.data ?? [],
    pending_expenses: { count: (exp.data ?? []).length, total_sar: (exp.data ?? []).reduce((s, e) => s + Number(e.amount), 0) },
    open_work_orders: wo.data ?? [],
    open_incidents: inc.data ?? [],
    open_tasks: tasks.data ?? [],
    window_since: since,
  };

  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system:
      "أنت مساعد عمليات لشركة نقل بري سعودية اسمها دَرب. اكتب ملخصاً صباحياً بالعربية الفصحى المختصرة: عنوان، ثم أقسام قصيرة بنقاط: الرحلات المتأخرة، المستندات القريبة من الانتهاء، المصروفات المعلقة، الصيانة، الحوادث، المهام المفتوحة، ثم 3 توصيات عملية لليوم. لا تخترع أرقاماً غير موجودة في البيانات. العملة ر.س.",
    messages: [{ role: "user", content: "بيانات اليوم بصيغة JSON:\n" + JSON.stringify(facts) }],
    maxRetries: 0,
    providerOptions: { openai: { store: false, reasoningEffort: "low" } },
  });
  const body = (await result.text).trim();
  if (!body) throw new Error("لم يرجع الذكاء الاصطناعي أي نص");
  const { error } = await db.from("ai_reports").insert({ report_date: facts.date, body, source });
  if (error) throw new Error(error.message);
  return body;
}
