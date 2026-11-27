# Darb → existing Hostinger VPS: read-only migration inventory and phased plan

Status: inventory only. Nothing deployed, no files changed outside this plan, VPS not inspected yet. Items marked UNKNOWN need evidence before any write.

## 1. Runtime and build output (verified in repo)

- Stack: React 19 + TanStack Start/Router, Vite build (`package.json` scripts: dev, build, build:dev, preview, test). **No production `start` script.**
- `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, whose Nitro build defaults to the **Cloudflare (workerd) target**. `src/server.ts` exports a worker-style `fetch(request, env, ctx)` wrapper.
- Consequence: the current build output is not a Node server. Running on Node 22/24 needs either (a) a Nitro `node-server` preset build (config change, Build mode) or (b) running the Cloudflare output under `workerd`/`wrangler` in a container. Both UNVERIFIED; must be proven in a throwaway container first.
- `src/start.ts` adds security/noindex headers; `vite-plugin-pwa` emits `sw.js` — must be served from the same origin.
- Only Dockerfile in repo: `petroapp-bridge/Dockerfile` (Python 3.12 FastAPI, non-root, `PORT` fallback 8080, `/livez` + authenticated `/health`). No root Darb Dockerfile/Compose.
- A production container would need: Node 22 LTS image (or workerd), `bun install --frozen-lockfile`, build with the chosen preset, non-root user, `PORT` listener on 127.0.0.1-bound host port, env file, health route (none exists for Darb yet — UNKNOWN whether a `/livez`-style route is needed; would be a Build-mode change).

## 2. External services and portability

| Service | Evidence | Recommendation |
|---|---|---|
| Lovable Cloud DB/Auth/Storage/Realtime | `src/integrations/supabase/*`, 65 files in `drizzle/migrations/`, ~174 SECURITY DEFINER occurrences, bucket `attachments`, realtime in `src/components/screens/ChatScreen.tsx`, phone OTP login | **Stay external initially.** Self-hosting needs Postgres+GoTrue+Storage+Realtime and full data/auth export; separate project |
| Scheduled jobs | `src/routes/api/public/jobs/{daily-report,task-reminders,whatsapp-outbox,whatsapp-send}.ts`, guarded by `LOVABLE_CRON_SECRET` | Currently called by Cloud HTTP schedules. Keep them pointing at the current published URL until cutover; later re-point or use VPS cron/systemd timers |
| WhatsApp gateway (Evolution-style) | `src/lib/whatsapp.functions.ts`; code not in repo | External; location UNKNOWN (could already be on this VPS — check) |
| AI | `src/lib/ai-report.server.ts`, `person-intake-ai.server.ts`, `translate.functions.ts` use `LOVABLE_API_KEY` | Stay external |
| GPS Daman / Traccar (legacy) / OpenRouteService | `src/lib/daman-gps.server.ts` | External providers; check VPS egress |
| Maps | MapLibre + OpenFreeMap tiles, plugin in `public/vendor` | Browser-side, no change |
| PetroApp bridge | `petroapp-bridge/`, `render.yaml` (Free) | Portable; good first VPS candidate |
| Email | phone/WhatsApp OTP primary; no custom email sender found | none |

## 3. Env variable names only

Server: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `LOVABLE_CRON_SECRET`, `LOVABLE_CRON_SECRET_PREVIOUS`, `WHATSAPP_SERVER_URL`, `WHATSAPP_INSTANCE`, `WHATSAPP_SERVER_KEY`, `DAMAN_GPS_API_KEY`, `DAMAN_GPS_FLEET_ID`, `ORS_API_KEY`, `TRACCAR_URL`, `TRACCAR_EMAIL`, `TRACCAR_PASSWORD`, `PETROAPP_RAE_BRIDGE_URL`, `PETROAPP_RAE_BRIDGE_TOKEN`.
Build-time public: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
Bridge: `PETROAPP_RAE_BRIDGE_TOKEN`, `PETROAPP_BEARER_TOKEN`, `PETROAPP_FINGERPRINT`, `PETROAPP_PAYMENT_STATUS_MAP`, `PORT`.

Blocker: **the service-role key is not obtainable on Lovable Cloud.** Server functions that need it (account provisioning, driver access, jobs) cannot run on a self-hosted Darb server while the DB stays on Cloud. This makes "move the Darb web server, keep Cloud" infeasible today for those features — must be resolved before Phase 3.

Secret boundary: all of the above except VITE_* stay in a root-owned `/opt/darb/env/*.env` (mode 600), never in images, Compose YAML, git or logs.

DB logic that must keep working: RLS on every public table, SECURITY DEFINER RPCs, `*_guard` triggers, `no_overlapping_bookings` exclusion constraint, `whatsapp_outbox` triggers, `user_roles`/`app_role`, protected owner number. Auth callbacks: site/redirect URLs must include any new domain. Backup: real data export (DB, auth users, `attachments` objects) — migrations are not a backup.

## 4. Jobs, ports, storage, resources

- Jobs: 4 POST routes above; outbox several per minute with ~5s budget (`outbox-budget.ts`), daily report 08:00 Asia/Riyadh, reminders. No separate worker/queue process; queue is the DB outbox.
- Listeners: Darb SSR one HTTP port; bridge one HTTP port. Both bind 127.0.0.1 only.
- Persistent storage on VPS: none for Darb/bridge (stateless); logs only.
- Estimate (UNVERIFIED, measure): Darb SSR 300–600 MB RAM, bridge ~100 MB; well within KVM 4 if n8n/site leave headroom — confirm with `free`/`docker stats`.

## 5. Isolated layout (no impact on n8n or the other site)

```text
/opt/darb/
  compose.yaml          project name: darb (COMPOSE_PROJECT_NAME=darb)
  env/darb-web.env      600 root
  env/petroapp-bridge.env
  releases/<sha>/       build artifacts, rollback = previous sha
  logs/
Network: darb_net (dedicated bridge network, no attach to n8n network)
Containers: darb-web, darb-petroapp-bridge
Ports: 127.0.0.1:<free port A> -> web, 127.0.0.1:<free port B> -> bridge (pick after ss -ltnp)
```
Rules: never run `docker compose down`, `docker system prune`, `docker network prune` or restart Docker daemon; always pass `-p darb -f /opt/darb/compose.yaml`; no edits to existing Compose, proxy (nginx/Caddy/Traefik), firewall or DNS until explicitly approved; set memory limits on darb containers.

## 6. Preflight checks (read-only, before any write)

1. `uname -a`, `lsb_release -a`, `df -h`, `free -m`, `nproc`, uptime/load.
2. `docker ps -a`, `docker compose ls`, `docker network ls`, `docker volume ls` — record n8n and the other site's projects, names, networks.
3. `ss -ltnp` — used ports; identify which process owns 80/443.
4. Identify the reverse proxy and its config location (n8n often ships Traefik/Caddy); read only.
5. `ufw status`, `crontab -l`, `systemctl list-timers`.
6. Check whether the WhatsApp gateway already runs here.
7. Confirm a full Hostinger VPS snapshot exists and is recent.
8. Confirm DNS records for darb.website (currently pointing at Lovable hosting) — do not change.

## 7. Phased plan and rollback

1. **Phase 0 – Inspect** (read-only, section 6). Exit: written inventory of the VPS, free ports chosen, snapshot taken.
2. **Phase 1 – Bridge** on VPS under `/opt/darb`, loopback port, temporary subdomain added to the proxy only after approval. Verify `/livez`, then authenticated `/health`. Rollback: `docker compose -p darb down` (darb only), remove proxy block, keep Render config.
3. **Phase 2 – Darb server proof** (needs Build mode: Node preset or workerd container + Dockerfile + health route). Run on a staging subdomain against existing Cloud; test login, RLS screens, maps, chat realtime. Blocked by the service-role key issue for admin/job functions.
4. **Phase 3 – Jobs** re-pointed only after Phase 2 passes; never run Cloud and VPS schedules for the same job concurrently (outbox claims are atomic, but daily report would duplicate).
5. **Phase 4 – Cutover** of darb.website DNS with low TTL; rollback = restore DNS to Lovable hosting, which stays live throughout.
6. **Phase 5 (separate project)** – self-host DB/Auth/Storage/Realtime, only with tested export/restore.

## Unknowns
VPS proxy type and port usage; n8n install method; other site's stack; gateway location; Darb RAM under load; whether Lovable supports a Node build preset for this config; service-role key availability off-platform; approved subdomain names.

## Build-mode changes that would later be strictly necessary
- Production build target (Node preset or workerd) + `start` script.
- Root Dockerfile for Darb and an unauthenticated static `/livez` route.
Each will be described before requesting Build mode.
