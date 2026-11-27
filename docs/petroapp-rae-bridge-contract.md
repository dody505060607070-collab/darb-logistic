# PetroApp RAE bridge contract (OUR routes, not PetroApp routes)

Status: **NOT COMPLETE**. The isolated FastAPI bridge source and mocked tests now exist under `petroapp-bridge/`, but no bridge is deployed, no server secrets are configured by this work, and no real health check or sync has been verified. No PetroApp traffic was made while implementing it.

## Captured facts versus unknowns

A sanitized fuel-bills schema report supplied on 2026-11-27 establishes exactly one observed source request:

```text
GET https://app.petroapp.com.sa/dashboard_api/bills
```

Observed query parameters are `dates=YYYY/MM/DD-YYYY/MM/DD`, `date_filter=last_90_days`, `order_by=''`, `limit=10`, `page=1`, `order_type=''`. The response root contains a `data` array. The observed bill fields used by the adapter are listed under **Captured field mapping** below.

This replaces the older statement that no fuel endpoint had been captured. Earlier history remains relevant only as history: a prior RAE-generated `api_client.py` covered dashboard/profile/config methods, and a later audit stopped on a rate-limit warning without a fuel capture.

Still unknown: pagination beyond page 1, every unlisted endpoint or capability, source write methods, `payment_status` values and semantics, card references, full-tank semantics, and the `odo` unit. The bridge does not infer any of them.

## Architecture

```text
Darb (TanStack server functions) --HTTPS + bearer--> OUR isolated FastAPI bridge --> one captured read-only GET --> PetroApp
```

- Darb calls **only** the bridge and never calls PetroApp hosts.
- The bridge source is isolated under `petroapp-bridge/`; it has no Darb database access and performs no import, review, or approval.
- Darb server secrets: `PETROAPP_RAE_BRIDGE_URL` (HTTPS only) and `PETROAPP_RAE_BRIDGE_TOKEN`. Missing either → state `missing`, no request.
- Bridge-host source secrets: `PETROAPP_BEARER_TOKEN` and `PETROAPP_FINGERPRINT`. They never belong in Darb tables, browser code, logs, documentation values, or commits.
- `PETROAPP_PAYMENT_STATUS_MAP` is an exact, case-sensitive JSON mapping on the bridge. Its default `{}` maps nothing.

## Bridge routes (defined by us)

All routes except `/livez` require `Authorization: Bearer <PETROAPP_RAE_BRIDGE_TOKEN>`.

| Route | Purpose |
| --- | --- |
| `GET /livez` | Unauthenticated static `200 {"ok":true}` liveness response. It never calls PetroApp and is the only platform health-check path. |
| `GET /health` | Authenticated real upstream check: performs a read-only source request for the latest one-day window and returns `200 {"ok":true}` only after a valid captured-schema response. |
| `POST /v1/petroapp/preview` | Existing Darb body `{from,to,limit,cursor}`. Returns one page; Darb stores nothing. |
| `POST /v1/petroapp/sync` | Same body and single page. Darb alone stages returned rows for explicit review. |

`from` and `to` are timezone-aware ISO timestamps. The window must be positive and ≤31 days. Query dates are formatted in `Asia/Riyadh`. Incoming `limit` remains compatible with Darb's existing 50/200 requests, but the source query and returned rows are hard-capped to **10**. The source request always uses **page 1**. `next_cursor` is always null; a non-null input cursor is rejected because no next-page request was captured.

Page response: `{"transactions":[NormalizedTxn],"next_cursor":null,"unavailable_fields":[field names]}`. Preview and sync never fetch additional pages.

Error signalling: `401/403` or `{"error":"auth_expired"}` → authentication expired; `429` or `{"error":"rate_limited"|"security_warning"}` → hard stop. Optional `message` is fixed human text without source content or secrets.

### User-triggered cold-start preflight

Before any user-invoked `/health`, `/v1/petroapp/preview`, or `/v1/petroapp/sync` call, Darb calls our `GET /livez` with `Accept: application/json` and **no Authorization header or other credential**. Transient network/502/503/504 liveness failures retry after 5 seconds; each probe has a 10-second timeout and the total liveness window is at most 90 seconds. A non-retry status retains the existing hard-stop classification. Only successful liveness permits the requested endpoint call; the existing endpoint timeout, three attempts, 500ms/1s backoff, and immediate 401/403/429/security stops are unchanged.

If the bound expires, Darb returns a safe Arabic message saying the free bridge is waking and the user may retry; it returns no response body and never marks success or stages data. This policy is user-triggered only, never a scheduled/synthetic keep-alive. It is provider-neutral and works unchanged on an always-on Hostinger VPS, where `/livez` should respond immediately. Deterministic tests use mocked fetch/time only; no live Render or PetroApp verification has occurred.

## Captured field mapping

Only these observed source fields are read:

| Observed source field | Normalized field | Boundary |
| --- | --- | --- |
| `id` integer | `provider_txn_id` string | Required; stable idempotency key. |
| `date` string | `occurred_at` ISO timestamp | ISO 8601 only. Timezone-less values use the bridge's documented Asia/Riyadh convention, then UTC; this is not a claim about undocumented source timezone semantics. |
| `vehicle_id` integer | `provider_vehicle_ref` string/null | Opaque provider reference. |
| `station_name`, fallback `station` | `station` string/null | Empty `station_name` falls back to `station`. |
| `fuel_type_title` | `fuel_type` string/null | |
| `number_of_liters` string | `liters` decimal string/null | Must be >0 when present. |
| `fuel_price` string | `unit_price` decimal string/null | Must be ≥0 when present. |
| `cost_inc_vat` string | `amount` decimal string/null | Must be ≥0 when present. |
| `odo` integer | `odometer` decimal string/null | Raw staged-only value; unit unknown. |
| `payment_status` string | conditional `provider_state` | Exact configured value mapping only; otherwise the key is omitted so Darb rejects the row. |

All other source fields are ignored. `provider_card_ref`, `card_last4`, and `full_tank` are always null and listed unavailable. If any row lacks an exact payment-state mapping, `provider_state` is also listed unavailable. Malformed required values fail safely instead of being fabricated.

## NormalizedTxn (strict; unknown keys reject the row in Darb)

| Field | Type | Notes |
| --- | --- | --- |
| provider_txn_id | string ≤120, required | Stable source transaction ID; idempotency key. |
| occurred_at | ISO timestamp, required | |
| provider_vehicle_ref | string or null | Opaque source vehicle ID. |
| provider_card_ref | string or null | Always null in this adapter. A 12–19 digit full card number is rejected by Darb. |
| card_last4 | 4 digits or null | Always null in this adapter. |
| station, fuel_type | string or null | |
| full_tank | boolean or null | Always null in this adapter. A reviewer must set yes/no before approval, import, or applying a correction. |
| liters (>0), unit_price, amount, odometer (≥0) | number/string or null | `odometer` is raw and staged-only; its unit is not established. |
| provider_state | `completed` \| `cancelled` (**required by Darb**) | No default and no inference from `payment_status`. The bridge omits it unless an exact environment mapping exists; Darb then rejects that row. A changed row with the same ID is a correction/cancellation only after its state is explicitly mapped. |

## Bridge behaviour required and implemented

- Read-only source **GET only** to the single captured URL; redirects are not followed.
- Exact captured query keys, fixed `limit=10` and `page=1`; no guessed pagination.
- Timeout 15 seconds per source request; at most 3 attempts only for network/502/503/504, exponential backoff 0.5 s and 1 s.
- On 401/403/429, "too many attempts", rate-limit text, captcha, or security warning: stop immediately with no retry, no IP/account rotation, and no bypass.
- Log no tokens, fingerprints, cookies, full card numbers, source rows, or raw payloads. Docker access logs are disabled.
- Mocked tests only in `petroapp-bridge/tests/`; no live request is part of the test suite.
- Docker listens on the host-injected `PORT` (fallback `8080`) as a non-root user. Render probes `/livez`, never the upstream-checking `/health`.

## FREE TEMPORARY TEST HOSTING ONLY (not deployed)

The root `render.yaml` follows Render's [Blueprint specification](https://render.com/docs/blueprint-spec) and declares exactly one isolated `darb-petroapp-bridge` Docker web service in Frankfurt on **plan `free`**. It retains `rootDir: petroapp-bridge`, `dockerfilePath: ./Dockerfile`, `dockerContext: .`, `/livez`, and `autoDeployTrigger: checksPass`. No paid plan, database, persistent disk, worker, or other add-on is declared. `.github/workflows/petroapp-bridge.yml` runs mocked pytest and strict mypy on Python 3.12 with pinned dependencies for relevant paths; later automatic deploys require successful checks.

Render Free provides 512 MB RAM/0.1 CPU, sleeps after 15 idle minutes, takes about one minute to cold-start, has an ephemeral filesystem, and provides 750 workspace instance-hours/month. It may restart or suspend services and provides no persistent disks, SSH/shell, one-off jobs, or background workers. Exhausted hours suspend services until the next month. Render states no card is required to start; without a payment method, included-usage exhaustion causes suspension/disabled builds rather than automatic supplementary billing. Free is not a spend cap where billing is already enabled: use a zero spend limit/no payment method and review current bandwidth/build terms. See [Render Free limitations](https://render.com/docs/free). This is unsuitable for reliable production/SLA. The bridge's stateless design makes ephemeral storage acceptable; Darb business data stays outside it. Never add keep-alive pings or fake traffic to defeat sleep.

Manual later test setup: choose **New → Blueprint** for `dody505060607070/darb-logistic`, confirm only the Free service, and add no payment method. Render prompts for `PETROAPP_RAE_BRIDGE_TOKEN`, `PETROAPP_BEARER_TOKEN`, and `PETROAPP_FINGERPRINT` (`sync:false`); no secret value belongs in YAML or logs. `PETROAPP_PAYMENT_STATUS_MAP` stays `"{}"` until exact semantics are verified. The bridge token must be identical in Render and Darb server secrets; Darb additionally needs the bridge HTTPS URL, never the source credentials.

The future Hostinger VPS objective covers the **entire Darb server/agent stack**, not only this stateless bridge. `docs/hostinger-vps-migration.md` records the verified architecture and future migration/rollback runbook. The current Darb app still has external Supabase auth/database/storage, external schedules and providers, a Cloudflare-targeted build, and no root production container manifest; moving this bridge alone moves none of those. No whole-app VPS readiness is claimed.

## Darb side (unchanged)

- Tables: `petroapp_mappings`, `petroapp_sync_runs`, `petroapp_transactions`, `petroapp_transaction_events` (migration `0061_petroapp_foundation.sql`).
- Roles: owner configures mappings and resolves unmatched rows; owner/ops_manager/accountant/fleet_supervisor view, sync, review, import. Drivers/workshops: no access.
- Mapping is exact on active provider refs; conflicting vehicle/card links are `ambiguous` and cannot be approved.
- Import only after explicit approval → `fuel_entries` with `source='petroapp'`, `status='pending'`, `client_event_id='petroapp:<id>'` (idempotent).
- A source correction/cancellation of an imported row is flagged for review; it never silently overwrites the fuel entry.
- After a `rate_limited` run no new run starts for 30 minutes.
- Existing tests: `src/test/petroapp.test.ts`, `tests/sql/petroapp_rules.sql` (synthetic, rolled back). No Darb test or SQL fixture was changed by this bridge task.

## Safety boundaries (migrations 0062–0063)

- **Owner access:** owner + ops_manager + accountant + fleet_supervisor, identical to `petroapp_can_review()`. Only the owner edits mappings.
- **No automatic WhatsApp:** PetroApp fuel imports queue no automatic money notice.
- **Odometer sync disabled:** raw `odo` remains on `petroapp_transactions.odometer` only; imports/corrections never write fuel/asset odometers.
- **Card → driver:** no driver inference from a card. A vehicle mapping is still required before import.
- **Strict provider state:** missing or unknown state fails Darb validation/staging instead of becoming `completed`.
- **Full tank:** null unless an observed field exists (none does in this adapter); reviewer confirmation is mandatory before approval/import/correction.

## Remaining external blockers

1. Deploy `petroapp-bridge/` on an isolated HTTPS host and configure its source session secrets plus `PETROAPP_RAE_BRIDGE_TOKEN`.
2. Configure `PETROAPP_PAYMENT_STATUS_MAP` only with exact values whose completed/cancelled semantics are established by a permitted capture. Without it, rows are deliberately rejected by Darb.
3. Set Darb's `PETROAPP_RAE_BRIDGE_URL` and `PETROAPP_RAE_BRIDGE_TOKEN` server secrets.
4. Run an authorized live health check and a reviewed first sync, then verify results. Until all four happen, the integration remains **NOT COMPLETE**.
