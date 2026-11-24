# Functionality gaps

This is a prioritized first pass, not a feature-level parity audit. See the JSON source index and existing docs/APP_EXPANSION_CLOSURE.md, docs/PHASE3_ACCEPTANCE.md, docs/CALENDAR_IMPLEMENTATION.md and docs/WEBSITE_IMPLEMENTATION.md for current AfriCore evidence.

## First checkpoint

- Source inventory generated with static AST parsing; REA Odoo import is unavailable on this Windows host.
- Single-rate integer tax calculation now runs in Python from the existing AfriCore tax preview route; it does not claim Odoo tax parity.
- Still open: Linux/macOS REA source import, complete selected-module call and data flow, live Odoo UI and screenshots, and Docker qualification. Disposable PostgreSQL verification passed.

## Priority matrix

| App/workflow | Odoo modules to trace | AfriCore evidence | Gap | Method | Status |
|---|---|---|---|---|---|
| Accounting: bank statements and reconciliation | Community account, with move lines and the bank statement views in the same addon | src/erp/bank-reconciliation.ts, src/erp/bank-python.ts, python/africore_accounting/bank.py | CSV and posted-line reconciliation integrated. Unallocated payments, suspense posting, FX and cross-statement continuity remain open | Python parsing and matching, TypeScript journal/API | Checkpoint 3 |
| Accounting: assets, depreciation, deferrals, close | account, account_asset if present, account_reports if present | Accounting periods/entries/approvals | Source-linked asset schedules and reviewed posting workflow remain | Python compatibility where pure; TS owns books | Gap |
| Inventory: transfer, replenishment, lots, forecasting | stock, stock_account, stock_barcode, purchase_stock, sale_stock | src/inventory/service.ts | Transfers, serial/lot, multiwarehouse and valuation boundaries need source-level workflow mapping | preserve canonical TS stock movements | Gap |
| POS/Commerce | point_of_sale, stock, account, payment | POS registers and settlement; Commerce catalog | session lifecycle, returns, cash close, offline and hardware integration | native TS with provider boundaries | Gap |
| People/Work | hr, hr_holidays, hr_recruitment, project, hr_timesheet, planning | People, Calendar and Work services | payroll localization, Gantt/resource planning and full profiles remain | native TS; reviewed localized rules | Gap |
| Documents, Analytics, Automations | documents, mail, base_automation, reporting modules | encrypted document authority, analytics and safe worker | full request/version/share, pivot builder, branching/retries and schedule parity | keep existing authorities | Gap |
| Calendar/Website | calendar, website, website_sale | docs/PHASE3_ACCEPTANCE.md | public booking, website workflows, matched Odoo screens and hosted readiness remain partial | existing AfriCore services | Partial |
| Apps 17–26 | see 26-group map in SOURCE_MAPPING.md | app catalog and closure docs | implement in requested batches after shared services | decide per feature | Not started |

No application-level accepted status is implied by this table.
