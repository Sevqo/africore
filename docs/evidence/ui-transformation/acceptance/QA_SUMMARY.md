# Final local UI acceptance

12 November 2026. Implementation and bounded local acceptance complete; no deployment.


## Functional, role and keyboard acceptance

Representative real local-browser journeys passed for POS cash sale/shift close; Commerce storefront test order; People profile editing; Procurement private source attachment; Accounting separate-reviewer approval and immutable balanced posting; BusinessID fictional manual-review submission; Personal manual income and aligned historical chart comparison; Developer explicitly scoped request and revocation; and populated Work board/calendar/timeline/workload and disabled private workflow configuration. Earlier Finance, Inventory, CRM, Documents and Analytics journeys remain recorded in the parent evidence directory. All records are synthetic and local.

Five-role read checks and restricted-view browser checks passed: Accounting and bills deny operations/viewer access; a private document remains owner-only even for admin; viewer HR views expose no private employee. Search, launcher and mobile drawer Escape/focus handling, skip link, chart keyboard exploration and ledger keyboard scrolling were exercised. See acceptance/role-api-checks.json, role-ui-checks.json, keyboard-checks.json, journeys.json and work-populated-checks.json.

## Quality gates

- Website build, public prerender and 66 frontend tests passed after final source corrections.
- SQLite: 435 discovered, 434 passed, one PostgreSQL-only skip; PostgreSQL: 435/435 passed on a fresh disposable local database. An initial reused-fixture run failed from retained state and was discarded; the fresh run is the acceptance result. PostgreSQL was stopped afterward.
- Lint, architecture (168 modules), fixture isolation and root typecheck passed.
- Legacy OpenAPI 59 and workspace OpenAPI 427 operations validated; no semantic contract changes.
- Development configuration 3, gateway/edge 10 and isolated local chain checks passed.
- Full backend checks preceded the final frontend-only corrections; final frontend build/lint were repeated. No backend/schema changes were made.

## Practical limits and release status

Local UI work is complete within this bounded matrix. Physical iPhone/Safari, comprehensive screen-reader/WCAG certification, real network performance timings, external providers/mailbox delivery and hosted release verification were not performed. Module-preload inspection confirms Finance does not preload the other app workspaces; it does not establish Core Web Vitals. Some full-page captures include sticky-header stitching artifacts; targeted viewport screenshots and DOM geometry provide the critical layout checks.

No main push, deployment, hosted database tests, live funds, external AI activation or missing-app implementation occurred. The hosted preview is unchanged. Original catalog service aliases and authorization gates remain intact. Evidence: [acceptance summary](evidence/ui-transformation/acceptance/QA_SUMMARY.md).
