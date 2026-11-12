# Approved UI reference implementation — 12 November 2026

Implemented from the six founder-approved images, each inspected once. Their figures, ratings and future capabilities were not copied into application data. The working code retains AfriCore branding and the existing 14-app registry.

| Checkpoint | Code delivered | Commit |
|---|---|---|
| A | Charcoal Business/Personal/Developer navigation, green active states, native responsive controls; removed global .75 zoom | 4ca763a |
| B | App directory; distinct CRM pipeline, Work board, Inventory register, Accounting ledger, Documents register and service layouts | 74714eb |
| C | Finance service inclusions, companion-app navigation, metrics/chart/donut/ledger composition, integrated chart controls | 86ddd03 |
| D | Full-page Notifications and distinct merchant administration/customer storefront | 6c02c77 |
| E | Original editorial homepage, confident typography, existing product imagery and retained teaching/content links | 6a1f3be |
| F | Browser corrections, stylesheet precedence, mobile grid containment, working service Cards/List toggle, regression verification | Final acceptance commit |

## Scope and behavior

Every existing app and direct-service render uses the approved shared shell, typography, controls and table system. App-specific layouts remain distinct; Finance has its approved overview hierarchy, CRM and Work preserve interactive boards, Accounting retains reviewed journal/ledger views, Documents retains private file operations, and POS retains its cashier layout. Personal keeps manual personal activity; Developer keeps scoped integration tooling. No new apps, permissions, endpoints, provider activation or migrations were added.

The previous 0.75 root zoom is removed. Native sizing replaces multiplicative scaling: desktop body/table text is 14/13px, with mobile editable text 16px and primary touch controls 44px. This is a responsive type hierarchy, not another uniform zoom adjustment. Brand/font assets are reused.

Notification bell navigation opens the full workspace page, including on mobile. All/Unread/Approvals/Orders/Finance/System filters, search, Nairobi date groups, read/dismiss and existing record actions are retained. Filters run before local pagination. The existing authorized API supplies history in pages; the initial bounded history window is disclosed, and older history can be loaded explicitly. Preferences remain separate from approval decisions; no action auto-approves a financial record.

Commerce overview uses actual store/listing/order data and labels loaded-page coverage. Catalog, storefront/publication and inventory integration controls expose the existing supported forms. View Storefront appears only for a currently published store. The customer storefront has a separate shop sidebar, collection navigation, search, merchant-owned hero, product grid, actual images where supplied, existing cart and checkout. Empty image slots use a neutral fallback. Promotion management, genuine review aggregates, visitor conversion and additional product-type workflows absent from the backend remain future work; no fake controls or statistics were added.

Chart line/area/bar/donut primitives, exact tables, legends, comparison, tooltip, keyboard exploration and drill-down remain grounded in authorized data. Sparse records remain sparse; no intermediate observations or decorative growth trends were introduced.

## Verification

- Website build/prerender and 68 frontend/content tests passed, including notification filter/date tests and chart correctness tests.
- SQLite: 435 discovered; 434 passed, one PostgreSQL-only skip, zero failures.
- PostgreSQL: fresh disposable localhost database, 435/435 passed; cluster stopped afterward. Initial attempts were invalidated by a denied local port and a concurrent build clearing dist; only the final serial fresh-database run is counted.
- Root typecheck, lint, architecture (170 frontend modules), fixture isolation and development configuration (3) passed.
- OpenAPI legacy 59 and platform 427 operations passed. Gateway 10 and isolated local-chain checks passed.
- Isolated in-app browser: desktop 1440 and mobile 390 checks across all 14 app layout families, plus independent service discovery, Personal/Developer, Notifications, storefront and public homepage. No final document overflow was accepted. Representative screenshots are limited to one desktop/mobile pair per reviewed layout pattern, not an exhaustive screenshot collection.
- Browser actions checked full-page bell navigation in Business/Personal, Commerce Catalog/publication tabs, actual storefront URL, service Cards/List switching, Work task inspection, public mobile navigation, and mobile drawer Escape/focus restoration. Mobile inputs measured 16px text and approximately 44px height; root zoom measured 1.

Browser fixes include lazy CSS precedence, the Notifications tab-strip min-content overflow, service-row mobile column precedence, and removal of redundant embedded Commerce headings. All financial/authentication/inventory behavior is preserved; browser checks used the existing disposable synthetic fixture, not hosted records.

## Evidence and limits

See [browser observations](evidence/approved-ui/checks.json) and [Finance preview](evidence/approved-ui/finance-desktop.jpg). The screenshots show actual application code and existing synthetic local records, not regenerated reference images. Empty/sparse/unconfigured states are intentional where that is the authorized data.

The local implementation is verified at representative layout/workflow scope. This does not claim pixel-for-pixel identity for every state, manual acceptance of every section/role permutation, physical iPhone/Safari testing, comprehensive screen-reader certification or measured Core Web Vitals. Public article/guide content, prices, SEO/prerender and onboarding routes are retained. No new reference assets or dependencies were needed.

This approved-reference implementation is committed locally; it has not been pushed or deployed. The earlier Cloudflare release belongs to the preceding UI checkpoint and does not contain these new reference-driven changes.
