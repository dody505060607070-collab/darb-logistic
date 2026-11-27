import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getDarbAIConfig } from "./ai-provider.server";

/** Translate user-written text (e.g. a task) between Arabic and English on demand. */
export const translateText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { text: string; to: "en" | "ar" }) => {
    const text = String(d?.text ?? "").slice(0, 4000);
    if (!text.trim()) throw new Error("لا يوجد نص");
    return { text, to: d.to === "ar" ? "ar" as const : "en" as const };
  })
  .handler(async ({ data }) => {
    const aiConfig = getDarbAIConfig();
    if (!aiConfig) throw new Error("خدمة الترجمة غير مهيأة");
    const res = await fetch(`${aiConfig.baseURL}/responses`, {
      method: "POST",
      headers: { ...aiConfig.headers, Authorization: `Bearer ${aiConfig.apiKey}`, "Content-Type": "application/json", ...(aiConfig.lovableGateway ? { "X-Lovable-AIG-SDK": "fetch" } : {}) },
      body: JSON.stringify({
        model: aiConfig.model, stream: true, ...(aiConfig.lovableGateway ? { store: false, reasoning: { effort: "low" } } : {}),
        instructions: `Translate the user's text into ${data.to === "en" ? "English" : "Arabic"} for a Saudi logistics company. Output only the translation.`,
        input: data.text,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`تعذرت الترجمة [${res.status}]: ${(await res.text()).slice(0, 200)}`);
    const reader = res.body.getReader(); const dec = new TextDecoder();
    let buf = "", out = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop() ?? "";
      for (const l of lines) {
        if (!l.startsWith("data:")) continue;
        try { const j = JSON.parse(l.slice(5)); if (j.type === "response.output_text.delta") out += j.delta; } catch { /* keep-alive */ }
      }
    }
    return { text: out.trim() };
  });
