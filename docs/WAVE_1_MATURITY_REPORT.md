# Wave 1 maturity — implementation checkpoints

The master program remains authoritative. This report records incremental work and is not acceptance of all six mature apps or Wave2. Existing live installations and canonical customer/order/invoice/payment/stock histories remain in place.

## CRM lifecycle checkpoint

An explicit lead conversion endpoint changes an open active lead to a qualified opportunity in place. Customer ID, entry ID, creation time, owner, notes, value, currency and existing links persist. Ordinary editing still cannot change customer identity or record kind. Conversion uses current membership/operations authority, Business eligibility, CRM entitlement, current linked-customer validation, expected version and the existing organization transaction/idempotency store. It records one audit action and creates no extra customer or billable CRM record. Completed or cancelled leads and won/lost leads cannot convert. No schema migration is required.

Record detail editing exposes title, stage/status, owner, due time, notes, amount and currency. Search/status filters explicitly cover the loaded bounded record list. The opportunity board groups those records by stage, supports keyboard-accessible stage changes, opens the same detail editor and labels prospective amounts rather than recognized revenue. Read-only members have disabled mutation forms; server checks remain authoritative. Details receive focus when opened. Existing customer activity and direct-service access are retained.

## Research and qualification

Odoo's official20.0 CRM README describes pipeline boards, activities and connected opportunity records: https://github.com/odoo/odoo/blob/20.0/addons/crm/README.md . The hosted20.0 conversion documentation timed out; no claim is made to have read it. The AfriCore implementation is original and uses existing records and primitives. No email automation, external messages or copied artwork/source is introduced.

Local synthetic browser testing confirmed edit persistence, conversion retaining the notes/customer/value, refreshed opportunity visibility and stage changes through the board. At390px the board stacks into one column; at1440px detail fields use two columns and receive focus. Requested/measured viewport and clipping checks are recorded with evidence. Screenshots contain synthetic records only. Physical mobile/browser-assistive-technology certification is not inferred.

## Remaining program work

CRM still needs full sales-team/work-queue reporting and richer activities. Finance, Inventory, Sales, Analytics and Automations retain the deeper master requirements; this checkpoint does not certify them complete. Wave2 Work, Accounting, People, Procurement, Documents and BusinessID remain pending after Wave1 qualification. Posted financial history, immutable issued documents, explicit currency/minor-unit arithmetic, exact inventory units, approval boundaries and provider gates must be preserved throughout.

Validation: full SQLite299discovered/298passed/one PostgreSQL-only skip; full local PostgreSQL299/299passed. After adding the final concurrency/archive assertions, affected cross-app tests23/23passed on each engine. Frontend56/56, lint117modules, workspace267and legacy59contract operations, development3checks and gateway7checks passed. Chain result is recorded after completion. No hosted ordinary tests or schema migration were used.

The isolated local chain/credential/authorization/anchoring/independent-verification gate passed. Final board geometry checked320/375/390/430/768/1024/1440/1920requested widths;768measured769on this host. No document horizontal overflow was observed. Final responsive data and desktop/mobile screenshots are under evidence/wave1-maturity.

## Inventory count checkpoint

A physical count observes one tracked product at one active warehouse/location. The snapshot includes current physical/reserved quantities and a revision derived from target, product version, warehouse revision and location balance. Posting rechecks that observation inside the existing organization transaction. A changed stock/reservation/product state requires a new review instead of applying an old difference.

The counted amount is nonnegative exact integer thousandths; integral product units remain integral. An actual difference passes through the existing immutable movement service, reservation protections, usage limits and exact second-person write-off approvals. A matching count records an audited observation with no artificial physical movement or usage. Idempotency persists the count result; replay does not duplicate movements or audits. Internal operation keys hash the supplied key to preserve the full200-character external key boundary. Existing movement rows are never rewritten. Count observations/results are retained by the existing operation/audit stores; a separate browseable multi-line count session/history is not implemented by this single-location checkpoint.

The Inventory Counts interface loads an observation, shows the proposed difference and records a reason. It can request an exact negative-adjustment review and later select the approved operation. Changes to count amounts, reason or stock state invalidate the original review where applicable. Success refreshes the overview. No inventory valuation, accounting journal, supplier order or payment is inferred.

Targeted connected-workflow checks25/25passed on SQLite and PostgreSQL, including unchanged counts, exact physical delta,200-character replay, concurrent counts, stale observations, integral-unit validation, second-person approval, reserved stock and workspace/role/service denial. Full release checks and browser evidence follow below.

Final Inventory qualification: full SQLite302discovered/301passed/one PostgreSQL-only skip; fresh local PostgreSQL302/302passed. The initial full PostgreSQL repeat reused an existing test database and failed on immutable price/provider-reference fixture history; it is discarded as release evidence. No integrity constraint was weakened; a fresh local database passed. Frontend56/56, lint118modules, workspace269and legacy59contract operations, isolated chain/credential verification passed. Gateway7and development3checks passed in this checkpoint chain; the gateway was unchanged by the Inventory work.

The sandbox browser posted two fictional count differences, displayed success, refreshed inventory and showed both new adjustments beside the original20-unit receipt. Count form geometry passed the eight requested widths with768measured769; no horizontal document overflow. Screenshots/data are under evidence/wave1-maturity. Read-only Inventory forms and Sales draft creation now disable mutation controls consistently while retaining backend authority checks. No new migration, hosted synthetic write, paid compute or external provider activation occurred.


## Deployed checkpoint — 4 November 2026

CRMsourcef7cb36d and Inventorysourcee3c3b58ff07b68513d774c66d7ecb53647e4d345 are on main. GitHubCI41819879120 passed allfive jobs. Render deploymentdep-dblha4gae00c73c8j6o0 was triggered and verified Live from the isolated sandbox dashboard; no external-browser control or paid changes occurred. Cloudflare versione949e416-9802-47ab-81e2-2640f3189815 followed the backend. Main/Accounts/BusinessAppJS/CSS hashes match the local tested assets. Managed public configuration matches, anonymous account401 and direct backend403 pass. Existing managed read-only audit:46checks,37successful/7inactive/2without safe collection GET, no unexpected failures. The new count preview route preserves inactive Inventory402 in the controlled managed workspace. Hosted business writes were not used as an ordinary test fixture.

Evidence: evidence/wave1-maturity/deployed.json, hosted-service-reads.json, hosted-count-route.json, responsive measurements and synthetic screenshots. Full Wave1 maturity and all Wave2 applications remain outstanding as specified; these two deployed checkpoints do not certify the entire program. No new migration, identity/data rewrite, provider activation or production Neon branch change was performed.
