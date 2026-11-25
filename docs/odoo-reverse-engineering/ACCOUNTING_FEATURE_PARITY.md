# Odoo 20 Accounting — Feature Parity Audit & Implementation Plan

> Audited against official Odoo 20 Accounting documentation (`odoo.com/app/accounting-features`, `odoo.com/documentation/20.0/applications/finance/accounting.html`) and pinned `odoo-reference/addons/account*` modules (16 modules).

## Feature Parity Matrix

| Odoo 20 Accounting Feature | Reference Module / Doc | AfriCore Status | Implementation |
| --- | --- | --- | --- |
| Double-Entry GL & Journals | `account` | Shipped | `src/erp/accounting.ts`, `accounting-schema.ts` |
| Chart of Accounts & CSV Opening Balances | `account` | Shipped | `src/erp/accounting-opening.ts`, `python/.../opening.py` |
| Tax Engine, Fiscal Positions & Cash Rounding | `account`, `account_tax_python` | Shipped | `src/erp/accounting-tax.ts`, `python/.../tax.py` |
| Bank Sync & Smart Reconciliation Models | `account` | Shipped | `python/.../bank.py` |
| Fixed Assets & Depreciation Schedules | `account_asset` | Shipped | `python/.../assets.py` |
| Deferred Revenue & Deferred Expenses | `account_accountant` | Shipped | `python/.../deferrals.py` |
| Fiscal Years, Lock Dates & Period Close | `account_accountant` | Shipped | `src/erp/accounting-close.ts` |
| Financial Statements (P&L, BS, TB, GL, Aging) | `account_reports` | Shipped | `src/erp/accounting-statements.ts`, `python/.../statements.py` |
| **Classified Cash Flow Statement** | `account_reports` | **Added in App #2** | `python/.../accounting_parity.py` (`cash_flow_statement`) + `GET /accounting/cash-flow` |
| **Multi-Currency FX Revaluation** | `account_reports` | **Added in App #2** | `python/.../accounting_parity.py` (`fx_revaluation`) + `POST /accounting/fx-revaluation` |
| **Analytic Accounting & Budgets vs Actual** | `analytic`, `account_budget` | **Added in App #2** | `python/.../accounting_parity.py` (`budget_variance`) + `/accounting/analytic-accounts`, `/accounting/budgets` |
| **Automated Follow-up / Dunning Levels** | `account_followup` | **Added in App #2** | `python/.../accounting_parity.py` (`followup_evaluate`) + `/accounting/followup-levels`, `/accounting/followups/evaluate` |
| **Batch Payments & Remittance Export** | `account_batch_payment` | **Added in App #2** | `python/.../accounting_parity.py` (`batch_payment_summary`) + `/accounting/batch-payments` |
| **Debit Notes** | `account_debit_note` | **Added in App #2** | `POST /accounting/debit-notes`, `GET /accounting/debit-notes` |

## Architecture
- **Python Engine**: `python/africore_accounting/accounting_parity.py` — pure integer minor units, basis points (`bps`), and micro-scaled FX rates (`1_000_000 = 1.000000`).
- **TypeScript Persistence & API**: `src/erp/accounting-parity.ts` — encrypted zero-migration storage in `ac_erp_objects` (`analytic_account`, `analytic_budget`, `followup_level`, `batch_payment`, `debit_note`, `fx_revaluation_run`).
- **React UI**: `website/src/apps/AccountingParityPanel.tsx` mounted in the Accounting workspace with minimalist single-accent `#166534` Odoo styling.
