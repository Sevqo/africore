# Odoo 20 CRM — Feature Parity Audit & Implementation Plan

> Audited against official Odoo 20 CRM documentation (`odoo.com/app/crm-features`, `odoo.com/documentation/20.0/applications/sales/crm.html`) and pinned `odoo-reference/addons/crm*` modules (7 modules).

## Feature Parity Matrix

| Odoo 20 CRM Feature | Reference Module / Doc | AfriCore Status | Implementation |
| --- | --- | --- | --- |
| Visual Kanban Pipeline & Custom Stages | `crm` | Shipped | `CrmPipeline.tsx`, `CrmWorkspace.tsx` |
| Leads, Opportunities & Duplicate Merge | `crm` | Shipped | `CrmWorkspace.tsx` |
| Activity Planning & Scheduled Follow-ups | `crm`, `mail` | Shipped | `src/erp/odoo-phases4-7.ts` |
| Predictive Lead Scoring & Weighted Forecast | `crm` | Shipped | `python/.../crm_forecast.py` |
| **Rule-Based Lead Routing & Round-Robin** | `crm` (`crm.team`) | **Added in App #3** | `python/.../crm_parity.py` (`route_lead`) + `/crm/routing-rules`, `/crm/leads/route` |
| **Lost Reason Catalog & Win/Loss Analytics** | `crm` (`crm.lost.reason`) | **Added in App #3** | `python/.../crm_parity.py` (`win_loss_analytics`) + `/crm/lost-reasons`, `/crm/analytics/win-loss` |
| **Recurring Revenue (MRR/ARR) Normalization** | `crm` Recurring Revenues | **Added in App #3** | `python/.../crm_parity.py` (`recurring_rollup`) + `/crm/recurring/rollup` |
| **Sales Team Quotas & Attainment** | `crm` (`crm.team` target) | **Added in App #3** | `python/.../crm_parity.py` (`quota_attainment`) + `/crm/quotas`, `/crm/quotas/evaluate` |
| **Lead Enrichment Profiles** | `crm_iap_enrich` | **Added in App #3** | `/crm/enrichments` |
