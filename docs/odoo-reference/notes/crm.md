# crm — Odoo 20.0 notes

- Odoo commit: `2b5a64e54f5d68f4a3263e75128d63423326ffef`
- Path root: `odoo-reference/addons/crm`
- AfriCore question(s): how Odoo models customerless leads and opportunities, presents pipeline/forecast views, merges duplicate records, and applies reusable activity plans.
- Status: read
- Last updated: 2026-11-18

## Model map

- `crm.lead` stores both leads and opportunities. Its `type` selection is `lead` or `opportunity`; `partner_id` is optional and its help text says a partner is usually created when converting a lead (`addons/crm/models/crm_lead.py`, `CrmLead`, fields `type` and `partner_id`).
- CRM activity plans reuse the generic `mail.activity.plan` model, with the CRM action scoped to `crm.lead` (`addons/crm/views/mail_activity_plan_views.xml`, `mail_activity_plan_action_lead`). The plan steps are `mail.activity.plan.template` rows (`addons/mail/models/mail_activity_plan_template.py`).

## Lifecycle / state machine

- The lead form and pipeline Kanban share `crm.lead`; the pipeline action provides Kanban, list, graph, pivot, calendar, form and activity views (`addons/crm/views/crm_lead_views.xml`, `crm_lead_view_form`, `crm_case_kanban_view_leads`, `crm_lead_action_pipeline`).
- The forecast action defaults the forecast search and closing-date field and offers forecast Kanban, graph, pivot and list views (`addons/crm/views/crm_lead_views.xml`, `crm_lead_action_forecast`).
- The merge wizard filters out records whose won status is already `won`, allows a salesperson and sales team to be set, and calls the model merge method (`addons/crm/wizard/crm_merge_opportunities.py`, `default_get`, `action_merge`). The model chooses a master, merges selected field values, and transfers dependent history, attachments and calendar events (`addons/crm/models/crm_lead.py`, `_merge_data`, `_merge_opportunity`, `_merge_dependences`). CRM tests explicitly cover moved attachments and activities (`addons/crm/tests/test_crm_lead_merge.py`, `test_merge_method_dependencies`).
- CRM activity plans are ordered templates with activity type, summary, responsibility, delay count/unit and delay origin fields (`addons/mail/models/mail_activity_plan_template.py`; `addons/mail/views/mail_activity_plan_views.xml`). The CRM action uses a `crm.lead` domain and default model context (`addons/crm/views/mail_activity_plan_views.xml`).

## Money and units

This focused pass did not audit the CRM monetary field declarations, currency conversion, or rounding. AfriCore's CRM forecast remains in integer minor units and keeps each currency separate; no Odoo arithmetic or conversion behavior is assumed.

## Security and access

The CRM merge and view access-control rules were not audited in this pass. AfriCore must continue to enforce current tenant, environment, membership, role and service authorization in its own backend.

## Transactions and concurrency

Odoo's database transaction and merge concurrency behavior were not audited. AfriCore keeps merge snapshots, activity reparenting and archival in its existing authorized, idempotent operation path.

## What AfriCore should take

- Adapt the shared lead/opportunity lifecycle while preserving AfriCore's separate canonical Customer and Sales authority: [D-003](../DECISIONS.md#d-003-keep-crm-prospects-independent-from-canonical-customers).
- Preserve related activity/history through explicit duplicate review: [D-004](../DECISIONS.md#d-004-merge-crm-records-with-a-reviewable-history).
- Keep reusable activity plans bounded to supported steps and idempotent executions: [D-005](../DECISIONS.md#d-005-keep-crm-activity-plans-bounded-and-retry-safe).
- Reimplement ideas in AfriCore's own code. No Odoo source, markup or assets were copied.

## Open questions

- Complete the requested running-app side-by-side review for populated pipeline, activity-plan, merge and forecast states; no Phase 2.5B capture was made in this checkpoint.
- Review CRM permissions, currency/rounding and transaction behavior only if a later concrete requirement needs those Odoo sources.
