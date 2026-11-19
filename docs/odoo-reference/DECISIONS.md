# Decisions informed by Odoo

Research notes describe what Odoo does. This file records what **AfriCore**
decided, and why. An entry here is authoritative for future sessions; a note in
`RESEARCH_LOG.md` or `notes/` is only evidence.

## Rules

- One entry per decision, newest at the top.
- A decision must state the AfriCore constraint it serves. "Odoo does it this
  way" is not a rationale.
- Decisions here never override `AGENTS.md`, `docs/security/*`, or the financial
  provenance rules. If Odoo evidence conflicts with an existing AfriCore rule,
  the existing rule stands and the conflict is recorded under `Rejected`.
- Adopting anything that requires transcribing Odoo source (LGPL-3.0) needs
  explicit owner approval first. Recording the decision is not that approval.
- This file does not authorise code changes. Implementation follows AfriCore's
  normal change process.

## Format

```
### D-00N — <decision, imperative>
- Date: YYYY-MM-DD
- Status: proposed | accepted | rejected | superseded by D-00M
- Evidence: `odoo-reference/<path>` (+ RESEARCH_LOG entry)
- Constraint: <the AfriCore rule or requirement this serves>
- Decision: <what AfriCore will/will not do>
- Consequences: <what becomes easier, what becomes harder, what must be tested>
```

## Log

### D-009 — Keep People resources private and transitions explicit
- Date: 2026-11-19
- Status: accepted
- Evidence: `odoo-reference/addons/hr/models/hr_employee.py`, `addons/hr_recruitment/models/hr_applicant.py`, `addons/hr_recruitment/models/hr_recruitment_stage.py`, and `addons/hr_recruitment/tests/test_recruitment.py` (+ `RESEARCH_LOG.md`, People expansion entry)
- Constraint: People must preserve encrypted tenant-scoped employment records, field-level privacy, separate recruiter/reviewer authority, employee/login separation, and reviewable lifecycle transitions.
- Decision: keep applicants, employees, private profile data, professional history, goals and appraisals as distinct encrypted People resources. Allow hiring only through an explicit idempotent transition that creates or links one canonical employee record after duplicate checks. Never create a workspace login, publish an opening, send an invitation, or revoke workspace access from a People status alone.
- Consequences: test employee/applicant separation, duplicate detection, one-time hiring, recruiter and reviewer scopes, private profile redaction and historical review transitions. People references Work and Documents only through their existing authorized services. Do not copy Odoo source/assets or infer Enterprise Appraisals behavior from the Community checkout.

### D-008 — Keep Work effort in its own audited authority
- Date: 2026-11-19
- Status: accepted
- Evidence: `odoo-reference/addons/project/models/project_task.py`, `project_task_recurrence.py`, `report/project_task_burndown_chart_report.py`, and `addons/hr_timesheet/models/account_analytic_line.py` (+ `RESEARCH_LOG.md`, Work expansion entry)
- Constraint: Work must preserve project privacy, current human identity, exact time-entry provenance, and Finance/People separation while supporting durable timers and truthful history.
- Decision: bind each time entry to its author and project/task, keep manager review separate, make approved entries immutable, and exclude rejected entries from recorded-effort totals. Timer state is server-owned and one active timer is allowed per user/environment. Recurring generation uses a unique rule/date key and explicit clone policy. Historical charts start at a captured cutover baseline; earlier periods are labeled unavailable. Work never creates payroll or invoices from time, milestone completion, or estimates.
- Consequences: test tenant/environment/project isolation, author/reviewer permissions, idempotent timers and recurrence, exact elapsed seconds, immutable approvals, and report coverage. Unattended recurrence is not promised unless the existing worker can be shown to run reliably in the deployment.

### D-007 — Keep POS dependencies and reporting on explicit canonical scopes
- Date: 2026-11-19
- Status: accepted
- Evidence: `odoo-reference/addons/point_of_sale/models/pos_config.py`, `pos_session.py`, `pos_order.py`, `pos_payment.py`, and `report/pos_order_report.py` (+ `RESEARCH_LOG.md` and `notes/point_of_sale.md`, POS expansion entry)
- Constraint: POS operations must keep canonical customer/order/invoice/payment/stock ownership, current register authorization, exact currency boundaries and honest cash/payment evidence.
- Decision: declare Customers as a required POS dependency wherever register writes are enabled; do not auto-provision its entitlement or records. Build cross-register reports only from the full bounded set of currently authorized register sales, retain register-local date boundaries and separate currency totals, and label sales, allocations, cash observations and session closures by their actual source and date scope.
- Consequences: test installation metadata and register rejection when Customers is inactive, cashier/manager/register authorization on report reads, complete aggregates and pagination, currency separation, and independent event-date coverage. Unsupported offline confirmation, restaurant state and physical hardware remain unavailable until their own authoritative state/integration is implemented and verified.

### D-006 — Keep supplier awards, receipt evidence and currency semantics explicit
- Date: 2026-11-18
- Status: accepted
- Evidence: `odoo-reference/addons/purchase_alternative/models/purchase.py`, `odoo-reference/addons/purchase/models/purchase_order.py`, `odoo-reference/addons/purchase_stock/models/purchase_order_line.py`, and `odoo-reference/addons/purchase/report/purchase_report.py` (+ `RESEARCH_LOG.md`, Procurement expansion entry)
- Constraint: procurement must preserve independent review, canonical Inventory and Accounting ownership, immutable purchase evidence, and exact money without implying a supplier communication or currency conversion that did not occur.
- Decision: link alternative offers to one approved requirement and persist one separately reviewed award; plan incoming quantities at order issue and increase stock only through accepted receipts; validate supplier bills against recorded purchasing/receipt evidence; and aggregate amounts by source currency until an authorized rate basis exists. Do not claim RFQ/PO email, bank payment or statutory filing without a real service result.
- Consequences: test distinct-person review, award uniqueness/replay, partial receipts, quantity matching, currency-isolated reports, and external-action wording. A standalone Odoo alternative-bid model, Odoo accounting tables and source/assets are not copied.

### D-005 — Keep CRM activity plans bounded and retry-safe
- Date: 2026-11-18
- Status: accepted
- Evidence: `odoo-reference/addons/crm/views/mail_activity_plan_views.xml`, `odoo-reference/addons/mail/models/mail_activity_plan_template.py`, and `odoo-reference/addons/mail/views/mail_activity_plan_views.xml` (+ `RESEARCH_LOG.md`, CRM expansion entry)
- Constraint: CRM follow-up workflows must use current operational members, safe local date semantics and retry-safe persistence; unsupported external communication must not be implied.
- Decision: model plans as ordered, bounded activity steps with integer calendar-day offsets, current-member assignment validation, due times at 09:00 Africa/Nairobi, and an idempotent execution key. Generate missing step identifiers in the service and store them with the plan.
- Consequences: plan edit/apply tests must cover version checks, assignment eligibility, local due dates and replay without duplicate activities. Plan steps do not send email/SMS or call external providers.

### D-004 — Merge CRM records with a reviewable history
- Date: 2026-11-18
- Status: accepted
- Evidence: `odoo-reference/addons/crm/wizard/crm_merge_opportunities.py`, `odoo-reference/addons/crm/models/crm_lead.py`, and `odoo-reference/addons/crm/tests/test_crm_lead_merge.py` (+ `RESEARCH_LOG.md`, CRM expansion entry)
- Constraint: a duplicate merge must not erase the record of prior CRM work, reparent activities without authorization, merge terminal Won/Lost records, or create duplicate work when retried.
- Decision: require an explicit primary/duplicate selection, preserve source snapshots in merge history, reparent linked CRM activities through the versioned service, archive merged duplicates, and bind retries to an idempotency key. Exclude terminal Won/Lost entries from automatic suggestions and merge candidates.
- Consequences: future merge changes must test replay, authorization, history retention and activity parent references together. Odoo's field-resolution and physical unlink behavior is not copied.

### D-003 — Keep CRM prospects independent from canonical customers
- Date: 2026-11-18
- Status: accepted
- Evidence: `odoo-reference/addons/crm/models/crm_lead.py` (`CrmLead.type`, optional `partner_id`, `action_convert_to_opportunity`) (+ `RESEARCH_LOG.md`, CRM expansion entry)
- Constraint: CRM intake must not create a canonical customer prematurely, while Sales and opportunity workflows must continue to use AfriCore's authoritative customer records.
- Decision: allow leads to be captured and imported without a customer link; create or select the canonical Customer through the existing conversion workflow. Keep opportunity and Sales customer-link validation in their existing services.
- Consequences: lead imports can preserve incomplete prospect data without weakening customer uniqueness or Sales permissions; conversion remains the explicit CRM-to-customer boundary.

### D-002 — Keep automations bounded and run scheduled actions through the existing worker
- Date: 2026-11-17
- Status: accepted
- Evidence: `odoo-reference/addons/base_automation/models/base_automation.py`, `odoo-reference/addons/base_automation/views/base_automation_views.xml`, `odoo-reference/odoo/addons/base/models/ir_cron.py`, and `odoo-reference/odoo/addons/base/views/ir_cron_views.xml` (+ `RESEARCH_LOG.md`, Automation Rules and Scheduled Actions entry)
- Constraint: automation side effects must remain workspace-scoped, finance-authorized, service-checked, audited, idempotent and safe to retry; the application must not execute user code or claim schedule guarantees its worker cannot meet.
- Decision: use a closed registry of supported triggers, conditions and actions over AfriCore's durable event/run store. Manual schedule execution may evaluate only the selected saved, enabled scheduled rule and must use the existing worker, ownership checks, service checks and natural-period deduplication. Do not add an independent scheduler, arbitrary code/SQL, unsupported external messaging or financial actions.
- Consequences: the UI can reproduce Odoo's record structure and **Run Manually** placement while describing AfriCore's actual polling semantics. No exact next-call time is shown for per-resource schedule candidates. The manual-run endpoint must be route-authorized, scoped, version-checked and regression-tested; time-sensitive use remains subject to worker uptime and polling delay.

### D-001 — Keep analytics aggregates registry-driven and source-authorized
- Date: 2026-11-16
- Status: accepted
- Evidence: `odoo-reference/addons/web/static/src/views/graph/graph_model.js`, `odoo-reference/addons/web/static/src/views/pivot/pivot_model.js`, and `odoo-reference/addons/spreadsheet_dashboard/models/spreadsheet_dashboard.py` (+ `RESEARCH_LOG.md`, Analytics entry)
- Constraint: AfriCore must preserve tenant/environment isolation, current service and role permissions, integer-money/currency semantics, and authoritative source records.
- Decision: reimplement compatible graph, pivot, dashboard and saved-filter behavior using AfriCore's typed measure registry, approved SQL expressions, existing service APIs and versioned actor-owned configuration. Do not copy Odoo source or assets, expose public links without an approved share service, or present unsupported sources as available.
- Consequences: report dimensions and chart types remain capability-checked; financial measures stay separate from record counts and preserve source currencies; saved configurations are validated on read/write. Test tenant, service, role, stale-version and filter behavior independently from visual acceptance.

## Rejected

Ideas considered and turned down, with the reason. Keeping these prevents a
future session from re-litigating a settled question.

_None yet._
