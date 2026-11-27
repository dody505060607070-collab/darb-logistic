# PetroApp RAE bridge contract (OUR routes, not PetroApp routes)

Status: **foundation only**. No bridge is deployed, no secrets are set, and no real sync has been verified. A prior RAE-generated `api_client.py` artifact exists for dashboard/profile/config-related methods, but **no verified fuel-transaction method or endpoint was captured**. The latest full audit produced no new client or traffic capture and stopped on the source's rate-limit ("too many attempts") warning. The PetroApp integration is **not complete**.

## Architecture

```text
Darb (TanStack server functions) --HTTPS + bearer--> OUR bridge (Python/FastAPI) --> RAE-generated client --> PetroApp (read-only)
```

- The Darb app calls **only** the bridge. It never calls PetroApp hosts.
- The bridge is read-only against the source: no create/update/delete calls of any kind.
- Server secrets in Darb (Project Settings → Secrets): `PETROAPP_RAE_BRIDGE_URL` (https only), `PETROAPP_RAE_BRIDGE_TOKEN`. Missing either → state `missing`, no request is made.
- PetroApp session material (cookies/tokens) lives only on the bridge host, never in Darb tables, browser code, logs or this repo.

## Bridge routes (defined by us)

All require `Authorization: Bearer <PETROAPP_RAE_BRIDGE_TOKEN>`.

| Route | Purpose |
| --- | --- |
| `GET /health` | `200 {"ok": true}` when the bridge can reach the source with a valid session. |
| `POST /v1/petroapp/preview` | Body `{from, to, limit≤50}` (ISO UTC). Returns one page; Darb stores nothing. |
| `POST /v1/petroapp/sync` | Body `{from, to, cursor, limit≤200}`. Returns one page; Darb stages it for review. |

Page response: `{"transactions": [NormalizedTxn], "next_cursor": string|null, "unavailable_fields": [field names]}`. Darb reads at most 10 pages per sync, range ≤ 31 days.

Error signalling: `401/403` or `{"error":"auth_expired"}` → authentication expired; `429` or `{"error":"rate_limited"|"security_warning"}` → hard stop. Optional `message` must be human text without secrets.

## NormalizedTxn (strict; unknown keys reject the row)

| Field | Type | Notes |
| --- | --- | --- |
| provider_txn_id | string ≤120, required | Stable source transaction ID; idempotency key. |
| occurred_at | ISO timestamp, required | |
| provider_vehicle_ref | string or null | Opaque source vehicle ID. |
| provider_card_ref | string or null | Opaque card ID. A 12–19 digit full card number is rejected. |
| card_last4 | 4 digits or null | |
| station, fuel_type | string or null | |
| full_tank | boolean or null | Only from a source field observed in a permitted capture; otherwise null. A reviewer must set yes/no before approval, import or applying a correction. |
| liters (>0), unit_price, amount, odometer (≥0) | number or null | `odometer` is a raw source reading; its unit is NOT established (see Safety boundaries). |
| provider_state | `completed` \| `cancelled` (**required**) | No default: a missing or unknown value is rejected by validation and by `petroapp_stage`. The bridge may send `completed` only when the permitted capture proves the record is a completed transaction. A changed row with the same ID = correction/cancellation. |

**Source-field mapping is intentionally not defined here.** The RAE adapter may fill a field only from a source field actually observed in a future permitted capture; anything not observed is `null` and listed in `unavailable_fields`. No PetroApp endpoint, field name, permission or capability is assumed.

## Bridge behaviour required

- Timeout ≤15 s per source request; at most 3 attempts only for network/502/503/504, exponential backoff (0.5 s, 1 s).
- On 429, "too many attempts", captcha or any security warning: stop immediately, return `rate_limited`, do not retry, do not rotate IPs/accounts or otherwise bypass limits.
- Log no tokens, cookies, full card numbers or raw payloads.

## Darb side (implemented)

- Tables: `petroapp_mappings`, `petroapp_sync_runs`, `petroapp_transactions`, `petroapp_transaction_events` (migration `0061_petroapp_foundation.sql`).
- Roles: owner configures mappings and resolves unmatched rows; owner/ops_manager/accountant/fleet_supervisor (the existing fuel-write roles) view, sync, review, import. Drivers/workshops: no access.
- Mapping is exact on active provider refs; conflicting vehicle/card links are `ambiguous` and cannot be approved.
- Import only after explicit approval → `fuel_entries` with `source='petroapp'`, `status='pending'`, `client_event_id='petroapp:<id>'` (idempotent). The raw odometer stays on the staged row only (see below).
- A source correction/cancellation of an imported row is flagged `correction_pending`/`cancellation_pending` with before/after event; it changes the fuel entry only when a reviewer applies it (corrections return the entry to pending).
- After a `rate_limited` run no new run starts for 30 minutes.
- Tests: `src/test/petroapp.test.ts`, `tests/sql/petroapp_rules.sql` (synthetic, rolled back).

## Remaining external blocker

1. A permitted RAE capture of the PetroApp **fuel-transaction** page/traffic and a verified fuel adapter built from it. (The existing `api_client.py` covers only dashboard/profile/config-related methods; the last audit captured nothing new and stopped on the rate-limit warning.)
2. The FastAPI bridge implementing this contract, deployed on HTTPS (e.g. the company VPS, isolated from other sites).
3. `PETROAPP_RAE_BRIDGE_URL` and `PETROAPP_RAE_BRIDGE_TOKEN` saved as server secrets, then a real health check and a reviewed first sync.

## Safety boundaries (safety pass, migration 0062)

- **Owner access:** the panel's reviewer set is owner + ops_manager + accountant + fleet_supervisor, identical to the DB gate `petroapp_can_review()`. Only the owner edits mappings.
- **No automatic WhatsApp:** `wa_money_trigger` returns without queueing for `fuel_entries` rows with `source='petroapp'`. Manual fuel entries and expenses keep their existing notices.
- **Odometer sync disabled:** the source unit is unproven. The raw reading is kept on `petroapp_transactions.odometer` for review only; imports and corrections never write `fuel_entries.odometer` or `assets.odometer_km`. This stays disabled until a permitted RAE capture proves the unit and the bridge maps it explicitly to km.
- **Card → driver:** a card mapping may name a driver explicitly; a driver is never inferred from a card. A vehicle mapping is still required before import because `fuel_entries.asset_id` is required.
- **Strict provider state (0063):** `provider_state` is required; missing or unknown states fail the batch instead of becoming `completed`.
- **Full tank (0063):** `full_tank` is staged as null unless the bridge maps an observed field; reviewers set it with the role-checked `petroapp_set_full_tank` RPC (logged as `full_tank_set`). Approval, import and correction require it; import and correction copy the explicit value to `fuel_entries.full_tank`. A source correction resets it to the source value so it is confirmed again. Never guessed.
