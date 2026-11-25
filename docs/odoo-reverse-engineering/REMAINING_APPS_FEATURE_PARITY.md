# Odoo 20 Apps #7–#26 — Complete Feature Parity Audit & Implementation Plan

> Audited against official Odoo 20 documentation for Project, Employees/HR, eCommerce, Website, Documents, Sign, Spreadsheet/BI, Marketing Automation, Helpdesk, Subscriptions, Manufacturing (MRP), Field Service/Maintenance/Fleet/Rental, Knowledge, eLearning, and Studio.

## Complete Parity Matrix (Apps #7–#26)

| App # | AfriCore App | Odoo 20 Counterparts | Shipped Core | New Parity Additions (Python + API + UI) |
| --- | --- | --- | --- | --- |
| 7 | **Work** | Project, Timesheets, Planning | Projects, tasks, subtasks, dependencies, milestones, billable timesheets | **Project Profitability & Margin Engine**, **Resource Capacity Utilization**, **Recurring Task Templates** |
| 8 | **People** | Employees, Payroll, Time Off, Attendance, Recruitment, Appraisals | Employees, org chart, payroll brackets, leave, attendance, recruitment, appraisals, onboarding | **Shift Planning & Overtime Calculator**, **Expense-to-Payroll Handoff** |
| 9 | **Commerce** | eCommerce | Storefront, products, loyalty, portal | **Abandoned Cart Recovery Evaluator**, **Product Wishlists & Comparison**, **Cross-sell/Upsell Recommendations** |
| 10 | **Finance** | Accounting/Payments/Treasury | Payments, mobile money, collections, credit readiness | **Treasury Cash Forecast & Liquidity Runway** (Python) |
| 11 | **Documents** | Documents & Sign | Files, versions, document requests, approvals | **Cryptographic E-Signature Envelopes** (SHA-256 audit trail + multi-signer order) |
| 12 | **Analytics** | Spreadsheet & BI | Dashboards, reporting | **KPI Snapshot & Formula Evaluator** (Python) |
| 13 | **Automations** | Studio Automated Actions | Workflow rules, scheduled actions | **Rule Condition Dry-Run Evaluator** |
| 14 | **Business ID** | Trust & Compliance | Business passports, verification, credentials | **Compliance Readiness Score** (Python) |
| 15 | **Calendar** | Calendar & Appointments | Events, appointment types, bookings | **Slot Availability & Buffer Resolver** |
| 16 | **Website** | Website Builder & SEO | Site home, pages, blocks, redirects | **SEO Audit & Sitemap Generator** |
| 17 | **Marketing** | Marketing Automation, Email/SMS | Campaigns, CRM lead handoff | **Campaign Funnel Analytics (Open/Click/Conversion bps)** (Python) |
| 18 | **Support** | Helpdesk | Tickets, shared inbox, Work/Field Ops escalation | **SLA Policy & Breach Evaluator** (Python) |
| 19 | **Subscriptions** | Subscriptions | Plans, contracts, MRR/proration, auto-invoicing | **Churn & Net Revenue Retention (NRR) Cohort Engine** (Python) |
| 20 | **Manufacturing** | MRP, Quality, PLM | BoMs, production orders, QC, Inventory consumption | **Finite Capacity Work Center Scheduler & OEE** (Python) |
| 21 | **Field Operations** | Field Service, Maintenance, Fleet, Rental | Dispatches, maintenance, fleet | **Rental Periodicity Pricing (Hourly/Daily/Weekly/Monthly)** + **Field Worksheet Signature** |
| 22 | **Logistics** | Delivery & Fleet | Shipments, dispatch, POD | **Route Consolidation & Cost-per-Kg Evaluator** (Python) |
| 23 | **Property & Hospitality** | Rental / Leases / Reservations | Units, leases, reservations, auto-invoicing | **Occupancy Rate & RevPAR Engine** (Python) |
| 24 | **Knowledge & Learning** | Knowledge & eLearning | Articles, courses, enrollments, assessments | **Quiz Grader & Certificate Eligibility Engine** (Python) |
| 25 | **AfriCore Studio** | Odoo Studio | No-code apps, custom records | **Custom View & Field Schema Validator** |
| 26 | **Integrations Hub** | API / Webhooks / Pipelines | Connectors, pipelines, event bus, topology | **Webhook Retry Backoff & Delivery Health** |
