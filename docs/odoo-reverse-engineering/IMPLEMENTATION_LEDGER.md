# Source-driven implementation ledger

## Checkpoint 5 — Deferred expenses and deferred revenue

- Added expense and revenue registers, reusable models, recognition boards, authorized journal drilldowns and filtered CSV reports inside Accounting.
- Added exact Python allocation, source validation, future revisions and native review, posting and reversal. [Deferrals checkpoint](DEFERRALS.md)

## Checkpoint 4 — Fixed assets and depreciation

- AfriCore baseline 9b4dc358f5a7ff9283e417cddbcb0ec543ff0331. Odoo 20 Community baseline 4968b8772ab96e25471ebbcdcbe32f6049e5b728. The existing 668-addon inventory was reused.
- See [Fixed assets checkpoint](FIXED_ASSETS.md) for source provenance, native journal controls, exact depreciation rules, APIs and acceptance evidence.

## Checkpoint 3 — Bank statement import and reconciliation

- AfriCore baseline d70e55b3292211f50048e47fc188f167c2086554. Odoo 20 Community baseline 4968b8772ab96e25471ebbcdcbe32f6049e5b728. The existing 668-addon index was reused.
- Source trace, APIs, local storage, performance, verification and outstanding acceptance are recorded in [Bank reconciliation checkpoint](BANK_RECONCILIATION.md).

## Checkpoint 2 — Cash rounding for manual Accounting adjustments

Source pin 4968b8772ab96e25471ebbcdcbe32f6049e5b728. REA inspected the
compiled AccountCashRounding model in checkpoint 1. The source trace follows
addons/account/models/account_cash_rounding.py into
addons/account/models/account_move.py (_recompute_cash_rounding_lines) and
odoo/tools/float_utils.py (float_round).

Python computes the signed difference to a positive cash increment using Up,
Down, or Nearest with ties away from zero. Accounting can add the difference
as a gain or loss line, or add a rounding line to the configured tax account.
The manual adjustment supports one configured tax. A tax that would become
negative or a journal total outside the supported range is rejected.

The Tax codes and manual adjustments screen exposes both strategies. The
existing API validates the workspace, environment and account types before
calculation. The draft records the input, original total, difference and
proposed lines, and posting uses the existing separate reviewer workflow.
The generated platform API schema describes the optional rounding rule.
No migration is required.

Verification passed 19 focused backend tests on each of SQLite and PostgreSQL
17, six Python unit tests, 108 arithmetic comparisons with the pinned helper,
149 website checks, lint, and the platform API registration check. The first
PostgreSQL run hit the previous 1.5-second Python startup deadline. Both
focused database suites passed after extending the bound to five seconds.
Interactive browser acceptance remains unverified.

The manual adjustment is an explicit per-entry choice. Reusable Odoo rule
configuration, automatic matching by currency or customer/payment method,
rounding issued invoices and supplier bills, multiple tax lines, and POS
tender and return behavior remain open. The index records addon declarations
as research inputs and does not establish implementation parity.

## Checkpoint 1 — Accounting single-rate tax arithmetic

### Source analysis
- Odoo Community 20.0 commit 4968b8772ab96e25471ebbcdcbe32f6049e5b728.
- The manifest inventory was checked against the pinned Git tree. It covers 668 top-level addons across addons and odoo/addons. All 1,393 declared dependency edges resolve within the index. Dynamic ORM behavior and feature-level application mapping still require targeted source tracing.
- Inspected the account manifest, addons/account/models/account_tax.py (_eval_tax_amount_price_excluded, _get_tax_details and compute_all), addons/account/tests/test_tax.py and odoo/tools/float_utils.py (float_round).
- REA CLI 6.10.1 help/version/doctor/providers ran. The source importer returned capability_unavailable on Windows, and WSL returned access denied. REA MCP binary_session responded. Its inspect_python_pyc tool successfully found 10 code objects in a scratch compilation of addons/account/models/account_cash_rounding.py, including AccountCashRounding and validate_rounding. Parent evidence ID ev_df2951d884e2af89426d2ce0f1595cb9e783ff6e4de9eb146624d560aa09682b. This check verified compiled symbol inspection. The manifest, model, security and view inventory uses the static indexer.
- Odoo supports richer grouping, currency/line/global rounding, price inclusion and document context; this feature only adapts AfriCore's existing single-rate manual tax calculation.

### Implementation and boundary
- Python: python/africore_accounting/tax.py, standard library only, integer minor units, half-up once.
- Adapter: src/erp/python-accounting.ts, fixed subprocess arguments, bounded time/response, output validation.
- Existing source: src/erp/accounting-tax.ts invokes the adapter; TypeScript remains canonical for authorization, scoped configuration, approval, audit and journal writes.
- Method C compatibility calculation. Direct use of account.tax would require Odoo recordsets, company and currency context, batching and account data. The bounded adapter implements the percentage and half-up rounding rule independently in integer minor units. It moves an existing calculation into Python and serves as the runtime integration proof. It adds no new accounting workflow or migration.
- The existing AccountingTax.tsx screen calls the same preview and preparation endpoints. Python 3 is required on the API host. The Docker runtime installs it. For local development, set AFRICORE_PYTHON_BIN if the interpreter is outside PATH.

### Verification status
| Feature | Source indexed | Dependency traced | Method chosen | Code integrated | Backend tested | UI tested | Visually compared | Accepted | Blocked |
|---|---|---|---|---|---|---|---|---|---|
| Single-rate tax preview | yes | tax evaluator, rounding helper and manifest graph | Python adapter | yes | covered on the existing API | website build and content checks | browser pending | browser acceptance pending | no |
| Broader accounting workflows | yes | partial | per feature pending | no | no | no | no | no | no |

Six source comparisons matched the pinned Odoo price-excluded percentage evaluator and rounding helper, including the exact half-unit tie, a value immediately below the tie, zero tax and the upper input bounds. Odoo ran neither its ORM nor the full account workflow for this comparison.

- SQLite backend suite passed 500 tests with one PostgreSQL-only skip. Python passed all four unit tests.
- Disposable PostgreSQL 17 passed all 501 backend tests. Hosted-mode schema verification passed against that freshly migrated fixture without invoking the migration runner. The local database server was stopped after verification.
- Website build and all 149 content tests passed. The in-app browser timed out connecting to the disposable local workspace, so the UI and matched Odoo screenshots remain pending.
- Lint, architecture and fixture isolation checks, OpenAPI (59 operations), platform registration (560 operations), Render verifier (5 tests) and the Git diff check passed.

### Render and GitHub qualification

- Render boots the Docker image with AFRICORE_MIGRATIONS_MODE=verify and uses /v1/readiness. Startup reads the migration ledger and probes required tables and columns. The application database role needs equivalent read access during preflight. Python 3 is now part of the image prerequisite.
- Exact required migration IDs are the ordered list in src/deployment-database.ts. This includes 001-workspaces through 021-people-expansion, followed by 026-app15-16, 027-website-forms, and 028-calendar-appointments. The only known hosted failure is the historical deploy dep-dc08d315efls73b3m2p0, where startup rejected the schema.
- The following preflight lists every missing version in prerequisite order. A missing ledger table or permission failure prevents qualification. The hosted ledger and a restorable backup have yet to be verified.

  ```sql
  BEGIN READ ONLY;
  WITH required(version, position) AS (
    SELECT * FROM unnest(ARRAY[
      '001-workspaces', '002-stage2', '003-stage3', '004-account-foundation',
      '005-workspace-experiences', '006-security-hardening', '007-service-marketplace',
      '008-financial-operations', '009-connected-platform', '010-business-apps',
      '011-connected-business-operations', '012-erp-foundation', '013-accounting-ledger',
      '014-people-operations', '015-private-documents', '016-procurement',
      '017-commerce-foundation', '018-public-media', '019-point-of-sale',
      '020-procurement-expansion', '021-people-expansion', '026-app15-16',
      '027-website-forms', '028-calendar-appointments'
    ]) WITH ORDINALITY
  )
  SELECT version
  FROM required
  WHERE NOT EXISTS (
    SELECT 1 FROM platform_migrations m WHERE m.version = required.version
  )
  ORDER BY position;
  ROLLBACK;
  ```

- Docker Desktop's Linux engine was unavailable, so the image build remains unqualified.
- The GitHub connector returned no combined statuses and no PR workflow runs for baseline 28c6f5c922af1125b32fc4a9cd65e4a6573824d2. Its workflow query covers PR runs only. The public checks page and push workflow API were inaccessible, so current hosted CI is unverified.
- A public readiness probe could not resolve africore-api.onrender.com in this environment. Current Render status and readiness remain unverified.

## Next bounded unit
Trace Odoo account bank statement lines, reconcile handlers, security, views/wizards and tests against AfriCore import/approval/journal boundaries. First deliver review-only candidate matching; retain source provenance and prohibit automatic allocation of merchant-imported evidence.
