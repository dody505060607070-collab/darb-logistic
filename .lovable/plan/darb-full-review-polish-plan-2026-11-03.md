# DARB — Full Review & Polish Plan

Your log isn't a build error. It asks for a full review of the ZIP and a detailed upgrade. The latest build is clean.

## 1. ZIP audit (MASTER_SPEC + SCREENS, D01–D18, M01–M04)
- Check every screen, field, button, status and business rule against the app and write a checklist (done / partial / missing).
- Build every missing or partial item in full.

## 2. A separate look for each role
| Role | Landing page | Look |
|---|---|---|
| Owner / Ops manager | Full dashboard: KPIs, Kingdom map, alerts | Deep green + gold, complete sidebar |
| Dispatcher | Operations room: unassigned orders, live trips | Map-first, quick-assign buttons |
| Accountant | Finance: unpaid invoices, collections, margins | Tables and charts, no fleet clutter |
| Fleet supervisor / Maintenance | Fleet health, inspections, open work orders | Status colours, red for vehicles that can't run |
| Driver | Mobile app only: current trip, big step buttons | Large touch buttons, no prices or admin menus |
- Each role's sidebar shows only its own pages. Opening a page that isn't allowed redirects to that role's home page.

## 3. Detailed design for every page
- **Buttons:**
  - Main action: solid green.
  - Secondary action: gold outline.
  - Dangerous action: red with a confirmation step.
  - All buttons are at least 44px tall on mobile.
- **Status badges** use fixed colours:
  - Draft: grey
  - Assigned: blue
  - In transit: gold
  - Delivered: green
  - Late or blocked: red
- Every page has a clear title, filters, search, and a sensible empty state with a next-step button.
- **New photos:** a hero image on the login page, plus pictures for empty states (trucks, roads, a warehouse) and the driver home page.
- **Richer colours:** soft gradient headers and coloured stat cards.

## 4. Motion
- Smooth fade and slide between pages.
- Cards appear in sequence.
- KPI numbers count up.
- Gentle hover lift on cards.
- Skeleton placeholders while data loads instead of spinners.
- Motion is reduced for users who turn animations off in their device settings.

## 5. Map and GPS
- The map shows depots, cities, trip routes and the latest truck positions.
- **Live phone GPS:** the driver app sends the phone's location every 30–60 seconds during an active trip, with permission. Tracking then works now without a paid provider.
- **External GPS device provider:** connected later if you give me the provider name and account details. Until then its screen keeps showing "لم يتم الربط".

## 6. Mobile and quality pass
- Check every page at 375px, 768px and desktop: no horizontal scrolling, tables become cards, dialogs fill the screen.
- Make sure no red error messages appear: friendly Arabic messages, error boundaries and not-found pages.
- Sign in as each role and run one full trip flow: order, assign, driver steps, delivery, invoice, payment.

## 7. Go live
- Publish once everything has been tested.
- An honest note: no system can promise zero errors 100% of the time. The aim is careful testing and safe error handling.

## Technical details
- Role home pages are redirected from `/`, and role guards live in AppShell.
- Animation uses CSS and tw-animate, plus a small count-up hook.
- The phone GPS uses `navigator.geolocation.watchPosition` and posts readings through the existing location RPC, which already ignores older readings. It is queued in the outbox while offline.
- Images are generated with the image tool and saved as project assets.
