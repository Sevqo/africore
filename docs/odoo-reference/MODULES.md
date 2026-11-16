# Odoo module index

Only modules that have actually been studied appear here. The cross-application
comparison report has a section for each module group listed below and records
the relevant source paths. Earlier focused HR findings remain in `notes/hr.md`.

## Convention

- Add a row when the first note for a module is written.
- `Status` is one of `skimmed`, `read`, `deep-dive`.
- Notes live in `notes/<module_name>.md`, named exactly like the Odoo module
  directory (for example `account`, `sale`, `stock`).
- The Odoo module root is `odoo-reference/addons/<module_name>` for community
  modules and `odoo-reference/odoo/addons/<module_name>` for the technical base
  modules. Record which root applies.

## Indexed modules

| Module | Odoo path root | Status | Notes | AfriCore relevance |
| --- | --- | --- | --- | --- |
| `base` | `odoo-reference/odoo/addons/base` | read | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | Shared ORM metadata, actions, menus, attachments and security architecture |
| `base_automation` | `odoo-reference/addons/base_automation` | read | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | AfriCore Automations |
| `contacts` | `odoo-reference/addons/contacts` | skimmed | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | Business ID/contact distinction |
| `account` | `odoo-reference/addons/account` | read | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | AfriCore Accounting and Finance concepts |
| `crm` | `odoo-reference/addons/crm` | read | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | AfriCore CRM |
| `hr` | `odoo-reference/addons/hr` | deep-dive | [hr.md](notes/hr.md) | AfriCore People employees and departments |
| `hr_attendance` | `odoo-reference/addons/hr_attendance` | deep-dive | [hr.md](notes/hr.md) | AfriCore People attendance |
| `hr_holidays` | `odoo-reference/addons/hr_holidays` | deep-dive | [hr.md](notes/hr.md) | AfriCore People leave and approvals |
| `point_of_sale` | `odoo-reference/addons/point_of_sale` | read | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | AfriCore POS |
| `project` | `odoo-reference/addons/project` | read | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | AfriCore Work |
| `purchase` | `odoo-reference/addons/purchase` | read | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | AfriCore Procurement |
| `sale` | `odoo-reference/addons/sale` | read | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | AfriCore Sales and Commerce |
| `spreadsheet` | `odoo-reference/addons/spreadsheet` | skimmed | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | Analytics authoring comparison; not a standalone app in this manifest |
| `spreadsheet_dashboard` | `odoo-reference/addons/spreadsheet_dashboard` | read | [spreadsheet_dashboard.md](notes/spreadsheet_dashboard.md) | Spreadsheet-backed dashboards, favorites and saved global filters |
| `stock` | `odoo-reference/addons/stock` | read | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | AfriCore Inventory and fulfillment |
| `web` | `odoo-reference/addons/web` | read | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | Shared generic view client and UI patterns |
| `website` | `odoo-reference/addons/website` | skimmed | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | AfriCore Commerce storefront |
| `website_sale` | `odoo-reference/addons/website_sale` | read | [application comparison](AFRICORE_APPLICATION_COMPARISON.md) | AfriCore Commerce and Sales storefront integration |

## Backlog (not started, on-demand only)

Candidate modules are listed here **only** as pointers for future questions.
Being listed is not authorisation to analyze them, and the list must never grow
into a "read everything" plan.

| Module | Why it might inform AfriCore | Trigger |
| --- | --- | --- |
| `mail` | Generic activity/thread/messaging mixins | Review of notifications and activity feeds |
