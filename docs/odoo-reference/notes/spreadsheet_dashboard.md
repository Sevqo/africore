# Odoo Spreadsheet Dashboard — focused source review

Reviewed 2026-11-16 against Odoo Community 20.0 commit `1f622740a0688c940c9ed6ab40a4a174326a345d`.

## Question

How are dashboards, graph/pivot analysis and saved global filters structured in the Community source, and which ideas fit AfriCore's existing Analytics service and security model?

## Source observations

- `odoo-reference/addons/spreadsheet_dashboard/__manifest__.py` declares a Community module depending on `spreadsheet`; it is an installed dashboard application, separate from the lower-level spreadsheet module.
- `odoo-reference/addons/spreadsheet_dashboard/models/spreadsheet_dashboard.py` stores dashboard spreadsheet data plus required name/group, order, publication, company/group access, allowed users and per-user favorites. Read-only dashboard serialization supplies user locale and company currency.
- `odoo-reference/addons/spreadsheet_dashboard/models/spreadsheet_dashboard_group.py` provides ordered dashboard sections.
- `odoo-reference/addons/spreadsheet_dashboard/models/spreadsheet_dashboard_favorite_filters.py` persists named, dashboard-scoped global filter values, optional user audiences and a default flag.
- `odoo-reference/addons/spreadsheet_dashboard/static/src/bundle/dashboard_action/dashboard_search_model.js` applies global filter values to the spreadsheet model, exposes active values as search facets and persists favorite filter records through the ORM.
- `odoo-reference/addons/web/static/src/views/graph/graph_model.js` combines the active search domain with an explicit measure, graph mode and group-by metadata; request sequencing prevents stale aggregate responses from replacing newer state.
- `odoo-reference/addons/web/static/src/views/pivot/pivot_model.js` models a two-axis aggregate table with expandable row/column groupings and totals. The axes represent dimensions, not arbitrary SQL.

## AfriCore implications

These are behavior observations, not a request to copy Odoo implementation or assets. AfriCore reimplements compatible ideas in React/TypeScript and its existing Express/SQL adapter: registry-defined measure/dimension compatibility, server-side aggregate endpoints, explicit source/date/status/currency filters, owner/admin dashboard editing, and actor-scoped saved report configurations. AfriCore does not expose Odoo-style public dashboard links or every spreadsheet interaction because no equivalent approved sharing/authoring service exists.

The Odoo screenshot shell differs from AfriCore's global application shell, product identity and design tokens. The implementation uses the supplied composition as the target for its dashboard sidebar, toolbar, scorecards, chart/report panels and builder, while preserving AfriCore navigation and service boundaries. This source review did not launch Odoo or compare the running AfriCore screen against the screenshots.

### 2026-11-19 implementation follow-up

The Analytics registry now includes aggregate Automation rule and run measures over the canonical AfriCore automation records. As with the source observations above, measure and dimension choices remain explicit and server-owned; no dashboard spreadsheet runtime or arbitrary query surface was added. See `src/operations/business-analytics.ts` and the combined expansion note in `docs/PHASE2_APP_PROGRESS.md`.

## Limits

This was a narrow read of dashboard persistence, global-filter state, graph and pivot models; it was not an exhaustive Odoo permission or spreadsheet-runtime audit. The Odoo repository remained read-only.
