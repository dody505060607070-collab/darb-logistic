# Preview issue verification — 27 November 2026

## Implemented

1. **Custody and inspections:** undefined results now remain unknown, with dashes instead of zero counts. The unacknowledged heading gains its count only after valid data arrives. Initial errors expose query-specific retry; successful empty results have distinct empty messages. Cached successful rows and counts remain visible during refetch and refetch failure, with an explicit stale-data warning. Inspection details depend on both custody and inspection availability; inspection success cannot turn unknown custody into “no custody.” Custody counts render directly, avoiding the shared KPI animation starting at zero.
2. **Accountant home:** the required-action section comes before the four KPI tiles. Receivables, today's collections, pending expenses and open advances remain siblings in the same responsive grid: two columns on mobile and four at larger widths. No card identity, DOM index, account storage key or layout group was changed for this fix. Keyboard card movement and reload persistence were exercised at 390px.
3. **Manager home:** an early operational document list displays expired and expiring asset/driver documents, ordered by expiry. It reuses existing document records, configuration windows, assets, drivers and open custody sources through the existing access-controlled client. It shows related record identity, expiry date/severity, actual document owner or open-custody holder when mapped, and fleet-supervisor responsibility as a role—not an invented employee assignment. Record buttons open the document screen with the matching expiry filter, entity and selected record. The document screen is shared by real routes and the isolated presentation preview.

## Actual verification

- Full test run: **280 passed, 56 test files** (`bunx vitest run`).
- Focused run: **67 passed, 12 files**, including new state/retry/expiry tests and existing home-summary, card arrangement, presentation isolation, trip assignment, invoice validation and accounting tests.
- New tests: `query-state.test.ts` (5), `query-notice.test.tsx` (2), `operational-documents.test.ts` (4).
- Preview checked at **390×844, 800×1100, 1920×1080**.
- Custody: initial delayed reads, initial failures, retry, loaded 17 pending custodies, successful empty data, custody-success/inspection-error mixed state, retained rows after refetch failure and retained rows during retry.
- Manager: document pending/error/empty/retry states; expired asset plus expiring driver plus valid document fixture; list appears ahead of operational KPIs even with required actions at zero; matching expired document opens selected and other expiry classes are excluded.
- Accountant: nonempty and empty required actions, paired receivables/collections on mobile, all four tiles grouped on larger widths, keyboard reorder persisted after reload at 390px.
- Main browser run: **zero JavaScript errors and zero production auth/database/storage/realtime/server-function requests**. All fixture writes were isolated session/local layout storage only.
- No horizontal page overflow in the checked custody, accountant and document-record views.
- Latest automatic preview build: **build OK**. No manual application build was run.
- Screenshots were inspected for accountant placement, manager priorities, document links, and pending/error presentation.

## Request → order → trip → POD → billing regression inspection

No executable, isolated fixture suite covering the entire linked chain was found. Existing tests verify pieces, not the complete chain:

- `presentation-runtime.test.ts`: representative request persistence and related customer/location readback; rerun successfully.
- `presentation-demo.test.ts`: legacy isolated trip transitions and invoice restrictions; rerun successfully, not equivalent to live RPC enforcement.
- `trip-assignment.test.ts`, `invoice-document.test.ts`, `accounting.test.ts`, `invoice-draft.test.ts`: resource checks, invoice figures/validation and accounting calculations; rerun successfully.
- `tests/sql/production_readiness.sql`: actual database trip/POD/access checks, but creates fixtures against the connected database and requires pre-existing test accounts; inspected only, not executed.
- `tests/sql/business_rules.sql`: a comment-only pointer, not an executable suite.
- `tests/sql/shitaa_acceptance.sql`: a pointer to maintenance/wallet acceptance, not request-to-billing coverage.
- The shared-screen presentation runtime fails unsupported conversion/billing RPCs closed; it does not supply a faithful full billing-cycle engine.

Therefore **full linked request-to-billing regression remains unverified**, requiring a separate isolated database with appropriate role fixtures. No real invoices or production rows were created to bridge this gap.

## Touched files

- `src/components/screens/CustodyScreen.tsx`
- `src/components/darb/RoleDashboards.tsx`
- `src/components/screens/HomeScreen.tsx`
- `src/components/darb/OperationalDocuments.tsx` (new)
- `src/components/darb/QueryNotice.tsx` (new)
- `src/lib/operational-documents.ts` (new)
- `src/lib/query-state.ts` (new)
- `src/components/screens/DocumentsScreen.tsx` (extracted shared screen)
- `src/routes/documents.tsx` (thin route, URL filter/record selection)
- `src/components/darb/PresentationDemo.tsx` (shared document screen registration)
- `src/test/query-state.test.ts` (new)
- `src/test/query-notice.test.tsx` (new)
- `src/test/operational-documents.test.ts` (new)
- `roadmap.md`
- `docs/dashboard-review/preview-issues.md` (this report)

## Limits and boundaries

- Preview verification used explicit synthetic fixtures, not real employee sessions; no new claim of production role/RLS acceptance.
- The asset holder is contextual identity, not proof they were assigned document renewal; where no person is mapped, only the existing fleet-supervisor responsibility is shown.
- Existing account-specific layout identities were preserved for the accountant change; all historic layouts and pointer/touch drag combinations were not exhaustively tested.
- Document renewal, approval and upload were not exercised in production; read-only preview flows were sufficient for the requested changes.
- No production data mutations, notifications, deployments, schema changes or real invoices; no backend tools were invoked.