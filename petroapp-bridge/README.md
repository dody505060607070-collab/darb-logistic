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

- `GET /livez`: unauthenticated static liveness response `200 {"ok":true}`. It never creates a source client or calls PetroApp; Render's frequent health probes use this route.
- `GET /health`: authenticated real upstream check. It performs a read-only source request for the latest one-day window and returns `{"ok":true}` only after a valid captured-schema response.
- `POST /v1/petroapp/preview`: returns one normalized page; Darb stores nothing.
- `POST /v1/petroapp/sync`: returns the same single page; Darb alone stages it for review.

Every route except `/livez` requires `Authorization: Bearer <PETROAPP_RAE_BRIDGE_TOKEN>`. Preview/sync accept the existing Darb body `{from,to,limit,cursor}`. Timestamps must include a timezone, `to` must be later than `from`, and the maximum window is 31 days. Dates in the source query are formatted in `Asia/Riyadh`. Do not use `/health` as a platform health-check path: frequent probes would repeatedly call PetroApp.

Darb's server caller performs one token-free `GET /livez` preflight whenever a user explicitly invokes health, preview, or sync. If the bridge is sleeping, transient liveness failures retry every 5 seconds with a 10-second per-probe timeout and a **90-second total liveness bound**. Only a successful liveness response permits the requested endpoint call, whose existing 15-second/3-attempt policy and 401/403/429/security hard stops remain unchanged. If readiness does not recover, Darb returns an Arabic retry-later message and does not stage data. There is no scheduled keep-alive; on Hostinger or another always-on host the same preflight simply succeeds immediately.

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

The container runs as non-root user `bridge`, disables access logs, and listens on the injected `PORT`, falling back to `8080` for local use. Deploy behind HTTPS on an isolated host.

## FREE TEMPORARY TEST HOSTING ONLY — Render

The root `render.yaml` defines **exactly one Free Docker web service**, `darb-petroapp-bridge`, in Frankfurt with `rootDir: petroapp-bridge`, `./Dockerfile`, `/livez`, and `autoDeployTrigger: checksPass`. It declares no paid plan, database, disk, worker, or other add-on. See Render's [Blueprint reference](https://render.com/docs/blueprint-spec), [Free-tier documentation](https://render.com/docs/free), and [compute plans](https://render.com/docs/compute-plans).

Render Free is suitable only for temporary testing, not reliable production or an SLA:

- 512 MB RAM and 0.1 CPU; one instance only.
- Spins down after 15 minutes without inbound traffic; the next request can take about one minute while it cold-starts.
- Ephemeral filesystem: local changes disappear on redeploy, restart, or spin-down. This is acceptable only because this bridge is stateless and keeps no local business data.
- 750 Free instance-hours per workspace per calendar month, shared by Free services. Exhausting them suspends Free web services until the next month.
- Render may restart Free services at any time and may suspend them for tier/usage reasons.
- No persistent disks, SSH/dashboard shell, one-off jobs, or background workers.

Render states that no credit card is required to start Free Docker hosting. Without a payment method, exhausted included bandwidth suspends Free services and exhausted build minutes disable new builds instead of creating automatic supplementary charges. A Free plan is not a spend cap on a workspace that already has billing enabled: review Render's current usage terms and keep a zero spend limit/no payment method to prevent supplementary charges. Do not add a payment method or upgrade this Blueprint. Do not add keep-alive pings, synthetic requests, or other traffic to defeat sleep.

No service is created by these files. For an explicitly approved temporary test later:

1. Push the reviewed commit to `dody505060607070/darb-logistic`. In Render choose **New → Blueprint**, select that repository/branch, and confirm the preview contains only the Free bridge service with no paid resources.
2. At Render's prompts, enter `PETROAPP_RAE_BRIDGE_TOKEN`, `PETROAPP_BEARER_TOKEN`, and `PETROAPP_FINGERPRINT`. Values stay out of YAML/logs/commits. Leave `PETROAPP_PAYMENT_STATUS_MAP` as `{}` until exact observed status semantics are established.
3. After any separately approved test deployment, set Darb's `PETROAPP_RAE_BRIDGE_URL` to the HTTPS URL and use **exactly the same** `PETROAPP_RAE_BRIDGE_TOKEN` in Render and Darb server secrets. Source credentials never belong in Darb.
4. Expect sleep and cold starts. Verify `/livez` without upstream traffic; only an authorized authenticated `/health` request may call PetroApp. A reviewed first sync is separate.

The path-filtered GitHub Actions workflow runs mocked pytest and strict mypy on Python 3.12 with pinned dependencies. Later automatic deploys require successful GitHub checks. Creating the initial Free service remains manual.

The future goal is moving the entire Darb server/agent stack to a Hostinger VPS, not merely this bridge. See `docs/hostinger-vps-migration.md` for the verified architecture, external dependencies, and future runbook. No VPS migration is performed or claimed ready now. Completion still requires authorized live health/sync verification; neither has happened.

## Mocked verification

```bash
pip install -r requirements-dev.txt
pytest -q
mypy app tests
```

All tests use `httpx.MockTransport` or FastAPI's in-process transport. They contain no live source requests.
