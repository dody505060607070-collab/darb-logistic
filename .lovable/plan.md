# PetroApp bridge implementation

Build an isolated `petroapp-bridge/` service without changing Darb UI, database files, migrations, review/import code, or deployment state.

- Add FastAPI application, typed configuration/models, strict bearer authentication, and a read-only HTTP client for the single observed `GET /dashboard_api/bills` request.
- Accept only a maximum 31-day window; send exactly the captured query parameters with `limit=10`, `page=1`, and no pagination continuation.
- Map only the supplied bill fields; leave card/full-tank unavailable. Use exact configured `payment_status` mappings, otherwise omit `provider_state` so Darb rejects the row.
- Stop on authentication, rate-limit, or security responses; retry only network errors and 502/503/504 with bounded exponential backoff and redacted logging.
- Add Dockerfile, pinned requirements, README, `.env.example`, and fully mocked tests covering mapping, date conversion, request shape, retries/stops, auth, and secret/redaction behavior.
- Update the bridge contract and readiness notes to distinguish captured facts from unknowns and keep live integration NOT COMPLETE.
- Run bridge tests and static checks, then the existing TypeScript checks without altering app behavior. Commit only the bridge and documentation changes.
