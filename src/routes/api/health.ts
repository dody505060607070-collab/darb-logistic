import { createFileRoute } from "@tanstack/react-router";

/** Lightweight process liveness endpoint for Docker and reverse-proxy health checks. */
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
