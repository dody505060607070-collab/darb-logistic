# DARB roadmap

## Current request 2026-11-04 10:52 UTC
- [x] Phone-first SMS sign-in UI with country selection and email fallback; native OTP verification and international validation tested.
- [x] Preserve existing role permissions and restricted pending screen for unknown numbers; auth-created profiles retain phone numbers.
- [x] CRM home extension retaining dashboards: customer directory, sales stages, editable opportunities, follow-ups, contact log, weighted forecasts; calculation tests pass.
- [ ] SMS activation and real delivered-code login — blocked: user must configure Phone auth service in More → Users → Auth settings → Phone.
- [ ] Authenticated CRM create/edit/readback verification — blocked: no session for requesting user and multiple auth accounts; user must sign in or identify the test account.

## Done
- [x] Packages 1–5 core: login, roles/invites, dashboard, ops room, order wizard, trips, tracking, fleet, drivers, custody & inspection, documents & authorizations, maintenance/tires/stock, fuel/expenses/advances, finance/invoices/payments, customers/contracts/carriers, incidents, reports, settings/audit, driver mobile app with offline outbox and POD.

- [x] Phone GPS from driver app, role home pages + page guards, page/number animations, mobile pass on login

## Open
- [ ] Full ZIP line-by-line audit, new images, skeletons, signed-in mobile check per role — continue next turn

## Open (blocked on user)
- [ ] GPS provider integration — needs provider name, API docs, key
- [ ] E-invoicing (ZATCA) / accounting provider — needs provider account
- [ ] SMS/WhatsApp alerts — needs provider, templates, recipients
- [ ] Truck routing/ETA provider — needs provider with truck restrictions
- [ ] CSV import with column mapping — waiting for user's real data files
- [ ] Replace sample reference data with real fleet, drivers, customers, contracts
- [ ] Signed-in end-to-end check — needs the owner account to be created first

## Improvements batch (2026-11-03)
- [x] Global search Ctrl+K + Alt+1..9 page shortcuts
- [x] Sidebar counters (pending expenses, open incidents, open work orders)
- [x] Excel (CSV) + PDF print on every table
- [x] Morning summary hero with 3D truck on dashboard
- [x] Installable app (manifest + icon)
- [ ] Reports charts (revenue, fuel, cost/km)
- [ ] Drag & drop assignment in operations room
- [ ] Letterhead print for POD / invoice
- [ ] Branch-scoped data per user
- [ ] Offline-capable driver app (service worker)

## Batch 2026-11-04
- [x] Tasks page (assign, urgent 12h / normal 24h reminders, submit, Super Admin confirm)
- [x] Activity page (sign-in/out, actions per person per day)
- [x] AI morning report daily 08:00 Riyadh + "generate now"
- [x] Role preview moved to small sidebar picker with "شكل فقط" banner
- [ ] WhatsApp sending of tasks/reminders — blocked: WhatsApp gateway (Hostinger) details
- [x] Role home pages for dispatcher, accountant, maintenance, fleet supervisor (driver keeps its own app)

## Batch 2026-11-04 (b)
- [x] Fix chat: opening a private chat crashes the page
- [x] Click-through check of every page and main button, per role
- [x] Driver app preview for Super Admin with sample look (no real data)
- [x] WhatsApp server link panel: status, QR, test message (secrets WHATSAPP_SERVER_URL/INSTANCE/KEY)
- [ ] Auto-send tasks/reminders from the WhatsApp number — blocked: user must add server details and scan QR first
