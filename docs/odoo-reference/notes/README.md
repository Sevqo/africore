# Per-module Odoo notes

One file per Odoo module, created only when that module is actually studied.
Register each file in [../MODULES.md](../MODULES.md).

## Naming

`notes/<module_name>.md`, using the Odoo module directory name verbatim — for
example `notes/account.md`, `notes/sale.md`, `notes/stock.md`. If a module
exists in both roots, say which one in the note's header
(`addons/` vs `odoo/addons/`).

## Required header

```
# <module> — Odoo 20.0 notes

- Odoo commit: <short hash>
- Path root: odoo-reference/addons/<module> | odoo-reference/odoo/addons/<module>
- AfriCore question(s): <why this module was opened>
- Status: skimmed | read | deep-dive
- Last updated: YYYY-MM-DD

## Model map
<models/tables and what they own, each with a source path>

## Lifecycle / state machine
<states, transitions, and the methods that enforce them>

## Money and units
<how amounts, currencies, rounding and dates are represented — and how that
differs from AfriCore's integer minor units>

## Security and access
<groups, record rules, and what actually enforces them>

## Transactions and concurrency
<where transactions begin, locking, idempotency, failure handling>

## What AfriCore should take
<pointers into PATTERNS.md / DECISIONS.md; never instructions to copy code>

## Open questions
<anything unresolved, so the next session knows where to resume>
```

## Rules

- Read-only source: cite paths, never paste large blocks of Odoo code into
  notes. Short quoted fragments (a few lines) are fine and must be attributed.
- Keep notes about Odoo's behaviour separate from recommendations for AfriCore;
  use the sections above rather than mixing the two.
- If a module turns out to be irrelevant, do not delete the note — add
  `Status: rejected` with the reason.
