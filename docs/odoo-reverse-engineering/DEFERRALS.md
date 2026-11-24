# Checkpoint 5 — Deferred expenses and deferred revenue

AfriCore baseline `301a158602c516e06e727bf2c2dec808dc24ae87`. Odoo 20 Community reference `4968b8772ab96e25471ebbcdcbe32f6049e5b728`.

## Source evidence

| Evidence | Verified behavior |
|---|---|
| `addons/account/models/account_move_line.py`, `AccountMoveLine` and `_compute_balance` | Journal lines have entry, journal, company, currency, date and posting state context. Debit and credit determine balance. |
| `addons/account/models/template_generic_coa.py` and `addons/account/tests/common.py` | Community supplies chart defaults and fixtures for prepayments and deferred revenue. |
| `addons/account/tests/test_kpi_provider.py` and `addons/account/tests/test_tour.py` | Community tests conditionally reference a `deferred_move_ids` extension. The pinned checkout contains no implementation of that extension or deferral scheduling addon. |

REA `inspect_python_pyc` inspected a scratch compilation of `account_move_line.py`, targeting `AccountMoveLine` and `_compute_balance`. Evidence ID `ev_84e9e63fb877374ab21792663c67781a9fc73fa5b622f60d03db4e264fffa57b`. The implementation uses original Python allocation and AfriCore journal controls. [Odoo 20 deferred expenses](https://raw.githubusercontent.com/odoo/documentation/20.0/content/applications/finance/accounting/vendor_bills/deferred_expenses.rst) · [Odoo 20 deferred revenue](https://raw.githubusercontent.com/odoo/documentation/20.0/content/applications/finance/accounting/customer_invoices/deferred_revenues.rst)

## Workflow

1. Select an unreversed posted journal line in the same workspace and currency. The line must hold the exact deferral amount in the configured prepaid asset or deferred-revenue liability. If the original commercial transaction posted directly to expense or revenue, prepare and post a balanced reclassification before selecting the source. An invoice establishes commercial evidence independently of cash settlement.
2. Choose active recognition accounts and a journal. An optional model supplies versioned defaults for the accounts, allocation, frequency and duration. Subsequent model changes apply to new selections.
3. Compute and review the board, then confirm the schedule. Prepare the next eligible recognition entry from the board. Expense recognition debits expense and credits the prepaid asset. Revenue recognition debits the deferred liability and credits revenue.
4. Request and obtain separate approval in the native journal workflow. Native posting revalidates the source, active accounts and journal, posting period, and bound approval. Each recognition links to the posted source and the board. Withdraw an outstanding draft before revising or reversing the schedule.
5. Reverse recognition through native journal review and posting, latest recognized period first. Future revisions keep posted periods and allocate only the unrecognized amount. To correct the original source journal, clear dependent drafts and reverse posted recognition, then have a manager retire the confirmed schedule with a recorded reason. The source journal itself still requires native reversal approval.

## Allocation

`python/africore_accounting/deferrals.py` calculates the entire board in one bounded invocation through the existing Python accounting adapter. It uses exact rational weights and cumulative half-up rounding in currency minor units. Equal allocation assigns equal weight to each scheduled interval. Actual days weights each inclusive calendar day equally. Months weights full months equally and prorates a stub by its actual days over that month's length. Full months includes the starting stub as a full month and prorates the final stub. Monthly, quarterly and annual boundaries follow calendar periods, with the last recognition dated on the explicit end when it precedes the final boundary. The remaining balance reaches zero and rounding residuals stay in the board. The engine accepts ranges up to 360 months across fiscal years. The journal controls enforce posting locks.

## Accounting and reporting

Registers and model configuration live inside Accounting. Details, boards, source drilldowns and version history reflect live records. The expense and revenue reports support dates or an accounting period, deferred or recognition account, journal, authorized partner ID and state. Posted columns net recognition and reversals by actual journal date. Proposed, later and overdue amounts use the current schedule. A report covers configured deferrals. The board and filtered report export CSV.

See [Accounting API](../API.md#accounting-deferrals) for the routes. The action endpoint takes `expected_version`; prepare and withdraw take a recognition date, revise takes dates, policy and reason, and retire takes a reason. The implementation uses existing scoped encrypted storage and approval grants. It adds no database migration.

## Verification and boundaries

- All 17 Python accounting unit tests passed. Deferral cases cover exact residuals, partial periods, leap years, quarterly and annual schedules, prior recognition, and invalid bounds.
- The final focused Accounting and Python adapter suite passed all 22 tests on SQLite and all 22 on a fresh PostgreSQL 17 database. The journey covers source balance, duplicate controls, debit and credit orientation, separate approval, trial balances, period locking, future revision, reversal, source correction and scoped reporting.
- The full SQLite regression run passed 503 tests with one skipped before the final retirement and navigation changes. The final focused suites exercised the new retirement path through approval and posting of the source reversal.
- The final website production build passed all 151 content tests, including the focused Accounting navigation and integration checks. Typecheck, lint, OpenAPI validation and validation of all 588 workspace operations passed.
- The isolated in-app browser passed authenticated expense and revenue creation, schedule calculation, confirmation, separate approval and posting. Each KES 120,000 source produced 12 periods and the first KES 10,000 posting left KES 110,000 deferred. The browser also verified source and posted-journal drilldowns, record reload, register search, period/account/group filters in the revenue report, the expense report and the downloaded revenue CSV. A separately approved December reversal returned the revenue balance to KES 120,000, preserved November's historical posted amount and allowed recalculation through November 2027. History displayed both the reversal and revision.
- Browser testing identified and verified fixes for the draft date submission, native journal post and reversal forms, and journal register drilldown. The final website build and lint passed after those fixes.
- Initial reclassification is a reviewed Accounting operation. This checkpoint provides manual, same-currency recognition and CSV. The current storage workflow limits each workspace environment to 200 deferral records and 200 models. Automatic recognition, grouped posting and PDF/XLSX exports remain outside this implementation. Hosted migration and readiness work remains separate.

### Visual comparison

The four Odoo references show the form title, state-specific actions, recognition board, posted-entry count and period reporting. AfriCore keeps its own Accounting shell, version history and journal links. The browser was set to the reference dimensions for comparison. The in-app screenshot service cropped some JPEGs, especially the first and fourth, so the exported files have different pixel dimensions.

| Reference | Browser viewport requested | AfriCore observation |
|---|---|---|
| D1, draft expense | 1915 × 801 | The named draft shows compute and confirm actions, a Board tab and dated amounts. [Draft expense](../evidence/deferrals/expense-draft.jpg) |
| D2, running revenue | 1666 × 860 | The board shows posted and proposed rows, cumulative and remaining amounts, and a journal drilldown. [Revenue board](../evidence/deferrals/revenue-board.jpg) |
| D3, deferred revenue report | 1917 × 752 | Reporting exposes the period, account, journal, state and grouping controls above historical and proposed amounts. [Revenue report](../evidence/deferrals/revenue-report.jpg) |
| D4, posted expense | 1830 × 726 | The posted-entry control shows one result and opens a posted-only board. [Cropped expense capture](../evidence/deferrals/expense-posted.jpg) |
| Mobile | 390 × 844 | The board scrolls within its 320 px container. Dates and amounts stay on one line, and the page has no horizontal overflow. [Mobile expense board](../evidence/deferrals/expense-mobile.jpg) |
