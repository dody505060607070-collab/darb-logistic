# Quality and security review — 14 November 2026

## Applied
- Expanded the English phrase catalog for return requests, delay notices, workshop intake and reports, accounting, profile previews, legal text, and errors.
- Replaced unbounded inside-word substitutions with normalized exact phrases and word-boundary matching. Batched DOM translation after hydration, including titles and alternative text.
- Consolidated language and light/dark controls in one compact group in login, staff toolbar, and driver header. Both languages, themes and privacy preferences were exercised on public pages.
- Added safe problem-and-remedy errors and login field error states. Real validation and permission refusals remain enforced.
- Added privacy, terms and contact pages; Riyadh, Saudi Arabia is the only supplied contact location. Policies are operational drafts, not legal certification.
- Connected analytics consent to Consent Mode using the official consent module, with permanent settings access and Global Privacy Control support.
- Preserved private ERP pages outside search. Added public legal/contact routes to the existing sitemap and robots allowlist, canonical references, page-specific metadata and Organization structured data with only supplied city/country.
- Existing 404, manifest/PWA, loading states and mobile operational action bars remain. No invented thank-you page, subscription or external payment flow was added.
- Added a limited compatible Content Security Policy, nosniff, HSTS, existing CSRF and private/no-store on authenticated or internal responses. No framing restriction was added that would break the editor preview.
- Updated vulnerable runtime/build dependencies through compatible patch overrides and Zod 4. Current production dependency scan: no known vulnerabilities in 61 checked packages. Basic database scan: no findings. These results do not establish comprehensive security.
- Queries retry only bounded reads and never known permission/validation failures. Existing 30-second cache and focus-refetch suppression remain; no unmeasured percentage performance improvement claimed.

## Verification and limits
- 107 tests passed after dependency changes, including consent refusal/GPC/expiry, safe errors, bounded retries and preservation of identifiers during translation.
- Public English login, privacy, terms, contact and 404 opened without JavaScript errors or horizontal overflow. Arabic/English roundtrip, both themes, and consent settings were exercised. Mobile at 390 pixels passed.
- A hydration mismatch found during translation of server-rendered legal pages was reproduced and corrected with delayed/coalesced DOM translation; the same browser audit then reported no JavaScript errors.
- All content routes inspected for individual title, description, Open Graph title/description/type and Twitter card. Existing bundled/relative images are not invented absolute Open Graph URLs; hosting supplies preview imagery. Public login canonical added.
- Signed-in route and operational integration readback were NOT verified in this turn: requesting user was signed out and self-session minting found no matching account. No alternate employee was chosen, no message was sent, no business operation was approved, and nothing was published.
- Full arbitrary employee-written content is not automatically English: the existing on-demand translation remains, and names/official identifiers are not rewritten. Full signed-in forms/dialogs and reports require another authenticated audit.
- Deep code scan returned one error-level finding and four warnings: pending workshop intake changed arbitrary asset availability; role helpers disclosed other user roles (two helper functions); CSV formula injection; and unvalidated fleet IDs in filter syntax. Applied migrations remove asset mutation from pending intake and scope role queries to self, authorized staff or service execution. Applied shared CSV neutralization and UUID validation before fleet filter reads. These are corrections, not a 99% security claim.
- SQL behavioral regression is saved in tests/sql/security_review_regressions.sql. Database test tools refused fixture writes in a read-only transaction and role helper execution in their diagnostics role; no persistent fixture data was written. Runtime cross-role acceptance still requires authenticated accounts or a privileged rollback-test connection. Migration structure regressions and CSV/UUID tests run locally.

## Waiting on outside input
- Sign-in in preview for authenticated full-page/forms and cross-role workflows, provider connectivity and actual WhatsApp delivery.
- Official street address and contact number, retention policy and company approval of legal drafts.
- PetroApp and selected GPS provider documentation/credentials and official e-invoicing onboarding remain separate existing blockers.
- Next publish to deploy public metadata and policy changes; publishing was not automatic.