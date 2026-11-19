# Odoo Project and Timesheets — focused Phase 2.9B notes

Reference commit: `bd181ee5eb1f200db3c062733d4f464c37ef9e25` (`20.0`). The
read-only checkout was clean when inspected. These are source observations,
not claims about AfriCore behavior.

## Task state, milestones and dependencies

`project.task.stage_id` and `project.task.state` are separate fields. Odoo's
state vocabulary includes in-progress, changes-requested, approved, done,
cancelled and dependency-waiting. Open stage changes can reset state to
in-progress; a stage is not itself the state (`addons/project/models/project_task.py`,
`state`, `_compute_state`, `write`). The task's `milestone_id` relation is
constrained to the task's project and is cleared/recomputed when project
consistency changes (`addons/project/models/project_task.py`, `milestone_id`,
`_compute_milestone_id`, `write`).

## Recurrence

`project.task.recurrence` stores a positive interval, day/week/month/year unit
and optional end date. On terminal state, Odoo generates the next task from the
last task in that recurrence. It postpones configured date fields, resets
priority and stage, copies child tasks/checklists per its copy logic, and
resolves dependencies only after generated records exist
(`addons/project/models/project_task.py`, `_inverse_state`;
`addons/project/models/project_task_recurrence.py`,
`_create_next_occurrences`, `_create_next_occurrences_values`).

## Historical progress

The burndown report uses task stage duration tracking and derives transitions
from stored durations. The report requires date and stage grouping; it does
not infer past states from only today's task state
(`addons/project/report/project_task_burndown_chart_report.py`, `_search`,
`_validate_group_by`).

## Timesheets

Timesheets are `account.analytic.line` records related to task, project, user
and employee. Creating a task entry derives/validates the project, and the
standard write guard prevents a basic user from editing another user's line
(`addons/hr_timesheet/models/account_analytic_line.py`, `task_id`, `project_id`,
`_check_can_write`, `create`).

## AfriCore application note

AfriCore must retain its own project grants and exact actor identity. Time
entries should be private to their author except for authorized project
reviewers. A timer must be server-owned if it survives reloads. Historical
reports must disclose the first trustworthy event date. A project's Sales
relationship is not recognized revenue, and time is not a payroll or invoice
record. No source or asset was copied.

## AfriCore Phase 2.9B implementation note

The local implementation adds encrypted author-bound time entries, server-owned
idempotent timers, review transitions, project-bound milestones, explicit
recurrence generation, finish-to-start schedule preview/apply, append-only
project updates, and scoped task/time/history reports. Migration 013 is the
history cutover: it cannot reconstruct transitions from before migration.
Recurrence is not automatically scheduled; project scheduling is previewed on a
date grid; and recorded time is not linked to payroll, attendance, invoices or
capacity. The focused and full backend checks are in
`docs/PHASE2_APP_PROGRESS.md`. In the signed-in local sandbox, the calendar
rendered but Timesheets and Reporting returned “Resource not found”; the routes
still need runtime verification after the local server is refreshed. No live
time record was created for this check.
