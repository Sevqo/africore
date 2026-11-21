# Website implementation — Phase 3 local checkpoint

Status: **typed page editor, reviewed public media, and consent-based contact submissions are implemented; full Website scope is incomplete**.

## Authority and public route

Website drafts are encrypted `website_page` ERP records. Publishing requires the exact current draft version and stores an immutable encrypted snapshot in the existing `ac_publications` / `ac_publication_versions` authority. A unique active slug is enforced per environment. Public rendering reads only active production snapshots for active Business workspaces. Draft preview is rendered in the authenticated editor; it does not mutate the public snapshot. Unpublish deactivates the snapshot. Sandbox publication returns no public URL, avoiding a false live-site claim.

The public read API is `/api/public/sites/:slug`; the SPA handles `/sites/:slug`. Typed React output does not render submitted HTML. Block links are restricted to HTTPS, mailto and single-slash root-relative paths; protocol-relative links are rejected. Image blocks reference immutable, re-encoded public-media records in the same organization/environment. Private Documents URLs are not selectable. A public image is served only when an active production Website snapshot references it. Upload requires an owner/admin, Website or Commerce activation, a bounded raster file, alt text, public-use acknowledgement and rights acknowledgement. This acknowledgement is not independent rights verification and the pipeline does not claim malware scanning.

Published contact-form blocks POST to `/api/public/sites/:slug/forms`. Required name/email/message and explicit consent are validated server-side; a honeypot returns a success response without storage. The global unauthenticated IP limiter applies. Accepted payloads are encrypted with workspace/environment-bound context and shown to current workspace administrators through `GET /api/v1/organizations/:org/website/forms`; payload content is cleared when the inbox is next read after its 90-day expiry. No email delivery or CRM handoff is claimed. A sandbox cannot activate live Website service, so anonymous accepted-submission persistence has not been exercised through a production-mode integration test.

## Interface and supported data

Implemented screens include a page register with search/status/version/SEO columns, six starter templates that create real editable typed sections, a draft canvas, inline title/body edits, supported block insertion, duplicate/reorder/delete, SEO title/description/noindex fields, save draft, draft preview, publish/unpublish and a production-only View Website link. Typed section kinds include hero, heading, text, image/gallery, columns, features, CTA, testimonial, pricing, FAQ, contact/contact form, footer and commerce showcase.

## Open implementation gaps

The app has a separate encrypted website identity/settings record, publication history with restore as a new version, a bounded nested draft menu, and a production-scoped sitemap endpoint. Still missing are multi-website host scoping, nested public page routes, changed-path redirects, a robots.txt endpoint and canonical URL editor, public-media replacement/withdrawal controls, Commerce-backed product data for showcase blocks, a full site theme token set, undo/redo, blog/content workflows, and custom-domain/HTTPS verification. Several block types still share a typed presentation instead of complete block-specific editing/rendering contracts. Do not describe these areas as working or the Website app as Odoo-equivalent.

## Tests and visual evidence

`src/__tests__/phase3-apps.test.ts` covers Website-only media upload/metering, authenticated image preview, page media reference validation, versioned sandbox publication, no sandbox public URL, protocol-relative URL rejection, and the production activation/public submission boundary. The website build passed; content suite 135/135. The in-app synthetic browser showed the administrator Forms inbox and its empty state at a narrow viewport. An accepted public production form submission and matched Odoo desktop comparison remain unverified. Official Odoo 20 documentation confirms drag-and-drop typed blocks and configurable menu nesting; see [Building blocks](https://www.odoo.com/documentation/20.0/applications/websites/website/web_design/building_blocks.html) and [Headers and footers](https://www.odoo.com/documentation/20.0/applications/websites/website/pages/header_footer.html). Odoo source directory access timed out from the research tool. Supplied block/editor/menu/pages/templates references are Odoo 19 captures.

## Website editor continuation — 21 November 2026

The draft canvas and public snapshot renderer now have distinct typed presentation for hero, heading, image/gallery, feature cards, columns, FAQ details, pricing cards, testimonial quotes, forms, commerce showcase links, and footer sections. Feature/column bodies use one item per line with `Title :: description`; FAQs use `Question :: Answer`; pricing uses `Name | price | description`. This keeps pricing operator-authored and does not invent catalog prices. Selected blocks expose background color, image alt text and supported CTA label/link controls. The same contracts render in the authenticated draft canvas and public site. TypeScript/Vite production build and the website content suite passed (135/135) after this change.

Remaining block gaps include multiple media items in gallery, a canonical Commerce product query for the showcase, richer contact/business identity fields, resize/drag positioning, undo/redo, and visual comparison at Odoo reference dimensions. Typed rendering does not close the separate Website identity, hierarchy, publication-history, redirect or sitemap gaps above.

## Continuation — 21 November 2026

Website identity and publication history now exist independently from individual page drafts:

- `GET /website/settings` returns the current workspace's encrypted site identity. `PUT /website/settings` is owner/admin only and uses optimistic record versions. It stores name, description, public-access switch, default page, logo media reference, brand color and content width in `website_identity` ERP objects; no database migration is needed.
- The public renderer takes the site name/color/logo from the immutable publication snapshot. Logo media is validated against the scoped public media library. Disabling public access deactivates active Website publications; turning it back on requires explicit republishing.
- `GET /website/pages/:id/publication-history` lists the 50 most recent immutable versions. `POST /website/pages/:id/publication-history/:version/restore` validates snapshot integrity and current media references, then creates a new publication version without changing the draft.
- The editor now has Website Settings and Publication History panels. A custom host is intentionally unavailable: published URLs use `/sites/<page-slug>`. The configured default page is recorded, but the platform does not yet map a workspace root hostname to it.

The focused synthetic API test covers saving identity, two publications, history listing and restoring version 1 as version 3. Public production routing still cannot be proven in the synthetic environment because Website production activation is refused. The latest Website production build/content suite passed 135/135; browser review of these new panels remains open.

### Current status correction — 21 November 2026

The Settings panel now renders with no selected page. Synthetic browser checks saved a Website name, reloaded it, and navigated to the Pages register at `section=pages`; the latest rebuilt bundle passed 135/135 content checks. The history restore API has focused tests, but its UI is not browser-verified. Website remains incomplete: production public publication/form submission, root-host/default-page mapping, redirect/sitemap/canonical metadata, Commerce-backed catalog sections, nested menus, undo/redo, and media replacement/withdrawal remain absent or unverified. The final Browser width was 550px; Odoo desktop comparison has not been performed.

The no-page Media section now renders the site-wide public library and its upload/preview controls. Menus, Theme, and SEO explain that they require selecting a page and keep the page register available. This final no-page Media workflow is compile/build verified only, not browser-interacted.


## Website repair checkpoint — 20 November 2026

Page update validation now accepts the persisted template field that the editor includes, fixing the observed 400 on draft save. The page ID is stored in the URL and the editor restores it after refresh. Draft menus support add, rename, link edit, reorder, remove, save and discard; theme color/width and SEO draft controls save through the versioned page API. A sandbox page was saved, published and unpublished in browser checks; the UI correctly reported that sandbox publication has no public production URL. Website identity, media upload/library, persistent public forms, publication history/restore, production tenant routing, redirects/sitemap and canonical Commerce product rendering remain open. See [Phase 3 acceptance](PHASE3_ACCEPTANCE.md).

## Phase 3 continuation, 21 November 2026

Public Website rendering now updates title, meta description, robots, Open Graph title/description and canonical URL from the published snapshot; previous document head values are restored when the page component is left. This is client-rendered metadata. Production crawl/index behavior, custom domain/site-root mapping, sitemap and redirects remain unverified or unsupported. The website build and content suite passed 138/138 after this update. Publication on a production-enabled Website service and anonymous form success still require runtime qualification.

The Website register now duplicates a selected page as a new unpublished draft with a fresh unique slug. The published renderer updates title, description, robots, Open Graph and canonical metadata client-side; server-side crawl output, sitemap, redirects, custom domains and canonical root mapping are still not supported.

Website page duplication now creates a new draft and client-rendered SEO metadata reflects the current published snapshot. Website content tests remain 138/138 after these additions. The features do not add a sitemap, redirects, host mapping, product data source, server-rendered metadata or production crawl verification.

## Website menu hierarchy — 21 November 2026

Website page menu items now support a bounded three-level draft hierarchy through `parent_index`. The editor can nest an item under the preceding root item and outdent it; ordering is restricted to siblings so a child cannot be moved before its parent. Removing an item promotes its direct children to the root and keeps remaining parent references valid. Draft preview and public rendering show the hierarchy, and public links still pass the existing safe-link allowlist. The API rejects forward parent references and hierarchy depth above three. The menu stays in the page draft until a new publication is made. The focused Phase 3 API test now saves and validates a nested menu and rejects an invalid forward reference.

## Public internal-link routing — 21 November 2026

Published menu and call-to-action links now resolve same-site paths through the supported `/sites/<page-slug>` route. A `/` link resolves to the snapshot's configured default page slug, falling back to the current published page when no default is configured. Approved HTTPS, mailto and tel links remain external; protocol-relative, encoded and unsupported nested page paths are rejected by the resolver. Existing published snapshots without `default_page_slug` remain compatible. Link mapping tests pass, the full Website build/content suite passes 142/142, and backend typecheck plus focused Calendar/Website integration tests pass. This route change has not yet received a separate browser click-through; sitemap, redirects, server-rendered SEO metadata, and production host mapping remain open.

The focused backend integration test also configures a default page, publishes the page in the synthetic sandbox, decrypts the immutable publication snapshot with its scoped context, and verifies the page slug was captured for root-link resolution. The focused suite passed 5/5 after this assertion.

The publication API now validates same-site menu and CTA links before creating a public snapshot. A link may target the page being published, the configured default page, or a page with an active publication in the same organization and environment. Unsupported/nested slugs fail with 400; links to an unpublished target fail with 409. The focused Phase 3 API test verifies the unpublished-target rejection and successful current-page/default-page publication. This remains API-tested only; cross-page anonymous browser navigation has not been exercised.

## Public sitemap endpoint — 21 November 2026

`GET /api/public/sites/:slug/sitemap.xml` now returns XML for active production publications under the same organization as the requested published page. Each candidate is passed through the public page gate, so unpublished, withdrawn, inactive-service, inactive-workspace, or disabled-public-access pages are excluded. Absolute `loc` values use the validated HTTPS `AFRICORE_PUBLIC_ORIGIN`; if it is absent or invalid, the endpoint returns 404 rather than publishing incorrect URLs. The Cloudflare worker permits only GET/HEAD for this exact sitemap suffix and keeps the response `no-store`. Gateway forwarding is tested; a successful sitemap against a production-enabled tenant and a browser crawler check remain unverified.

## Website template browser follow-up — 21 November 2026

The Contact template was selected in the synthetic app, created as a new draft, and remained the selected editor page after refresh with its Contact title/path and two typed sections. Browser testing found the create handler selected the draft before reloading the page register, allowing the stale previously selected page to replace the new draft state. The handler now refreshes first and selects the returned record afterward. A sandbox publication then appeared in the Publication history panel as version 1; the UI correctly stated that sandbox publication has no production URL. This was tested with the disposable demo DB at 550px, not against anonymous production routing or matched-size Odoo references.

The isolated in-app browser was restarted against the existing disposable Phase 3 SQLite fixture after its original server had stopped. Website browser verification then created a Landing Page template draft, saved it, toggled preview, and refreshed; the selected draft and page editor returned. This confirms a working create/save/preview/refresh sequence at the existing 550px viewport. It does not verify anonymous production publishing, menu click-through, or Odoo desktop parity.

## Public Cloudflare route repair — 21 November 2026

Source review found Cloudflare's gateway allowlist rejected both `/sites/<slug>` and the anonymous `/api/public/sites/...` endpoints, even though the Render Express app mounted them. The Worker now allows one safe slug for the page route, the public page GET, a UUID-scoped media GET, and a contact-form POST; unsupported methods, nested/encoded paths and unrelated subroutes fail closed. All gateway requests remain no-store and the gateway credential is not returned to the caller. `node --test deploy/cloudflare/worker.test.mjs` passes 11/11, including these routes. This is code/test evidence only; no Cloudflare deployment, Render readiness check or anonymous production request was performed.
# Website media withdrawal follow-up — 21 November 2026

The Website media library now exposes a withdrawal action for active public-use images. The authenticated endpoint accepts Website-only or Commerce-only workspaces and meters the operation against the active service. Withdrawal is blocked with HTTP 409 while an active Website publication references the image, so a published page remains available; owners must remove the reference and republish or unpublish before withdrawal. Existing Commerce storefront withdrawal behavior is preserved: a withdrawn image stops being delivered immediately while its retained custody/history remains intact.

Verification: the Calendar and Website integration fixtures passed together, including the active Website reference guard. The full backend suite passed 486, failed 0, with 1 PostgreSQL-only test skipped. Typecheck, lint, platform route validation (554 operations), Website production build/content checks (142), and `git diff --check` passed. This does not verify a production media endpoint or hosted Website publication.

## Server-rendered page metadata — 21 November 2026

The public `/sites/:slug` route now reads the active production publication before returning HTML. It replaces the generic homepage title, description, canonical, Open Graph and JSON-LD metadata with page-specific title/description and robots policy, and clears the homepage prerendered body so the Website SPA can mount the requested page. Canonical and Open Graph URLs are emitted only when `AFRICORE_PUBLIC_ORIGIN` is an exact HTTPS origin. Unknown, unpublished, sandbox and deactivated pages return 404. This provides crawlable metadata but not server-rendered page body content; the visitor content still requires JavaScript. Sitemap entries remain scoped to active production publications.

The helper tests cover XSS-safe metadata escaping, removal of stale home metadata/body, noindex and invalid-origin behavior. The Phase 3 Website fixture confirms sandbox page routes return 404. No production host or anonymous live publication is available in this environment.

## Commerce product showcase — 21 November 2026

The Website editor's Commerce showcase block accepts a safe published storefront slug. Its public rendering reads the production Commerce storefront's published catalog, displaying up to four canonical product names, reviewed images, descriptions and current prices, then links to the Commerce-owned storefront. Website does not copy prices into page content or implement cart, checkout or inventory. Invalid/protocol-like slugs are rejected by the Website page schema. Website typecheck and production build/content checks passed after this UI change; a focused API assertion now covers slug validation. Live production catalog/browser verification remains unavailable.
