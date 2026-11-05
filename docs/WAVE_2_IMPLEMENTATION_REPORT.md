# AfriCore Waves 1 and 2 — evaluation release

5 November 2026. This report supersedes the local implementation checkpoints. The complete master specification remains in MASTER_IMPLEMENTATION_PROGRAM.md; the evaluation boundaries below are not regulatory or external-provider certification.

## Authentication and stabilization

Neon Managed Auth remains the hosted provider on the approved development branch. The earlier repair corrected submitted-email/session matching, normalized verification errors, bounded startup GET retries and edge provider discovery. The owner confirmed founder login/refresh and controlled-mailbox verification, password reset and subsequent sign-in. No identity merge, provider migration, password reconstruction or MFA bypass was introduced. See AUTH_RECOVERY_REPORT.md for evidence and remaining provider limitations.

Global search retains scoped canonical results, focus containment, source-error feedback and environment-safe navigation. Credentials and financial writes are not automatically replayed. Earlier GitHub report push failures matched the Git Operations/Actions outage; no history rewrite or protection weakening was used. The release uses a normal fast-forward push.

## Wave 1

| App | Delivered behavior and shared records | Boundaries |
| --- | --- | --- |
| Finance | Canonical customers, issued invoices, credits, allocations, expenses, source-aware reports and Documents attachments | Manual income is separate from provider confirmation; no real funds activated |
| CRM | Configurable stages/teams/fields, canonical contact conversion, board and keyboard movement, atomic CSV imports, probability/team reports and CSV | Reports disclose loaded/source coverage; no contact email auto-merge |
| Inventory | Exact quantities, reservations, movements, warehouses, reviewed count adjustments and purchase-linked incoming/partial receipts | No automatic financial valuation or COGS |
| Sales | Versioned quantity/customer price lists, previews, frozen quotations, revisions/expiry, printable templates and canonical orders/invoice integration | Confirmation is not payment; original prices/evidence retained |
| Analytics | Scoped saved reporting and drilldown over canonical services | Currency, service and source coverage remain explicit; no bank-balance inference |
| Automations | Versioned bounded policies, branch/retry preview, durable runs and current authority checks; optional private Work completion notifications | Fixed supported actions only; no arbitrary scripts, external AI or autonomous money movement |

## Wave 2

| App | Screens, model and connected behavior | Focused suite |
| --- | --- | --- |
| Work | Private projects, board/list/calendar/timeline, assignments, dependencies/subtasks/checklists, discussions/mentions, My work, workload, exact separate reviews, approved Sales checklist templates and private completion policies | 13 tests per database |
| Accounting | Separate double-entry accounts/journals/periods, explicit opening boundary, source-linked drafts, separate-person posting, immutable posted lines, reversals, posted statements, current AR/AP comparison and configured manual tax adjustments | 16 tests per database |
| People | Separate employee identities, departments/reporting chart, HR/compensation delegation, configured leave with append-only balances, attendance/corrections, scoped reports and private Work onboarding | 9 tests per database |
| Procurement | Canonical supplier contacts, purchase requests/RFQs/offers, separate order review, issue/confirm/amend, partial accepted/rejected receipts, matched supplier bills/credits, manual payment evidence, aging and replenishment review | 12 tests per database |
| Documents | Encrypted private files/folders, versions, tags/search, grants/expiry, preview/download, copy/move/stars, recoverable trash, assigned requests, exact reviews and canonical source attachments | Documents 15 plus requests 5 per database |
| Business ID | App navigation over existing Passport, evidence, verification requests, credentials, relationships, consent-based sharing and history | Existing trust/credential/authorization suites and local-chain verification |

These test counts describe scenarios, not feature counts. The final complete database runs include these suites together with legacy finance, authentication, inventory, service, tenancy and trust regressions.

## Integrity and architecture

Migrations 012–016 add scoped ERP objects/grants/history/idempotency receipts, the separate accounting ledger, People records/leave ledger, private document custody and purchase-reference/receipt protection. Sensitive snapshots are context-bound encrypted v2 data; current membership, environment, service, role, source and participant permissions are rechecked before reads, writes and retries. Private approval bodies are decrypted only after current authorization and pagination. Disabling a service preserves authorized history but stops writes.

Shared invoices, customers, allocations, products and stock movements remain canonical. Purchase inspection posts accepted physical quantities only. Purchase plans cannot be received through generic shortcuts. Supplier/delivery references deduplicate across idempotency keys. Bills use accepted quantities and reviewed variance reasons. Manual supplier payments are explicitly unverified observations. Source journals retain one identity, current source bindings, reviewed tax splits and original-parent requirements. Posted journals, receipt/payment evidence, document blobs and leave ledger entries reject mutation.

Work and HR participation never grant financial permission. Financial source attachments retain financial checks after copying. Personnel files require both file access and current People authority. Private Work workflows send generic in-app notifications only to current project managers; they require a separately approved exact policy and retain blocked reasons. A quota-blocked workflow does not consume the last slot needed to commit the task.

## Release checks

- Full fresh PostgreSQL: 384 passed, zero failures/skips.
- Full fresh SQLite: 384 discovered, 383 passed, one PostgreSQL-only skip, zero failures.
- Website production/prerender/content/SDK tests: 59 passed.
- Gateway: 7 passed; development/startup configuration: 3 passed.
- Backend/frontend types and lint passed; architecture checked 154 frontend modules and isolated fixture import ordering.
- Contracts: 379 workspace operations and 59 legacy operations validated.
- Isolated local EVM, signed credential, authorization, anchoring and independent verification checks passed.
- All ordinary tests used disposable local SQLite/PostgreSQL, never Neon.

Browser evidence uses a fictional local workspace and the isolated in-app browser. CRM/Sales/workflow evidence is under evidence/wave1-completion. Wave 2 evidence covers private project/task/discussion persistence, separate accounting approval/posting, People records, purchase request creation without self-approval, private file upload/preview/version history, configured tax preview, Work policy saving and existing Business ID trust gates. Desktop around 1280px and mobile 390px were checked without horizontal overflow. Physical devices, every browser/assistive technology and actual pointer drag are not certified by these checks; keyboard movement and conflict behavior are tested. Screenshots contain fictional records only.

## Migration and deployment

The guarded maintenance command is node scripts/financial-development-migration.cjs --erp --apply. It accepts only the approved development project/branch/host, creates an AES-GCM encrypted backup, verifies decryption/digest, applies additive commands transactionally and compares every original public row on its original columns. On 5 November, migrations 012–016 applied successfully; all 1,283 original rows across 102 original public tables were retained unchanged. The new received quantity column is derived from retained incoming history. No production branch, identities, memberships, keys or original financial records were rewritten. A full restore rehearsal was not performed.

Source push, CI and hosted backend/frontend deployment results will be appended after execution. Hosted startup remains read-only schema verification. Backend must be live with the new schema before the Cloudflare frontend is published. Existing user service selections/installations are not silently expanded; Apps provides explicit reviewed installation of the new applications.

## Availability limits and remaining work

- No live payments, lending, Capital, mainnet, statutory payroll/eTIMS filing, automatic FX, cash-flow statement or automatic inventory valuation. Purchase costs use reviewed unreconciled clearing, requiring manual close/reclassification.
- Configured tax rates are user choices for separate manual adjustments. They do not certify statutory rates, tax recoverability or alter issued invoices/bills.
- Current aging is operational source aging with posted-account comparison, not historical reconstruction. Missing source coverage is unavailable, not a fabricated zero.
- Documents evaluation limits are 512 KiB per file and 50 MiB retained logical content per workspace environment. Supported files are validated PDF/PNG/JPEG/UTF-8 text; no malware scanning, public permanent URL, hard erasure or all-folder bulk management claim. Viewer-only assigned uploads are unavailable. A stale request requires cancellation/recreation.
- Private Work automation currently supports generic completion notifications, not arbitrary actions. Sales templates copy approved generic structure, never source discussions/files/memberships/financial actions.
- Managed MFA/passkeys remain dependent on genuine provider support; no auth migration is authorized. Free Render sleep remains possible. Physical-device and external provider/issuer qualification remain external readiness work.

Later master-roadmap requirements remain recorded and are not represented as delivered by this evaluation release.
