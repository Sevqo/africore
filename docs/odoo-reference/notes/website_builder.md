# Website builder comparison notes

Reference: Odoo Community 20.0 checkout at `c1ef83e9c`.

## Observations

- `addons/website/models/website_page.py` treats a page as a website-scoped resource with a URL and published state; the page model also participates in page properties and access handling.
- `addons/website/models/website_menu.py` models menu hierarchy with parent/child links and ordering. Menus are separate records rather than an incidental page list.
- `addons/website/controllers/main.py` contains distinct page listing, page creation and website-serving/sitemap routes. The sitemap query only includes pages marked published.
- The supplied builder references show a block chooser, a visual page canvas with editing controls, a separate menu editor, a dense pages register and selectable page templates.

## AfriCore decision

Use typed sections with a shared React renderer, safe link validation and immutable publication snapshots. Draft content remains private. Commerce remains the authority for products, carts and orders. Public media must be reviewed, public media, not Documents blobs. Menus/themes/forms should only be advertised as available when their edit and publish lifecycle is implemented.

## Limits

Official Odoo 20 Website documentation URLs timed out or were inaccessible in the available reader on 2026-11-20. Source review is focused on page, menu and routing models, not a complete block editor study. Supplied screenshots are Odoo 19 UI references.
