# Darb PetroApp RAE bridge

**Status: NOT COMPLETE / NOT DEPLOYED.** This isolated FastAPI service implements only the sanitized fuel-bills capture supplied on 2026-11-27. No live request, health check, or sync has been verified. It does not connect to Darb's database and never imports or approves financial records.

## Captured source capability

One read-only request is implemented:

```text
GET https://app.petroapp.com.sa/dashboard_api/bills
```

Every call uses exactly these query keys and fixed values, with only `dates` changing:

```text
dates=YYYY/MM/DD-YYYY/MM/DD
date_filter=last_90_days
order_by=
limit=10
page=1
order_type=
```

There is deliberately no pagination, create, update, delete, or other provider method. `next_cursor` is always null and a supplied cursor is rejected. Incoming Darb `limit` values remain compatible with the existing app but the source request and returned rows are hard-capped to 10.

## Bridge routes (ours, not PetroApp's)

- `GET /health`: performs a real read-only source request for the latest one-day window and returns `{"ok":true}` only after a valid captured-schema response.
- `POST /v1/petroapp/preview`: returns one normalized page; Darb stores nothing.
- `POST /v1/petroapp/sync`: returns the same single page; Darb alone stages it for review.

All routes require `Authorization: Bearer <PETROAPP_RAE_BRIDGE_TOKEN>`. Preview/sync accept the existing Darb body `{from,to,limit,cursor}`. Timestamps must include a timezone, `to` must be later than `from`, and the maximum window is 31 days. Dates in the source query are formatted in `Asia/Riyadh`.

## Environment

Copy `.env.example` into your deployment secret manager, not into source control:

| Variable | Purpose |
| --- | --- |
| `PETROAPP_RAE_BRIDGE_TOKEN` | Long random bearer token shared only by Darb and this bridge. |
| `PETROAPP_BEARER_TOKEN` | Source bearer session, sent only to the captured source URL. |
| `PETROAPP_FINGERPRINT` | Source fingerprint value, sent in the `fingerprint` header. |
| `PETROAPP_PAYMENT_STATUS_MAP` | JSON object of exact, case-sensitive observed `payment_status` values to `completed` or `cancelled`. Default `{}` maps nothing. |

Example **shape**, not a claim about source values:

```text
PETROAPP_PAYMENT_STATUS_MAP={"OBSERVED_COMPLETED_VALUE":"completed","OBSERVED_CANCELLED_VALUE":"cancelled"}
```

Do not populate that mapping by guessing. With no exact mapping, `provider_state` is omitted and Darb intentionally rejects the row. Card references and `full_tank` are always null/unavailable. `odo` is copied raw to staging only; its unit is unknown.

## Normalization facts and boundaries

Only these observed fields are read:

- `id` → `provider_txn_id`
- `date` → `occurred_at`
- `vehicle_id` → `provider_vehicle_ref`
- `station_name`, falling back to `station` → `station`
- `fuel_type_title` → `fuel_type`
- `number_of_liters` → `liters`
- `fuel_price` → `unit_price`
- `cost_inc_vat` → `amount`
- `odo` → raw staged-only `odometer`
- `payment_status` → only through the explicit exact-value environment mapping

`date` is accepted only as ISO 8601. A timezone-less ISO value is interpreted using the bridge's documented `Asia/Riyadh` convention, then returned in UTC. This convention is not a claim that the source has documented its timezone. Other source fields are ignored. Malformed required values fail safely instead of being fabricated.

## Retry and stop policy

- Timeout: 15 seconds per source attempt; redirects are not followed.
- Only network failures and HTTP 502/503/504 are retried: at most 3 attempts with 0.5 s and 1 s backoff.
- HTTP 401/403/429, captcha, rate-limit text, and security warnings stop immediately with no retry.
- No IP/account rotation or rate-limit bypass exists.
- Source rows, source payloads, bearer tokens, and fingerprints are never logged. Container access logs are disabled.

## Run locally (configuration only; not a connectivity test)

```bash
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8080 --no-access-log
```

Do not run this with real source credentials unless a live check is separately authorized.

## Docker deployment artifact

```bash
docker build -t darb-petroapp-bridge .
docker run --rm -p 8080:8080 --env-file .env darb-petroapp-bridge
```

Deploy behind HTTPS on an isolated host. Then set Darb's server secrets `PETROAPP_RAE_BRIDGE_URL` and `PETROAPP_RAE_BRIDGE_TOKEN`. Completion still requires an authorized live health check and a reviewed first sync; neither has happened.

## Mocked verification

```bash
pip install -r requirements-dev.txt
pytest -q
mypy app tests
```

All tests use `httpx.MockTransport` or FastAPI's in-process transport. They contain no live source requests.
