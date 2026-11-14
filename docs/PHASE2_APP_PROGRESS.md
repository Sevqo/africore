# Phase 2 — Applications Progress

Current checkpoint: **2.1 Commerce app/service separation** — implemented and verified.

Source checkpoint: Phase 1 committed by the founder; this work is uncommitted by design.
Hard limits observed: no commits, pushes, deployments, production data or provider changes.

## Checkpoint status

| Checkpoint | App | State |
| --- | --- | --- |
| 2.1 | Commerce | Implemented; build/tests green; browser click-through not executed |
| 2.2 | Finance | Not started |
| 2.3 | Sales | Not started |
| 2.4 | Inventory | Not started |
| 2.5 | CRM | Not started |
| 2.6 | Procurement | Not started |
| 2.7 | Accounting | Not started |
| 2.8 | POS | Not started |
| 2.9 | Work | Not started |
| 2.10 | People | Not started |
| 2.11 | Documents | Not started |
| 2.12 | Analytics | Not started |
| 2.13 | Automations | Not started |
| 2.14 | Business ID | Not started |

## Checkpoint 2.1 — what was wrong

`AppsWorkspace` dispatched `app.id === 'commerce'` to `<CommerceWorkspace embedded>`, the same
component the independent Commerce service renders. The app only added an identity header,
installation review and a two-item navigation (`dashboard`, `orders`). Opening the app therefore
opened the service with a wrapper; the app added no operational composition.

## Architecture change

- `src/apps/catalog.ts` — Commerce app navigation now follows a merchant workflow:
  Overview, Catalogue, Orders, Storefront, Inventory, Payments, Reports, Settings.
  Required/optional services, preview availability and uninstall semantics unchanged.
- `website/src/commerce/merchant-sections.ts` — one exported workflow order shared by the app
  registry test and the UI.
- `website/src/commerce/CommerceMerchantWorkspace.tsx` — dedicated app-level workspace. It reads
  the same authoritative `/commerce/stores`, `/configuration`, `/listings` and `/orders` endpoints
  through the shared idempotent API. It does not import, wrap or duplicate `CommerceWorkspace`.
- `website/src/apps/AppsWorkspace.tsx` — installed Commerce app renders
  `CommerceMerchantWorkspace`; the direct service path in `BusinessApp.tsx` still renders
  `CommerceWorkspace`.
- `website/src/apps/lazy-workspaces.tsx` — lazy export for the merchant workspace.
- `website/src/workspace-navigation.ts` + `website/src/apps/AppNavigation.tsx` — app section
  routing helper. Commerce sidebar sections stay in the app (`#Apps&section=…`) instead of
  leaving for a same-named shared service tab; other apps keep their existing mapping.
- `website/src/approved-platform.css` — merchant context header, section tabs, overview grid,
  fact lists and responsive collapse using existing tokens/classes.

## How the independent service differs

The Commerce **service** remains the full store operator: create/edit store settings, listings,
collections, delivery and discount rules, media library, checkout authorization, publication
review/publish/unpublish, plus order and overview panels. It stays available without the app.

The Commerce **app** is a merchant control room: store context and switching, pending-action
queue, catalogue/order reporting from authorized pages, storefront readiness and public link,
inventory link state, payment-evidence distinction, supported reports and configuration summaries.
Editing that belongs to authoritative service records links back to the service editor rather than
creating a second editor or state store.

## Verification

| Check | Result |
| --- | --- |
| `website: npm run typecheck` | Pass |
| `website: node --test tests/commerce-app.test.mjs tests/service-navigation.test.mjs tests/application-quality.test.mjs tests/app-intent.test.mjs` | 20/20 pass |
| `website: npm run build` (tsc, Vite, prerender 82 pages, content tests) | 81/81 pass |
| Root `npm run lint` | Pass (179 frontend modules, no static import cycles) |
| Root `npm run build` | Pass |
| Backend `app-installations`, `commerce-catalog`, `commerce-pricing` suites | 27/27 pass |

Browser click-through: **not executed**. No authenticated local workspace/browser control is
available to this session; demo mode has no `/apps` transport, so it cannot install the app.
Do not present screenshots or live-flow evidence as completed.

## Phase 2 application matrix (working assessment)

| App | Required services | Current app screen | Duplication / gap | Target next action |
| --- | --- | --- | --- | --- |
| Commerce | products, commerce, orders, invoicing, payments | Dedicated merchant workspace (new) | Service editor intentionally separate | Verify with an installed app and browser session |
| Finance | invoicing, expenses, cash_flow | `FinanceDashboard`; nav mirrors service tabs | High: Invoices/Payments/Expenses/Reconciliation open service views | Operational finance overview; keep record detail shared |
| Sales | customers, products, sales, orders, invoicing, fulfillment | `SalesWorkspace` | Medium: workflow tabs are app-specific | Verify quotation→order→invoice flow and duplication boundaries |
| Inventory | products, inventory | `InventoryWorkspace` | High: service and app show the same register | Stock-manager overview and exception queue |
| CRM | customers, crm | `CrmWorkspace` | Medium: pipeline exists; Customers duplicates service | Pipeline-first composition, shared customer detail |
| Procurement | customers, products, procurement | `ProcurementWorkspace` | Medium: app tabs mirror procurement stages | Buying desk overview; approval/delivery exceptions |
| Accounting | accounting | `AccountingWorkspace` | High: app opens same journals workspace | Period-close and review overview, not a second ledger |
| POS | products, orders, invoicing, cash_flow, pos | `POSWorkspace` | High: the counter is the app | Keep counter; add shift/cash overview distinct from register |
| Work | work | `WorkWorkspace` | High | Portfolio/board composition distinct from project service |
| People | people | `PeopleWorkspace` | High | HR overview; preserve private access rules |
| Documents | documents | `DocumentsWorkspace` | High | File manager is legitimate app workspace; distinguish service access |
| Analytics | intelligence (+ forecasting) | `AnalyticsWorkspace` | Low-medium: already app-shaped | Confirm coverage/unsupported measures |
| Automations | automations | `AutomationsWorkspace` | Medium | Run/exception overview distinct from rule editor |
| Business ID | passport, verification, credentials, trust_network (+ blockchain) | `BusinessIDWorkspace` wraps `PassportWorkspace` sections | High: same trust workspace under app identity | Identity/evidence overview with app workflow; retain trust detail |

## Service-overlap register (deferred)

- `verification` vs `credentials` vs `blockchain` vs `verification_api`: shared trust evidence and
  verification paths, different authority/qualification. Do not merge in Phase 2.
- `orders` vs `sales` vs `fulfillment`: canonical order records with distinct lifecycle stages.
- `payments` vs `reconciliation` vs `cash_flow`: evidence, matching and movement are separate facts.
- `invoicing` vs `accounting`: source documents vs reviewed double-entry posting.
- No merge, rename, deletion or deprecation is authorized in Phase 2.

## Next step

Continue with Checkpoint 2.2 (Finance) only after Commerce is accepted by the founder. First
inspect `FinanceDashboard` and its sections, then apply the same service-vs-app separation and add
a focused test.
