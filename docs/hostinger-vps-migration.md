# Future Hostinger VPS migration runbook — Darb server/agent stack

**Current state: NOT MIGRATED; WHOLE-APP VPS READINESS IS NOT PROVEN.** The only current hosting preparation is **FREE TEMPORARY TEST HOSTING ONLY** for the isolated PetroApp bridge on Render Free. No Render or Hostinger service has been created, no payment method or secret was entered, and this runbook performs no migration. Hostinger plan, OS, region, domains, runtime, and data-migration choices must be confirmed later.

The user's future objective is to move the entire Darb server/agent stack to a Hostinger VPS, not just the bridge. The bridge is portable; the rest requires the work and decisions below.

## 1. Verified repository architecture (2026-11-27)

| Component | Verified current implementation | VPS consequence |
| --- | --- | --- |
| Darb browser + server app | React 19, TanStack Start/Router, Vite 8, SSR, `createServerFn`, and API routes. `package.json` has `dev`, `build`, and `preview`, but no production `start` script. | A production runtime/start command and container artifact must be selected and tested before migration. `vite preview` is not a production hosting claim. |
| Server build target | `vite.config.ts` uses Lovable's TanStack config, whose Nitro build defaults to Cloudflare; `src/server.ts` exports a worker-style `fetch(request, env, ctx)` handler. | The existing artifact cannot be assumed to run unchanged under Node/Docker. Choose and verify a VPS-compatible Node or workerd target, including `node:crypto` compatibility and server-only imports. |
| App containerization | The only Dockerfile is `petroapp-bridge/Dockerfile`. There is no root Darb Dockerfile or Compose manifest. | Only the bridge is currently Docker-portable. The Darb app needs its own reviewed production image and orchestration. |
| Auth, database, storage, realtime | Generated clients use external Supabase/Lovable Cloud. Browser/server auth verifies Supabase claims; server functions use publishable and service-role credentials. Data uses RLS/RPC/triggers, the `attachments` storage bucket, and realtime chat subscriptions. Schema history is under `drizzle/migrations/`. | These remain external if only the bridge or web server moves. Full migration requires an explicit PostgreSQL/Auth/Storage/Realtime plan, data export/import, secrets, redirect URLs, and acceptance tests. Migration files are not a backup. |
| Scheduled work | Authenticated POST routes exist for `daily-report`, `task-reminders`, `whatsapp-outbox`, and `whatsapp-send`; current docs describe external HTTP schedules. `cron-auth.ts` requires `LOVABLE_CRON_SECRET` (and optional previous secret). | Replace/recreate schedules with VPS `cron` or systemd timers, preserve bearer authentication and Asia/Riyadh timing, and verify outbox/idempotency behavior. Sleeping free hosting is not a scheduler. |
| WhatsApp agent/gateway | Server code calls a separately hosted Evolution-style gateway through `WHATSAPP_SERVER_URL`, `WHATSAPP_INSTANCE`, and `WHATSAPP_SERVER_KEY`; gateway implementation/state is not in this repository. | Inventory and migrate that gateway separately, including its session/data backup and provider reconnection. Do not assume it moves with this repo. |
| AI and external providers | Server code uses Lovable AI (`LOVABLE_API_KEY`), Daman GPS, OpenRouteService, optional legacy Traccar settings, and PetroApp through the isolated bridge. | Provider services remain external unless separately replaced. Inventory egress, credentials, callbacks, quotas, and data-protection requirements; do not invent self-hosted replacements. |
| PetroApp RAE bridge | FastAPI on Python 3.12, non-root Docker image, dynamic `PORT` (fallback 8080), environment-only secrets, no database/local business state, `/livez` liveness, authenticated `/health` upstream check, and disabled access logs. | Standard Docker/Compose or systemd deployment behind an HTTPS reverse proxy is portable. No bridge data backup is needed; protect its environment secrets. |

No source adapter behavior, Darb UI, DB migration, fuel workflow, production hosting, or bridge endpoint is changed by this runbook.

## 2. Decisions to confirm before any VPS work

1. Hostinger VPS plan/size, OS image, region, expected load, and availability/RPO/RTO targets. No plan is assumed here.
2. Docker Engine + Docker Compose (recommended template below) or an equivalent systemd-managed container approach; Node versus workerd for Darb SSR/server functions.
3. Whether auth/database/storage/realtime move in phases or all at once. For the user's whole-stack goal, choose the target PostgreSQL/Auth/Storage/Realtime implementation and a proven migration path; moving the bridge alone is insufficient.
4. WhatsApp gateway placement and session-state migration; AI/GPS/routing/PetroApp provider connectivity and secrets ownership.
5. Domains/subdomains for Darb and the bridge, DNS TTL/cutover window, TLS automation, Supabase/auth callback changes, and rollback DNS plan.
6. Firewall/admin SSH policy, secret manager/environment-file permissions, log retention, monitoring/alerting, backup retention, offsite backup location, and restore-test schedule.
7. VPS cron/systemd timer ownership and schedule times, including the daily 08:00 Asia/Riyadh report and frequent outbox/GPS work.

## 3. Safety and backup gate (before cutover)

- Inventory every environment variable by name without committing values. Keep service-role, source, gateway, cron, and AI secrets out of images, YAML, shell history, CI output, and logs. Store future VPS env files outside the repository with restricted ownership/mode.
- Back up the **actual Darb database**, not only migrations: public schema/data, roles, RLS policies, RPC/functions, triggers, constraints, sequences, and scheduled-job definitions. Include auth users/identities and role mappings through a supported export path.
- Export the `attachments` storage objects and metadata. Preserve user/session references and verify object counts/checksums where supported.
- Back up the separately hosted WhatsApp gateway's session/state using its supported procedure. Inventory external provider configuration that cannot be exported automatically.
- Store backups encrypted off the VPS, record restore steps, and perform a restore into an isolated environment before production cutover. A backup that has not been restored is unverified.
- The bridge itself is stateless and needs no business-data backup. Its Docker image, commit SHA, and secret inventory are sufficient for redeployment; secret values remain protected separately.

## 4. Future bridge deployment template (not executed)

The existing `petroapp-bridge/Dockerfile` remains the provider-neutral image definition. Build it from repository root with context `petroapp-bridge`; no new Dockerfile is required. Run behind HTTPS and bind its host port to loopback so only the reverse proxy exposes it.

The following is an **unexecuted Compose example** for a future reviewed file, not a claim that Compose was tested here:

```yaml
services:
  petroapp-bridge:
    image: darb-petroapp-bridge:candidate
    build:
      context: ./petroapp-bridge
      dockerfile: Dockerfile
    restart: unless-stopped
    init: true
    env_file:
      - /etc/darb/petroapp-bridge.env
    environment:
      PORT: "8080"
    ports:
      - "127.0.0.1:8080:8080"
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/livez', timeout=3)"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

The env file supplies `PETROAPP_RAE_BRIDGE_TOKEN`, `PETROAPP_BEARER_TOKEN`, `PETROAPP_FINGERPRINT`, and `PETROAPP_PAYMENT_STATUS_MAP`; it must never be committed. `/livez` is unauthenticated and performs no upstream call. Reserve authenticated `/health` for an explicitly authorized real PetroApp check, not frequent proxy/Docker probes. Darb's user-triggered health/preview/sync caller first performs a token-free `/livez` preflight with a bounded 90-second cold-start window; on an always-on VPS it should succeed immediately. There is no scheduled keep-alive, and no requested provider endpoint runs before liveness succeeds.

Example reverse-proxy target (placeholder hostname only):

```caddyfile
bridge.example.invalid {
    reverse_proxy 127.0.0.1:8080
}
```

Caddy or an equivalent proxy must terminate HTTPS, request/renew TLS, redirect HTTP to HTTPS, and forward only to the loopback port. Do not use the placeholder hostname for deployment.

## 5. Future execution sequence

### Phase A — prove the Darb production artifact

1. Choose the VPS-compatible runtime target and add a reviewed root production Dockerfile/start command for Darb. Preserve all server routes/functions, PWA assets, security headers, and server-only secret boundaries.
2. Build with the existing `bun run build` after the target is selected; add and verify the production start command. Do not treat `vite preview` as production readiness.
3. Run unit/integration tests and signed-in acceptance in the target container, including SSR errors, server functions, file upload/download, realtime chat, offline outbox, and cron-authenticated routes.
4. Only after these checks can the app be called container-ready. Currently it is not.

### Phase B — prepare VPS and data services

1. Apply OS updates; install the chosen container runtime; create unprivileged deployment users and restricted SSH access. Confirm time synchronization and Asia/Riyadh display scheduling while stored timestamps remain UTC.
2. Firewall inbound access to 80/443 and restricted SSH only; keep database, storage, realtime, bridge, and app ports private/loopback or private-network only. Require outbound HTTPS to selected providers.
3. Provision the chosen database/auth/storage/realtime targets with persistent volumes outside container ephemeral layers. Configure encryption, least privilege, monitoring, and tested backups before importing.
4. Restore schema and data in an isolated rehearsal, then validate RLS, RPC permissions/triggers, auth identities, permanent-owner protections, attachments, and record counts. Never run destructive migration/rollback SQL on production to make a cutover easier.
5. Deploy and separately verify the WhatsApp gateway and other agent components. Recreate authenticated schedules with VPS cron/systemd timers and confirm no duplicate senders run from old and new hosts simultaneously.

### Phase C — deploy, cut over, and verify

1. Deploy the bridge using the template, check container health and logs without printing env files, and verify `/livez`. Do not call `/health` or sync until separately authorized.
2. Deploy the proven Darb image with all required server env vars and the same external/new backend URLs. Keep the existing production app untouched until rehearsal passes.
3. Configure HTTPS proxies and placeholder-free DNS. Lower TTL before the planned window if useful; update Darb's `PETROAPP_RAE_BRIDGE_URL` and matching bridge token when the bridge moves. Update auth redirect/callback/allowed-origin settings for the selected domain.
4. Cut DNS only after backups, restore rehearsal, security checks, and a rollback decision point. Keep old data writers/schedulers paused during final synchronization to avoid split writes or duplicate notifications.
5. Verify read-only pages first, then explicitly approved test workflows with disposable data: login/logout, roles/RLS, request→order→trip→POD→reviewed billing, uploads, realtime chat, reports, and outbox draining. Do not send real WhatsApp messages or real invoices as smoke tests.
6. Monitor errors, resource use, certificate renewal, scheduler runs, provider quotas, and backup/restore health. Document the actual URLs, versions, and evidence; no evidence exists yet.

## 6. Rollback

- Before each candidate, tag the last known-good bridge/app images and record commit SHAs/config versions. Roll back containers to those tags with the same protected env files; never bake secrets into rollback images.
- Disable new VPS cron/systemd timers before re-enabling old schedules so only one sender/writer set is active.
- Restore the previous reverse-proxy/DNS target if application rollback is required. DNS propagation and TLS issuance are not instantaneous; retain the previous working endpoint until verification ends.
- Database rollbacks need a separate point-in-time/data reconciliation plan. Do not blindly reverse additive migrations or restore an old backup over newer production writes. Pause writes and choose an explicit recovery point with the owner.
- After rollback, verify auth, database reads, storage, schedules, bridge `/livez`, and absence of duplicate external sends. Record what was and was not restored.

## 7. Current blockers to a whole-stack VPS claim

- No Darb root production Dockerfile/start script or VPS-compatible runtime verification exists.
- Supabase/Lovable Cloud auth, database, storage, and realtime remain external; their target/migration is undecided.
- The WhatsApp gateway implementation/state and existing external schedules are not contained in this repo.
- Hostinger plan/OS/region, domains/TLS, secrets management, monitoring, backup retention/offsite location, and maintenance windows are unconfirmed.
- No VPS build, deployment, restore rehearsal, signed-in acceptance, DNS cutover, live provider health check, or reviewed first PetroApp sync has occurred.

Until these are closed with evidence, describe this work only as **a portable stateless bridge plus a future whole-stack migration runbook**.


## Candidate branch implementation status (2026-11-28)

The isolated branch `migration/hostinger-vps-node-runtime` contains a first-pass Node-hosting candidate:

- `vite.config.ts` selects Nitro's `node-server` preset.
- `package.json` adds `start: node .output/server/index.mjs`.
- Root `Dockerfile` builds with Bun 1.3.10 and runs the standalone Nitro output on Node 22 as the unprivileged `node` user.
- `src/routes/api/health.ts` exposes a small liveness endpoint for container checks.
- `.dockerignore` excludes local dependencies, build output, and environment files from the Docker context.
- `.github/workflows/vps-candidate.yml` validates locked dependency installation, unit tests, the Node production build/output, and the PetroApp bridge tests/type checks.

This is a **candidate, not a validated deployment**. The PR remains draft and `main` is unchanged. CI must pass, and a real Docker image must be built and exercised before the image is accepted. The container has not been deployed to Hostinger. Do not add production secrets to GitHub or the repository.
