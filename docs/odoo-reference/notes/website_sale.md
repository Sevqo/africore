# website_sale — Odoo 20.0 notes

- Odoo commit: `36fef5806` (read-only reference checkout, branch `20.0`)
- AfriCore question: which catalog, product, cart and checkout behaviors are supported by Odoo's website shop, and which should inform Commerce without importing its models or code?
- Status: focused source review complete, 2026-11-20. Official Odoo documentation URLs timed out in the research browser; this note relies on the pinned source paths below and the supplied screenshots.

## Source paths reviewed

- `odoo-reference/addons/website_sale/controllers/main.py` (`WebsiteSale.shop`, shop filters and pagination)
- `odoo-reference/addons/website_sale/controllers/cart.py` (cart and checkout controller routes)
- `odoo-reference/addons/website_sale/models/sale_order.py` (`_cart_add`, cart line matching, quantity verification and checkout readiness)
- `odoo-reference/addons/website_sale/models/website.py` (shop page size/columns and default sort)
- `odoo-reference/addons/website_sale/controllers/product_configurator.py` (published product domain for configurator choices)
- `odoo-reference/addons/website_sale/models/website_checkout_step.py` (checkout progression and address/checkout readiness checks)

## Findings

- The public shop accepts search, category, min/max price, tags, sale and in-stock filters; it validates categories and uses a configured page size, columns and sort. The shop route is public but checks whether the website has eCommerce access before rendering.
- A cart line is a canonical Sales order line. Adding a product validates its available unit, verifies requested quantity, merges a matching variant/configuration line and rechecks the cart. A product page/configurator is distinct from a catalog card.
- Checkout is an ordered step flow. The checkout-step model checks whether preceding steps and current cart data are ready, including account policy and delivery/address requirements. A payment attempt is not equivalent to settlement.
- Odoo supports wishlist, variant configurator, sale/in-stock tags, price filters and configurable default sort in this module; the shop can expose these where enabled by configuration.

## AfriCore application decisions

- Preserve canonical Products, Orders/Sales, Inventory, Invoicing and Payments. The public shop remains a published allowlisted projection, and a guest cart capability is scoped to its store/environment rather than workspace membership.
- AfriCore's catalog implements published-product search, collection selection, paging, canonical current prices, explicit product detail, quantity bounds, server quote refresh, shipping/discount/tax calculation, and idempotent canonical order conversion. It does not expose arbitrary product attributes, wishlist, price/in-stock facets, customer account, live provider payment or external shipping where the corresponding AfriCore authority is absent.
- The merchant Promotions section reads configured discount rules and routes editing to the existing Commerce service. Server quote revalidation remains authoritative; no usage analytics or campaign attribution is claimed.
- The merchant product register now has Cards/List presentation. It still links editing to canonical Product/Commerce editors and does not duplicate product masters or infer exact stock quantities from listing data.

## Limits

This is a focused source review, not a full Odoo security or checkout audit. It does not claim Odoo visual parity. The supplied Odoo shop screenshots were used as references, but no running AfriCore capture was available for a new matched-viewport comparison. Official documentation pages referenced by the request timed out; no behavior beyond inspected source is attributed to those pages.
