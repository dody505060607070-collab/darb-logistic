# src/lib rules
- Times are stored UTC and shown in Asia/Riyadh via `src/lib/format.ts` — why: single conversion point.
- React auth context lives in its own HMR-stable module, apart from the provider — why: split routes may hold mixed module versions.
- Offline delivery drafts are account-scoped in IndexedDB, reuse one RPC reference and keep uploaded paths — why: no duplicate or misreported deliveries.
- `trip-assignment.ts` mirrors `assign_trip_resources` checks for the order wizard — why: trips are never silently left driverless.
- Phones are understood in any common form by `src/lib/phone.ts` and stored/sent as E.164 at every form, login and WhatsApp send — why: one parser, no mistyped numbers.
- Granting the driver role links the single unlinked driver file with the same phone, else creates one (DB trigger); saving a driver file with a phone activates its login via `ensureDriverLogin`; missing items come from `driver-completeness.ts` — why: no driver without a file and no duplicate files.
- ضمان المهندس GPS: per-minute job runs `daman-gps.server.ts` into `gps_provider_vehicles` (positions every run, device details a few per run); only devices the provider marks as trucks auto-join the fleet (service-only RPC), others link via role-checked RPCs; each linked truck's device driver gets a driver file and automatic custody (`source='daman_gps'`), never overriding staff-made custody; trip monitor adds the fresh provider fix so parked/offline trucks still alert — why: cars aren't offered as cargo trucks and rarely-reporting parked trucks aren't missed.
