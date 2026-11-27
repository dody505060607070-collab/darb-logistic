import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const PUBLIC_INDEXABLE = new Set(["/login", "/privacy", "/terms", "/contact", "/robots.txt", "/sitemap.xml"]);

/** Baseline security headers; internal screens are never indexed (auth still protects them). */
const securityHeaders = createMiddleware().server(async ({ next, request }) => {
  const result = await next();
  const response = result instanceof Response ? result : result.response;
  try {
    const h = response.headers;
    h.set("X-Content-Type-Options", "nosniff");
    h.set("Content-Security-Policy", "base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests");
    if (request.headers.has('Authorization') || !PUBLIC_INDEXABLE.has(new URL(request.url).pathname)) h.set('Cache-Control', 'private, no-store');
    h.set("Referrer-Policy", "strict-origin-when-cross-origin");
    h.set("Permissions-Policy", "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()");
    h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    if (!PUBLIC_INDEXABLE.has(new URL(request.url).pathname)) h.set("X-Robots-Tag", "noindex, nofollow");
  } catch {
    /* immutable upstream response */
  }
  return result;
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

// Presentation screens reuse real views, never real server actions or bearer tokens.
const presentationIsolation = createMiddleware({ type: 'function' }).client(async ({ next }) => {
  if (window.location.pathname === '/demo') throw new Error('الخدمات الخارجية غير متاحة في تجربة الشرح؛ لم تُرسل أي بيانات');
  return next();
});

export const startInstance = createStart(() => ({
  functionMiddleware: [presentationIsolation, attachSupabaseAuth],
  requestMiddleware: [securityHeaders, errorMiddleware, csrfMiddleware],
}));
