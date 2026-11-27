import { createFileRoute } from "@tanstack/react-router";

/**
 * Process liveness only. This endpoint deliberately does not query Supabase,
 * WhatsApp, PetroApp, or any other upstream service.
 */
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          service: "darb",
          timestamp: new Date().toISOString(),
        }),
    },
  },
});
