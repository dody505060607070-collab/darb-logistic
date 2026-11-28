import { createOpenAI } from "@ai-sdk/openai";

export type DarbAIConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
  lovableGateway: boolean;
  headers: Record<string, string>;
};

/**
 * Lovable preview keeps its managed gateway by default.
 * A self-hosted deployment supplies AI_API_KEY, AI_API_BASE_URL and AI_MODEL.
 * The external provider must implement the OpenAI Responses API because document
 * intake and translation use the /responses endpoint.
 */
export function getDarbAIConfig(): DarbAIConfig | null {
  const externalKey = process.env.AI_API_KEY?.trim();
  if (externalKey) {
    const baseURL = (process.env.AI_API_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "");
    const model = process.env.AI_MODEL?.trim();
    if (!model) throw new Error("AI_MODEL is required when AI_API_KEY is configured");
    const parsed = new URL(baseURL);
    if (
      parsed.protocol !== "https:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      throw new Error("AI_API_BASE_URL must use HTTPS");
    }
    return { apiKey: externalKey, baseURL, model, lovableGateway: false, headers: {} };
  }

  const lovableKey = process.env.LOVABLE_API_KEY?.trim();
  if (!lovableKey) return null;
  return {
    apiKey: lovableKey,
    baseURL: "https://ai.gateway.lovable.dev/v1",
    model: process.env.AI_MODEL?.trim() || "openai/gpt-6-astra",
    lovableGateway: true,
    headers: {
      "Lovable-API-Key": lovableKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  };
}

export function createDarbAIProvider(fetchImpl?: typeof fetch) {
  const config = getDarbAIConfig();
  if (!config) return null;
  return createOpenAI({
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    headers: config.headers,
    ...(fetchImpl ? { fetch: fetchImpl } : {}),
  });
}
