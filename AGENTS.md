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
- Roles live only in `user_roles` (enum `app_role`); invited accounts keep their role, uninvited new accounts await assignment, and verified administrator reservations apply separately — why: scoped workshop and employee access requires safe onboarding.
- Trip money lives in `trip_financials` (finance roles only), never on `trips` — why: drivers must not see revenue/margins.
- Overlap prevention for drivers/tractors/trailers is the `no_overlapping_bookings` exclusion constraint on `resource_bookings` — why: correct under concurrent requests.
- Shared form field configs and helpers live in `src/components/darb/*`, never exported from route files — why: route files must only export `Route`.
- Leaflet is loaded only inside `MapView` via dynamic import and rendered behind `ClientOnly` + `lazy` — why: SSR runs on workerd without `window`.
- tsconfig disables `noPropertyAccessFromIndexSignature` and `exactOptionalPropertyTypes` — why: screens work with loosely typed dynamic selects.
- Business-rule DB checks are described in `tests/sql/business_rules.sql` (the final RAISE rolls everything back; the exact DO block is in the migration history).
- The AI morning report is generated server-side in `src/lib/ai-report.server.ts`, run by a managed 05:00 UTC schedule on `/api/public/jobs/daily-report` and a role-checked server function — why: AI key and cross-role data stay on the server.
- Task submit/review go through `task_submit`/`task_review` RPCs; reminder cadence lives in `src/lib/tasks.ts` — why: assignees cannot self-approve.
- Task events enqueue a durable outbox in DB triggers; immediate sends and the managed reminder callback share atomic claims, persist provider acceptance IDs and retain ambiguous outcomes without resending — why: browser exits and retries cannot silently lose or duplicate notifications.

- WhatsApp goes through the company's self-hosted Evolution-style gateway via owner-only server functions in `src/lib/whatsapp.functions.ts`; credentials are server secrets only — why: keys never reach the browser.
- WhatsApp number management matches the unique configured instance, verifies disconnection server-side, and requires explicit in-app confirmation — why: prevents selecting another company's number or interrupting messaging accidentally.
- Phone login checks approved profile + assigned roles or service-only admin reservation before sending and exchanging OTP; owner-only employee creation provisions identity, role and driver/workshop link with rollback — why: unlisted numbers cannot register or acquire company access.
- CRM lives in a focused home-page component and role-restricted opportunity/activity tables; pipeline values use integer-cent calculations and remain forecasts, not revenue — why: preserves existing dashboards and finance boundaries.
- Employee profile edits use an owner-checked server function and a unique profile phone index; profile phone is the WhatsApp identity lookup — why: prevents ambiguous account matching while retaining roles in user_roles.
- Integration checks are owner-only read-only server functions and distinguish provider connectivity from ingestion — why: configured credentials do not establish live vehicle tracking.
- Explicit administrator phone reservations are service-only records applied by a service-only RPC after OTP consumption and profile identity matching; new phone-login profiles are normalized to E.164 — why: preserves server-enforced privileges and prevents duplicate identity lookups.
- Account deletion uses an owner-checked server function with explicit confirmation and a self-deletion guard; reference-record deletion is allowlisted and RLS-enforced, never enabled implicitly on audit or finance tables — why: avoids erasing history or bypassing atomic financial workflows.
- Workshop membership and field assignments scope work-order access through role-checked RPCs; legacy status mutation is disabled — why: approvals and receiving inspection must not be bypassed.
- Maintenance financial custody is an immutable approved ledger with role-checked creation/review RPCs and derived balances — why: disbursement is not expense, retries cannot debit twice, and corrections preserve history.
- Delivery and custody return/transfer are atomic RPCs; busy-resource and critical-defect checks are triggers — why: no partial writes.
- Display identity lives in a browser-safe brand module; legacy directories stay — why: rebrand without touching data/URLs.
- Panel/Kpi drag uses a page-scoped context, account-scoped layout storage and CSS order; never changes workflow status — why: arrangement only.
- Service worker registers only via the guarded PWA wrapper outside dev/preview/frames — why: no stale preview caches.
- Route errors use an eager fallback with one session-scoped reload for lazy-import failures — why: no blank screens or reload loops.
- Trip/POD/expense invariants are DB triggers (`*_guard`); anon runs no function; `src/start.ts` adds security/noindex headers — why: no bypass.
- Operational WhatsApp notices are DB-trigger-queued in `whatsapp_outbox`, sent per minute plus immediate flush — why: no lost events.
- English mode = client DOM translation layer over src/lib/i18n/en.json; user text translates on demand server-side — why: covers all pages without rewrites.
- Review decisions notify the sender via DB status triggers — why: reasons always reach them.
- RecordActions shares explicit table identity and the deletion allowlist — why: safe adjacent controls.
- Direct owner driver/representative preview is read-only with opt-in samples — why: no identity substitution.
