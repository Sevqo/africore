# Odoo research log

Append-only. Newest entry at the top, directly under this header. Never rewrite
or delete a past entry; if a conclusion changed, add a new entry that supersedes
it and say so explicitly.

An entry is required for every session that reads Odoo source. Trivial
navigation (opening a file to check a symbol) does not need an entry; anything
that produced a conclusion does.

## Entry template

```
## YYYY-MM-DD — <short title>

- Question: <the AfriCore question that motivated this>
- Odoo commit: <git rev-parse --short HEAD in odoo-reference at the time>
- Read (paths): <odoo/... relative paths, one per line>
- Findings:
  - <observation> — `<path>` (`<function or model>`)
- Conclusions: <what AfriCore should take from this>
- Decision: none | <link to DECISIONS.md anchor>
- Follow-ups: <open questions, or "none">
- Limits: <what was not checked, so the conclusion is not over-read>
```

## Entries

## 2026-11-16 — Cross-application source comparison and roadmap

- Question: how do all Phase 2 AfriCore applications map to the actual Odoo Community addon architecture, which modules exist in this checkout, and what dependencies/UI/workflows remain incomplete in AfriCore?
- Odoo commit: `9d233dca4156d58ca573e9cdc3b32327c97aa282` (`20.0`), clean at inspection.
- Read (paths): core `odoo/addons/base/models/ir_model.py`, `ir_ui_view.py`, `ir_actions.py`, `ir_ui_menu.py`, `ir_attachment.py`; `addons/website/__manifest__.py`; `addons/website_sale/controllers/main.py`, `models/sale_order.py`, `views/website_sale_menus.xml`, `views/product_views.xml`, `views/sale_order_views.xml`; `addons/sale/models/sale_order.py`, `views/sale_order_views.xml`; `addons/crm/models/crm_lead.py`, `views/crm_lead_views.xml`, `tests/test_crm_lead.py`, `tests/test_crm_lead_assignment.py`, `tests/test_crm_lead_merge.py`; `addons/stock/models/stock_move.py`, `models/stock_picking.py`, `views/stock_picking_views.xml`; `addons/purchase/models/purchase_order.py`, `views/purchase_order_views.xml`; `addons/account/models/account_move.py`, `views/account_move_views.xml`; `addons/point_of_sale/models/pos_order.py`, `views/pos_order_view.xml`; `addons/project/models/project_project.py`, `models/project_task.py`, `models/project_task_recurrence.py`, `views/project_project_views.xml`, `views/project_task_views.xml`; HR paths in the preceding People entry; `addons/base_automation/models/base_automation.py`, `tests/test_automation.py`; `addons/contacts/models/res_partner.py`; relevant module manifests and root `LICENSE`.
- Findings:
  - Odoo applications compose through manifests and shared ORM models/actions/menus/views/access rules; Community Sale, CRM, Stock, Purchase, Accounting, POS, Project and HR application modules exist. `website_sale` and `base_automation` are extensions/technical addons, not equivalent standalone AfriCore apps.
  - `documents`, `account_reports`, and `hr_contract` directories are absent. `spreadsheet` exists but its manifest does not make it an application. Community attachments exist in base; no Odoo Community standalone Business ID or cross-service Analytics app directly matches AfriCore.
  - Transaction paths converge at service/ORM boundaries in Odoo (`sale.order`, `stock.picking/move`, purchase orders, `account.move`, POS orders). AfriCore has corresponding canonical service boundaries and must keep cross-app changes API-mediated.
  - The AfriCore comparison and implementation roadmap, including exact AfriCore target files and dependency blockers, is recorded in `docs/odoo-reference/AFRICORE_APPLICATION_COMPARISON.md`.
- Conclusions: use the actual module/model/view as behavior evidence; preserve AfriCore tenant/role, audit, idempotency and money/unit contracts. Resolve discrepancies in the app registry and source-read error coupling before adding visual controls.
- Decision: none; this is research only.
- Follow-ups: wait for explicit owner instruction before implementation. Founder/manual app acceptance remains distinct from this source audit.
- Limits: source-based review of relevant Community files and selected tests/manifests; no Odoo server was launched, no exhaustive addon audit, and no new browser screenshot comparisons were performed.

## 2026-11-16 — Analytics dashboard, graph, pivot and global filters

- Question: how does the local Odoo Community dashboard/reporting stack persist dashboards, drive graph and pivot aggregates, and save global filters for the AfriCore Analytics implementation?
- Odoo commit: `1f622740a0688c940c9ed6ab40a4a174326a345d` (`20.0`).
- Read (paths): `addons/spreadsheet_dashboard/__manifest__.py`; `addons/spreadsheet_dashboard/models/spreadsheet_dashboard.py`; `addons/spreadsheet_dashboard/models/spreadsheet_dashboard_group.py`; `addons/spreadsheet_dashboard/models/spreadsheet_dashboard_favorite_filters.py`; `addons/spreadsheet_dashboard/static/src/bundle/dashboard_action/dashboard_search_model.js`; `addons/web/static/src/views/graph/graph_model.js`; `addons/web/static/src/views/pivot/pivot_model.js`.
- Findings: Community includes a `spreadsheet_dashboard` module depending on `spreadsheet`; the dashboard model stores spreadsheet state and access/favorite metadata. A separate model persists named dashboard filter values. Graph reports combine a search domain with a declared measure/grouping and guard against stale responses. Pivot reports use row/column dimensions, expansion and totals. Evidence and paths are recorded in `notes/spreadsheet_dashboard.md`.
- Decision: see D-001 in `DECISIONS.md`; adapt the reporting patterns within AfriCore's registry, SQL, tenant and role boundaries.
- Follow-ups: live AfriCore screenshot comparison and founder interaction acceptance remain outstanding.
- Limits: focused source review only; no Odoo server launch, no running AfriCore browser comparison, and no Odoo file changes.

## 2026-11-16 — People service and independent loading

- Question: which employee, department, attendance and leave validations should inform the active AfriCore People checkpoint, and does the frontend preserve usable records when an auxiliary source fails?
- Odoo commit: `9d233dca4156d58ca573e9cdc3b32327c97aa282` (`20.0`).
- Read (paths): `addons/hr/__manifest__.py`; `addons/hr/models/hr_employee.py`; `addons/hr/models/hr_department.py`; `addons/hr/views/hr_employee_views.xml`; `addons/hr/views/hr_department_views.xml`; `addons/hr/security/hr_security.xml`; `addons/hr/security/ir.access.csv`; `addons/hr_attendance/__manifest__.py`; `addons/hr_attendance/models/hr_attendance.py`; `addons/hr_attendance/views/hr_attendance_view.xml`; `addons/hr_attendance/tests/test_hr_attendance_constraints.py`; `addons/hr_holidays/__manifest__.py`; `addons/hr_holidays/models/hr_leave.py`; `addons/hr_holidays/views/hr_leave_views.xml`; `addons/hr_holidays/views/hr_holidays_views.xml`; `addons/hr_holidays/tests/test_leave_requests.py`; root `LICENSE`.
- Findings:
  - Employees is a Community HR application with explicit security, employee and department views and identity/resource dependencies — `addons/hr/__manifest__.py`.
  - Attendance constraints check ordered timestamps, break length, a single open interval and overlap — `addons/hr_attendance/models/hr_attendance.py` (`_check_validity_check_in_check_out`, `_check_break_duration`, `_check_validity`).
  - Time Off exposes distinct approval, refusal, cancellation and reapproval transitions; transition eligibility and dates are validated in the model — `addons/hr_holidays/models/hr_leave.py` (`action_approve`, `action_refuse`, `action_cancel`, `_check_date`, `_check_approval_update`).
  - Employee actions expose kanban, list, form, hierarchy, activity and analysis views; departments expose kanban/list/form/hierarchy — the corresponding HR view XML. Attendance exposes its own register/form/search action; Time Off uses request form/list/search and calendar-oriented views.
  - Community test coverage includes invalid and open attendance intervals and overlaps, leave overlap and insufficient-allocation rejection, and access rights — `addons/hr_attendance/tests/test_hr_attendance_constraints.py`, `addons/hr_holidays/tests/test_leave_requests.py`.
  - No `addons/hr_contract` module is present in this clone; employee version or contract-template references do not establish a complete Community payroll/contract workflow.
- Conclusions: retain model/service validation and current-actor authorization; surface independent source errors without suppressing successful directory/configuration data. Do not infer payroll or statutory compliance from People records.
- Decision: People frontend loading is now independently settled per service; existing People service contracts remain the authority.
- Follow-ups: role-specific browser acceptance and broader HR addon audit remain founder/manual work.
- Limits: focused employee, department, attendance and leave paths only; no exhaustive security-rule review, work-entry pipeline, payroll localization or browser-tour review.


