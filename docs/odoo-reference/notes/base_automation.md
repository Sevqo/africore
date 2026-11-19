# Odoo Community `base_automation` — source comparison

Research date: 2026-11-17. Local source commit: `1f622740a0688c940c9ed6ab40a4a174326a345d`, branch `20.0`.
The screenshots supplied for AfriCore Phase 2.13 show Odoo 19 automation rules and an Odoo 18 scheduled-action form. The local checkout is Odoo 20 Community, so it is architectural and behavior evidence, not proof that every label or pixel is identical across versions.

## Odoo composition

`addons/base_automation/models/base_automation.py` defines `base.automation`. A rule names a concrete model and a supported trigger, can carry trigger-specific fields and before-update/apply-on domains, and owns an ordered collection of `ir.actions.server` records. Constraints validate trigger/model compatibility and action/model pairing. The hook registers create, write, unlink, onchange, mail and time-based trigger processing. The technical model inherits mail thread/activity behavior, which explains Odoo's discussion and activity controls on a record form.

`addons/base_automation/views/base_automation_views.xml` defines the record form, kanban, list and search views. The form puts the name in a document title, keeps trigger-specific fields beside the trigger, shows domain controls where relevant, and uses horizontal `Actions To Do` and `Notes` pages. The trigger widget's grouped dropdown is implemented in `addons/base_automation/static/src/base_automation_trigger_selection_field.js` and its XML template. The seven supplied screenshots are the visual authority for this task; the local source confirms the component structure but is a different Odoo version.

Odoo's trigger and server-action surface is intentionally broader than AfriCore's. `odoo/addons/base/models/ir_actions.py` and `odoo/addons/base/views/ir_actions_views.xml` define reusable server-action behaviors and views. Odoo can expose code and external communication actions. AfriCore must continue to reject user-authored code, raw SQL, unrestricted webhooks and unconfigured external delivery.

`odoo/addons/base/models/ir_cron.py` defines `ir.cron` as a delegated server action with active state, interval, next call, last call, priority and failure tracking. `method_direct_trigger` runs a job in the current HTTP thread with a separate cursor. `odoo/addons/base/views/ir_cron_views.xml` provides the full-page form with **Run Manually**, a dense list, calendar and search/grouping. This differs from AfriCore's periodic worker poll: AfriCore has no authoritative single `nextcall` for per-record scheduled recipes, so the register must not fabricate one.

## AfriCore mapping

| Odoo behavior | AfriCore implementation and boundary |
| --- | --- |
| Model selection | `src/operations/contracts.ts` owns a closed template/source registry. The UI displays a readable source derived from that template; users cannot select database models. |
| Trigger choices | `src/operations/contracts.ts` declares actual event and scheduled templates. Existing producers are `src/operations/events.ts`, `src/operations/crm.ts`, `src/platform/payments.ts`, `src/platform/routes.ts`, `src/operations/channel-sales.ts`, `src/operations/commerce.ts`, `src/operations/business-worker.ts`, and `src/operations/integrations.ts`. |
| Conditions and branches | `src/operations/contracts.ts`, `src/operations/automation.ts`, and `website/src/operations/WorkflowBranchFields.tsx` validate a bounded condition/action schema; no user SQL or arbitrary domain string is accepted. |
| Action execution | `src/operations/workflow-actions.ts` performs the approved CRM follow-up and inventory suggestion effects; `src/operations/automation.ts` performs notification/skip actions and stores run outcomes. Notification preferences, membership checks, dedupe and caps remain authoritative. |
| Durable schedules and runs | `src/operations/automation.ts`, `src/operations/worker.ts`, and `src/operations/business-worker.ts` use the existing durable run/event store and polling worker. A 15-second poll and 50-item pass limit are operational facts, not timing guarantees. |
| Record UI | `website/src/apps/AutomationsWorkspace.tsx`, `website/src/operations/WorkflowBranchFields.tsx`, and `website/src/apps/apps.css` provide the rule form, grouped trigger selection, action dialog, schedule register/detail, execution history, versions and service disclosure while retaining AfriCore's global shell. |
| API and permission | `src/operations/routes.ts`, `src/marketplace/policy.ts`, `src/platform/workspace-capabilities.ts`, and `src/operations/connected-routes.ts` scope and authorize rule, ownership, manual run, history, private Work and approvals operations. Finance authority and required services are rechecked by the backend. |

The selected schedule's **Run Manually** operation is `POST /organizations/:org/automations/:id/process`. It accepts only a saved, enabled scheduled recipe, checks the current owner's finance authority and required services, verifies the saved version has not changed, and filters both candidate discovery and pending-run draining to that one workflow. It uses the existing worker and daily/weekly idempotency key. It does not run paused rules or bypass service/owner requirements.

## UI match assessment

The implementation follows the seven references' recognizable structure: full-page rule record, compact grouped trigger choices, horizontal rule tabs, centered action dialog, dense scheduled-action table and full-width schedule detail. The schedule form uses `TECHNICAL SETTINGS` / `ACTION DETAILS` and `Execution Plan` / `Help`; it includes a real selected-rule manual execution control. AfriCore uses a light theme and its own shell. Some differences are deliberate: there is no Odoo free-form model/domain, no executable Code tab, no fake `nextcall`, and no unsupported mail/SMS/webhook action.

No running AfriCore browser capture was made in this task, so none of the seven references is marked screenshot-compared or pixel-verified. The founder's visual acceptance is still required. See the Phase 2.13 visual matrix in `docs/PHASE2_APP_PROGRESS.md`.

### 2026-11-19 Analytics connection

Aggregate workflow reporting reads the same canonical `ac2_objects` and `ac2_runs` authority as this automation implementation. It counts rules and persisted run statuses only; it does not expose run payloads, infer successful scheduled delivery, or report duration without a stored start time. Automations service access and a finance-capable role are required. The verified implementation and tests are tracked in `docs/PHASE2_APP_PROGRESS.md`.
