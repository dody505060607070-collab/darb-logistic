# Darb whole-system migration to Hostinger VPS — read-only source audit and phased plan

Legend: **[V]** verified this turn (code read or read-only query) · **[C]** code-only, not proven live · **[U]** unknown.
Nothing was edited, deployed or written. The previous runbook (`docs/hostinger-vps-migration.md`) matches the code on every point checked below.

## 1. Runtime and build target
- [V] TanStack Start + React 19 + Vite; `package.json` has dev/build/build:dev/preview/test, **no start script**.
- [V] `vite.config.ts` → `@lovable.dev/vite-tanstack-config`, whose Nitro build defaults to **Cloudflare/workerd**; `src/server.ts` is a worker-style `fetch(request, env, ctx)` wrapper; `src/start.ts` adds headers; PWA `sw.js` emitted.
- [V] Only Dockerfile: `petroapp-bridge/Dockerfile`. No root Dockerfile/Compose.
- Required change (Build mode, later): choose Nitro `node-server` preset (Node 22 LTS) or run the Cloudflare output under workerd; add `start` script, root Dockerfile, a static `/livez` route. [U] whether the Lovable config wrapper allows overriding the preset cleanly; must be proven in a throwaway container.

## 2. Backend dependencies
| Dependency | Evidence | Live status |
|---|---|---|
| DB (Postgres) | [V] 66 public tables, 137 public functions, 65 triggers, 222 RLS policies (public+storage), 65 files in `drizzle/migrations/` | [V] live |
| Auth | [V] 10 auth users; phone/WhatsApp OTP flow (`driver-access.server.ts`, phone login) | [V] live |
| Storage | [V] bucket `attachments` (private), 6 objects | [V] live, small |
| Realtime | [V] publication contains only `chat_messages`; used by `ChatScreen.tsx` | [V] configured |
| Scheduled jobs | [V] 6 HTTP schedules: daily-report `0 5 * * *` (08:00 Riyadh), task-reminders hourly, whatsapp-outbox every minute, whatsapp-send lanes a/b/c every minute; targets `src/routes/api/public/jobs/*`, auth via `LOVABLE_CRON_SECRET` | [V] active |
| WhatsApp gateway | [V] `whatsapp_outbox`: 89 accepted, 38 unresolved; gateway code not in repo | [V] has sent; [U] host location and how unresolved rows arose |
| AI | [V] `LOVABLE_API_KEY` in `ai-report.server.ts`, `person-intake-ai.server.ts`, `translate.functions.ts` | [C] (logs not checked) |
| Daman GPS | [V] 40,241 `gps_readings` rows; `daman-gps.server.ts` | [V] data ingested |
| Traccar | [C] secrets set, legacy code path | [U] live |
| OpenRouteService | [C] `ORS_API_KEY` set | [U] live |
| PetroApp bridge | [V] 0 fuel rows from petroapp; bridge secrets not set | [C] **not live** |

## 3. Environment variable names
- Source `.env` (present, publishable only) [V]: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`.
- Runtime secrets configured [V]: `DAMAN_GPS_API_KEY`, `DAMAN_GPS_FLEET_ID`, `DAMAN_GPS_USERNAME`, `DAMAN_GPS_PASSWORD` (last two not referenced in `src`), `LOVABLE_API_KEY` (managed), `LOVABLE_CRON_SECRET` (platform-managed), `ORS_API_KEY`, `TRACCAR_URL`, `TRACCAR_EMAIL`, `TRACCAR_PASSWORD`, `WHATSAPP_SERVER_URL`, `WHATSAPP_INSTANCE`, `WHATSAPP_SERVER_KEY`.
- Referenced but not configured as user secrets [V]: `SUPABASE_SERVICE_ROLE_KEY` (platform-injected, used by `src/integrations/supabase/client.server.ts`), `LOVABLE_CRON_SECRET_PREVIOUS`, `PETROAPP_RAE_BRIDGE_URL`, `PETROAPP_RAE_BRIDGE_TOKEN`.
- Bridge-only: `PETROAPP_BEARER_TOKEN`, `PETROAPP_FINGERPRINT`, `PETROAPP_PAYMENT_STATUS_MAP`, `PORT`.
- Not exportable: secret values cannot be read back; the service-role key, DB password and managed AI/cron keys are unavailable off-platform. Owners must re-obtain each provider credential from its source (Daman, WhatsApp gateway, ORS, Traccar).

## 4. Data migration scope and approach
- Schema: replay `drizzle/migrations/` into the new Postgres, then diff against live with `pg_dump --schema-only` equivalents (tables, functions, triggers, policies, grants, exclusion constraint `no_overlapping_bookings`, enums incl. `app_role`).
- Data: export public tables (incl. `audit_log`, finance ledgers, `gps_readings`) in dependency order; preserve UUIDs and timestamps (UTC).
- Auth: 10 users plus identities and phone numbers; `user_roles` and the protected owner number must map to identical user IDs. Password-free phone OTP means users re-verify, not reset.
- Storage: 6 objects in `attachments` with paths kept identical (DB rows reference paths).
- Cron: recreate 6 schedules as VPS cron/systemd timers with a new cron secret; disable Cloud schedules at the same moment.
- [U] Supported export path for auth tables and full data dumps from Lovable Cloud without the DB password — must be confirmed before committing to Phase 5.

## 5. Blockers
1. No service-role key or DB password off-platform → a VPS-hosted Darb server cannot run admin server functions against Cloud, and a faithful full dump is unconfirmed.
2. Workerd build target → no Node production artifact yet.
3. Managed `LOVABLE_API_KEY` / AI Gateway: [U] usable from outside Lovable hosting; may need a replacement AI provider.
4. Phone OTP delivery depends on the WhatsApp gateway and Cloud auth hooks; [U] how OTP is sent end-to-end outside Cloud.
5. WhatsApp gateway host and session state unknown; 38 unresolved outbox rows must be understood before cutover.
6. PetroApp not live (no bridge deployment, no secrets, no data).

## 6. Parity tests
- Existing: `bun run test` (vitest suite, ~298 tests), `tests/sql/business_rules.sql` (rollback), bridge pytest/mypy.
- New, against the migrated stack: row counts and checksums per table; function/trigger/policy counts (137/65/222) match; RLS role matrix (owner, accountant, ops, driver, workshop, representative) per route; phone OTP login for an owner and a driver; storage upload/download in `attachments`; chat realtime delivery; each cron job once with idempotency (no duplicate daily report or WhatsApp send); GPS ingestion fresh; AI report generation; Excel export; overlap constraint rejects double booking.

## 7. Phased plan (priority order)
1. **Phase 0 — VPS read-only inspection**: OS, disk/RAM, `docker ps/compose ls/network ls`, `ss -ltnp`, proxy owning 80/443, cron, firewall, WhatsApp gateway presence; take a Hostinger snapshot.
2. **Phase 1 — Resolve blockers 1–4**: confirm data/auth export path, AI provider outside Lovable, OTP path. Go/no-go decision.
3. **Phase 2 — Bridge** under `/opt/darb` (Compose project `darb`, network `darb_net`, loopback ports only).
4. **Phase 3 — Build-mode code changes** (described before switching): Node preset, start script, Dockerfile, `/livez`.
5. **Phase 4 — Staging stack**: self-hosted Postgres/Auth/Storage/Realtime on a staging subdomain, restore a copy, run section 6 tests.
6. **Phase 5 — Cutover**: freeze writes, final export/import, switch schedules, DNS change with low TTL.
7. **Rollback**: Lovable hosting and Cloud stay untouched until parity is signed off; DNS back plus re-enabling Cloud schedules restores service. Never touch n8n or the other site's containers, networks or proxy config without approval.
