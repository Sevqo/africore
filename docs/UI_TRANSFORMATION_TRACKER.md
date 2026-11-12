# Platform UI transformation tracker

12 November 2026 — **Implementation and bounded local UI acceptance complete. Not deployed.**

The implemented scope contains 14 existing apps and 92 app sections. The four absent Wave 3 apps remain outside this UI release. The owner's additional 25% reduction applies throughout authenticated platform shells, controls, typography and header tools; public website pages are excluded.

The final isolated-browser matrix covers 165 route/context entries at desktop and mobile widths: 330 observations. Every entry was inspected through rendered DOM checks and saved native screenshots. All app-section contact sheets and representative direct-service screens were manually reviewed, alongside targeted populated journeys. This is representative visual and functional acceptance, not a claim that every screenshot, workflow permutation or assistive technology has been manually qualified. Setup and entitlement gates are valid tested states, not evidence of activated external functionality.

## Route matrix

“Passed” means no observed document overflow, visible alert, unnamed visible native control, or completed broken image in the recorded owner state. Each evidence JSON includes exact URLs, widths, headings and screenshot names.

| Surface | App/context | Section | Render checks | Viewports |
|---|---|---|---|---|
| Apps | pos | Daily overview | Passed | 2 |
| Apps | pos | Counter | Passed | 2 |
| Apps | pos | Saved sales | Passed | 2 |
| Apps | pos | Shifts and cash | Passed | 2 |
| Apps | pos | Register policy | Passed | 2 |
| Apps | commerce | Store and catalog | Passed | 2 |
| Apps | commerce | Storefront orders | Passed | 2 |
| Apps | procurement | Overview and reports | Passed | 2 |
| Apps | procurement | Replenishment | Passed | 2 |
| Apps | procurement | Purchase requests | Passed | 2 |
| Apps | procurement | Suppliers | Passed | 2 |
| Apps | procurement | Supplier offers | Passed | 2 |
| Apps | procurement | Purchase orders | Passed | 2 |
| Apps | procurement | Goods receipts | Passed | 2 |
| Apps | procurement | Supplier bills | Passed | 2 |
| Apps | procurement | Supplier credits | Passed | 2 |
| Apps | procurement | Payment observations | Passed | 2 |
| Apps | documents | My files | Passed | 2 |
| Apps | documents | Company files | Passed | 2 |
| Apps | documents | Shared with me | Passed | 2 |
| Apps | documents | Recent | Passed | 2 |
| Apps | documents | Starred | Passed | 2 |
| Apps | documents | Trash | Passed | 2 |
| Apps | documents | Requests | Passed | 2 |
| Apps | documents | Storage and privacy | Passed | 2 |
| Apps | people | Overview | Passed | 2 |
| Apps | people | Employees | Passed | 2 |
| Apps | people | Organization chart | Passed | 2 |
| Apps | people | People reports | Passed | 2 |
| Apps | people | Departments | Passed | 2 |
| Apps | people | Leave and reviews | Passed | 2 |
| Apps | people | Attendance | Passed | 2 |
| Apps | people | Leave policies | Passed | 2 |
| Apps | people | Employer policy and access | Passed | 2 |
| Apps | business_id | Overview | Passed | 2 |
| Apps | business_id | Business profile | Passed | 2 |
| Apps | business_id | Verification | Passed | 2 |
| Apps | business_id | Business Passport | Passed | 2 |
| Apps | business_id | Credentials | Passed | 2 |
| Apps | business_id | Evidence | Passed | 2 |
| Apps | business_id | Shared information | Passed | 2 |
| Apps | business_id | Trust relationships | Passed | 2 |
| Apps | business_id | Verification history | Passed | 2 |
| Apps | business_id | Privacy and settings | Passed | 2 |
| Apps | accounting | Dashboard and reports | Passed | 2 |
| Apps | accounting | Journal entries | Passed | 2 |
| Apps | accounting | Shared financial sources | Passed | 2 |
| Apps | accounting | Current AR and AP aging | Passed | 2 |
| Apps | accounting | Tax codes and adjustments | Passed | 2 |
| Apps | accounting | Accounts and periods | Passed | 2 |
| Apps | work | Projects | Passed | 2 |
| Apps | work | Approved templates and Sales | Passed | 2 |
| Apps | work | My work | Passed | 2 |
| Apps | work | Boards | Passed | 2 |
| Apps | work | Discussions | Passed | 2 |
| Apps | work | Calendar | Passed | 2 |
| Apps | work | Timeline | Passed | 2 |
| Apps | work | Team workload | Passed | 2 |
| Apps | work | Private workflows | Passed | 2 |
| Apps | finance | Dashboard | Passed | 2 |
| Apps | finance | Invoices | Passed | 2 |
| Apps | finance | Customers | Passed | 2 |
| Apps | finance | Payments | Passed | 2 |
| Apps | finance | Expenses | Passed | 2 |
| Apps | finance | Reconciliation | Passed | 2 |
| Apps | finance | Receivables | Passed | 2 |
| Apps | finance | Financial reports | Passed | 2 |
| Apps | crm | Dashboard | Passed | 2 |
| Apps | crm | Customers | Passed | 2 |
| Apps | crm | Pipeline | Passed | 2 |
| Apps | crm | Follow-ups | Passed | 2 |
| Apps | crm | Activity | Passed | 2 |
| Apps | inventory | Dashboard | Passed | 2 |
| Apps | inventory | Products | Passed | 2 |
| Apps | inventory | Warehouses | Passed | 2 |
| Apps | inventory | Stock movements | Passed | 2 |
| Apps | inventory | Reservations | Passed | 2 |
| Apps | inventory | Replenishment | Passed | 2 |
| Apps | sales | Dashboard | Passed | 2 |
| Apps | sales | Quotations | Passed | 2 |
| Apps | sales | Orders | Passed | 2 |
| Apps | sales | Fulfillment | Passed | 2 |
| Apps | sales | Customers | Passed | 2 |
| Apps | analytics | Dashboard | Passed | 2 |
| Apps | analytics | Financial patterns | Passed | 2 |
| Apps | analytics | Saved reports | Passed | 2 |
| Apps | analytics | Data quality | Passed | 2 |
| Apps | automations | Dashboard | Passed | 2 |
| Apps | automations | Workflows | Passed | 2 |
| Apps | automations | Execution history | Passed | 2 |
| Apps | automations | Private project workflows | Passed | 2 |
| Apps | automations | Approvals | Passed | 2 |
| Business direct services | direct-service | Accounting ledger | Passed | 2 |
| Business direct services | direct-service | AfriCore Pay | Passed | 2 |
| Business direct services | direct-service | Automations | Passed | 2 |
| Business direct services | direct-service | Business Passport | Passed | 2 |
| Business direct services | direct-service | Business Verification | Passed | 2 |
| Business direct services | direct-service | Cash Flow | Passed | 2 |
| Business direct services | direct-service | Commerce operations | Passed | 2 |
| Business direct services | direct-service | Customer relationships | Passed | 2 |
| Business direct services | direct-service | Customers & clients | Passed | 2 |
| Business direct services | direct-service | Expenses | Passed | 2 |
| Business direct services | direct-service | Financial Intelligence | Passed | 2 |
| Business direct services | direct-service | Fulfillment & delivery | Passed | 2 |
| Business direct services | direct-service | Inventory Tracking | Passed | 2 |
| Business direct services | direct-service | Invoicing | Passed | 2 |
| Business direct services | direct-service | Orders | Passed | 2 |
| Business direct services | direct-service | People operations | Passed | 2 |
| Business direct services | direct-service | Point of Sale | Passed | 2 |
| Business direct services | direct-service | Private documents | Passed | 2 |
| Business direct services | direct-service | Procurement | Passed | 2 |
| Business direct services | direct-service | Product Catalog | Passed | 2 |
| Business direct services | direct-service | Projects and teamwork | Passed | 2 |
| Business direct services | direct-service | Sales and quotations | Passed | 2 |
| Business direct services | direct-service | Trust Network | Passed | 2 |
| Business direct services | direct-service | Verifiable Credentials | Passed | 2 |
| Personal | personal | Overview | Passed | 2 |
| Personal | personal | Apps | Passed | 2 |
| Personal | personal | Notifications | Passed | 2 |
| Personal | personal | My Services | Passed | 2 |
| Personal | personal | Explore Services | Passed | 2 |
| Personal | personal | Usage & Billing | Passed | 2 |
| Personal | personal | Assistant | Passed | 2 |
| Personal | personal | Income | Passed | 2 |
| Personal | personal | Expenses | Passed | 2 |
| Personal | personal | Invoices | Passed | 2 |
| Personal | personal | Clients | Passed | 2 |
| Personal | personal | Payment Records | Passed | 2 |
| Personal | personal | Cash Flow | Passed | 2 |
| Personal | personal | Reports | Passed | 2 |
| Personal | personal | Learn | Passed | 2 |
| Personal | personal | Settings | Passed | 2 |
| Developer | developer | Overview | Passed | 2 |
| Developer | developer | Notifications | Passed | 2 |
| Developer | developer | Products | Passed | 2 |
| Developer | developer | My Services | Passed | 2 |
| Developer | developer | Explore Services | Passed | 2 |
| Developer | developer | Usage & Billing | Passed | 2 |
| Developer | developer | Assistant | Passed | 2 |
| Developer | developer | Data | Passed | 2 |
| Developer | developer | My Applications | Passed | 2 |
| Developer | developer | API Keys | Passed | 2 |
| Developer | developer | API Explorer | Passed | 2 |
| Developer | developer | Sandbox | Passed | 2 |
| Developer | developer | Webhooks | Passed | 2 |
| Developer | developer | Request Logs | Passed | 2 |
| Developer | developer | Usage & Limits | Passed | 2 |
| Developer | developer | API Documentation | Passed | 2 |
| Developer | developer | SDKs & Examples | Passed | 2 |
| Developer | developer | Verification APIs | Passed | 2 |
| Developer | developer | Settings | Passed | 2 |
| Developer | developer | Support | Passed | 2 |
| Shared Business pages | shared-business | Overview | Passed | 2 |
| Shared Business pages | shared-business | Apps | Passed | 2 |
| Shared Business pages | shared-business | My Services | Passed | 2 |
| Shared Business pages | shared-business | Explore Services | Passed | 2 |
| Shared Business pages | shared-business | Usage & Billing | Passed | 2 |
| Shared Business pages | shared-business | Notifications | Passed | 2 |
| Shared Business pages | shared-business | Approvals | Passed | 2 |
| Shared Business pages | shared-business | Team | Passed | 2 |
| Shared Business pages | shared-business | Settings | Passed | 2 |
| Shared Business pages | shared-business | Assistant | Passed | 2 |
| Shared Business pages | shared-business | Data | Passed | 2 |
| Shared Business pages | shared-business | Connect | Passed | 2 |
| Shared Business pages | shared-business | Forecasts | Passed | 2 |

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
