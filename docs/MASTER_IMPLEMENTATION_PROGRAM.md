# AFRICORE — MASTER IMPLEMENTATION PROGRAM
## AUTHENTICATION RECOVERY + WAVE 1 PRODUCT MATURITY + WAVE 2 APPLICATIONS

**Project:** AfriCore  
**Primary infrastructure:** Existing Cloudflare deployment, Neon PostgreSQL, existing authentication implementation and application backend  
**Product:** Modular African business infrastructure and application platform  
**Implementation stages:** Three  
**Application scope:** Twelve business applications  
**Priority:** Restore founder login before other work  

---

# 0. EXECUTIVE INSTRUCTIONS

You are the principal engineer, product architect, database engineer, security engineer and technical implementation lead for AfriCore.

Continue developing the existing repository and deployed infrastructure.

AfriCore is intended to become a complete, interconnected business operating system for African businesses.

Our quality benchmark is:

- **Odoo 20:** Deep business applications, complete operational workflows, reliable integration, shared records, powerful business processes and collaboration.
- **Shopify:** Merchant-centered usability, straightforward onboarding, excellent navigation, approachable product management and high-quality analytics interactions.
- **AfriCore:** Independent programmable business services, AfriCore Pay, Business Passport, business verification, credentials, trust infrastructure and African market requirements.

Use these products as functional and design research references.

Do not copy proprietary source code, brand assets or protected UI artwork.

Build original AfriCore implementations.

## Mandatory execution order

### STAGE 1 — AUTHENTICATION RECOVERY AND PLATFORM STABILIZATION

Fix the broken login and account persistence before proceeding.

### STAGE 2 — WAVE 1 DEEPENING

Upgrade the existing six applications into substantive, interconnected business products.

### STAGE 3 — WAVE 2

Implement six additional applications with complete cross-app integration.

Do not skip Stage 1.

Do not silently declare a stage complete when critical workflows remain broken.

Do not replace the existing application with a new project.

Preserve existing users, organizations, workspaces, service entitlements, billing records and business data.

---

# 1. FIRST: INVESTIGATE THE EXISTING REPOSITORY

Before modifying the implementation, inspect:

- `AGENTS.md`.
- Application architecture documentation.
- Current Git state.
- Existing monorepo/workspace structure.
- Frontend framework.
- API framework.
- Authentication libraries.
- Database adapters.
- Database migrations.
- Neon project configuration.
- Cloudflare Workers and Pages configuration.
- Existing environment bindings.
- Authorization middleware.
- Service Catalog.
- App Registry.
- Usage metering.
- Cross-app event infrastructure.
- Automated tests.
- CI/CD.
- Production deployment architecture.

Identify what exists and works.

Create a concise implementation inventory covering:

1. Functional capabilities.
2. Incomplete capabilities.
3. Broken capabilities.
4. Existing shared domain models.
5. Missing models.
6. Existing integration infrastructure.
7. Migration risks.
8. Security risks.

Favor extending correct existing implementations over rebuilding them.

---

# STAGE 1 — AUTHENTICATION RECOVERY

# 2. CRITICAL PROBLEM

The founder reports:

- An account was created.
- The account is not appearing in the expected Better Auth records in Neon.
- Login no longer works.
- This currently prevents access to AfriCore.

Investigate and fix the actual root cause.

Do not assume the database is empty merely because a table or page appears empty.

Do not assume the authentication provider is configured correctly.

Do not assume the application uses managed Neon Auth.

---

# 3. DETERMINE THE REAL AUTHENTICATION ARCHITECTURE

Identify which architecture the repository actually uses:

### Option A — Managed Neon Auth

Neon-managed authentication powered by Better Auth.

### Option B — Self-hosted Better Auth

Application-managed Better Auth using PostgreSQL, Drizzle, Prisma, Kysely or another supported adapter.

### Option C — Legacy or mixed authentication

A previous authentication provider, partially migrated schema, stale SDK, custom implementation or conflicting integration.

Inspect dependencies, initialization code, SDKs, authentication routes and Neon Console configuration.

**Do not combine managed Neon Auth and self-hosted Better Auth accidentally.**

Managed Neon Auth is not a drop-in substitute for a self-hosted Better Auth server.

Retain the architecture best suited to existing accounts, plugin requirements and deployment constraints.

If an actual migration is necessary, prepare a reviewed, reversible migration plan first.

---

# 4. NEON DATABASE INVESTIGATION

Determine:

- Actual Neon project ID.
- Production branch ID.
- Preview branch ID.
- Database name.
- Connection role.
- Current database connection.
- Auth schema.
- Application schema.
- Expected auth tables.
- Actual auth tables.
- Migration history.
- Runtime configuration.
- Schema search path.

Verify whether authentication records are stored in:

- `neon_auth`.
- `public`.
- A dedicated `auth` schema.
- Another schema actually configured by the application.

Inspect the relevant tables safely.

For Better Auth, investigate the expected identity, account, session and verification records and any enabled plugin tables.

Verify the schema required by the actual installed authentication version.

Compare the database reached by the deployed backend to the database being viewed in the Neon Console.

### Important

Neon branches can have different authentication records and endpoints.

A signup made against one branch will not automatically appear as a new record in another unrelated branch.

Do not move identities between branches without verifying the correct recovery procedure.

Do not disable Neon security or authorization controls.

Never expose connection strings in logs or the final report.

---

# 5. SIGNUP AND LOGIN DIAGNOSTICS

Reproduce the failure in an appropriate isolated environment using a test identity.

Inspect the complete lifecycle:

1. Open signup.
2. Submit valid credentials.
3. Validate input.
4. Call authentication API.
5. Confirm server-side validation.
6. Persist identity.
7. Persist credential/account association.
8. Handle email verification when enabled.
9. Create session.
10. Establish secure cookie.
11. Return authenticated state.
12. Provision personal workspace where required.
13. Load account profile.
14. Enter application.

Then test login:

1. Submit existing credentials.
2. Locate identity in correct auth database.
3. Validate credentials.
4. Establish session.
5. Return session to browser.
6. Load profile.
7. Resolve workspace membership.
8. Load authorized workspaces.
9. Enter correct default workspace.

Identify exactly where the process fails.

### Check

- Authentication routes.
- Auth API base URL.
- Database adapter.
- Schema compatibility.
- Incorrect connection strings.
- Missing migrations.
- Unsupported configuration.
- Cookie domain.
- SameSite policy.
- Secure cookie configuration.
- CSRF protections.
- Trusted origins.
- Reverse proxy headers.
- Cloudflare routing.
- CORS and credentials.
- Environment variable bindings.
- Session expiration.
- Email verification.
- Password hashing/verification.
- OAuth providers if configured.
- Authentication client/server version compatibility.
- User-to-workspace mapping.
- Redirect loops.
- Account enumeration protections.

Don't assume that a successful database connection proves signup is working.

---

# 6. RECOVER EXISTING ACCOUNTS SAFELY

Preserve the founder's existing identity.

If records exist but are hidden by incorrect project, branch or schema selection, fix the configuration.

If authentication records are inconsistent, determine the minimal safe correction.

If account creation succeeded in one system but workspace provisioning failed, repair that relationship without duplicating the user.

If an account record truly does not exist, provide a secure account recovery or re-registration procedure.

### Never

- Insert a plaintext password into the database.
- Fabricate a password hash.
- Grant administrator privileges to an arbitrary email.
- Create duplicate founder identities automatically.
- Expose password-reset tokens.
- Copy sessions between environments.
- Modify production credentials without authorization.
- Delete existing sessions/users as a blanket workaround.
- Bypass authentication for testing production pages.

Require verified ownership before privileged account recovery.

Preserve legitimate account identifiers and memberships.

---

# 7. COMPLETE AUTHENTICATION FEATURES

After repairing the root cause, ensure the existing authentication system supports:

- Account registration.
- Sign in.
- Sign out.
- Session persistence.
- Session expiration.
- Email verification where enabled.
- Password reset.
- Password change.
- Safe account recovery.
- Correct auth errors.
- Proper loading states.
- Workspace selection.
- Workspace switching.
- Role-aware access.
- Profile retrieval.
- Multiple sessions/device management where supported.

Do not promise unsupported OAuth or passkey providers.

### Account categories

Preserve the existing:

1. Personal.
2. Business.
3. Developer.

A user may belong to multiple authorized workspaces.

Separate:

- Authentication identity.
- User profile.
- Workspace membership.
- Workspace type.
- Workspace role.
- Service entitlements.

Do not treat signing in as proof that every workspace belongs to the user.

---

# 8. VERIFY CLOUDFLARE AND NEON CONFIGURATION

Compare deployed configuration against source configuration.

Audit:

- Runtime secrets.
- Environment bindings.
- Auth endpoint.
- Public frontend origin.
- API origin.
- Backend routing.
- Custom domain.
- Cookie configuration.
- Database connection.
- Neon branch.
- Preview environment separation.

Document required environment variables.

Do not hardcode secrets.

Do not use a development database accidentally in production.

Do not point previews at production auth without an explicit, secure reason.

Do not log credentials.

Do not overwrite an existing production secret simply because it differs from an example file.

---

# 9. AUTHENTICATION ACCEPTANCE TESTS

Stage 1 authentication is complete only when:

- New test signup persists in the intended Neon auth database.
- The appropriate identity record exists.
- Login succeeds.
- Session survives refresh.
- Logout succeeds.
- Expired sessions are handled correctly.
- Password recovery works.
- Correct Personal/Business/Developer workspaces are resolved.
- A user cannot access another organization's workspace.
- Existing founder account access is recovered through a secure verified process.
- Frontend and backend use the intended environments.
- No production data is lost.

Test authentication in the actual deployed environment using an authorized account.

If direct verification requires a user-controlled login or secret, request only the necessary user interaction and do not claim production success until verified.

---

# 10. STABILIZE THE EXISTING PLATFORM

After authentication works, resolve the previously reported global search and service errors.

### Global search

Fix:

- Incorrectly positioned modal.
- Sidebar overlap.
- Dialog clipping.
- Portal mounting.
- `z-index` and stacking contexts.
- Keyboard navigation.
- Search results.
- Focus management.
- Mobile responsiveness.

### Service failures

The founder previously reported "Request failed" across multiple services.

Inspect:

- Shared API client.
- Backend availability.
- Authentication cookies.
- Route mappings.
- Authorization.
- Service entitlements.
- Neon queries.
- Database migrations.
- Response parsing.
- Cloudflare configuration.

### Error states

Distinguish:

- Loading.
- Empty result.
- Unauthorized.
- Inactive service.
- Configuration required.
- Request failure.
- Success.

A failed API response must not be interpreted as an empty database.

Audit every existing service for these issues before moving on.

---

# STAGE 2 — WAVE 1 PRODUCT MATURITY

# 11. WAVE 1 PHILOSOPHY

The existing six apps should be upgraded substantially.

They must become complete working business applications, not dashboards with navigation links and a handful of forms.

Study the mature workflow patterns documented by Odoo.

For every application, implement:

- Core records.
- Complete record detail pages.
- Create/edit workflows.
- Lifecycle states.
- Business validation.
- Related records.
- Activities.
- Filters.
- Search.
- Grouping.
- Bulk actions where suitable.
- Imports/exports where appropriate.
- Permissions.
- Notifications.
- Audit trails.
- Integrations.
- Useful reports.
- Working quick actions.

Implement capabilities using shared domain models and services.

Do not duplicate the database just because a new app needs a different interface.

---

# 12. APPLICATION 1 — AFRICORE FINANCE

Upgrade AfriCore Finance into a unified operational financial workspace.

## Main dashboard

Preserve the approved Finance design.

Include:

- Confirmed collections.
- Recorded outflows.
- Net recorded movement.
- Outstanding receivables.
- Payables where supported.
- Cash-flow overview.
- Receivables aging.
- Expense breakdown.
- Recent invoices.
- Recent payment events.
- Upcoming financial obligations.
- Notifications and required approvals.

Use accurate metric definitions.

## Invoicing

Implement or deepen:

- Customer invoices.
- Draft creation.
- Invoice line items.
- Products and services.
- Taxes.
- Discounts.
- Payment terms.
- Due dates.
- Recurring invoices.
- Partial payments.
- Invoice status.
- Credit notes.
- Appropriate corrections.
- PDF output.
- Customer sharing.
- Audit history.
- Linked orders.
- Payment allocation.

Issued invoices must not silently mutate.

## Expenses

- Expense categories.
- Vendors.
- Receipts.
- Status.
- Recurring expenses.
- Approval.
- Attachments.
- Payment state.
- Reporting.

## Payments

- Payment requests.
- Links.
- Checkout.
- M-Pesa integration through configured, authorized providers.
- Callback validation.
- Idempotency.
- Reconciliation.
- Partial settlement.
- Refund records where supported.

Simulated payment events must be visibly separate from live confirmations.

## Reconciliation

- Imported bank/payment records.
- Matching suggestions.
- Exact matching.
- Partial matching.
- Exceptions.
- Manual review.
- Audit log.

## Reporting

- Receivables.
- Collections.
- Cash flow.
- Expenses.
- Trends.
- Customer aging.
- Exportable reports.

Do not falsely label this app as a complete general ledger. Full accounting belongs to the Accounting app in Wave 2.

---

# 13. APPLICATION 2 — AFRICORE CRM

Upgrade CRM toward Odoo-class customer and opportunity management.

## Functional areas

### Leads

- Create.
- Import.
- Assign.
- Qualify.
- Convert.
- Archive.
- Activity history.

### Opportunities

- Customizable Kanban stages.
- Drag and drop.
- Expected revenue.
- Probability.
- Assigned salesperson.
- Expected closing date.
- Tags.
- Activities.
- Notes.
- Team ownership.
- Lost/won reasons.

### Customers

- Individual and company contacts.
- Company/contact relationships.
- Contact details.
- Addresses.
- Customer tags.
- Business ID link where authorized.
- Purchase and invoice history.
- Recent activity.
- Outstanding balances where authorized.

### Sales teams

- Team membership.
- Ownership.
- Work queues.
- Performance reporting.

### Activities

- Calls.
- Meetings.
- Tasks.
- Follow-up reminders.
- Assigned activities.
- Due dates.

## Shared integrations

A single customer identity should be used by:

- CRM.
- Sales.
- Finance.
- Commerce when built.
- Work where authorized.
- Business ID where consent permits.

No duplicate manual data entry across apps.

---

# 14. APPLICATION 3 — AFRICORE INVENTORY

Upgrade Inventory toward a substantial operational stock-management application.

## Product catalogue

- SKU.
- Name.
- Description.
- Product image.
- Category.
- Variants.
- Units of measure.
- Barcode fields.
- Cost.
- Selling price.
- Supplier.
- Stock-tracked versus non-stock items.
- Tax configuration where appropriate.

## Stock management

- Warehouses.
- Locations.
- Receipts.
- Deliveries.
- Internal transfers.
- Stock adjustments.
- Reservations.
- Returns.
- Stocktaking.
- Reorder points.
- Low-stock alerts.
- Inventory movement history.

Maintain:

- On hand.
- Reserved.
- Available.
- Incoming.
- Outgoing.
- Forecasted.

Use transactional reservation logic.

## More mature features

Where compatible with architecture and testing:

- Lots and serial numbers.
- Expiration tracking.
- Stock traceability.
- Multiple warehouses.
- Cycle counting.
- Replenishment suggestions.
- Stock valuation with an explicitly selected costing method.

## Integration

- Sales confirms demand.
- Inventory manages reservations.
- Procurement manages replenishment.
- Accounting receives posted valuation events when configured.
- Analytics reflects valid movements.

Do not deduct physical stock merely because an invoice was drafted.

---

# 15. APPLICATION 4 — AFRICORE SALES

Build a complete quotation-to-fulfillment application.

## Quotations

- Customer selection.
- Products and services.
- Quantities.
- Discounts.
- Applicable taxes.
- Validity date.
- Payment terms.
- Templates.
- PDF or approved sharing.
- Revision history.

## Sales orders

- Convert quotation to order.
- Confirm.
- Track status.
- Reserve inventory.
- Assign fulfillment.
- Prepare draft invoices.
- Handle partial fulfillment.
- Cancel or amend safely.
- Record returns.
- Review payment status.

## Pricing

- Customer-specific pricing.
- Price lists.
- Quantity-based discounts.
- Promotion rules where suitable.
- Controlled discount approvals.

## Dashboard

- Quotations.
- Conversion rates.
- Orders.
- Revenue-related metrics.
- Pending fulfillment.
- Order aging.
- Customer ranking.
- Salesperson performance.

## Integrations

- CRM opportunities.
- Inventory.
- Finance.
- Accounting.
- Procurement.
- Work.
- Notifications.

---

# 16. APPLICATION 5 — AFRICORE ANALYTICS

Build a substantive, trustworthy reporting experience.

## Data domains

- Sales.
- Customers.
- Invoices.
- Payments.
- Expenses.
- Inventory.
- Procurement.
- Projects.
- Accounting where authorized.
- Business verification where permitted and meaningful.

## Features

- Interactive metrics.
- Date ranges.
- Comparison periods.
- Filtering.
- Segmentation.
- Saved reports.
- Drill-down.
- Custom views.
- Exports.
- Data freshness indicators.
- Metric definitions.
- Authorized cross-app reporting.

## Accuracy

Each metric must have:

- Definition.
- Source service.
- Time basis.
- Currency.
- Refresh status.
- Permission policy.

Never invent business data.

Do not combine unrelated currencies without a documented conversion method.

## Design direction

Use Shopify's merchant-centric information architecture as a reference.

For now, prioritize functional charts and reliable drill-downs.

The complete platform-wide chart redesign will happen later.

Do not postpone functional analytics to that final visual phase.

---

# 17. APPLICATION 6 — AFRICORE AUTOMATIONS

Upgrade Automations into a mature workflow application.

## Workflow builder

Support:

- Trigger.
- Conditions.
- Branching.
- Actions.
- Delays where supported.
- Approvals.
- Scheduled execution.
- Retry configuration.
- Failure handling.

## Triggers

Examples:

- Customer created.
- Lead stage changed.
- Order confirmed.
- Stock below threshold.
- Invoice overdue.
- Payment confirmed.
- Purchase request approved.
- Document uploaded.
- Task completed.
- Credential expiring.

## Actions

- Create task.
- Notify member.
- Update authorized record.
- Prepare invoice draft.
- Create purchase request.
- Assign team member.
- Request approval.
- Trigger authorized webhook.
- Record activity.

## Management

- Templates.
- Draft workflows.
- Testing.
- Versioning.
- Enable/disable.
- Execution logs.
- Retry.
- Failure inspection.
- Usage tracking.
- Permissions.

Use the existing durable execution infrastructure.

Do not implement customer-supplied arbitrary server code.

Do not allow automation to bypass accounting, stock, financial or trust verification controls.

---

# STAGE 3 — WAVE 2 APPLICATIONS

# 18. APPLICATION 7 — AFRICORE WORK

**Category:** Projects, team collaboration and task management.

This is a major new application.

Research Odoo Project, Discuss and task management patterns.

Build an integrated experience suitable for a small company, agency, logistics operator, distributor or growing enterprise.

## Main structure

- My Work.
- Projects.
- Boards.
- Tasks.
- Teams.
- Discussions.
- Calendar.
- Timeline.
- Files.
- Reports.
- Settings.

## Project dashboard

Show:

- Active projects.
- Tasks assigned to me.
- Overdue tasks.
- Upcoming milestones.
- Team activity.
- Projects at risk.
- Recent updates.
- Pending approvals.

## Project creation

Support:

- Name.
- Description.
- Owner.
- Team.
- Visibility.
- Deadline.
- Status.
- Template.
- Milestones.
- Linked customer.
- Linked sales order where relevant.
- Related documents.

## Kanban task boards

Implement genuinely functional drag and drop.

Allow:

- Custom columns.
- Custom stages.
- Reordering tasks.
- Moving tasks between stages.
- Task priority.
- Assignee.
- Due date.
- Labels.
- Completion status.

Use optimistic updates with safe persistence and rollback.

Persist order correctly for multiple users.

Handle concurrent edits.

Provide keyboard-accessible alternatives.

## Task details

Each task should support:

- Title.
- Description.
- Assignee.
- Followers.
- Due date.
- Priority.
- Status.
- Subtasks.
- Checklists.
- Dependencies.
- Comments.
- File attachments.
- Related records.
- Activity log.
- Mentions.

## Views

- Kanban.
- List.
- Calendar.
- Timeline/Gantt where feasible.
- My Tasks.
- Team Workload.

## Team collaboration

Include:

- Project discussions.
- Team channels.
- Direct messages where suitable.
- Message history.
- Mentions.
- Threaded replies.
- Shared task updates.
- Notifications.
- Presence indicators only if actually supported.
- File sharing.

Do not implement a fake chat interface.

Messages must persist and be scoped to their authorized participants.

## Integrations

### Sales

An accepted customer project or service order may generate a project from an approved template.

### CRM

Projects can link to customer accounts.

### Finance

Project expenses and billing milestones can appear in authorized financial views.

### Documents

Tasks can attach or link files from the shared document repository.

### People

Tasks can be assigned to active authorized workspace members.

### Automations

Task state changes can trigger approved workflows.

## Approval workflows

Support project-level review and approval actions through the shared Approval Center.

Do not allow arbitrary teammates to approve restricted financial operations.

---

# 19. APPLICATION 8 — AFRICORE ACCOUNTING

**Category:** Full bookkeeping and financial accounting.

This app must be substantially deeper than the existing Finance app.

Study Odoo Accounting's documented accounting lifecycle.

## Core system

Implement a coherent double-entry accounting ledger.

### Master data

- Chart of accounts.
- Account types.
- Fiscal periods.
- Journals.
- Currencies.
- Accounting configuration.
- Tax codes.
- Opening balances.

### Journal entries

- Draft.
- Validate.
- Post.
- Reverse.
- Audit.

Every posted entry must balance.

Do not allow edits that silently alter posted journal history.

### General ledger

- Journal lines.
- Account balances.
- Drill-down.
- Period filtering.
- Reconciliation support.

### Receivables

- Customer invoices.
- Credits.
- Payment allocations.
- Customer balances.
- Aging.

### Payables

- Supplier bills.
- Credit notes.
- Due dates.
- Payment records.
- Vendor aging.

### Financial statements

- Balance Sheet.
- Profit and Loss.
- Trial Balance.
- General Ledger.
- Accounts Receivable Aging.
- Accounts Payable Aging.
- Cash Flow Statement only when its method and required records are correctly implemented.

### Accounting controls

- Period locks.
- Posted entry immutability.
- Reversals.
- Corrections.
- Approvals.
- Audit history.
- Currency precision.
- Decimal-safe financial calculations.
- Transaction-safe posting.

### Integration

Finance and Accounting must use the same underlying invoices, payments and expenses.

Do not create a second independent invoicing system.

For accounting events, build documented posting rules:

- Invoice issued.
- Supplier bill posted.
- Payment allocated.
- Expense recognized.
- Stock valuation posted where enabled.
- Credit note issued.
- Refund processed.

Make each event idempotent.

## Kenya localization

Design for Kenya-first accounting:

- KES currency.
- Configurable tax rates.
- Kenyan financial document requirements.
- eTIMS integration architecture.
- Company tax identifiers.
- Relevant withholding logic where correctly supported.

Do not fabricate tax compliance.

Do not claim KRA-certified integration unless actual certification/configuration exists.

Provide proper readiness states for unavailable regulatory integrations.

### Accounting accuracy tests

- Every posted journal balances.
- Trial balance debits equal credits.
- Correct receivables movement.
- Correct partial payment allocation.
- Correct credit note reversal behavior.
- Correct locked-period behavior.
- Correct vendor payable behavior.
- No duplicate posting from replayed events.

---

# 20. APPLICATION 9 — AFRICORE PEOPLE

**Category:** Human resources and employee operations.

## Main sections

- Employees.
- Departments.
- Organization.
- Attendance.
- Leave.
- Onboarding.
- Documents.
- Roles.
- Reports.
- Settings.

## Employee directory

- Employee profile.
- Department.
- Manager.
- Job title.
- Employment status.
- Work contact details.
- Start date.
- Assigned workspaces.
- Relevant documents.

Separate employment records from platform login identities.

An employee may exist without being an AfriCore user.

## Departments

- Create departments.
- Assign managers.
- Manage reporting lines.
- View team members.

## Leave

- Leave types.
- Requests.
- Balances.
- Approvals.
- Calendar.
- Team availability.
- Accrual rules where configured.

## Attendance

- Check-in/out records.
- Timesheets or attendance records.
- Review history.
- Exceptions.
- Permission-aware reports.

## Onboarding

- Employee onboarding checklists.
- Assigned tasks.
- Document requests.
- Approvals.
- Completion status.

## Sensitive data controls

HR data is highly confidential.

Implement:

- HR role permissions.
- Employee self-service permissions.
- Manager visibility restrictions.
- Audit logs.
- Appropriate retention rules.
- Protected personnel documents.
- Authorized access to compensation information.

Do not let ordinary workspace members read private HR records.

## Payroll

Prepare clean payroll integration boundaries.

If full Kenya payroll is implemented, validate current PAYE and statutory contribution requirements with authoritative sources and tests.

Otherwise show payroll as an accurately labeled future/limited capability.

Do not invent statutory deductions.

## Integration

- Work task assignments.
- Leave-aware project scheduling.
- Documents for employee records.
- Approvals.
- Finance for properly approved expenses.
- Accounting for properly posted payroll obligations when supported.

---

# 21. APPLICATION 10 — AFRICORE PROCUREMENT

**Category:** Purchasing and supplier management.

## Main sections

- Overview.
- Suppliers.
- Purchase Requests.
- Requests for Quotation.
- Purchase Orders.
- Receiving.
- Bills.
- Replenishment.
- Reports.

## Suppliers

Use existing customer/contact master-data infrastructure where appropriate.

Support supplier-specific data and authorization.

## Purchase requests

- Requester.
- Items.
- Quantity.
- Reason.
- Budget or spending limit.
- Approval.
- Status.

## RFQs

- Supplier selection.
- Product list.
- Pricing.
- Requested delivery date.
- Terms.
- Supplier quotation comparison.
- Acceptance/rejection.

## Purchase orders

- Create from approved RFQ.
- Approve.
- Issue.
- Track.
- Amend with controls.
- Cancel.
- Record supplier confirmation.

## Receiving

- Goods received.
- Partial receipt.
- Inspection status.
- Damaged or rejected goods.
- Warehouse assignment.
- Stock movements.

## Supplier bills

Link supplier invoices to purchases.

Support appropriate two-way and three-way matching:

- Purchase order.
- Goods receipt.
- Supplier bill.

Flag discrepancies.

Don't mark invoices approved or paid just because goods were received.

## Replenishment

Inventory can suggest purchase requests when stock falls below configured reorder levels.

Automated ordering requires explicit approval or policy.

## Integration

- Inventory.
- Accounting.
- Finance.
- Documents.
- People.
- Work.
- Automations.

---

# 22. APPLICATION 11 — AFRICORE DOCUMENTS

**Category:** Business document management.

Research Odoo Documents for information architecture and workflows.

## Main views

- My Files.
- Company Files.
- Shared with Me.
- Recent.
- Starred.
- Requests.
- Trash.
- Settings.

## File management

- Upload.
- Download.
- Preview.
- Create folders.
- Rename.
- Move.
- Copy.
- Drag and drop.
- Multi-select.
- File tags.
- Search.
- Filter.
- Sort.
- Version history.
- Archive/trash.
- Restore.

## Storage

Use the existing secure object storage infrastructure.

If available and appropriately configured, Cloudflare R2 is a suitable object store for file content.

Store authoritative metadata in Neon.

Use private storage and authorized access.

Avoid public permanent object URLs for sensitive files.

## Permissions

- Owner.
- Editor.
- Viewer.
- Explicit sharing.
- Workspace membership.
- Expiring links where implemented.
- Download restrictions where supported.

Do not grant every workspace member access to all documents.

## Attachments

Integrate with:

- Customer records.
- Invoices.
- Expenses.
- Purchase orders.
- Employee records.
- Project tasks.
- Business verification.
- Agreements.

Use links/references to shared documents rather than duplicating files unnecessarily.

## Security

- Validate file type.
- Enforce file size limits.
- Prevent path traversal.
- Sanitize filenames.
- Protect against unsafe file rendering.
- Scan uploads where the available infrastructure supports it.
- Support lifecycle and retention policies.
- Enforce access on every download.

## Document workflows

- Request document.
- Submit document.
- Review.
- Approve/reject where appropriate.
- Version.
- Notify requester.

Integrate with the shared Approval Center and Notifications.

---

# 23. APPLICATION 12 — AFRICORE BUSINESS ID

**Category:** Identity, verification and business trust.

This is a major AfriCore differentiator.

Build an understandable business-facing application over the trust infrastructure from earlier milestones.

## Main sections

- Overview.
- Business Profile.
- Verification.
- Business Passport.
- Credentials.
- Shared Information.
- Trust Relationships.
- Verification History.
- Settings.

## Business profile

Support:

- Legal/trading name.
- Business type.
- Registration information.
- Relevant identifiers.
- Contact information.
- Address.
- Business description.
- Verification status.

Do not treat self-declared information as independently verified.

## Verification

- Verification request.
- Evidence submission.
- Review status.
- Additional information requests.
- Approved/rejected status.
- Renewal/expiry.
- Audit trail.

## Business Passport

Present an authorized portable business profile containing:

- Identifying information.
- Verified claims.
- Credential references.
- Evidence metadata.
- Sharing status.

Separate self-reported claims from provider-verified evidence.

## Verifiable credentials

Reuse the existing credential infrastructure:

- Issuance.
- Verification.
- Validity.
- Expiration.
- Revocation/status checking where supported.
- Consent-based presentation.
- Audit records.

Do not create fake credentials or fictitious regulators.

## Sharing

Allow authorized businesses to share selected information with:

- Suppliers.
- Buyers.
- Financial institutions.
- Business partners.
- Other eligible AfriCore organizations.

Support:

- Explicit scope.
- Consent.
- Expiration.
- Revocation.
- Audit.

## Trust

Show evidence-backed verification states.

Don't convert an unverified trust score into a guarantee of payment, solvency or business legitimacy.

## Integration

- CRM.
- Procurement supplier onboarding.
- Commerce when implemented.
- Work.
- Documents.
- Trust Network.
- Payments where lawful and appropriate.

Preserve privacy and sensitive identity records.

---

# 24. CROSS-APP ENGINE — MANDATORY

The twelve applications must operate over shared services and records.

Create or improve a common business domain architecture.

## Shared domain models

At minimum:

- User identity.
- Workspace.
- Membership.
- Customer/contact.
- Supplier.
- Employee.
- Product.
- Inventory movement.
- Stock reservation.
- Quotation.
- Sales order.
- Purchase order.
- Invoice.
- Payment.
- Expense.
- Accounting journal.
- Project.
- Task.
- Document.
- Workflow.
- Notification.
- Approval.
- Business verification.
- Credential.
- Audit event.

Use explicit workspace scoping.

Avoid duplicating business records in each application's private database.

---

# 25. BUSINESS EVENT PROPAGATION

Use existing durable infrastructure.

If absent, implement an appropriate transactional outbox and reliable event dispatch mechanism.

Events should include:

- Event ID.
- Type.
- Version.
- Workspace ID.
- Actor.
- Source record.
- Event timestamp.
- Correlation ID.
- Relevant validated payload.

Example events:

- CustomerCreated.
- OpportunityWon.
- SalesOrderConfirmed.
- StockReserved.
- StockDispatched.
- StockReceived.
- PurchaseOrderApproved.
- SupplierBillPosted.
- InvoiceIssued.
- PaymentConfirmed.
- PaymentAllocated.
- JournalPosted.
- TaskCompleted.
- DocumentUploaded.
- VerificationApproved.
- CredentialRevoked.

## Safety

- Idempotent event handling.
- Retry policy.
- Dead-letter handling.
- Duplicate protection.
- Transaction boundaries.
- Authorization.
- Tenant isolation.
- Failure observability.
- Loop prevention.
- Auditability.

Don't perform irreversible external actions just because an event was redelivered.

---

# 26. EXAMPLE COMPLETE BUSINESS WORKFLOW

Implement and test this actual connected flow.

### Step 1 — CRM

A salesperson creates a customer.

### Step 2 — Sales

The same customer is selected without being reentered.

A quotation is created.

### Step 3 — Sales Order

The quotation is accepted and converted to an order.

### Step 4 — Inventory

Inventory reserves the appropriate available stock.

### Step 5 — Procurement

If stock is insufficient, an authorized replenishment request is suggested.

No unauthorized supplier payment or purchase is triggered.

### Step 6 — Work

The relevant team receives a fulfillment task.

### Step 7 — Documents

The task links to relevant customer/order documents.

### Step 8 — Finance

An appropriate draft invoice is generated.

### Step 9 — Accounting

After proper invoice posting, a balanced accounting entry is created.

### Step 10 — Payments

A legitimate payment confirmation is received through a configured payment workflow.

### Step 11 — Reconciliation

Payment allocation updates the invoice balance.

### Step 12 — Analytics

Relevant dashboards refresh from authoritative records.

### Step 13 — Notifications

Authorized team members receive meaningful updates.

No redundant manual reentry.

No false financial events.

---

# 27. NOTIFICATIONS AND APPROVALS

Preserve and improve the existing notification bell.

The system must support:

- In-app notifications.
- Unread counts.
- Read/unread state.
- Action-required status.
- Approval requests.
- Links to related records.
- Notification preferences.
- Role-aware delivery.
- Event deduplication.

### Approval examples

- High-value discounts.
- Stock write-offs.
- Supplier purchase orders.
- Financial corrections.
- Leave requests.
- Document verification.
- Business verification actions.

Approvals must be tied to specific record versions and exact actions.

A notification button must not bypass backend authorization.

---

# 28. APP INSTALLATION AND SERVICE INDEPENDENCE

Preserve the business model agreed for AfriCore.

**Apps are optional interfaces. Services are independently usable capabilities.**

Users may activate a service without installing an app.

Users may install an app without manually visiting the Service Catalog for each dependency.

## Installation

1. Open Apps.
2. Choose an app.
3. Review features.
4. Review required services.
5. Review service charges.
6. Consent to applicable terms and paid activation.
7. Install.
8. Activate eligible required service entitlements automatically.
9. Open the app.

App installation is free.

Service usage may have charges.

Do not silently activate billable usage without authorization.

## Uninstallation

Preserve historical data.

Do not remove services still used by:

- Another installed app.
- Independent direct activation.
- Valid pending obligations.

Track entitlement references and installation origins.

---

# 29. SERVICES MUST IMPROVE AS WELL

While building apps, do not neglect their underlying services.

Review each service used by Waves 1 and 2.

For each service verify:

- Correct domain API.
- Clear service description.
- Activation state.
- Configuration.
- Usage meter.
- Permissions.
- Audit history.
- Business workspace presentation.
- Personal eligibility.
- Developer API availability where appropriate.
- Documentation.
- Error handling.
- Monitoring.

### Independent access

All eligible services must remain directly usable from the Services section.

App interfaces and direct-service interfaces must operate on the same business records.

Avoid showing the same service as separate unrelated products.

---

# 30. WORKSPACE ELIGIBILITY

## Business workspaces

All twelve business apps are eligible subject to product availability, account permissions, workspace requirements and service readiness.

## Personal workspaces

Offer only relevant simplified app experiences.

Possible examples:

- Personal Finance.
- Client tracking for individuals/freelancers.
- Personal Work/Tasks.
- Personal Documents.
- Personal Analytics.
- Personal Automations.

Reuse relevant application capabilities rather than cloning all business infrastructure.

Don't force complex corporate accounting, warehouse management, procurement teams or formal HR into a normal Personal workspace.

## Developer workspaces

Do not force business applications into Developer accounts.

Developers retain:

- Service API access.
- API keys.
- Documentation.
- Webhooks.
- API usage.
- Logs.
- Integration configuration.
- Appropriate developer tools.

The future AfriCore Studio/Builder will be a separately planned initiative.

Do not build Studio during this task.

---

# 31. BUSINESS WORKSPACE NAVIGATION

Preserve the approved app shell visual direction.

- Dark sidebar.
- White/light content area.
- Compact typography.
- Clear application icon and title.
- Workspace selector.
- Global search.
- Notification bell.
- Account menu.
- Installed apps.
- Independently accessible services.
- Billing.
- Settings.

## Contextual sidebar

When an app is opened, show that app's useful sections.

Examples:

Finance:
Dashboard, Invoices, Payments, Expenses, Reconciliation, Reports.

CRM:
Dashboard, Leads, Opportunities, Customers, Activities, Teams.

Inventory:
Dashboard, Products, Warehouses, Operations, Replenishment, Reports.

Work:
My Work, Projects, Boards, Teams, Discussions, Calendar.

Accounting:
Dashboard, Journal Entries, Chart of Accounts, Receivables, Payables, Reports.

Documents:
My Files, Company Files, Shared With Me, Recent, Trash.

Avoid a permanent sidebar containing every section from all twelve apps.

Allow fast switching through the Apps launcher.

### UX requirement

A user should reach the important task from the dashboard with minimal steps.

No dead-end buttons.

No placeholder workflows represented as finished features.

---

# 32. PRIVACY AND AUTHORIZATION

Enforce authorization at the backend.

Implement:

- Workspace isolation.
- Role-based access.
- Action permissions.
- Record permissions where appropriate.
- HR data restrictions.
- Financial posting controls.
- Document access controls.
- Project/team visibility.
- Business trust evidence restrictions.
- Audit trails.
- Secure file handling.

A member assigned to a project should not automatically gain access to the entire organization's accounting ledger.

An employee should not gain access to private HR files merely because they can open the People app.

Do not mistake app installation for permission to access all of its data.

---

# 33. ACCOUNTING AND INVENTORY SAFETY

These systems must be treated as high-integrity domains.

## Accounting

- Balanced journal entries.
- Controlled posting.
- Immutable posted history.
- Reversals and adjustments.
- Period locks.
- Auditability.
- Proper currency precision.

## Inventory

- Transaction-safe reservations.
- Distinction between on-hand and available.
- No negative inventory unless explicitly supported by approved policy.
- Stock movement history.
- Reconciliation of quantities.
- Correct partial receipts and fulfillment.

## Payments

- Provider-confirmed status.
- Idempotent callbacks.
- Correct settlement states.
- No fabricated confirmations.
- No duplicate allocation.

## Documents

- Secure storage.
- Authorization checks.
- Protected links.
- Version history.
- Retention controls.

## Business Identity

- Verified evidence versus self-reported data.
- Credential lifecycle.
- Consent.
- Privacy.
- No false trust guarantees.

---

# 34. QUALITY OF IMPLEMENTATION

Use production-quality engineering practices.

## Backend

- Typed contracts.
- Input validation.
- Domain services.
- Transactions.
- Versioned APIs.
- Database constraints.
- Structured errors.
- Observability.
- Rate limits.
- Audit logging.

## Frontend

- Reliable forms.
- Data validation.
- Working search/filter.
- Error states.
- Loading states.
- Empty states.
- Optimistic updates only when safe.
- Accessible components.
- Responsive navigation.
- Stable chart rendering.

## Performance

- Paginated record queries.
- Appropriate database indexes.
- Query caching.
- Avoid unnecessary repeated requests.
- Efficient workspace switching.
- Background jobs for durable asynchronous tasks.
- Do not block the UI on unrelated services.

Avoid a generic collection of cards and forms with no useful operational workflows.

Build meaningful record-centered experiences.

---

# 35. TESTING REQUIREMENTS

Write unit, integration, database, security and browser end-to-end tests.

## Stage 1

Test:

- Registration.
- Neon identity persistence.
- Login.
- Session restoration.
- Password reset.
- Workspace provisioning.
- Workspace switching.
- Tenant isolation.
- Search modal.
- API request reliability.

## Wave 1

Test:

- Create customer.
- Create opportunity.
- Convert opportunity to quotation.
- Confirm order.
- Reserve stock.
- Generate draft invoice.
- Issue invoice.
- Confirm test payment.
- Allocate payment.
- Update financial reports.
- Execute automation.
- Deliver notification.

## Wave 2

Test:

- Create project.
- Invite/assign authorized member.
- Drag task through stages.
- Attach document.
- Discuss task.
- Request approval.
- Record leave.
- Create purchase request.
- Approve purchase order.
- Receive partial stock.
- Register supplier bill.
- Post balanced accounting entry.
- Reconcile payment.
- Prepare business verification.
- Share permitted verified credentials.

## Negative tests

- Unauthorized cross-workspace access.
- Duplicate customer creation request.
- Duplicate payment callback.
- Duplicate journal posting.
- Concurrent stock reservation.
- Expired approval.
- Unauthorized file download.
- Invalid accountant role.
- Invalid business verification claim.
- Missing provider configuration.
- Failed service entitlement.
- Session expiration.
- Failed network request.

Use isolated synthetic test accounts and workspaces.

Do not contaminate production records.

---

# 36. REFERENCE DOCUMENTATION

Use current official documentation as functional research.

### Better Auth

https://www.better-auth.com/docs/installation

https://www.better-auth.com/docs/adapters/postgresql

### Neon Auth

https://neon.com/docs/auth/overview

https://neon.com/docs/auth/authentication-flow

### Odoo 20

https://www.odoo.com/documentation/20.0/

https://www.odoo.com/documentation/20.0/applications/services/project/project_management.html

https://www.odoo.com/documentation/20.0/applications/finance/accounting.html

https://www.odoo.com/documentation/20.0/applications/inventory_and_mrp.html

https://www.odoo.com/documentation/20.0/applications/hr/time_off.html

https://www.odoo.com/documentation/20.0/applications/productivity/documents.html

https://www.odoo.com/documentation/20.0/applications/productivity/discuss/team_communication.html

### Shopify

https://help.shopify.com/en/manual/reports-and-analytics/shopify-reports/overview-dashboard/

### Kenya Revenue Authority

https://www.kra.go.ke/business/etims-electronic-tax-invoice-management-system/learn-about-etims/etims-system-to-system-integration

Review the relevant current documentation before implementing.

These are research references, not permission to copy proprietary material.

Where documentation, deployment constraints or local requirements conflict, identify the conflict and resolve it using actual evidence.

---

# 37. IMPLEMENTATION CHECKPOINTS

This is a large assignment.

Maintain a persistent implementation plan and update it after each checkpoint.

### CHECKPOINT A — Audit and authentication diagnosis

Deliver:

- Repo inventory.
- Actual auth architecture.
- Root cause of account persistence/login failure.
- Environment mapping.
- Planned safe repairs.

### CHECKPOINT B — Authentication recovery

Deliver:

- Fixed signup/login.
- Correct Neon persistence.
- Working session management.
- Workspace access.
- Auth regression tests.
- Verified deployed behavior.

**Do not move to Wave 1 while authentication remains broken.**

### CHECKPOINT C — Stabilization

Deliver:

- Fixed global search.
- Fixed service request failures.
- Functional audit.
- Correct error states.

### CHECKPOINT D — Wave 1 backend

Deliver:

- Deeper Finance, CRM, Inventory, Sales, Analytics, Automations domain operations.
- Shared records.
- Correct entitlement handling.
- Cross-app events.

### CHECKPOINT E — Wave 1 application workflows

Deliver:

- Complete application routes.
- Record views.
- Business actions.
- Reports.
- Notifications.
- Tested end-to-end workflows.

### CHECKPOINT F — Wave 2 foundation

Deliver:

- Shared projects/tasks.
- Accounting ledger.
- Employee/leave models.
- Procurement domain.
- Document metadata and secure storage.
- Business Identity reuse.

### CHECKPOINT G — Wave 2 applications

Deliver:

- AfriCore Work.
- AfriCore Accounting.
- AfriCore People.
- AfriCore Procurement.
- AfriCore Documents.
- AfriCore Business ID.

### CHECKPOINT H — Cross-app testing

Verify all twelve apps use common authoritative records.

### CHECKPOINT I — Deployment

Run builds, migrations, automated tests and authorized production deployment.

Verify the real deployed URLs.

---

# 38. DOCUMENTATION

Maintain updated documentation for:

- Authentication architecture.
- Neon project/branch/schema configuration, without secrets.
- Cloudflare routing.
- Signup/login lifecycle.
- Workspace provisioning.
- App Registry.
- Service entitlements.
- Cross-app domain model.
- Event system.
- Notifications.
- Approvals.
- Each of the twelve apps.
- Accounting rules.
- Stock management.
- Document security.
- Business verification.
- API contracts.
- Tests.
- Deployment.

Update `AGENTS.md`.

Provide migration and rollback notes.

Do not duplicate contradictory documentation.

---

# 39. FINAL REPORT FORMAT

At completion, provide a clear report.

## 1. Authentication repair

- Root cause.
- Actual auth provider.
- Neon schema/branch findings.
- Changes.
- Account recovery status.
- Tests.
- Production verification.

## 2. Platform stabilization

- Global search.
- Previously failing API requests.
- Service audit.
- Resolved issues.
- Remaining issues.

## 3. Wave 1

For each of the six apps:

- Features completed.
- End-to-end workflows.
- Connected services.
- Tests.
- Limitations.

## 4. Wave 2

For each of the six new apps:

- Features implemented.
- Screens.
- Data models.
- Connected services.
- Tests.
- Limitations.

## 5. Architecture

- Shared models.
- Event propagation.
- Billing and entitlements.
- Permissions.
- Storage.
- Accounting integrity.
- Inventory integrity.

## 6. Deployment

- Git commit.
- Build result.
- Migration result.
- Test results.
- Deployed environment.
- Verified functionality.

## 7. Evidence

Screenshots of working application flows.

Include technical logs and error summaries where appropriate.

Never include secrets.

## 8. Outstanding work

List incomplete features, external integration requirements and future improvements.

Do not claim unsupported functionality is complete.

---

# 40. STRICT SCOPE EXCLUSIONS

Do not implement the next wave of Commerce applications during this assignment.

Do not implement AfriCore Studio yet.

Do not implement all later Odoo-style applications in this assignment.

Do not spend this wave performing the final platform-wide visual redesign.

The founder wants the final large UI refinement after completing the planned app portfolio.

However, every screen implemented now must still be professional, accessible, easy to navigate and functional.

Preserve the approved AfriCore Finance visual direction.

Do not create poor UX simply because the final polish is scheduled for later.

---

# FINAL DIRECTIVE

AfriCore must become a genuine integrated business platform.

First, restore the founder's account access.

Identify why newly registered identities are not appearing in the expected Neon Better Auth records and why login is failing.

Correct the actual authentication architecture, database configuration, migrations, session flow and workspace provisioning without destroying user data.

Then stabilize the existing platform.

Next, substantially deepen the first six applications:

1. Finance.
2. CRM.
3. Inventory.
4. Sales.
5. Analytics.
6. Automations.

Then implement:

7. Work.
8. Accounting.
9. People.
10. Procurement.
11. Documents.
12. Business ID.

Use Odoo 20 as the operational completeness benchmark.

Use Shopify as the benchmark for clear, merchant-friendly product experiences.

Preserve AfriCore's unique financial, developer-service and business-trust architecture.

Applications must be interconnected, must share authoritative data, and must automatically propagate valid business changes.

Services must remain accessible directly, without installing an application.

Installing an app automatically activates eligible included services through one transparent, authorized installation flow.

Maintain correct financial, inventory, privacy and identity controls.

Every important button must perform a real action.

Every record must persist.

Every supported workflow must be tested.

Do not fabricate integration results, financial information, verification results or deployment success.

**Execute Stage 1 first, validate it, then implement Wave 1 and Wave 2 in order. Continue through the checkpoints where the environment permits, and clearly report any genuine external blockers.**