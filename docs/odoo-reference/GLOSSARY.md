# Odoo ↔ AfriCore glossary

Maps Odoo vocabulary onto AfriCore vocabulary so notes written by one session
are readable by the next. **Every row must be verified in the pinned source
before it is added** — the column `Verified at` names the file that proves it.
Rows carried over from general Odoo familiarity are labelled `unverified` and
must not be relied on for design work.

Semantic matches are approximate: a shared name does not mean a shared contract.
AfriCore's amounts are integer minor units with explicit currencies; Odoo's are
`float` monetary fields with a currency record. Never assume the arithmetic or
the rounding rule carries across.

## Verified mappings

| Odoo term / model | AfriCore term | Verified at | Notes |
| --- | --- | --- | --- |
| _none yet_ | | | |

## Unverified candidates (do not rely on these)

Listed only as search starting points for the next research session. Confirm
each one in source, then move the row up with a `Verified at` path.

| Odoo term / model | Likely AfriCore analogue | Where to check first |
| --- | --- | --- |
| `res.partner` | customer / contact record | `odoo/addons/base/models/res_partner.py` |
| `account.move` + `account.move.line` | invoice/entry header + ledger lines | `odoo/addons/account/models/account_move.py`, `account_move_line.py` |
| `account.journal` | ledger/account grouping | `odoo/addons/account/models/account_journal.py` |
| `product.product` / `product.template` | catalogue item / variant | `odoo/addons/product/models/product.py`, `product_template.py` |
| `sale.order` / `sale.order.line` | order / order line | `odoo/addons/sale/models/sale_order.py` |
| `stock.move` / `stock.quant` | stock movement / on-hand quantity | `odoo/addons/stock/models/stock_move.py`, `stock_quant.py` |
| `res.company` | organisation / business resource scope | `odoo/addons/base/models/res_company.py` |
| `res.users` + `res.groups` | account + role/membership | `odoo/addons/base/models/res_users.py`, `res_groups.py` |
| `ir.rule` (record rules) | row-level scoping / tenant isolation | `odoo/addons/base/models/ir_rule.py` |
| `ir.model.access` | model-level permission | `odoo/addons/base/models/ir_model.py` |
| `mail.thread` mixin | activity/notification feed | `odoo/addons/mail/models/mail_thread.py` |

## Deliberate non-equivalences

Concepts that look alike but must not be treated as the same thing in AfriCore
notes. Add a row whenever a mapping is rejected.

| Odoo concept | Why it is not AfriCore's | Recorded in |
| --- | --- | --- |
| _none yet_ | | |
