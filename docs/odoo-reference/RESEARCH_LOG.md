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

## 2026-11-17 — Business ID contact-record layout

- Question: how does Odoo Community Contacts assemble the company profile, related-record button box, grouped fields, child contacts and horizontal tabs, and which of these are presentation-only patterns for Business ID?
- Odoo commit: `36fef5806` (`20.0`).
- Read (paths): `addons/contacts/__manifest__.py`; `addons/contacts/models/res_partner.py`; `odoo/addons/base/models/res_partner.py`; `odoo/addons/base/views/res_partner_views.xml` (`view_partner_form`, partner child-contact subview and notebook pages).
- Findings:
  - Contacts extends the shared `res.partner` model and contributes the Contacts application menu; its manifest depends on address, mail and hierarchy capabilities — `addons/contacts/models/res_partner.py`, `addons/contacts/__manifest__.py`.
  - The base company form uses a smart-button box, image/name header, grouped fields and a notebook with related contacts and notes — `odoo/addons/base/views/res_partner_views.xml` (`view_partner_form`).
  - These sources define a contact record and its visual composition, not business passport identity, evidence assurance, holder consent, signed credentials or issuer trust.
- Conclusions: reuse macro layout only; keep Business ID workflows on AfriCore's existing Trust/Passport services and preserve each service's own permissions and state transitions.
- Decision: none.
- Follow-ups: inspect other inherited view contributors only if a particular screenshot button requires its origin; compare rendered AfriCore screens visually when the local app is available.
- Limits: focused view/model/manifest review; no full partner security, mail, inherited view or runtime tour audit. No Odoo source was modified.

## 2026-11-17 — Automation Rules and Scheduled Actions

- Question: how should AfriCore's bounded automation rules, trigger/action form, scheduled-action register and manual run operation map to Odoo Community's Automation Rules and Scheduled Actions?
- Odoo commit: `1f622740a0688c940c9ed6ab40a4a174326a345d` (`20.0`), clean at inspection.
- Read (paths): `addons/base_automation/models/base_automation.py`; `addons/base_automation/views/base_automation_views.xml`; `addons/base_automation/static/src/base_automation_trigger_selection_field.js`; `addons/base_automation/static/src/base_automation_trigger_selection_field.xml`; `addons/base_automation/tests/test_automation.py`; `odoo/addons/base/models/ir_actions.py`; `odoo/addons/base/models/ir_cron.py`; `odoo/addons/base/views/ir_actions_views.xml`; `odoo/addons/base/views/ir_cron_views.xml`; manifests and access-control files for `base_automation` and `base`.
- Findings:
  - Odoo stores `base.automation` with a concrete `ir.model`, selected trigger, trigger-specific fields, before-update and apply-on domains, and ordered server-action relations. The form uses a full-page title, compact trigger fields and `Actions To Do` / `Notes` notebook pages — `addons/base_automation/models/base_automation.py` (`BaseAutomation`) and `addons/base_automation/views/base_automation_views.xml` (`view_base_automation_form`).
  - Trigger options cover record creation/update/deletion, value changes, date timing, message events and webhooks. Model compatibility and action/model pairing are validated; runtime hooks patch relevant ORM operations, while time-based actions are evaluated by a scheduled processor — `addons/base_automation/models/base_automation.py` (`_check_trigger`, `_check_action_server_model`, `_register_hook`, `_cron_process_time_based_actions`).
  - The rule page exposes a grouped trigger selector and domain controls; its kanban and list views summarize name/model/trigger and configured actions. The source supports more powerful server actions, including executable code, than AfriCore authorizes — `addons/base_automation/views/base_automation_views.xml` and `odoo/addons/base/views/ir_actions_views.xml`.
  - `ir.cron` delegates to server actions and stores active state, interval, next execution, last execution, priority, and failure information. The form exposes `Run Manually`; the list and search views expose name, model, next call, interval, active state, and grouping — `odoo/addons/base/models/ir_cron.py` (`IrCron`, `method_direct_trigger`, scheduler methods) and `odoo/addons/base/views/ir_cron_views.xml` (`ir_cron_view_form`, `ir_cron_view_tree`, `ir_cron_view_search`).
  - AfriCore source events are produced by existing canonical CRM, payment, invoice, inventory, fulfillment and integration services, then durably recorded in `src/operations/events.ts`; `src/operations/worker.ts` and `src/operations/business-worker.ts` poll the existing worker. `src/operations/automation.ts` evaluates supported recipes and writes version-bound runs; `workflow-actions.ts` owns bounded effects. No second scheduler or event ledger is needed.
- Conclusions: retain the document-style rule form, grouped trigger picker, action modal, dense scheduled register and scheduled detail hierarchy; derive source/trigger/action choices from the authoritative registry. Preserve strict workspace/environment scope, current owner permissions, service checks, audit/version history, idempotency and safe retry semantics. The manual-run control must execute only the selected enabled schedule using the existing worker and must never bypass owner or service checks. Do not copy arbitrary code, email/SMS, unrestricted webhooks or financial side effects from Odoo.
- Decision: [D-002](DECISIONS.md#d-002-keep-automations-bounded-and-run-scheduled-actions-through-the-existing-worker).
- Follow-ups: founder visual/manual acceptance of all seven supplied screens; qualify PostgreSQL and deployed-worker behavior separately.
- Limits: inspected the local Odoo 20 Community checkout as behavior evidence for Odoo 19/18 screenshots; no Odoo server or browser session was launched, no source/assets were copied, and no running AfriCore screenshots were captured for this implementation.

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



## 2026-11-17 — Business ID profile and related-record layouts

- Question: how does Odoo Community's Contacts form assemble the compact company/person header, related-record smart buttons, horizontal tabs and child contacts shown in the supplied Business ID references, and which presentation patterns can AfriCore adapt without copying source or adopting Odoo's contact model as its identity authority?
- Planned source inspection: `addons/contacts/views/res_partner_views.xml`, `addons/base/views/res_partner_views.xml`, `addons/contacts/models/res_partner.py`, plus the Contacts module manifest where needed.
- Purpose: validate screenshot-level structure against the checked-out Odoo source before implementing the AfriCore Business ID presentation; no application workflow or trust semantics will be inferred from Odoo.
