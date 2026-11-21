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

## Phase 3 source follow-up — 2026-11-21

Focused paths at the pinned commit sharpen the page, menu and public-route comparisons:

- `addons/website/models/website_page.py` is the website-scoped page record and includes publication and page-property handling. The page register reference is implemented from page records, not inferred from menu links.
- `addons/website/models/website_menu.py` persists menu hierarchy, ordering and website ownership. Draft menu edits therefore need an explicit save/publish boundary in AfriCore.
- `addons/website/controllers/main.py` contains the public website and sitemap routes; its sitemap logic filters to published pages. AfriCore's public route and sitemap must likewise derive from published, tenant-matched snapshots.
- `addons/website/controllers/form.py` exposes a public form submission path with validation and anti-abuse checks. AfriCore public forms need persisted submissions and rate/spam controls; a rendered form alone is not a working workflow.
- `addons/website/views/website_pages_views.xml` and `addons/website/views/website_views.xml` provide the page register and menu editing references corresponding to supplied W2–W4 screenshots.

AfriCore follow-up decision: test public forms and sitemap generation against the exact published site identity and page snapshot; keep private media inaccessible and expose only reviewed public assets. Official documentation retrieval and matched-viewport AfriCore/Odoo visual comparison were not completed, so no pixel-parity claim is made.
