# Automations

Phase 2.13 implements a bounded, Odoo-style Automation Rules and Scheduled Actions workspace over AfriCore's existing event journal, workflow actions, SQL run ledger and worker. The authoritative recipe and trigger catalogue is `src/operations/contracts.ts`; service and role authorization remains server-side. This is a product-layer workflow engine, not an arbitrary code runner.

## Available recipes

The registry contains 18 recipes: CRM stage change; invoice review; customer onboarding; inventory reorder; confirmed-order sync review; upcoming obligations; credential expiry; integration failure; invoice due soon/overdue; payment success/failure; daily transaction summary; weekly cash-flow review; reconciliation exceptions; customer payment follow-up; shipment shipped; and delivery confirmation. Each recipe declares its source event or scheduled condition, source category and required services. The source producer must emit the event before an event recipe can match. A missing source service prevents configuration/enabling or pauses a rule if it becomes unavailable at execution.

Supported actions are internal notifications, CRM follow-up, inventory replenishment suggestion and conditional skip. The action is validated against the template, branch and required service. Notifications honor recipient membership, preferences, deduplication and the daily cap. CRM and inventory actions use the existing canonical services; a replenishment suggestion is for review and does not order stock. No external email/SMS/WhatsApp, unrestricted webhook, user code/SQL, customer payment request, financial posting, supplier order or money movement is exposed.

## User interface

`website/src/apps/AutomationsWorkspace.tsx` provides rule list/dashboard, a document-style rule editor, grouped trigger selector, action configuration dialog, dense scheduled-actions register and detail, execution history, templates, service configuration, private Work integration and approvals. Rule details expose immutable versions, notes, an execution-plan preview that does not execute, run history, and permission/service state. Scheduled records use a full-width form with **TECHNICAL SETTINGS**, **ACTION DETAILS**, **Execution Plan**, and **Help**; the toolbar exposes **Run Manually** for a saved scheduled rule.

The UI uses AfriCore's light theme, global shell and design tokens. It reproduces the structural hierarchy in seven supplied Odoo references while replacing unsupported controls with safe equivalents. The running app was not captured for screenshot comparison in this implementation; founder visual acceptance is still required. See `docs/PHASE2_APP_PROGRESS.md` for the per-image comparison matrix and manual acceptance steps.

## Routes and authority

The business API is registered in `src/operations/routes.ts`, with product/service policy in `src/marketplace/policy.ts` and workspace route-kind checks in `src/platform/workspace-capabilities.ts`. Connected version and run-control endpoints are in `src/operations/connected-routes.ts`.

- `GET /automations/templates` — authoritative recipes.
- `GET /automations` — filtered, paginated rule directory and full-result totals.
- `GET /automations/:id` — scoped rule detail and owner authority state.
- `POST /automations`, `PUT /automations/:id/configuration`, `PATCH /automations/:id` — create/version/update enabled state.
- `POST /automations/:id/take-ownership` — authorized recovery; transfer pauses and versions the rule.
- `POST /automations/process` — worker's due-rule pass.
- `POST /automations/:id/process` — manually evaluate only that saved enabled scheduled rule. The endpoint checks finance authority, owner membership, current service readiness, trigger type and configuration version. It uses the existing worker, local schedule timezone and daily/weekly natural-key deduplication.
- `GET /automation-runs`, `GET /automation-runs/:id`, `POST /automation-runs/:id/control` — scoped history and safe run controls; result details expose an allowlist, not raw payloads/errors.
- `GET /automations/:id/versions` — immutable configuration snapshots with display actor labels, not internal actor identifiers.

Rule search/filter is applied before pagination. Scheduled records intentionally do not claim a deterministic next execution timestamp: the worker polls every 15 seconds while awake, supports a 50-candidate/pass limit and can be delayed or stopped by host sleep. The scheduled detail describes the configured local hour and timezone without presenting them as an SLA.

## Persistence and execution

`src/operations/automation.ts` validates and evaluates schedules, checks owner/services and creates version-bound idempotent runs. `src/operations/events.ts` stores durable scoped events and an outbox. `src/operations/worker.ts` and `src/operations/business-worker.ts` are the existing runtime; `src/operations/workflow-actions.ts` performs approved CRM/inventory effects. The current flow is transaction-oriented and bounded; do not add another scheduler, worker, queue, event ledger or database.

The automation poll runs every 15 seconds when the API process is awake and processes up to 50 candidates/executions per pass. Scheduled candidates use a configured IANA timezone and daily/weekly natural key. Event runs use durable event IDs. Retries are bounded (default 3 attempts with exponential backoff) and eventually dead-letter. Rule version changes invalidate pending work bound to an older version. Pausing blocks new and pending effects. Current owner finance authority and required service availability are checked before execution. A worker sleeping or down can delay/miss a schedule; the manual control is still subject to worker/runtime availability.

## Integrations and limitations

Templates use existing event sources in CRM, customer, invoicing, payment/reconciliation, inventory, sales/order, fulfillment/delivery, credential and integration services. The action model can create in-app notifications, CRM follow-ups and replenishment suggestions. Private Work notification/approval routes remain separately scoped and do not become a second workflow engine.

The current deployment should be treated as a single API/worker process. Distributed worker leases and cross-instance rate limits are not established. External delivery providers and credentials, consent/opt-out, public webhook verification, arbitrary code, exact cron `nextcall`, and financial execution are unsupported. PostgreSQL and hosted worker uptime require deployment-specific qualification.

## Verification

Phase 2.13 adds regression coverage for filtered directories, literal wildcard search, historical run versions, sanitized results, revoked-owner recovery, daylight-saving schedule evaluation, and selected-rule manual runs. The final verification results and founder visual acceptance limits are recorded in `docs/PHASE2_APP_PROGRESS.md` after checks complete.
