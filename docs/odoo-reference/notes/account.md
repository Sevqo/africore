# Accounting (`account`)

Focused Odoo 20 Community source notes for AfriCore Accounting. Source was read
from the local, read-only `odoo-reference` checkout at commit
`373b237cac51920a664a07c242c337e7b095b0c1` on 2026-11-18. No Odoo source,
templates or assets were copied or modified.

## Observations

- `account.move` represents invoices, bills and reversal documents as typed
  accounting moves. Reversals link back to their source, and posting checks
  balance (`addons/account/models/account_move.py`: `reversed_entry_id`,
  `_check_balanced`, `_reverse_moves`, `_post`).
- `account.move.line` is the individual journal item. Residual amount and
  partial/full reconciliation are derived from matching relations
  (`addons/account/models/account_move_line.py`: `amount_residual`,
  `matched_debit_ids`, `matched_credit_ids`, `_reconcile_plan`).
- Accounts include type, active state, reconciliation permission, company,
  currency and parent fields; the account register exposes account metadata in
  a dense table (`addons/account/models/account_account.py`,
  `addons/account/views/account_account_views.xml`).
- Bank statement records retain opening, computed and ending balances, and
  validate both line completeness and continuity with the preceding statement
  (`addons/account/models/account_bank_statement.py`). Reconciliation is based
  on those statement lines and actual journal items.
- Reports are parameterized structures with report lines, groups and options;
  the accounting dashboard uses a journal-card view
  (`addons/account/models/account_report.py`,
  `addons/account/static/src/views/account_dashboard_kanban/account_dashboard_kanban_record.js`).

## AfriCore application guidance

Use these as behavior and layout observations. Keep AfriCore's existing
append-only ledger, integer minor units, independent journal approval,
tenant-scoped source services and explicit non-conversion between currencies.
Do not present a line as reconciled without a canonical match relation. Until a
bank statement source and matching workflow exist, keep reconciliation as an
honest service handoff. Distinct invoice credits and payment allocations should
read from their canonical records rather than reusing invoice rows.

The supplied screenshots are visual references; source inspection does not
constitute browser comparison. Official Odoo documentation fetches timed out in
this session, so these notes are limited to the cited Community source paths.
