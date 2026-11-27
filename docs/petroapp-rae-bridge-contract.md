# PetroApp RAE bridge contract (OUR routes, not PetroApp routes)

Status: **foundation only**. No bridge is deployed, no RAE client exists, no secrets are set, and no real sync has been verified. The PetroApp integration is **not complete**.

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
| liters (>0), unit_price, amount, odometer (≥0) | number or null | |
| provider_state | `completed` \| `cancelled` | A changed row with the same ID = correction/cancellation. |

**Source-field mapping is intentionally not defined here.** The RAE adapter may fill a field only from a source field actually observed in a future permitted capture; anything not observed is `null` and listed in `unavailable_fields`. No PetroApp endpoint, field name, permission or capability is assumed.

## Bridge behaviour required

- Timeout ≤15 s per source request; at most 3 attempts only for network/502/503/504, exponential backoff (0.5 s, 1 s).
- On 429, "too many attempts", captcha or any security warning: stop immediately, return `rate_limited`, do not retry, do not rotate IPs/accounts or otherwise bypass limits.
- Log no tokens, cookies, full card numbers or raw payloads.

## Darb side (implemented)

- Tables: `petroapp_mappings`, `petroapp_sync_runs`, `petroapp_transactions`, `petroapp_transaction_events` (migration `0061_petroapp_foundation.sql`).
- Roles: owner configures mappings and resolves unmatched rows; owner/ops_manager/accountant/fleet_supervisor (the existing fuel-write roles) view, sync, review, import. Drivers/workshops: no access.
- Mapping is exact on active provider refs; conflicting vehicle/card links are `ambiguous` and cannot be approved.
- Import only after explicit approval → `fuel_entries` with `source='petroapp'`, `status='pending'`, `client_event_id='petroapp:<id>'` (idempotent). Older odometer never lowers `assets.odometer_km`.
- A source correction/cancellation of an imported row is flagged `correction_pending`/`cancellation_pending` with before/after event; it changes the fuel entry only when a reviewer applies it (corrections return the entry to pending).
- After a `rate_limited` run no new run starts for 30 minutes.
- Tests: `src/test/petroapp.test.ts`, `tests/sql/petroapp_rules.sql` (synthetic, rolled back).

## Remaining external blocker

1. A permitted RAE capture of PetroApp traffic and the generated client (the last audit produced none and hit a "too many attempts" warning).
2. The FastAPI bridge implementing this contract, deployed on HTTPS (e.g. the company VPS, isolated from other sites).
3. `PETROAPP_RAE_BRIDGE_URL` and `PETROAPP_RAE_BRIDGE_TOKEN` saved as server secrets, then a real health check and a reviewed first sync.
