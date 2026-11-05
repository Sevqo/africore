# Wave 2 architecture and acceptance

The master implementation program is authoritative. Wave1 qualification precedes application implementation. New apps extend the existing repository, Neon identities, current memberships, service entitlements, canonical customers/products/orders/invoices/payments, durable events/approvals and encrypted custody. No replacement auth, copied invoice system, external funds, paid storage or production Neon branch change is part of this work.

## Shared persistence and access

Use an additive ERP migration with scoped encrypted operational objects, explicit per-resource participant grants, normalized accounting accounts/periods/journals/posted lines and durable source-posting uniqueness. Every reader resolves current membership, workspace kind, service entitlement and domain permission. Filtering happens before pagination/counting. Work project access never grants personnel-document or compensation access. Employees are records, not platform identities. Private documents default to their owner/explicit participants; company visibility is an explicit choice. Context-bound existing AEAD keys encrypt confidential object/file payloads. Retained versions and financial history are append-only through services.

## Work

Projects own scoped members, stages and board order. Tasks reference canonical customers/orders and shared documents, retain versioned assignments/due dates/labels/checklists/subtasks/dependencies and completion events. Atomic expected-version reordering prevents last-writer overwrite. Persisted comments/replies/mentions and notifications are participant-scoped. Calendar/timeline/workload derive actual dates and current task state. Sales-to-project creation requires a reviewed template/policy; no automatic billing or project finance entitlement is invented.

## Accounting

Use normalized double-entry posting, explicit currency and safe integer minor units. Every posted entry balances by currency; posted lines cannot be edited. Reversal appends an opposite entry in an open period. Account types drive separate trial balance, general ledger, balance sheet and profit/loss views. No statement combines currencies by guessing FX. Canonical issued invoices, credits, effective payment allocations and recognized expenses feed explicit configured posting rules, each with one durable source identity. Supplier bills use Procurement's authoritative bill, not a second invoice store. An explicit start date and opening-balance policy prevent duplicate historical receivables. Period locks are checked inside the same transaction as posting. Stock valuation stays disabled until a costing method and source qualification are implemented; reference cost is not valuation. No fabricated cash-flow statement, statutory deduction or tax certification.

## People

Separate employee/department/reporting records from login memberships. HR grants and current managerial/self-service rules control every read/update. Leave uses configured types/calendar/allowance and append-only entitlement/use records; requests cannot approve themselves or overdraw available leave. Attendance stores real check-in/out events and corrections with audit. Onboarding reuses Work/Documents/Approvals. Payroll remains a clearly limited integration boundary unless current statutory rules are actually implemented and tested.

## Procurement

Reuse canonical contacts as suppliers. Purchase requests, supplier RFQs, reviewed orders, partial receipts/inspection/rejections and bills use versioned exact quantities. Goods receipt posts only accepted physical quantities through Inventory; it does not approve or pay a bill. Matching compares order, accepted receipts and supplier bill; discrepancies need explicit review. Replenishment creates a request suggestion requiring approval, not an automatic order or payment. Bill posting and accounting source identity are atomic/idempotent.

## Documents and Business ID

Reuse private encrypted evidence storage with validated filenames/MIME/signature/size and per-download authorization. Metadata, immutable versions, folders, tags, references, sharing expiry, recoverable trash and requests/reviews live in scoped records. Personnel attachments require both document access and People authority. No permanent public object URLs or fake malware scan/physical erasure claim. Business ID is an app over existing Passport/evidence/reviews/credentials/relationships/disclosure; self-reported claims remain distinct from recognized issuer/provider evidence.

## Research

Official Odoo20Accounting describes opposite debit/credit entries and canonical business document integration: https://www.odoo.com/documentation/20.0/applications/finance/accounting.html . Its Project documentation describes stages and task dependencies: https://www.odoo.com/documentation/20.0/applications/services/project/project_management.html and https://www.odoo.com/documentation/20.0/applications/services/project/tasks/task_dependencies.html . AfriCore keeps explicit membership/participant authorization rather than treating knowledge of a task URL as permission. KRA's official eTIMS portal documents integration and sandbox qualification: https://etims.kra.go.ke/main/signup/indexLearnMore . AfriCore is not represented as an approved integrator. No proprietary code/artwork is copied.

## Acceptance

Local SQLite and fresh PostgreSQL suites must cover tenancy/environment/role/participant denial, HR and personnel-file redaction, task reorder conflicts/dependencies, leave double approval/overdraw, partial receipt concurrency, supplier bill matching, balanced posting/partial allocations/credits/locks/reversals/source replay, and the complete CRM-to-Sales-to-Inventory-to-Procurement-to-Work-to-Finance-to-Accounting workflow. Browser QA covers real CRUD/actions, desktop/mobile geometry and keyboard alternatives. No hosted ordinary tests or synthetic provider qualification. Apply any additive migration only after guarded encrypted backup/readback on approved development; then CI and backend-before-frontend deployment. Report actual outcomes and remaining external readiness limits.
