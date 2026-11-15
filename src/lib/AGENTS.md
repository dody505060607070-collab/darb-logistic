# src/lib rules
- Times are stored UTC and shown in Asia/Riyadh via `src/lib/format.ts` — why: single conversion point.
- React auth context lives in its own HMR-stable module, apart from the provider — why: split routes may hold mixed module versions.
- Offline delivery drafts are account-scoped in IndexedDB, reuse one RPC reference and keep uploaded paths — why: no duplicate or misreported deliveries.
- `trip-assignment.ts` mirrors `assign_trip_resources` checks for the order wizard — why: trips are never silently left driverless.
- Phones are understood in any common form by `src/lib/phone.ts` and stored/sent as E.164 at every form, login and WhatsApp send — why: one parser, no mistyped numbers.
- Granting the driver role auto-creates a linked driver file (DB trigger); missing items come from `driver-completeness.ts` — why: no driver without a file.
