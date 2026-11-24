# Checkpoint 6 — Fiscal Period Closing, Opening Balances and Financial Statements

AfriCore baseline `a81f7d025831be935f7bdde4370c839345312797` (continuing from `1749a4c4a25b038eff955e4f4e2efce34a4f9655`). Odoo 20 Community reference `4968b8772ab96e25471ebbcdcbe32f6049e5b728`.

## Source provenance and REA evidence

| Odoo 20 Community source | Verified behavior | AfriCore implementation choice |
|---|---|---|
| `addons/account/models/company.py` (`ResCompany`, `SOFT_LOCK_DATE_FIELDS`, `LOCK_DATE_FIELDS`, `_get_lock_date_violations`, `_get_violated_lock_dates`, `compute_fiscalyear_dates`) | Defines configurable fiscal year-end (`fiscalyear_last_day`, `fiscalyear_last_month`), four soft lock dates (`fiscalyear_lock_date`, `tax_lock_date`, `sale_lock_date`, `purchase_lock_date`), and `hard_lock_date`. Checks `sale` on sales journals, `purchase` on purchase journals, `tax` when taxes apply, and `fiscalyear`/`hard` globally. | `src/erp/accounting-close.ts` implements non-overlapping fiscal years (including non-Dec 31 year-ends) and four soft lock dates (`sales`, `purchases`, `tax`, `all`) enforced server-side across all entry creation, posting, reversal, and bank reconciliation paths. Irreversible `hard_lock_date` is intentionally disabled until recovery UX is qualified; closed periods enforce an independent lock. |
| `addons/account/models/account_lock_exception.py` (`AccountLock_Exception`, `_compute_state`, `action_revoke`, `_get_active_exceptions_domain`) | Models time-bounded, user-scoped, revocable exceptions for soft lock dates with chatter audit tracking; never applies to `hard_lock_date`. | Lock date updates require owner/admin authority, optimistic versioning, and an explicit audit reason; period reopening requires separate-actor review (`request_reopen` → `reopen`) with full version history. |
| `addons/account/models/account_account.py` (`account_type`, `include_initial_balance`, `equity_unaffected`) | Distinguishes permanent accounts (`include_initial_balance = True`: assets, liabilities, equity) from P&L accounts (`income`, `expense`) and `equity_unaffected` (Current Year Earnings). | Permanent account balances carry forward continuously from the posted ledger without generating duplicate annual opening entries; P&L resets by fiscal year; Balance Sheet computes Posted Equity, Prior-Year Earnings Carried Forward, and Current Fiscal Year Result. |
| `addons/account/models/account_move.py` (`_check_fiscal_lock_dates`, `_get_violated_lock_dates`, `_create_opening_balance_bank_statements`) | Enforces lock dates on posting/editing and treats the company opening move as a single explicit entry. | `saveJournalEntry`, `prepareDerivedEntry`, `postJournalEntry`, and `reverseJournalEntry` enforce both `openPeriod` and `enforceLockDates`. Opening balances are explicit balanced journal entries on `start_on`, one per currency, excluding AR/AP control accounts (`1100`, `2000`) to prevent double-counting open invoices/bills. |
| `addons/account/models/account_report.py` (`AccountReport`) | Community provides report metadata models (`account.report`), while the full live Trial Balance, Balance Sheet, Profit & Loss, General Ledger, and Executive Summary engines reside in Odoo Enterprise (`account_reports` / `account_accountant`), which is absent from the pinned Community checkout. | Implemented original server-side SQL aggregation and Python exact-integer statement validation in `src/erp/accounting-statements.ts` and `python/africore_accounting/statements.py`, matching Odoo 19/20 operational layouts (F1–F4). |

### REA compiled-artifact evidence

Because REA CLI 6.10.1 cannot import Python source trees directly on Windows, scratch-compiled `.pyc` artifacts from the pinned Odoo 20 Community checkout were inspected via REA MCP `inspect_python_pyc`:

- `account_lock_exception.pyc`: evidence `ev_d1cb44db7221eedf46cfa25ea045c946420ab4b679e217e9f621260d833fd055` (parent `ev_0e9673880c76707c04d04c0305e8848954d614323b2fbde00a1bf8e6cc87571b`) — verified `AccountLock_Exception`, `_compute_state`, `action_revoke`, and `_get_active_exceptions_domain` (22 code objects).
- `company.pyc`: evidence `ev_0c439256a1b4cd17b6a32cb55f575d765b3d235c41275368c2b4b0fa08c21778` (parent `ev_caf6c0540b6bd4f72f2e0832db52d461d2f2825db8b26d990a442b53872349d8`) — verified `ResCompany`, `_get_lock_date_violations`, `_get_violated_lock_dates`, and `compute_fiscalyear_dates` (97 code objects).

## Domain, Python engine, and cross-app lock enforcement

- **Fiscal years and periods (`src/erp/accounting-close.ts`)**: Non-overlapping fiscal years with configurable year-end dates (including non-Dec 31). Accounting periods cannot cross a configured fiscal-year boundary or overlap existing periods.
- **Period close workflow (`Open → Under Review → Approved for Close → Closed`, plus `Reopen Review`)**:
  - Checklist reads live Accounting records: `draft_journals`, `unbalanced_journals`, `unreconciled_bank_lines`, `pending_bank_decisions`, `depreciation_due`, `deferral_recognition_due`, `period_consistency`, `trial_balance_variance`, `opening_balance_required` (blockers) and `pending_journal_reviews` (warning).
  - A SHA-256 fingerprint of all live checklist facts binds review approval; any subsequent mutation invalidates stale approvals (`stale: true`) and requires a fresh review.
  - Separate-actor owner/admin approval is required for both closing and reopening; direct period-state toggling is blocked once a period enters reviewed close.
- **Lock dates (`sales`, `purchases`, `tax`, `all`)**:
  - Enforced server-side across `saveJournalEntry`, `prepareDerivedEntry`, `postJournalEntry`, `reverseJournalEntry`, and `bank-reconciliation.ts` (`importBankStatement`, `proposeBankMatch`, `decideBankMatch`).
  - Covers Accounting manual entries, Sales (`invoice`, `credit_note`, `pos_sale`, `cash_receipt`, `cash_return`, `SALES` journal), Procurement (`supplier_bill`, `supplier_credit`, `supplier_payment`, `expense`, `PURCHASE` journal), Tax-sensitive entries (`configured_tax_entry` or tax control/code accounts), Fixed Assets (`asset_depreciation`), Deferrals (`deferral_recognition`), Bank Reconciliation, and native reversals.
- **Opening balances (`src/erp/accounting-opening.ts`, `python/africore_accounting/opening.py`)**:
  - Bounded single-subprocess Python CSV parser validates 2–200 unique active permanent accounts in nonnegative integer minor units, rejects AR/AP control accounts (`1100`, `2000`), enforces exact balance, prevents duplicates per currency, and posts through the native separate-reviewer journal workflow.
- **Financial statements (`src/erp/accounting-statements.ts`, `python/africore_accounting/statements.py`)**:
  - Supports **Trial Balance**, **General Ledger** (with SQL window running balances, pagination, search, and entry drilldown), **Balance Sheet**, **Profit and Loss**, **Account Balance Register**, **Journal Audit Report**, **Accounting Closing Summary**, and **Opening Balances Report**.
  - Single-subprocess Python statement verifier validates integer minor-unit invariants, trial-balance equality, Balance Sheet accounting equation (`Assets = Liabilities + Equity`), prior-year earnings carry-forward vs. current fiscal year result, and P&L breakdown (`revenue_minor`, `cost_of_sales_minor`, `gross_profit_minor`, `operating_expenses_minor`, `net_profit_minor`).
  - Returns `unposted_count` for draft entries on or before the report end date to surface the Odoo unposted-entries warning banner.
  - Supports date range, accounting period, fiscal year, currency, journal, account, search, previous-period/prior-year comparison, category grouping, CSV export, and print CSS.

## API routes and database schema

All routes live under `/api/v1/organizations/{org}/accounting` and use existing encrypted ERP tables (`ac_erp_objects`, `ac_erp_history`, `ac_accounting_periods`, `ac_accounting_entries`, `ac_accounting_lines`) with **no new database migration** (preserving Render's `AFRICORE_MIGRATIONS_MODE=verify` readiness contract):

| Method | Route | Capability | Purpose |
|---|---|---|---|
| `GET`, `POST` | `/fiscal-years` | read / admin | List fiscal years with nested periods; create non-overlapping fiscal year |
| `GET`, `PUT` | `/lock-dates` | read / admin | Read/update `sales`, `purchases`, `tax`, `all` lock dates with optimistic version & reason |
| `GET`, `POST` | `/periods/{id}/close` | read / admin | Live close checklist + fingerprint + history; execute `request`, `approve`, `close`, `cancel`, `request_reopen`, `reopen` |
| `GET` | `/opening-balances` | read | Opening balance register and policy |
| `POST` | `/opening-balances/import` | finance | Validate CSV via Python and create balanced opening draft |
| `GET` | `/statements` | read | Trial Balance, General Ledger, Balance Sheet, Profit & Loss, Account Balances, Journal Audit, Closing Summary |

## UI and Odoo visual alignment

Implemented in `website/src/apps/AccountingPeriodWorkspace.tsx` within AfriCore Accounting:

- **Accounting → Lock Dates** (Odoo F1 reference): two-column lock-field hierarchy (`Lock Sales`, `Lock Purchases`, `Lock Tax Return` with *"after a tax closing"*, `Lock Everything`), rose/pink Hard Lock informational callout, audit reason input, `Save` / `Discard` actions, and review history.
- **Accounting → Fiscal Years**: register with current-year indicator, nested period posting eligibility, and drilldowns to Period Closing and Financial Statements.
- **Accounting → Period Closing**: live blocker/warning checklist with direct links to unposted journals, bank reconciliation, depreciation board, and deferrals, plus reviewed lifecycle actions.
- **Accounting → Opening Balances / Opening Balances Report**: manual draft launcher, CSV import form, register, correction journal link, and CSV export.
- **Reporting → Annual Statements & Audit** (Odoo F2, F3, F4 references): segmented tabs (`Balance Sheet`, `Profit and Loss`, `Trial Balance`, `General Ledger`, `Audit Trail`, `Closing Summary`), pale-blue unposted-entries banner, full filter bar, expandable category tables with tabular right-aligned numbers (negative figures in muted red), Executive-style Closing Summary tables, account/entry drilldowns, CSV export, and print styling.

## Verification status and remaining limitations

- **Python unit tests**: 21/21 passed (`test_opening.py`, `test_statements.py`, `test_assets.py`, `test_bank.py`, `test_deferrals.py`, `test_tax.py`).
- **Focused Accounting SQLite suite**: 21/21 passed (`accounting.test.js`), covering non-Dec 31 fiscal years, opening CSV import & duplicate rejection, close checklist blockers, stale-approval invalidation, separate-actor close & reopen, cross-app lock enforcement (invoices, reversals, manual entries), statements, comparisons, General Ledger search, and Audit Trail.
- **Full SQLite backend regression**: 504 passed, 0 failed, 1 PostgreSQL-only skip across 21 suites (`npm test`).
- **Disposable PostgreSQL 17 suite**: 21/21 focused Accounting tests passed against a freshly migrated disposable PostgreSQL 17 cluster, stopped and removed afterward.
- **Static & contract checks**: `typecheck`, `lint` (ESLint + 227-module architecture + fixture isolation), `validate:openapi` (59/59 legacy ops), `validate:platform` (597 workspace ops), `test:render-deploy` (5/5), and `website` production build + prerender + 151/151 content/frontend tests all passed.
- **Authenticated browser walkthrough**: Verified on a fresh disposable local Business workspace (`http://127.0.0.1:4016`, `Checkpoint 6 Trading Ltd`) across Fiscal Years, Lock Dates (Odoo F1), Period Closing checklist, Opening Balances + CSV import, and all 6 segmented Reporting statement views (Balance Sheet, Profit & Loss, Trial Balance, General Ledger, Audit Trail, Closing Summary) with the unposted-entries banner and CSV/Print controls, zero console errors, and mobile `390×844` responsiveness (`scrollWidth <= 390px`, zero horizontal overflow). A desktop grid-column overlap between the Hard Lock callout and lock-date helper text was identified during the walkthrough and fixed in `website/src/approved-platform.css` (single-column `.acc-lock-panel form` with `grid-column: 1 / -1` and `min-width: 155px` date inputs).
- **Cash Flow Statement**: Deferred. AfriCore's current chart of accounts does not yet tag operating, investing, and financing cash-flow activity classifications on accounts or move lines; implementing an accurate Cash Flow Statement requires explicit cash-flow activity tagging (operating/investing/financing) and reconciliation of non-cash adjustments (depreciation, deferrals, AR/AP deltas).
- **Remaining limitations**: Irreversible hard lock, per-user timed lock-exception grants (beyond reviewed period reopening), native PDF/XLSX binary export (CSV + browser print are provided), and hosted Render migration ledger verification remain separate.
