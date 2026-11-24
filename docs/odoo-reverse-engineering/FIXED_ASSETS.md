# Checkpoint 4 — Fixed assets and depreciation

AfriCore baseline 9b4dc358f5a7ff9283e417cddbcb0ec543ff0331. Odoo 20 Community reference 4968b8772ab96e25471ebbcdcbe32f6049e5b728.

## Source provenance

| Source | Verified behavior | Implementation choice |
|---|---|---|
| addons/account/models/account_account.py, AccountAccount.account_type | Odoo Community distinguishes fixed and non-current assets and scopes accounts to companies. | AfriCore validates its existing active asset and expense account types. The asset and accumulated depreciation accounts are distinct assets, with the accumulated account credited. |
| addons/account/models/account_journal.py and addons/account/models/account_move.py | Existing journals classify accounts and host entries; the account addon supplies the posting authority. | Use an existing journal selected in the model and AfriCore's immutable accounting entry, periods, approval grants and post controls. |
| addons/account/tests/common.py and tests/test_sequence_mixin.py | The Community Accounting fixtures contain the fixed-asset account type. | No asset-board computation or disposal test was found in the pinned Community account addon. |
| Odoo 20 asset documentation | Describes purchase linkage, templates, straight and declining methods, prorata first/last stubs and disposal at book value. | Implement a fresh Python schedule for the documented methods that can be validated. Adapt future revisions to preserve posted AfriCore entries. |

REA MCP inspected a scratch compilation of the pinned account_account.py using inspect_python_pyc. Evidence ev_79fa8fae5c4607e1ed95d1dcde75ab29df49ea05312cc5d01c71c9585464450a identified AccountAccount, its company checks and account type field. This was compiled-artifact inspection, alongside read-only source review. The pinned tree has localization templates named account.depreciation.model-*.csv. It has no account_asset addon or Python model definitions for account.asset or account.depreciation.model, and no corresponding asset-board ORM, form, wizard or disposal implementation to reuse. The index was reused without regeneration.

Reference [Odoo 20 asset documentation](https://raw.githubusercontent.com/odoo/documentation/20.0/content/applications/finance/accounting/vendor_bills/assets.rst).

## Workflow

1. In **Accounting → Assets → Depreciation Models**, an owner or administrator can save or edit reusable accounts, journal and plan defaults.
2. In the register, choose those defaults or configure them manually. Select an unreversed posted acquisition with the matching date, currency and asset debit. A posted supplier-bill entry can provide that evidence when its journal line actually capitalizes the asset. Already depreciated assets must also document the accumulated depreciation credit in the same acquisition/opening entry. One active asset can use each acquisition entry.
3. Save a draft, compute the schedule and confirm the reviewed board. Computing a schedule does not create a journal. Drafts can be edited, recalculated or archived.
4. Prepare the next positive period from the board. Its draft debits depreciation expense and credits accumulated depreciation. Use the existing journal detail to request separate review and post the exact approved draft. A draft cannot post after its board link is withdrawn. Closed periods and stale versions are rejected.
5. Revise remaining terms after posting. The system preserves the posted prefix and explains the versioned change in asset history. For a correction, use the original entry's native journal reversal workflow. Reverse the latest posted depreciation first. Applying the reversal reopens that board period and restores the book value. Reprepare from the board to book the period again.

The register and the board distinguish draft, running, fully depreciated and archived state. The board shows proposed, draft, approved, posted, reversed and zero-amount periods, with journal drilldowns, actual posted book value and CSV export. Schedule book values are projections.

## Domain and integration

Python in python/africore_accounting/assets.py computes one complete board per bounded subprocess call. The code uses exact fractions and integer minor units. Monthly and annual entries fall at the calendar month or year end. Optional prorata uses the actual days in the first period and assigns the complementary weight to the final stub. Straight line rounds cumulative weighted targets so intervening remainders cannot accumulate. Declining balance applies a per-period rate to the remaining depreciable basis and clears the remainder at the last date. A non-depreciable asset creates an empty board. TypeScript validates the dates, totals, cumulative amounts, remaining basis and book values before storing the result.

The workspace operation lock serializes asset writes and native journal posting. The accounting service enforces scoped acquisition evidence, active account classifications, current membership, separate review, version binding, open periods, and immutable journal history. Existing encrypted ERP objects hold the models, asset schedules and per-period source records. Acquisitions remain journal-backed. There is no new ledger or migration, and Render's verifier is unchanged.

| API under /api/v1/organizations/{org}/accounting | Purpose |
|---|---|
| GET and POST /asset-models, PUT /asset-models/{id} | List, create and edit reusable models |
| GET /asset-sources | List eligible posted source entries for the selected account and currency |
| GET and POST /assets, GET and PUT /assets/{id} | Register, create, view board and history, edit draft |
| POST /assets/{id}/action | Compute, confirm, archive, prepare, withdraw or revise |
| Existing /entries endpoints | Read, review, post and reverse an accounting journal |

## Acceptance and limits

The supplied A1–A4 brief and the Odoo 20 documentation guided the order of the register, configuration fields, board and model workflow. The in-app browser timed out at the disposable sign-in page. Authenticated UI acceptance, refresh and history verification in the browser, and matched desktop or mobile screenshot comparison remain open.

- The synthetic laptop journey verifies a 120,000-minor-unit acquisition, 20,000 salvage, a 25,000 first charge, expense and contra-asset balances, rejection of a duplicate or locked-period posting, revision of the unposted schedule, and a reviewed reversal that restores the book value.
- All 13 Python tests passed. The published Odoo example also matched five annual 4,000-unit charges on a 27,000-unit asset with 7,000 salvage.
- The 21 focused PostgreSQL 17 tests passed on a newly created disposable database. The server was stopped afterward.
- The full SQLite backend run passed 502 of 503 tests with one PostgreSQL-only skip and zero failures. The focused SQLite Accounting run passed all 19 tests. The focused Accounting frontend run passed all 8 tests.
- Type checking, lint, the platform contract for 578 operations, the 59-operation legacy contract, the website build and all 150 website tests, and the 5 Render verifier tests passed.

Declining-then-straight-line remains unavailable because the precise source implementation is absent from the checkout. Disposal and sale, gain/loss posting, revaluation and automatic posting are outside this checkpoint. An acquisition has to be posted to the selected asset account first. This checkpoint makes no change to existing supplier-bill posting rules or the bank statement workflow.
