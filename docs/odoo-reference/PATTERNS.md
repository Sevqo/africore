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
| 1 | Keep a prospect distinct from a canonical contact until conversion | `odoo-reference/addons/crm/models/crm_lead.py`, `CrmLead.partner_id` and `action_convert_to_opportunity` | adapt | Capture AfriCore leads without a Customer, then use the existing conversion workflow to create or link the canonical Customer; opportunities retain AfriCore's customer-link requirements. See D-003. |
| 2 | Merge related records through explicit review and preserve linked history | `odoo-reference/addons/crm/wizard/crm_merge_opportunities.py`, `odoo-reference/addons/crm/models/crm_lead.py` (`_merge_opportunity`, `_merge_dependences`) | adapt | Preserve AfriCore activity references and snapshots, archive merged records, and require scoped/idempotent service authorization instead of copying Odoo's persistence behavior. See D-004. |
| 3 | Model an activity plan as ordered, reusable activity templates | `odoo-reference/addons/mail/models/mail_activity_plan_template.py`, `odoo-reference/addons/mail/views/mail_activity_plan_views.xml` | adapt | Keep AfriCore's plan types bounded and use integer calendar-day offsets, Africa/Nairobi due times, current-member checks and idempotent plan executions; do not claim email or other unsupported external effects. See D-005. |

## How to add a row

1. Pick a specific mechanic, not a module. "Inventory valuation via stock moves
   with FIFO layers", not "the stock module".
2. Point at the narrowest file (and function or model method) that demonstrates
   it.
3. Give a verdict with a reason. `reject` rows are the most valuable ones: they
   stop a later session from re-proposing the same idea.
4. If adopting, open an AfriCore decision in `DECISIONS.md` rather than
   implementing silently from a research session.
