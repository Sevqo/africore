# AfriCore — Master Odoo 20 Reverse-Engineering Reference & Phased Build Blueprint

**Pinned Odoo Reference:** Odoo 20.0 Community (`4968b8772ab96e25471ebbcdcbe32f6049e5b728`, read-only sibling checkout `../odoo-reference`)  
**Analysis Tooling:** REA MCP (`inspect_python_pyc` compiled-artifact analysis) + Static AST Indexer (`scripts/odoo-reverse-engineering-index.py`, `odoo20-community-index.json`)  
**Licensing Boundary:** Odoo Community is LGPL-3.0. This document records architectural observations, domain workflows, and AfriCore re-implementation blueprints. Never copy Odoo source verbatim into AfriCore; re-implement concepts cleanly in AfriCore's own stack.

---

## 1. Complete Odoo 20 Community Architecture (Verified Inventory)

From `odoo20-community-index.json` across the pinned Odoo 20 Community tree:

| Metric | Verified Count |
|---|---|
| Total Addons (Modules) | **668** (34 top-level applications) |
| Dependency Graph Edges | **1,393** (100% resolved within tree) |
| Python Source Files | **9,395** |
| XML View / Data / Security Files | **6,144** |
| ORM Models (`models.Model` / `TransientModel` / `AbstractModel`) | **4,247** |
| Access Control Rows (`ir.model.access.csv`) | **2,584** |
| HTTP / JSON-RPC Controllers | **543** |
| Interactive Wizards (`TransientModel`) | **609** |
| Report Definitions | **308** |
| Automated Test Files | **5,887** |

### Core Layers of Odoo 20
1. **ORM & Persistence (`odoo/orm/`)**: Python 3 metaclass ORM (`models.py`, `fields.py`, `domains.py`, `environments.py`, `cache.py`, `query.py`, `registry.py`) backed exclusively by **PostgreSQL**. Every business entity inherits `BaseModel` with declarative fields, `@api.depends` computed fields, `@api.constrains` invariants, `_sql_constraints`, and multi-company scoping (`company_id`).
2. **HTTP & RPC Layer (`odoo/http/`)**: WSGI server exposing REST/JSON-RPC endpoints (`/web/dataset/call_kw`, `/web/action/load`, `/web/session/*`) and QWeb website routes.
3. **Web Client (`addons/web/static/src/`)**: Built in **JavaScript (ES modules) + OWL 2** (Odoo Web Library, a lightweight reactive component framework) + SCSS/Bootstrap.
   - **Views (`views/`)**: `list`, `form`, `kanban`, `calendar`, `graph`, `pivot`, `card`, `view_button`, `view_dialogs`, `widgets`.
   - **Shell (`webclient/`)**: `navbar`, `menus`, `actions` (ActionManager), `switch_company_menu`, `user_menu`, `offline_systray`, `settings_form_view`, `loading_indicator`.
4. **Cross-Cutting Platform Services**:
   - **Chatter & Activities (`mail`)**: Unified audit trail, internal notes, followers, and scheduled activities attached to any business document (`mail.thread`, `mail.activity.mixin`).
   - **Security (`base`)**: Group-based ACLs (`ir.model.access.csv`) + row-level record rules (`ir.rule`).
   - **Reporting (`base`, `account`, `web`)**: QWeb HTML→PDF reports, CSV/XLSX exports, and Enterprise-only dynamic SQL financial reports (`account_reports`).

---

## 2. REA Compiled-Artifact Evidence Registry

All inspections performed via REA MCP `inspect_python_pyc` on scratch-compiled `.pyc` artifacts from the pinned Odoo 20 Community checkout:

| Layer / App | Odoo 20 Source File | Key Symbols Verified | REA Evidence ID |
|---|---|---|---|
| **Core ORM** | `odoo/orm/models.py` | `BaseModel`, `create`, `write`, `unlink`, `search` (506 code objects) | `ev_9b56fb376011ac0ec77e883ff7e69b82edf755c58a85fd332fb387b74bbde872` |
| **Accounting — Locks & FY** | `addons/account/models/company.py` | `ResCompany`, `_get_lock_date_violations`, `_get_violated_lock_dates`, `compute_fiscalyear_dates` | `ev_0c439256a1b4cd17b6a32cb55f575d765b3d235c41275368c2b4b0fa08c21778` |
| **Accounting — Lock Exceptions** | `addons/account/models/account_lock_exception.py` | `AccountLock_Exception`, `_compute_state`, `action_revoke`, `_get_active_exceptions_domain` | `ev_d1cb44db7221eedf46cfa25ea045c946420ab4b679e217e9f621260d833fd055` |
| **Accounting — Move Lines** | `addons/account/models/account_move_line.py` | `AccountMoveLine`, `_compute_balance` | `ev_84e9e63fb877374ab21792663c67781a9fc73fa5b622f60d03db4e264fffa57b` |
| **Accounting — Accounts** | `addons/account/models/account_account.py` | `AccountAccount`, company checks, `account_type` | `ev_79fa8fae5c4607e1ed95d1dcde75ab29df49ea05312cc5d01c71c9585464450a` |
| **Accounting — Bank Rec** | `addons/account/models/account_bank_statement_line.py` | Matching domain, residuals, undo | `ev_a2c2c33195009e9565d4c7a1535641e1a9f3b5d945c7c7401085911ce299d489` |
| **Accounting — Cash Rounding** | `addons/account/models/account_cash_rounding.py` | `AccountCashRounding`, `validate_rounding` | `ev_df2951d884e2af89426d2ce0f1595cb9e783ff6e4de9eb146624d560aa09682b` |
| **Inventory (Stock)** | `addons/stock/models/stock_move.py` | `StockMove`, `_action_confirm`, `_action_assign`, `_action_done`, `_action_cancel` (257 code objects) | `ev_3f2890f098f375e6d2fb45cf7c89f8afa40fa1f8b59a4a6561538950c4abd4d2` |
| **Sales** | `addons/sale/models/sale_order.py` | `SaleOrder`, `action_confirm`, `action_cancel`, `_create_invoices` (231 code objects) | `ev_c6853dd91d3bf022edc07aeb96613b990e57673e73ae43e3f2fe0c0bdf34078b` |
| **Procurement** | `addons/purchase/models/purchase_order.py` | `PurchaseOrder`, `button_confirm`, `button_cancel`, `action_create_invoice` (152 code objects) | `ev_fd463826b2b09c4190749cf86efb2d97e20b8a114c6ac1135f3923fbcf33a956` |
| **Point of Sale** | `addons/point_of_sale/models/pos_session.py` | `PosSession` (97 code objects) | `ev_fad6c58334fe930c4a74068d625f7c2f4e1da8e2e8810c9b353a7d2d101873f9` |
| **CRM** | `addons/crm/models/crm_lead.py` | `CrmLead`, `action_set_won`, `action_set_lost`, `convert_opportunity` (178 code objects) | `ev_cb02e471108ec781fb367fd33555d5fb06e007c2ccb9bb9a9196c1d72233a2d5` |
| **Work (Projects)** | `addons/project/models/project_task.py` | `ProjectTask`, `_compute_state`, `action_dependent_tasks` (200 code objects) | `ev_0a1d5df7c0c9e25311c1f75ce33d28b0980afeb262cf8b065c04016304df9d2d` |
| **People (HR)** | `addons/hr/models/hr_employee.py` | `HrEmployee`, `_compute_work_contact_details`, `action_archive` (209 code objects) | `ev_0680d91566808e486e638a0345dcf03a73a69e28973f372e85301cf22f485d21` |
| **POS Orders** | `addons/point_of_sale/models/pos_order.py` | `PosOrder`, `action_pos_order_paid`, `refund` | `ev_8f80f8d6079019256e11fb954538cb4457767b27b286f805f3a9719101b83146` |
| **Work Milestones** | `addons/project/models/project_milestone.py` | `ProjectMilestone`, `_compute_can_be_marked_as_done` | `ev_b909f92c8b73efe6208862d2e24094a3e36d4fd29fcf370b42cd4e055e8eb89d` |
| **People Leave** | `addons/hr_holidays/models/hr_leave.py` | `HrLeave`, `action_approve`, `action_refuse` | `ev_191619a2c20a7ed8181d123cbeca2c425cd6f5dae12fc86f4bdc5691f386b6cc` |
| **Manufacturing BOM** | `addons/mrp/models/mrp_bom.py` | `MrpBom`, `explode` | `ev_874556d11349995761e22c0d192d524fd88e177961325658177c0ec2a8d6f709` |
| **Manufacturing Order** | `addons/mrp/models/mrp_production.py` | `MrpProduction`, `action_confirm`, `button_mark_done` | `ev_638bca2c48005cbdcc2433a8de0b15e01f8d798d9db167286798e3135a77fd92` |
| **Maintenance** | `addons/maintenance/models/maintenance.py` | `MaintenanceEquipment`, `MaintenanceRequest` | `ev_d9efedebec059a70187701793cbd6eb29549ddd7c13b739f4304e76cbf3c0cfb` |
| **Fleet** | `addons/fleet/models/fleet_vehicle.py` | `FleetVehicle` | `ev_ebdd6bda6456ed14eee135ada8e76761c84420103b89975d537f60da10b5e8da` |

---

## 3. Best-Language-Per-Layer Architecture for AfriCore

Rather than blindly copying Odoo's monolithic Python runtime, AfriCore uses the **best language for each architectural boundary**:

| Layer | Best Language & Stack | Why It Beats a Monolith |
|---|---|---|
| **Canonical API, Auth, Tenant Isolation, Approvals, Ledger & Persistence** | **TypeScript (Node.js + Express + Zod + PostgreSQL / SQLite)** | Strict compile-time contracts, shared types with frontend, fast async I/O, durable scoped idempotency, encrypted ERP storage, and zero ORM magic leaks. |
| **Pure Financial, Quantitative & Domain Calculation Engines** | **Python 3 (Standard Library / Exact `int` & `Fraction` / `Decimal`)** | Ideal for deterministic math without IEEE-754 float drift: tax & cash rounding (`tax.py`), bank CSV parsing & candidate scoring (`bank.py`), depreciation boards (`assets.py`), deferral recognition (`deferrals.py`), opening balance validation (`opening.py`), statement reconciliation (`statements.py`), and upcoming Inventory FIFO/AVCO valuation, MRP BOM explosion, and localized payroll engines. Invoked in bounded single-batch subprocesses — never one process per row. |
| **Interactive Application UI** | **React 19 + TypeScript + Vite + Semantic CSS Tokens** | Superior component ecosystem, strict typing, code-split lazy bundles, instant hot reload, and full responsive/accessibility control. |
| **Database Layer** | **PostgreSQL 17 (Production/Neon) + SQLite (Local/Disposable Tests)** | Full ACID transactions, SQL window functions, advisory/operation locks, and fast zero-dependency local testing. |

---

## 4. UI/UX Design Blueprint: Odoo Ergonomics + Unique AfriCore Identity

AfriCore adopts **Odoo's proven operational ergonomics** (so users get instant ERP muscle memory) while maintaining **AfriCore's unmistakable visual identity** (never looking like a purple Odoo clone):

| Odoo UI Pattern | Operational Function to Preserve | AfriCore Unique Visual & UX Expression |
|---|---|---|
| **Top App Navbar** | App icon + module menus (`Dashboard`, `Customers`, `Vendors`, `Accounting`, `Review`, `Reporting`, `Configuration`) | AfriCore's clean white/sage header with deep forest-green (`#183c2e` / `#397e0a`) active indicators, compact 8px radius geometry, and workspace/environment pill (`Sandbox` vs `Production`). |
| **Control Panel** | Breadcrumbs + `New` primary button + Search/Filter/GroupBy + View Switcher (`List`, `Kanban`, `Calendar`, `Pivot`, `Graph`) | Sticky compact toolbar using AfriCore `DM Sans` typography, crisp 1px `#dbe2dc` hairlines, and server-side filter-before-pagination. |
| **Form Sheet + Header** | Left: primary workflow buttons (`Confirm`, `Post`, `Approve`, `Cancel`); Right: horizontal **Statusbar Pipeline** (`Draft → Review → Posted`) | AfriCore elevated paper card with explicit **Separate-Reviewer Approval** badges and **Evidence Provenance** tags (e.g., `Posted`, `Bank-Verified`, `Manual Draft`). |
| **Smart Buttons (Stat Boxes)** | Top-right of form sheet showing linked record counts (`3 Invoices`, `2 Deliveries`, `12 Entries`) with 1-click drilldown | Clean bordered stat tiles with `Space Mono` tabular counters (`font-variant-numeric: tabular-nums`). |
| **Notebook Tabs & Inline Tables** | Tabbed lower sheet (`Order Lines`, `Journal Items`, `Board`, `Other Info`) with dense operational tables | Right-aligned tabular numerals, muted-red negative values (`#b42318`), sticky headers, and horizontal scroll wrappers for zero mobile overflow. |
| **Chatter / Audit History** | Right-hand or collapsible timeline of state changes, approvals, and actor timestamps | Immutable AfriCore `ac_erp_history` + audit log drawer showing actor, version, reason, and cryptographic/approval binding status. |

### Paper.design MCP Workflow
When **Paper.design MCP** is connected (via Paper Desktop or `https://mcp.paper.design`), every new phase begins by:
1. Sketching the phase's key screens (List, Form + Statusbar, Smart Buttons, Report) on the Paper canvas using AfriCore's semantic color/type tokens (`dashboard/shared/theme.css`).
2. Reviewing button hierarchy, density, and mobile stacking against the Odoo reference workflow while keeping AfriCore's distinct brand language.
3. Implementing directly into `website/src/apps/` and verifying via desktop/mobile browser captures.

---

## 5. Complete 23-Group App Map (668 Odoo Addons → AfriCore)

| AfriCore App Group | Odoo Addons | Current AfriCore Status | Target Phase |
|---|---|---|---|
| **Accounting** | 253 (`account`, localizations, EDI, tax) | **Checkpoints 1–6 Complete** (Tax/Rounding, Bank Rec, Fixed Assets, Deferrals, Fiscal Years, Period Close, Lock Dates, Opening Balances, 8 Financial Statements) | Phase 0 (Done) + Cash Flow/FX follow-up |
| **Inventory** | 18 (`stock`, `stock_account`, `stock_landed_costs`, `product_expiry`) | **Phase 1 Complete** (FEFO Lots/Serials, Expiry & Quarantine, Scrap Orders, Python FIFO/AVCO/Standard Valuation Engine, Landed Costs) | Phase 1 (Done) |
| **Sales** | 27 (`sale`, `sale_management`, `sale_stock`, `sale_margin`, `loyalty`) | **Phase 2 Complete** (Quotations, Price Lists, Templates, Python Margin Analysis, Down Payments with Over-Invoice Guard, Optional Upsells) | Phase 2 (Done) |
| **Procurement** | 10 (`purchase`, `purchase_stock`, `purchase_requisition`) | **Phase 3 Complete** (RFQs, POs, Bills, Python 3-Way Matching with Separate-Manager Override, Blanket Orders, Call-for-Tenders Bid Ranking) | Phase 3 (Done) |
| **POS** | 54 (`point_of_sale`, `pos_sale`, `pos_loyalty`) | **Phase 4 Complete** (Sessions, Orders, Python Cash Drawer Count & Variance, Loyalty Programs & Earn/Redeem Calculator) | Phase 4 (Done) |
| **CRM** | 10 (`crm`, `sale_crm`, `crm_iap_enrich`) | **Phase 5 Complete** (Pipeline, Forecast, Python Predictive Lead Scoring & Weighted Forecast, Scheduled Activities) | Phase 5 (Done) |
| **Work (Projects)** | 11 (`project`, `hr_timesheet`, `sale_timesheet`) | **Phase 6 Complete** (Projects, Tasks, Milestones, Python Billable Timesheet & Budget Burn Engine) | Phase 6 (Done) |
| **People (HR)** | 21 (`hr`, `hr_holidays`, `hr_attendance`, `hr_recruitment`, `hr_skills`) | **Phase 7 Complete** (Profiles, Leave Allocations, Attendance, Python Progressive-Bracket Payroll Runs with Separate-Manager Approval) | Phase 7 (Done) |
| **Commerce** | 25 (`payment_*`, storefront) | Core Commerce + Phase 8 Suite Integration | Phase 8 (Done) |
| **Website** | 62 (`website`, `website_sale`, `website_blog`, `website_crm`) | Core Website + Phase 8 Suite Integration | Phase 8 (Done) |
| **Subscriptions** | 1 (`mysubscription`) | **Phase 8 Complete** (Recurring Plans, Contracts, Python Actual-Days Proration & MRR/ARR Report) | Phase 8 (Done) |
| **Calendar** | 6 (`calendar`, `google_calendar`, `hr_calendar`) | Core Calendar + Phase 9 Suite Integration | Phase 9 (Done) |
| **Documents** | 2 (`documents` patterns) | Core Documents + Phase 9 Suite Integration | Phase 9 (Done) |
| **Analytics** | 3 (`spreadsheet`, `spreadsheet_dashboard`) | Core Analytics + Phase 9 Suite Integration | Phase 9 (Done) |
| **Automations** | 2 (`base_automation`) | Core Automations + Phase 9 Suite Integration | Phase 9 (Done) |
| **Support** | 6 (`im_livechat`, `portal_rating`) | **Phase 9 Complete** (Helpdesk Tickets, SLA Tracking, Ratings & SLA Compliance Report) | Phase 9 (Done) |
| **Marketing** | 26 (`mass_mailing`, `event_*`, `sms`) | **Phase 9 Complete** (Multi-channel Campaigns, Audience Segments & Delivery/Click Tracking) | Phase 9 (Done) |
| **Manufacturing** | 18 (`mrp`, `mrp_account`, `mrp_subcontracting`) | **Phase 10 Complete** (Bills of Materials, Python BOM Explosion + Scrap & Labor Cost Rollup, Manufacturing Orders) | Phase 10 (Done) |
| **Field Operations** | 11 (`fleet`, `maintenance`, `repair`) | **Phase 10 Complete** (Preventive/Corrective Maintenance Requests, Fleet Vehicle Registry & Odometer/Service Tracking) | Phase 10 (Done) |
| **Logistics** | 5 (`delivery`, `stock_dropshipping`) | **Phase 10 Complete** (Carrier Shipments, Tracking Lifecycle & Freight Cost Records) | Phase 10 (Done) |
| **Knowledge & Learning** | 5 (`survey`, `hr_skills_slides`) | Ready for custom expansion after design pass | Post-Phase 10 |
| **Integrations Hub / Shared** | 92 (`base`, `web`, `mail`, `iap`, `api_doc`) | Ongoing core platform | Cross-cutting |

---

## 6. Master Phased Implementation Plan

Each phase follows the proven **AfriCore Source-Driven Checkpoint Protocol**:
1. **REA & Source Trace**: Inspect target Odoo 20 models/views/tests + record REA evidence IDs.
2. **Design (PaperMCP / AfriCore Design System)**: Align operational layout, buttons, statusbar, and mobile responsiveness.
3. **Python Domain Engine (where quantitative)**: Exact integer/rational math in `python/africore_<domain>/` with unit tests.
4. **Canonical TypeScript API + DB**: Additive migrations (if needed), strict tenant/RBAC/idempotency/lock checks, OpenAPI contract validation.
5. **React Operational UI**: Full working controls (zero decorative buttons), drilldowns, CSV export, print support.
6. **Verification Gate**: Python unit tests + SQLite + Disposable PostgreSQL 17 + Typecheck + Lint + Website Build + Authenticated Browser Walkthrough.

### Phase 0 — Accounting Core Expansion (Completed)
- **Checkpoints 1–6**: Single-rate tax & cash rounding (`tax.py`), Bank statement import & reconciliation (`bank.py`), Fixed Assets & Depreciation (`assets.py`), Deferred Expenses & Revenue (`deferrals.py`), Fiscal Years, Period Closing Checklist, Cross-App Lock Dates, CSV Opening Balances (`opening.py`), and 8 Financial Statements (`statements.py`).

### Phase 1 — Inventory, Warehouses & Stock Valuation (Next)
- **Odoo Source Focus**: `stock/models/stock_move.py`, `stock_picking.py`, `stock_quant.py`, `stock_lot.py`, `stock_warehouse.py`, `stock_account/models/stock_valuation_layer.py`.
- **Deliverables**:
  - Multi-warehouse & double-entry location hierarchy (Internal, Vendor, Customer, Inventory Loss, Scrap).
  - Full Picking lifecycle (`Draft → Waiting → Ready → Done / Cancelled`) for Receipts, Internal Transfers, Delivery Orders, and Returns.
  - Lot / Serial number tracking and expiry dates (`stock_lot`).
  - **Python Stock Valuation Engine (`python/africore_inventory/valuation.py`)**: Exact integer-minor-unit FIFO, AVCO (Weighted Average), and Standard Cost valuation layers + Landed Cost allocation.
  - Automatic reviewed Accounting journal handoffs (Inventory Valuation ↔ Stock Interim Received/Delivered ↔ COGS) enforcing Checkpoint 6 period & lock dates.
  - Inventory Adjustment / Cycle Count workflow and Reordering Rules (Min/Max replenishment).

### Phase 2 — Sales, Pricelists & Order-to-Cash
- **Odoo Source Focus**: `sale/models/sale_order.py`, `sale_order_line.py`, `product_pricelist.py`, `sale_stock`.
- **Deliverables**:
  - Pricelists (tiered quantity breaks, date validity, multi-currency rules) computed in Python/TS.
  - Full Quotation → Sales Order lifecycle with optional products, sections/notes, customer portal preview, down payments, and partial/full delivery & invoicing policies.
  - Smart buttons linking Sales Orders ↔ Deliveries (Phase 1) ↔ Invoices & Payments ↔ Accounting Journals.
  - Sales margin & pipeline-to-cash reporting.

### Phase 3 — Procurement, Vendor Agreements & 3-Way Matching
- **Odoo Source Focus**: `purchase/models/purchase_order.py`, `purchase_stock`, `purchase_requisition`.
- **Deliverables**:
  - RFQ → Purchase Order lifecycle, vendor pricelists, blanket orders, and call-for-tenders comparison.
  - Strict **3-Way Matching** (PO Quantity vs. Warehouse Receipt vs. Vendor Bill) with discrepancy holds and approval workflow.
  - Landed-cost handoff into Phase 1 Stock Valuation and Vendor Bill handoff into Accounting (enforcing Purchase lock dates).

### Phase 4 — Point of Sale (POS) & Retail Sessions
- **Odoo Source Focus**: `point_of_sale/models/pos_session.py`, `pos_order.py`, `pos_payment.py`.
- **Deliverables**:
  - Full Register Session lifecycle (`Opening Control → Selling → Cash In/Out → Closing Count & Variance → Posted Session Journal`).
  - Split payment tenders (Cash, Mobile Money evidence, Card), returns/refunds, discounts, and receipt printing.
  - Resilient offline-queued POS cart with idempotent sync and automatic stock deduction (Phase 1) + Accounting session closing entry.

### Phase 5 — CRM, Activities & Sales Forecasting
- **Odoo Source Focus**: `crm/models/crm_lead.py`, `crm_stage.py`, `crm_lost_reason.py`, `sale_crm`.
- **Deliverables**:
  - Interactive Kanban pipeline with drag-to-stage, weighted expected revenue, automated probability scoring, and lost-reason tracking.
  - Unified Activity scheduler (Calls, Meetings, To-Dos) linked to Calendar, 1-click Lead → Opportunity → Quotation conversion (Phase 2).

### Phase 6 — Work (Projects, Tasks, Dependencies & Timesheets)
- **Odoo Source Focus**: `project/models/project_task.py`, `hr_timesheet`, `sale_timesheet`.
- **Deliverables**:
  - Project & Task views (Kanban, List, Calendar, Timeline/Gantt), blocking task dependencies, milestones, and recurring tasks.
  - Timesheet logging linked to tasks and billable Sales Order lines (without inventing payroll).

### Phase 7 — People (HR, Leave, Attendance & Localized Payroll Engine)
- **Odoo Source Focus**: `hr/models/hr_employee.py`, `hr_holidays`, `hr_attendance`, `hr_recruitment`.
- **Deliverables**:
  - Complete Employee directory, org hierarchy, contracts, skills/resume, Leave allocation/accrual calendar, Attendance check-in/out, and Recruitment Kanban pipeline.
  - **Python Payroll & Statutory Engine** (opt-in, versioned tax brackets/deductions in exact integer minor units) generating reviewed Accounting payroll journals.

### Phase 8 — Commerce, Website Builder & Subscriptions
- **Odoo Source Focus**: `website`, `website_sale`, `mysubscription`.
- **Deliverables**:
  - Visual drag-and-drop Website block editor, SEO/sitemap/redirects, multi-attribute Commerce catalog & checkout linked to Phase 1 stock & Phase 2 orders.
  - Subscriptions engine: recurring plans, proration, renewals, dunning notices, and automatic deferred-revenue handoff to Accounting Checkpoint 5.

### Phase 9 — Analytics, Documents, Automations, Calendar, Support & Marketing
- **Odoo Source Focus**: `spreadsheet`, `base_automation`, `im_livechat`, `mass_mailing`, `calendar`.
- **Deliverables**:
  - Dynamic Pivot/Graph Analytics builder over canonical data; Document approval/versioning; Visual Automation rule builder; Public Calendar appointment booking; Support Helpdesk/Livechat; Email/SMS Marketing campaigns.

### Phase 10 — Manufacturing (MRP), Field Operations & Logistics
- **Odoo Source Focus**: `mrp`, `mrp_account`, `maintenance`, `fleet`, `delivery`.
- **Deliverables**:
  - Multi-level Bills of Materials (BOMs), Manufacturing Orders (consuming Phase 1 components → finished goods with Python cost rollup), Equipment Maintenance/Fleet, and Carrier/Delivery tracking.
