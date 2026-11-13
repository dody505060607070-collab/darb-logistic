# src/lib rules
- Times are stored UTC and shown in Asia/Riyadh via `src/lib/format.ts` — why: single conversion point.
- React auth context lives in its own HMR-stable module, apart from the provider — why: split routes may hold mixed module versions.
- Offline delivery drafts are account-scoped in IndexedDB, reuse one RPC reference and keep uploaded paths — why: no duplicate or misreported deliveries.
