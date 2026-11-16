# Reusable Odoo patterns

Each row captures one engineering idea worth knowing about, the Odoo file that
proves it, and whether AfriCore should adopt it. Nothing here is populated
before it is verified in the pinned checkout — a pattern without a proving path
is not a pattern, it is a rumour.

## Status vocabulary

- `observed` — read in source, not yet judged for AfriCore.
- `adopt` — AfriCore should implement this, re-written in AfriCore's stack.
- `adapt` — the idea applies but the Odoo shape does not fit AfriCore's
  constraints (typed Node/TS, integer minor units, append-only evidence).
- `reject` — deliberately not doing this; the reason is mandatory.

## Register

| # | Pattern | Odoo evidence | Status | AfriCore verdict / reason |
| --- | --- | --- | --- | --- |
| _none yet_ | | | | |

## How to add a row

1. Pick a specific mechanic, not a module. "Inventory valuation via stock moves
   with FIFO layers", not "the stock module".
2. Point at the narrowest file (and function or model method) that demonstrates
   it.
3. Give a verdict with a reason. `reject` rows are the most valuable ones: they
   stop a later session from re-proposing the same idea.
4. If adopting, open an AfriCore decision in `DECISIONS.md` rather than
   implementing silently from a research session.
