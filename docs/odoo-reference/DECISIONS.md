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
