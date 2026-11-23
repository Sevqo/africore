# Odoo research log

## 2026-11-21 — Phase 3 Calendar and Website source follow-up

- Question: which source-backed lifecycle and publication rules should guide completion of Calendar and Website, and what evidence remains unavailable for visual acceptance?
- Odoo commit: `c1ef83e9c43760afd21db514e87568298a3a00b0` (local Community 20.0 reference checkout).
- Read (paths): `addons/calendar/models/calendar_event.py` (recurrence edit/split/break transitions); `addons/calendar/models/calendar_recurrence.py`; `addons/calendar/models/calendar_attendee.py`; `addons/calendar/views/calendar_views.xml`; `addons/website/models/website_page.py`; `addons/website/models/website_menu.py`; `addons/website/controllers/main.py` (public and sitemap routes); `addons/website/controllers/form.py`; `addons/website/views/website_pages_views.xml`; `addons/website/views/website_views.xml`.
- Findings:
  - Calendar recurrence has separate single-occurrence, following-occurrence and whole-series update behavior, backed by a recurrence record and attendee state transitions. A recurrence enum on an event is insufficient — `addons/calendar/models/calendar_event.py` and `calendar_recurrence.py`.
  - Website pages and menus are separate website-scoped records. Public sitemap generation filters published pages, and public form handling is a server-side submission workflow with validation/anti-abuse hooks — `addons/website/models/website_page.py`, `website_menu.py`, `controllers/main.py`, `controllers/form.py`.
- AfriCore decision: keep occurrence exceptions and edits in Calendar service authority; public sitemap/forms must be based on tenant-matched published site state and validated persisted submissions. Draft menu/page changes retain a publication boundary.
- Follow-ups: complete matched-viewport Odoo 19 screenshot comparison and browser acceptance. The official Odoo 20 documentation fetch was unavailable in the earlier reader attempt; these notes rely on pinned source and user-supplied screenshots. No Odoo source or visual asset was copied.
- Limits: focused source review only; no Odoo server was started and no live AfriCore visual comparison was performed.

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
## 2026-11-20 — Calendar and website builder source findings

- Question: which concrete Calendar event, invitation, recurrence and website page/editor/publication patterns should AfriCore compare against before implementing its combined Calendar and Website apps? This entry supersedes the pending source-review placeholder immediately above.
- Odoo commit: `c1ef83e9c`.
- Read (paths): `addons/calendar/models/calendar_event.py`; `addons/calendar/models/calendar_recurrence.py`; `addons/calendar/models/calendar_attendee.py`; `addons/calendar/tests/test_access_rights.py`; `addons/website/models/website_page.py`; `addons/website/models/website_menu.py`; `addons/website/controllers/main.py`.
- Findings: calendar events link attendee response state and recurrence authority, with access/privacy behavior tested separately. Website pages own URL/publication state, hierarchical menus are separate ordered records, and page listing/serving/sitemap are distinct paths. Detailed focused notes: [calendar](notes/calendar.md), [website builder](notes/website_builder.md).
- Conclusions: retain UTC instants plus timezone, separate recurring series from single events, enforce private-event redaction at the server, and keep draft/public content separated by immutable publication snapshots.
- Decision: see the implementation choices in the linked notes; no code or assets were copied.
- Follow-ups: add automated privacy and publication workflow tests; complete recurrence exceptions and real website menus/media/forms before describing those areas as complete.
- Limits: official Odoo 20 docs pages timed out or were not accessible in the reader; supplied UI screenshots are Odoo 19. Focused source review is not a parity audit.
## 2026-11-20 — Calendar and website builder workflow reference

- Question: which concrete Calendar event, invitation, recurrence and website page/editor/publication patterns should AfriCore compare against before implementing its combined Calendar and Website apps?
- Odoo commit: `c1ef83e9c`.
- Read (paths): pending targeted source review of `addons/calendar` and `addons/website` after recording this question.
- Findings: pending.
- Conclusions: observations will be separated from AfriCore decisions and the supplied screenshots will remain visual references, not copied assets.
- Decision: none.
- Follow-ups: review models, views, controllers and focused tests for event recurrence, attendee responses, page editing and published routing.
- Limits: no source files have been opened for this entry yet.

## 2026-11-19 — Documents workflow reference and supplied screens

- Question: which user-visible Documents workflows in the supplied Odoo screenshots and current official Odoo documentation are useful comparison points for the AfriCore Documents expansion, and where should the implementation avoid suggesting feature parity?
- Odoo version/source: official Odoo 20.0 user documentation and the supplied Odoo 19 screenshots; no Odoo source checkout inspected in this entry.
- Read: [Documents](https://www.odoo.com/documentation/20.0/applications/productivity/documents.html); [Documents features](https://www.odoo.com/app/documents-features); [Finance Documents](https://www.odoo.com/documentation/20.0/applications/finance/documents.html); [Sign](https://www.odoo.com/documentation/20.0/applications/productivity/sign.html); [Spreadsheet](https://www.odoo.com/documentation/20.0/applications/finance/spreadsheet.html); [Spreadsheet sharing](https://www.odoo.com/documentation/20.0/applications/productivity/spreadsheet/get_started.html).
- Findings: documentation describes All/Company/My Drive/Shared/Recent/Trash scopes, folders and file grids/lists, preview/details, versions, requests, tags, record links, external sharing roles/expiry, finance digitization, PDF splitting, spreadsheet creation, OCR/AI sorting and Sign workflows. The supplied screens illustrate navigation, New menu, private My Drive, file details and preview, planned activities, bulk selection, and folder actions. AfriCore's tested delta here is folder browsing and local PDF page rendering; its existing sharing/content permissions remain authoritative.
- Conclusions: use the navigation and preview patterns as usability references, while explicitly distinguishing existing AfriCore permissions and version behavior from Odoo's external sharing, OCR, workflow automations, Sign, spreadsheet editor and PDF editing features.
- Decision: none.
- Follow-ups: founder review against the supplied screenshots at matched desktop/tablet/mobile widths; assess feature requests only against AfriCore's current authorization and storage design.
- Limits: this was a documentation and screenshot comparison, not an Odoo runtime/source audit or complete same-size visual comparison. External Cybrosys screenshot URLs returned cache misses. No Odoo code or art was copied.

## 2026-11-19 — People expansion and supplied screen references

- Question: which People behaviors from the pinned Odoo 20 Community sources and the supplied Odoo 19 screenshots can be added to AfriCore without copying Odoo's data model or weakening existing employee, compensation, approval and service boundaries?
- Odoo commit: `bd181ee5eb1f200db3c062733d4f464c37ef9e25` (`20.0`, read-only local checkout).
- Read (paths): `addons/hr/models/hr_employee.py`; `addons/hr/models/hr_department.py`; `addons/hr/views/hr_employee_views.xml`; `addons/hr/views/hr_department_views.xml`; `addons/hr_attendance/models/hr_attendance.py`; `addons/hr_attendance/tests/test_hr_attendance_constraints.py`; `addons/hr_holidays/models/hr_leave.py`; `addons/hr_holidays/models/hr_leave_allocation.py`; `addons/hr_recruitment/models/hr_applicant.py`; `addons/hr_recruitment/models/hr_recruitment_stage.py`; `addons/hr_recruitment/tests/test_recruitment.py`.
- Findings: Employee screens and models distinguish work and private fields and provide card/list/hierarchy forms; Odoo 20 delegates effective employment facts to dated `hr.version` records. Department is a manager/parent hierarchy. Attendance validates ordered intervals, open sessions and overlaps, while policy-specific overtime must not be inferred from an older UI. Time Off models requests, allocations and distinct state transitions against configured work-time rules. Recruitment keeps applicant data separate and makes hiring an explicit action linked to a resulting employee. The pinned Community tree has no `addons/hr_appraisal`; this does not describe Enterprise Appraisals.
- Visual references: the user supplied Odoo 19 screenshots for employee cards/private fields/resume, hierarchy, Time Off/calendar/allocations, attendance grouping and goals. These are comparison references; Odoo 20 source behavior wins if the screenshot differs.
- Conclusions: reuse AfriCore's encrypted People service and canonical employee records; add only versioned People resource kinds and an additive index. Preserve privacy-scoped fields and separately delegated HR, compensation, recruiter and performance rights. Do not infer Enterprise appraisal implementation, payroll, overtime entitlement or employment-version history from Community or the screenshots.
- Decision: [D-009](DECISIONS.md#d-009-keep-people-resources-private-and-transitions-explicit).
- Follow-ups: complete a running-app side-by-side visual check and founder role acceptance when the local API is available; close remaining full-page employee profile, graphical calendar and schedule-history gaps.
- Limits: focused source review, not a full Odoo runtime, Enterprise source or all-module audit. The AfriCore browser was not compared at matched sizes; no pixel-parity claim is made. No Odoo source/assets were copied or changed.

## 2026-11-19 — People expansion: resume, recruitment, and approval boundaries

- Question: for the AfriCore People expansion, what minimum Community HR source evidence defines employee resume/skill records, recruitment application stages, and the candidate-to-employee transition, so the existing encrypted People authority can add comparable workflows without inferring Enterprise features or weakening access boundaries?
- Odoo commit: `bd181ee5eb1f200db3c062733d4f464c37ef9e25` (`20.0`).
- Read (paths): `addons/hr/models/hr_employee.py`; `addons/hr_recruitment/models/hr_applicant.py`; `addons/hr_recruitment/models/hr_recruitment_stage.py`; `addons/hr_recruitment/tests/test_recruitment.py`.
- Findings: `hr.employee` delegates effective employment fields to dated `hr.version` records and explicitly constrains private fields to HR groups (`addons/hr/models/hr_employee.py`, `_inherits`, `version_id`, private fields). Recruitment keeps `hr.applicant` separate from `hr.employee`, with an explicit optional employee link, job/stage/recruiter and application/hire dates (`addons/hr_recruitment/models/hr_applicant.py`). A stage has an explicit `hired_stage` marker (`addons/hr_recruitment/models/hr_recruitment_stage.py`); hiring is an explicit `create_employee_from_applicant` action, and focused recruitment tests exercise that transition (`addons/hr_recruitment/tests/test_recruitment.py`). The pinned Community checkout does not contain `addons/hr_appraisal`; this source pass does not establish Odoo Enterprise Appraisals behavior.
- Conclusions: keep applicants separate from employee records, use a deliberate hiring transition, and apply field-level privacy to personal information. Do not infer a login account or external communication from recruitment state.
- Decision: see [D-009](DECISIONS.md#d-009-keep-people-resources-private-and-transitions-explicit).
- Follow-ups: implement against AfriCore's People service and verify tenant, field-privacy and transition controls.
- Limits: focused source inspection only; no Odoo runtime, Enterprise source, full resume/skills addon review or browser-tour review.

## 2026-11-19 — Work timesheet, recurrence and history patterns

- Question: how do the pinned Odoo 20 Community Project and Timesheets sources represent task/milestone links, recurrence generation, task-state history, timer ownership, and timesheet approval, and which patterns can AfriCore adapt without weakening its project grants, audit trail or financial boundaries?
- Odoo commit: `bd181ee5eb1f200db3c062733d4f464c37ef9e25` (`20.0`), clean at inspection.
- Read (paths): `addons/project/models/project_task.py`; `addons/project/models/project_task_recurrence.py`; `addons/project/report/project_task_burndown_chart_report.py`; `addons/hr_timesheet/models/account_analytic_line.py`.
- Findings:
  - Project tasks have distinct `stage_id` and `state` values. State includes in-progress, changes-requested, approved, done, cancelled and dependency-waiting; stage changes can reset an open task's state, while completion remains a separate state transition (`addons/project/models/project_task.py`, `state`, `_compute_state`, `write`).
  - `milestone_id` is a project-scoped task relation, and milestone mismatch is corrected when a task's project changes (`addons/project/models/project_task.py`, `milestone_id`, `_compute_milestone_id`, `write`).
  - Recurrence has interval/unit/end configuration. Next tasks are generated from terminal tasks, dates are postponed, checklists/children are copied according to recurrence logic, and dependencies are resolved after the batch (`addons/project/models/project_task.py`, `_inverse_state`; `addons/project/models/project_task_recurrence.py`, `_create_next_occurrences`, `_create_next_occurrences_values`).
  - Burndown is an analytical projection over actual stage-duration tracking, requiring date and stage grouping; it is not a fabricated series from current task status (`addons/project/report/project_task_burndown_chart_report.py`, `_search`, `_validate_group_by`).
  - Timesheet lines link project, task, user and employee; task/project consistency is validated, and ordinary users cannot write another user's timesheet (`addons/hr_timesheet/models/account_analytic_line.py`, `task_id`, `project_id`, `_check_can_write`, `create`).
- Conclusions: preserve separate stage and workflow state, use project-validated milestone links, generate recurrence from an immutable occurrence identity with explicit copy policy, and disclose historical coverage. In AfriCore, keep time-entry identity bound to the current human login and separate manager review from entry creation; no employee, payroll or finance access follows from project membership.
- Decision: [D-008](DECISIONS.md#d-008-keep-work-effort-in-its-own-audited-authority).
- Follow-ups: implementation and source-backed focused tests; inspect running AfriCore views where browser tooling permits.
- Limits: focused Community-source read only; no Odoo runtime or tests were launched. The reviewed paths do not establish that a durable task timer is a Community capability; timer behavior is therefore implemented as an AfriCore server-owned feature, not claimed as Odoo parity. No source/assets were copied.

## 2026-11-19 — Point of Sale workflows and supplied Odoo reference screens

- Question: how does the pinned Odoo 20 Community POS manage register configuration, cashier sessions, product selection, basket/payment/receipt, order history/filters, cash closing, and order analysis, and which interaction/data rules can inform the AfriCore Phase 2.8B expansion?
- Odoo commit: `373b237cac51920a664a07c242c337e7b095b0c1` (`20.0`), clean at inspection.
- Read (paths): `addons/point_of_sale/__manifest__.py`; `addons/point_of_sale/models/pos_config.py`; `addons/point_of_sale/models/pos_order.py`; `addons/point_of_sale/models/pos_session.py`; `addons/point_of_sale/models/pos_payment.py`; `addons/point_of_sale/views/pos_config_view.xml`; `addons/point_of_sale/static/src/app/screens/product_screen/product_screen.js`; `addons/point_of_sale/static/src/app/screens/product_screen/order_summary/order_summary.js`; `addons/point_of_sale/static/src/app/screens/payment_screen/payment_screen.js`; `addons/point_of_sale/static/src/app/screens/payment_screen/payment_lines/payment_lines.js`; `addons/point_of_sale/static/src/app/components/product_card/product_card.js`; `addons/point_of_sale/static/src/app/components/numpad/numpad.js`; `addons/point_of_sale/report/pos_order_report.py`; `addons/point_of_sale/tests/test_point_of_sale_flow.py`; `addons/point_of_sale/tests/test_report_pos_order.py`; `addons/point_of_sale/tests/test_report_session.py`.
- Findings:
  - `pos.config` owns the register's payment methods, session/cash settings, product and partner load limits, currency/pricelist, warehouse and cashier policy. Open-session controls protect configuration changes that would make the active session inconsistent (`addons/point_of_sale/models/pos_config.py`, `addons/point_of_sale/views/pos_config_view.xml`).
  - `pos.session` exposes opening, opened, closing-control and closed states and links session cash controls and differences to the session; closing validates pending state before finalization (`addons/point_of_sale/models/pos_session.py`).
  - `pos.order` links the session/configuration, customer, lines, payments, invoice and refund origin. POS tests exercise duplicate sync, refunds, invoice links and cash rounding (`addons/point_of_sale/models/pos_order.py`, `addons/point_of_sale/tests/test_point_of_sale_flow.py`, `test_frontend.py`).
  - Payment amounts are separate `pos.payment` records associated with order and configured payment methods; a request and a settled payment are distinct facts (`addons/point_of_sale/models/pos_payment.py`).
  - Product, order-summary, payment and receipt interactions are implemented as separate client components. `pos.order.report` provides a line-based analytical projection and session reports separately cover cash/session results (`addons/point_of_sale/report/pos_order_report.py`, `addons/point_of_sale/tests/test_report_pos_order.py`, `test_report_session.py`).
  - The supplied screenshots show dashboard, cashier, payment, orders, receipt, closing, search/grouping and analysis patterns. They are visual references, not evidence of AfriCore runtime behavior.
- Conclusions: keep POS configuration and shifts explicit, preserve separate payment evidence and retry-safe order/refund links, and use a dedicated analytical source with measures/grouping rather than deriving totals from visible pages. AfriCore must keep its existing service authorities and extend reporting only within current register/cashier access and currency/timezone boundaries.
- Decision: [D-007](DECISIONS.md#d-007-keep-pos-dependencies-and-reporting-on-explicit-canonical-scopes).
- Follow-ups: browser captures and side-by-side comparison at matching desktop/tablet sizes, then founder manual acceptance. Qualify any restaurant/offline/device behavior only when authoritative state or the physical integration exists.
- Limits: focused Odoo 20 source review; no Odoo runtime or test suite was launched, no source or assets were copied, and no source changes were made. Official Payment Methods and Reporting pages were consulted; direct fetches of Multi-cashier, Reprint receipts, Restaurant, and Floors/Tables pages timed out. No running AfriCore screenshot or Odoo comparison was captured in this checkpoint.

## 2026-11-18 — Accounting documents, ledger lines, reports and reconciliation

- Question: how does Odoo 20 represent invoices and credit notes, enforce journal-line posting, expose account registers and financial reports, and propose bank-reconciliation counterparts; which screen/workflow structures can AfriCore adapt while preserving its single ledger, exact money, approvals, source ownership and tenant boundaries?
- Odoo commit: `373b237cac51920a664a07c242c337e7b095b0c1` (`20.0`).
- Read (paths): `addons/account/models/account_move.py`; `addons/account/models/account_move_line.py`; `addons/account/models/account_account.py`; `addons/account/models/account_bank_statement.py`; `addons/account/models/account_report.py`; `addons/account/models/account_journal.py`; `addons/account/views/account_move_views.xml`; `addons/account/views/account_account_views.xml`; `addons/account/views/account_reconcile_model_views.xml`; `addons/account/static/src/views/account_dashboard_kanban/account_dashboard_kanban_record.js`.
- Findings:
  - Odoo uses one `account.move` record for invoices and reversal documents, with explicit move types and a link to the reversed entry; posting validates journal balance (`addons/account/models/account_move.py`, `reversed_entry_id`, `_check_balanced`, `_reverse_moves`, `_post`).
  - Journal lines are first-class records. Residuals and full/partial matches are computed from reconciliation relations, not inferred from a payment label (`addons/account/models/account_move_line.py`, `amount_residual`, `matched_debit_ids`, `matched_credit_ids`, `_reconcile_plan`).
  - Accounts expose type, active state, reconciliation permission, company, currency and parent; account view presents those fields in a dense register (`addons/account/models/account_account.py`; `addons/account/views/account_account_views.xml`).
  - Bank statement validity depends on opening/ending balances and the continuity of successive statement balances; statement lines provide the counterpart for reconciliation (`addons/account/models/account_bank_statement.py`).
  - Financial reports are parameterized report definitions with lines, groups and options. The dashboard is implemented as a journal-card view (`addons/account/models/account_report.py`; `addons/account/models/account_journal.py`; `addons/account/static/src/views/account_dashboard_kanban/account_dashboard_kanban_record.js`).
- Conclusions: preserve AfriCore's existing canonical ledger and source ownership. Present invoice reversals/payments as distinct source registers, journal lines from the canonical line table, and confirmed report parameters beside report data. Reconciliation status must remain explicitly unavailable until AfriCore has a bank statement and line-matching model. Adapt the dense registers, journal cards, grouped fields and report controls without copying Odoo assets or source.
- Decision: none; focused implementation guidance only.
- Follow-ups: compare supplied Accounting references with running AfriCore pages and record actual captures/differences.
- Limits: focused source review for Phase 2.7B; no exhaustive audit of Odoo Community, Enterprise-only reporting, statutory localization or runtime acceptance.

## 2026-11-18 — CRM prospect intake, duplicate merges, activity plans and forecasts

- Question: how does the Odoo Community CRM reference model leads and opportunities, present pipeline/forecast views, merge related records, and reuse activity plans, and what behavior can AfriCore adapt without changing its canonical customer, authorization, history or currency contracts?
- Odoo commit: `2b5a64e54f5d68f4a3263e75128d63423326ffef` (`20.0`).
- Read (paths): `addons/crm/models/crm_lead.py`; `addons/crm/views/crm_lead_views.xml`; `addons/crm/wizard/crm_merge_opportunities.py`; `addons/crm/views/mail_activity_plan_views.xml`; `addons/mail/models/mail_activity_plan.py`; `addons/mail/models/mail_activity_plan_template.py`; `addons/mail/views/mail_activity_plan_views.xml`; `addons/crm/tests/test_crm_lead_merge.py`.
- Findings:
  - `crm.lead` represents either a lead or an opportunity through a `type` field. The canonical `partner_id` relationship is optional and the model describes it as usually created during conversion (`addons/crm/models/crm_lead.py`, `CrmLead`).
  - The CRM pipeline uses Kanban and exposes list, graph, pivot, calendar, form and activity views. Forecast is a separate action with forecast search defaults and forecast Kanban, graph, pivot and list views (`addons/crm/views/crm_lead_views.xml`, pipeline and forecast actions).
  - The merge wizard filters already-won records, lets the operator assign a salesperson and sales team, and invokes the model merge method (`addons/crm/wizard/crm_merge_opportunities.py`). The model merges selected values into a master and transfers dependent history, attachments and calendar events; the CRM merge test checks that attachments and activities move (`addons/crm/models/crm_lead.py`, `_merge_opportunity`, `_merge_dependences`; `addons/crm/tests/test_crm_lead_merge.py`, `test_merge_method_dependencies`).
  - CRM activity plans are generic mail records scoped to `crm.lead`. Ordered templates define activity type, summary, responsibility and delay fields (`addons/crm/views/mail_activity_plan_views.xml`; `addons/mail/models/mail_activity_plan_template.py`; `addons/mail/views/mail_activity_plan_views.xml`).
- Conclusions: adapt customerless prospect capture and explicit conversion, reviewed merge with dependent history transfer, and reusable activity plans. Preserve AfriCore's stronger service boundaries: canonical Customer creation/linking through CRM conversion, membership and role authorization, version checks, idempotency, snapshots, and integer minor-unit forecasts grouped by currency.
- Decision: [D-003](DECISIONS.md#d-003-keep-crm-prospects-independent-from-canonical-customers), [D-004](DECISIONS.md#d-004-merge-crm-records-with-a-reviewable-history) and [D-005](DECISIONS.md#d-005-keep-crm-activity-plans-bounded-and-retry-safe).
- Follow-ups: compare each populated running CRM screen with the supplied screenshots at a similar viewport; review permissions and financial currency semantics separately if required.
- Limits: focused source review, not an exhaustive CRM security, transaction, money-rounding or runtime audit. No Odoo source/assets were copied or modified. No new Phase 2.5B runtime screenshot or side-by-side comparison was captured.

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

## 2026-11-18 — Procurement workflows and supplied Odoo reference screens

- Question: how does the pinned Odoo 20 Community Purchase application organize the RFQ and purchase-order form/list, supplier alternatives, vendor prices, blanket agreements, bill matching, receiving, and purchase analysis, and which data/interaction rules can inform the AfriCore Phase 2.6B expansion?
- Odoo commit: `5dcff8c0e0d5e97bc6897ba1806c4ea8747670e2` (checkout dated 2026-11-02; purchase manifest version 1.2; branch content is Odoo 20 Community).
- Read (paths): `addons/purchase/__manifest__.py`; `addons/purchase/models/purchase_order.py` (`button_confirm`, `button_approve`, `button_cancel`, `action_create_invoice`, `_compute_receipt_status`, `_compute_bill_matched_ratio`); `addons/purchase/models/purchase_order_line.py` (`price_unit`, `discount`, `price_subtotal`, `qty_received`, `qty_to_invoice`); `addons/purchase/views/purchase_views.xml` (purchase root menus, form action buttons, tabs, search/group-by, list and kanban); `addons/purchase/views/product_views.xml` (supplierinfo lines); `addons/purchase/models/product.py` (`product.supplierinfo` use and seller selection); `addons/purchase/models/account_invoice.py` (purchase-order bill matching); `addons/purchase/report/purchase_report.py` and `report/purchase_report_views.xml`; `addons/purchase_stock/models/purchase_order.py` and `models/purchase_order_line.py` (stock incoming/received quantity integration); `addons/purchase_requisition/models/purchase_requisition.py` and `views/purchase_requisition_views.xml` (purchase agreements); `addons/purchase_alternative/models/purchase.py`, `views/purchase_views.xml`, and `tests/test_purchase_alternative.py` (alternative offers/comparison/selection); relevant manifests and root `LICENSE`.
- Findings:
  - Purchase manifests separate the purchase app from optional/auto-installed stock integration. `purchase/views/purchase_views.xml` lays out the Orders/Products/Reporting/Configuration menus, dense search/list/kanban, and a document form with state-aware Send RFQ, Confirm/Approve, Receive, Print, Cancel and Lock actions plus product/notes/other-information tabs.
  - Order confirmation either approves or moves the record to `to approve`; the separate approval transition records approval time. Cancellation refuses locked orders or orders with non-draft/non-cancelled bills — `purchase/models/purchase_order.py` (`button_confirm`, `button_approve`, `button_cancel`).
  - Purchase-order lines keep unit, quantity, promised date, unit price, discount and tax-derived subtotal; invoiced quantity can use ordered or received quantities according to product purchase policy — `purchase/models/purchase_order_line.py` (`qty_to_invoice`, `_compute_amount`, `qty_received`).
  - `purchase_stock` derives receipt state from stock moves and scheduled purchase lines; the order is not physical stock until receiving is validated — `purchase_stock/models/purchase_order_line.py` (`_compute_qty_received`) and `purchase_stock/models/purchase_order.py`.
  - Vendor price rows are shared `product.supplierinfo` records with supplier, product, quantity breaks, price/currency, date validity and delivery delay. Agreement state/type/validity and product quantities live in `purchase_requisition`; vendor alternatives are a separate `purchase_alternative` extension with linked purchase orders, line comparison, choose/warning behavior, not a field on the base purchase model.
  - Vendor bill preparation links order lines and derives invoiceable quantities; bill match rules and receipt/order policy are handled in the account-integration model paths. The purchase analysis is a dedicated `purchase.report` source exposing supplier, buyer, product/category, dates, ordered/received/billed quantities and totals. Its source module explicitly warns that this report is not multi-currency.
  - The six prompt images are Odoo 19 visual references: purchase dashboard/register, RFQ/PO document, agreement, vendor price list, supplier bill, and purchase analysis. They were inspected in the conversation at their supplied resolution as visual guidance; no local reference copies were added to the repository.
- Conclusions: retain the compact nav/toolbar, dense register, state-aware document hierarchy, supplier comparison and explicit purchase/stock/accounting handoffs. Adapt the model using AfriCore's shared canonical customers/products, scoped API, exact integer minor/thousandth units, separate actor review, service permissions and immutable receipt/payment evidence. Keep multi-currency values isolated. Where no transmission provider exists, preserve draft/print/copy language instead of copying Odoo's email action label as a claim of delivery.
- Decision: [D-006](DECISIONS.md#d-006-keep-supplier-awards-receipt-evidence-and-currency-semantics-explicit).
- Follow-ups: compare the actual running AfriCore Procurement screenshots against the six references at a similar viewport; founder to verify the local workflow and role-sensitive screens.
- Limits: focused source review, not an exhaustive purchase/account security audit; no Odoo server was launched. The official Odoo documentation lookup timed out in the prior browser attempt, so this entry relies on pinned source and supplied images. The existing Odoo checkout had no working-tree changes after review and no source/assets were copied.
## 2026-11-19 — Point of Sale workflows and supplied Odoo reference screens

- Question: how does the pinned Odoo 20 Community POS manage register configuration, cashier sessions, product selection, basket/payment/receipt, order history/filters, cash closing, and order analysis, and which interaction/data rules can inform the AfriCore Phase 2.8B expansion?
- Planned read-only paths: `addons/point_of_sale/__manifest__.py`; POS models for configuration, orders, sessions and payments; frontend product and payment screens; order/report views and tests where needed. Confirm exact paths and pinned commit before reading.
- Status: question recorded before source inspection. Findings and AfriCore decisions will be appended after the focused source review; supplied screenshots remain design references, not proof of AfriCore behavior.

## 2026-11-19 — Work task, timesheet, recurrence and reporting expansion

- Question: which Odoo Community Project/Timesheets constraints shown in the supplied nine screenshots belong in AfriCore's Work expansion, and which should remain bounded by AfriCore's own task, time, privacy and history authorities?
- Read-only source: pinned Odoo 20 Community commit `bd181ee5eb1f200db3c062733d4f464c37ef9e25`; focused paths include `addons/project/models/project_task.py`, `project_task_recurrence.py`, `report/project_task_burndown_chart_report.py`, project form/list/search views, and `addons/hr_timesheet/models/account_analytic_line.py`.
- Findings: task stage and state are independent; milestones are constrained to the task's project; recurrence generates from a terminal task under a recurrence rule and applies explicit copy/date-reset behavior; burndown depends on stored stage durations rather than today's state; timesheets are analytic lines with task/project/user/employee relations and write checks. Detailed source observations are in [`notes/project.md`](notes/project.md).
- AfriCore implementation: recorded time is a separate encrypted authority, bound to its author and project/task, with server-owned timers, review separation and immutable approvals. Recurrence generation is explicit and idempotent. Milestone consistency, schedule changes and task progress history are server-validated; reporting uses scoped, capped sources and a documented migration cutover. Work estimates/time are not payroll, attendance, recognized revenue or invoices.
- Decision: D-008, keep Work effort in its own audited authority. No Odoo source/assets were copied.
- Verification/limits: the full isolated backend suite passed 471 with 0 failures and 1 PostgreSQL-only skip; focused Work tests passed 19/19. The live signed-in sandbox rendered the calendar, but Timesheets and Reporting returned “Resource not found”; refresh/runtime verification, side-by-side visual comparison, founder acceptance, PostgreSQL and the complete requested manual matrix remain open. See `docs/PHASE2_APP_PROGRESS.md` for the implementation and exact limits.

## 2026-11-19 — Analytics and Automations canonical reporting connection

- Question: how can Analytics report workflow activity without duplicating the automation run ledger or implying scheduled delivery guarantees?
- Odoo basis: reuse the previously recorded Community 20.0 dashboard/graph/pivot findings in `notes/spreadsheet_dashboard.md` and Automation/Scheduled Actions findings in `notes/base_automation.md`; no additional Odoo source files were opened for this connection.
- AfriCore source reviewed: `src/operations/business-analytics.ts`, `src/operations/automation.ts`, `src/operations/schema.ts`, and `src/operations/connected-schema.ts`.
- Decision: register only aggregate rule counts and persisted run counts. Use server-owned fixed SQL over `ac2_objects` and `ac2_runs`; require the Automations service plus finance-capable role; preserve workspace/environment scoping. Pending runs may include retry waits. Do not report duration because there is no reliable run-start timestamp, and do not infer successful delivery from a configured schedule. No new persistence or Odoo code/assets were introduced.
- Verification status: integration regression coverage added; local test results are recorded in the current `docs/PHASE2_APP_PROGRESS.md` entry after execution. Official Odoo documentation endpoints timed out; this follow-up relies on the existing pinned-source notes and states no new documentation-backed behavior.

## 2026-11-20 — Business ID and Commerce combined continuation

- Questions: does the existing Passport remain the single Business ID authority; what is already complete in the public/merchant Commerce flow; and which source-backed gap in the supplied merchant navigation remains?
- Business ID: reused the focused Contacts finding above and current Passport/Trust implementation notes. Odoo Contacts' shared company form is visual prior art, not an identity-verification or credential authority. W3C VC Data Model 2.0 and Data Integrity 1.0 remain separate claim, issuer, proof and status references as documented in `docs/PHASE2_APP_PROGRESS.md`.
- Commerce: reviewed Odoo 20 source at pinned commit `36fef5806`: `addons/website_sale/controllers/main.py`, `controllers/cart.py`, `controllers/product_configurator.py`, `models/sale_order.py`, `models/website.py` and `models/website_checkout_step.py`. Focused findings are in [website_sale.md](notes/website_sale.md).
- Findings: Odoo's catalog supports configured search/category/price/tag/sale/stock filters and sorting; cart is a canonical Sales order with quantity and product-configuration checks; checkout validates ordered steps and address/delivery readiness. AfriCore preserves canonical authorities and has a smaller, explicitly bounded feature set.
- AfriCore decision: add the missing Promotions destination over existing validated server discount rules, plus Cards/List presentation in the canonical product listing. Do not duplicate product masters, make stock claims from listings or present payment as settlement.
- Official Odoo 20 documentation page fetches for Contacts, eCommerce, catalog and checkout timed out on 2026-11-20. No new docs-backed claim is made. Supplied screenshots were reviewed but not compared with a running application at matched viewport sizes.

### Phase 3 comparison status — 23 November 2026

The supplied Odoo 19/20 Calendar and Website images remain visual references only. Local synthetic browser evidence exists for Marketplace install/open, Calendar week view, Website Overview, and selected editor flows, but a matched viewport screenshot comparison covering toolbar geometry, calendar density, editor canvas/sidebar, menu editor, and mobile behavior has not been completed. No pixel-parity claim is made. See `../PHASE3_ACCEPTANCE.md` for the remaining capture and review gates.
