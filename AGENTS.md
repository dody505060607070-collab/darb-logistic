<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# DARB project rules
- Data access is client-side through the Supabase client with RLS; every sensitive multi-step operation (resource allocation, trip events, invoicing, payment allocation, expense review, advance settlement, work-order status, re-inspection) is a SECURITY DEFINER RPC that checks roles itself — why: atomicity and server-side enforcement.
- Roles live only in `user_roles` (enum `app_role`); invited accounts keep their role and nothing grants a role at sign-in — why: scoped workshop and employee access requires safe onboarding.
- Trip money lives in `trip_financials` (finance roles only), never on `trips` — why: drivers must not see revenue/margins.
- Overlap prevention for drivers/tractors/trailers is the `no_overlapping_bookings` exclusion constraint on `resource_bookings` — why: correct under concurrent requests.
- Shared form field configs and helpers live in `src/components/darb/*`, never exported from route files — why: route files must only export `Route`.
- Leaflet is loaded only inside `MapView` via dynamic import and rendered behind `ClientOnly` + `lazy` — why: SSR runs on workerd without `window`.
- tsconfig disables `noPropertyAccessFromIndexSignature`/`exactOptionalPropertyTypes` — why: loose dynamic selects.
- Business-rule DB checks: `tests/sql/business_rules.sql` (rolls back).
- Morning report saves plain figures before AI wording — why: cut-offs can't lose it.
- Task submit/review go through `task_submit`/`task_review` RPCs; reminder cadence lives in `src/lib/tasks.ts` — why: assignees cannot self-approve.
- Task events use a DB-trigger outbox with atomic claims and stored provider IDs; ambiguous sends are kept, not resent — why: no lost or duplicate notices.

- WhatsApp goes through the company's self-hosted Evolution-style gateway via owner-only server functions in `src/lib/whatsapp.functions.ts`; credentials are server secrets only — why: keys never reach the browser.
- WhatsApp number management matches the configured instance, verifies disconnection server-side and needs in-app confirmation — why: no wrong number or accidental outage.
- Phone login requires exactly one employee profile with a role, or exactly one unlinked driver file (drivers page) with that phone, checked before and after OTP; the only account login creates is driver-only for that file (`driver-access.server.ts`); owner-only employee creation provisions identity/role/link with rollback — why: only numbers administration listed get access.
- CRM is a home-page component with role-restricted tables; pipeline uses integer cents and is a forecast, not revenue — why: keeps finance boundaries.
- Employee profile edits use an owner-checked server function and a unique profile phone index; profile phone is the WhatsApp identity lookup — why: prevents ambiguous account matching while retaining roles in user_roles.
- Integration checks are owner-only read-only server functions and distinguish provider connectivity from ingestion — why: configured credentials do not establish live vehicle tracking.
- Admin phone reservations are retired (table emptied and blocked, RPC is a no-op); administrators are only employees given the owner role — why: reserved numbers bypassed the employee list.
- Account deletion: owner-checked server function, explicit confirmation, no self-deletion, unlinks driver/workshop first; reference deletes are allowlisted, never audit/finance tables — why: history stays intact.
- Work-order access, edit/delete and workshop removal are role-checked RPCs refusing started/costed records (archive instead) — why: approvals and history cannot be bypassed.
- Maintenance financial custody is an immutable approved ledger with role-checked creation/review RPCs and derived balances — why: disbursement is not expense, retries cannot debit twice, and corrections preserve history.
- Delivery and custody return/transfer are atomic RPCs; busy-resource and critical-defect checks are triggers — why: no partial writes.
- Display identity lives in a browser-safe brand module; legacy directories stay — why: rebrand without touching data/URLs.
- Panel/Kpi drag uses a page-scoped context, account-scoped layout storage and CSS order; never changes workflow status — why: arrangement only.
- Service worker registers only via the guarded PWA wrapper outside dev/preview/frames — why: no stale preview caches.
- Route errors use an eager fallback with one session-scoped reload for lazy-import failures — why: no blank screens or reload loops.
- Trip/POD/expense invariants are DB triggers (`*_guard`); anon runs no function; `src/start.ts` adds security/noindex headers — why: no bypass.
- Operational WhatsApp notices are DB-trigger-queued in `whatsapp_outbox`, sent per minute plus immediate flush; owners get department notices nobody else can receive — why: none dropped.
- English/Urdu use post-hydration one-pass phrase boundaries; Urdu dictionary loads lazily — why: no mixed words, re-translation or hydration race.
- Review decisions notify the sender via DB status triggers — why: reasons always reach them.
- RecordActions shares explicit table identity and the deletion allowlist — why: safe adjacent controls.
- Direct owner driver/representative preview is read-only with opt-in samples — why: no identity substitution.
- Public policies indexed; ERP noindex/no-store; official consent module — why: preserve privacy.
- Person intake is owner-only: AI reads uploads into a `person_intakes` draft, WhatsApp missing-items notice needs a click, and accounts are created only when nothing is missing via shared `provisionEmployee` — why: no partial or unapproved accounts.
- Representative is a separate job (`/representative` → `customer_requests` → order), no driver file — why: sales visits aren't driving.
- Driver WhatsApp uses `driver_wa_phone` (login phone first) — why: stale file numbers lost messages.
- Trip alerts: outbox job runs `trip-monitor.server.ts`; one episode per alert — why: no repeats.
- Excel downloads are real xlsx built in the browser by `src/lib/excel.ts` from rows the user's RLS allows — why: one safe export path.
- Form choice fields use `ChoiceInput` (pick or type) with `src/lib/choice.ts`; typed text maps to a listed value, "لا يوجد…" means empty, new text is saved only for text-valued lists or refs with `ref.create` (branches) — coded values stay list-only — why: manual entry without breaking DB value checks.
