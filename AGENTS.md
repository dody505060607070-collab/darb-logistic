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
- Roles live only in `user_roles` (enum `app_role`); first signup becomes owner, later accounts get roles via `invitations` — why: invite-only access without self-promotion.
- Trip money lives in `trip_financials` (finance roles only), never on `trips` — why: drivers must not see revenue/margins.
- Overlap prevention for drivers/tractors/trailers is the `no_overlapping_bookings` exclusion constraint on `resource_bookings` — why: correct under concurrent requests.
- Shared form field configs and helpers live in `src/components/darb/*`, never exported from route files — why: route files must only export `Route`.
- Leaflet is loaded only inside `MapView` via dynamic import and rendered behind `ClientOnly` + `lazy` — why: SSR runs on workerd without `window`.
- tsconfig disables `noPropertyAccessFromIndexSignature` and `exactOptionalPropertyTypes` — why: screens work with loosely typed dynamic selects.
- Times are stored UTC and shown in Asia/Riyadh via `src/lib/format.ts` — why: single conversion point.
- Business-rule DB checks are in `tests/sql/business_rules.sql` (run in a rolled-back DO block).
- The AI morning report is generated server-side in `src/lib/ai-report.server.ts`, run by a managed 05:00 UTC schedule on `/api/public/jobs/daily-report` and a role-checked server function — why: AI key and cross-role data stay on the server.
- Task submit/review go through `task_submit`/`task_review` RPCs; reminder cadence lives in `src/lib/tasks.ts` — why: assignees cannot self-approve.

- WhatsApp goes through the company's self-hosted Evolution-style gateway via owner-only server functions in `src/lib/whatsapp.functions.ts`; credentials are server secrets only — why: keys never reach the browser.
- WhatsApp number management matches the unique configured instance, verifies disconnection server-side, and requires explicit in-app confirmation — why: prevents selecting another company's number or interrupting messaging accidentally.
- Login is phone-only: `src/lib/whatsapp-login.functions.ts` sends HMAC-hashed, 5-minute, attempt- and rate-limited codes via the company WhatsApp gateway, then exchanges a verified code for a real Cloud Auth session (admin magic-link token hash); accounts match only on `profiles.phone`, new numbers get no role — why: owner chose WhatsApp delivery while permissions stay in `user_roles`.
- Keep the React auth context in a separate browser-safe module with HMR identity preservation, not in the provider/hook module — why: split routes can temporarily retain different module versions during preview updates.
- CRM lives in a focused home-page component and role-restricted opportunity/activity tables; pipeline values use integer-cent calculations and remain forecasts, not revenue — why: preserves existing dashboards and finance boundaries.
