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

_No decisions recorded yet._

## Rejected

Ideas considered and turned down, with the reason. Keeping these prevents a
future session from re-litigating a settled question.

_None yet._
