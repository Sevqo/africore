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
# Website editor undo and redo — 21 November 2026

The page editor now keeps up to 100 in-memory draft snapshots per selected page. Undo and redo buttons are available in the Website Editor, with Ctrl/Cmd+Z, Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z shortcuts when focus is outside a text input. A new edit after undo clears the redo branch. Restored edits remain draft-only until saved; saving still uses the current optimistic version check and publication snapshots are unchanged. Website production TypeScript/Vite build and 142 content checks passed; root typecheck, lint/architecture checks and `git diff --check` passed. This editor history is session-local and has not yet received browser interaction or accessibility review.

## Anonymous form rate controls — 21 November 2026

Public Website contact submissions now have a dedicated per-IP limit of 10 requests per 60-second window, in addition to the global API limit and the honeypot. This is an in-process limiter and resets on restart; multi-instance global coordination is not provided. Its focused hardening test passed 6/6. This reduces basic spam but does not claim CAPTCHA, persistent abuse reputation, or guaranteed cross-instance enforcement.

## Multi-image gallery blocks — 21 November 2026

Website gallery sections now support up to 12 distinct reviewed public media assets. The editor can add images from its media library, preview the grid, and remove selected images. Page validation rejects duplicates, over-limit sets and multi-image fields on unrelated block types. Save, publication restore, public snapshot validation, image delivery and active-publication withdrawal checks all include every gallery image ID. Focused Phase 3 HTTP integration passed 6/6, including a valid image set, duplicate and 13-image rejection, and blocked withdrawal while a publication references the asset. Website build/content checks passed 144/144. The gallery has not yet been browser exercised against anonymous production publication or compared at Odoo reference dimensions.

## Sitemap SEO correction — 21 November 2026

The public Website sitemap now omits pages whose publication snapshot is marked `noindex`; those pages remain directly reachable while the page response continues to emit `noindex, nofollow`. This aligns the sitemap with page-level SEO intent. The focused Phase 3 suite passes 7/7 including the indexability rule. Production sitemap behavior remains unverified because this local fixture publishes only to the sandbox environment.

### SEO and browser acceptance update — 22 November 2026

The sitemap now excludes `noindex` snapshots while leaving those pages directly reachable; page robots metadata remains `noindex, nofollow`. Regression coverage passed in focused Phase 3 (7/7) and full backend (491 passed, one PostgreSQL-only skip). Browser-local Website flow selected the Contact template, inserted and edited a hero block inline, saved, previewed, published to sandbox, and refreshed with the selected draft preserved. The sandbox publication gave no production URL. Desktop and 550px layout samples were inspected, but there is no complete Odoo comparison. Public production hostname/route, anonymous public forms, multi-site identity/domain mapping, redirects, mobile builder details and other stated Website gaps remain open.

## Website theme controls — 22 November 2026

The Website draft theme now exposes validated typography, background color, section spacing, header style, footer style, button shape, brand color, and content width. The editor applies these tokens to its draft preview; public rendering applies the values captured in the publication snapshot. Inputs are represented as bounded enums or hex colors, not arbitrary CSS. Phase 3 integration tests pass 7/7, including rejection of an unsafe CSS-shaped value. Typecheck, lint, build, and the Website production build/content checks passed during this local change. Live production rendering and full Odoo visual comparison remain unverified.

### Website inquiry handoff and latest local regression — 22 November 2026

Website administrators can explicitly create a CRM lead from an encrypted public inquiry when both Website and CRM services are active. It uses the canonical CRM creation path, records the Website source and page slug, follows CRM idempotency/audit/limits, and clears the encrypted inbox payload after success. The HTTP regression verifies replay returns the same lead and does not duplicate it. Focused Phase 3 passed 8/8; full backend passed 492, failed 0, skipped one PostgreSQL-only test; Website build/content passed 144/144; typecheck, lint, root build, OpenAPI (59/59), platform route validation (555), Render verifier (5/5), Cloudflare (11/11) and diff check passed. The public production form path and live CRM tenant have not been exercised. Production/hosted acceptance remains open.

### Website forms: explicit CRM handoff — 22 November 2026

The previous notes that no CRM handoff existed are superseded for administrator conversion. The Forms inbox now offers a Create CRM Lead action for new inquiries. It is available through the canonical CRM service only when active; it creates an idempotent, audited CRM lead, records the public page source, and clears the encrypted inbox copy. Automated coverage verifies conversion/replay and tenant-scoped storage. Anonymous production form acceptance and actual customer tenant use remain unverified.

## Website drag-and-drop block ordering — 22 November 2026

Website draft blocks can now be reordered with native drag-and-drop in the page canvas; the selected block remains selected across the move. Existing up/down buttons remain available for keyboard and touch use. Helper tests cover forward/backward movement, index remapping and invalid drops. Website production build/content passed 146/146 and lint passed. The drag gesture itself has not yet been browser verified.

## Website editor continuation — 22 November 2026

The editor canvas supports native drag-and-drop block ordering and remaps the selected block after a move. Helper tests cover both directions and invalid targets; the up/down controls remain available. Website production build/content checks pass 146/146. The drag gesture is not yet browser verified. Production form submission/host routing and full editor/menu/media/SEO acceptance remain open.

Final local verification on 22 November 2026: Website build/content passed 146/146; backend passed 493 with one PostgreSQL-only skip; lint, OpenAPI 59/59, platform validation 560, Render verifier 5/5, Cloudflare 12/12, and `git diff --check` passed. The Calendar public booking browser attempt timed out before local navigation; this does not add Website public-route browser evidence. Live production host routing, anonymous production form acceptance, media upload/publication, complete page/menu/history workflows, and matched-size Odoo screenshots remain outstanding.
## Superseding Website marketplace and browser update — 22 November 2026

The synthetic Business workspace showed AfriCore Website in Browse Apps. The installation preview resolved the Website publishing evaluation service, installation succeeded, and the Website Overview opened. Refresh retained the installation; Browse Apps then showed the app as installed with an Open action. The Overview screenshot was inspected in-session but was not exported as a repository artifact.

Website acceptance remains incomplete: the full page/template/block editor, draft menu and theme workflows, media upload and publication checks, anonymous form submission, SEO/sitemap/redirect flows, real tenant host routing, public publication/unpublication and full Commerce integration still need end-to-end browser and Odoo visual acceptance.
### Current release regression — 23 November 2026

Fresh isolated PostgreSQL 17 full suite passed 497/497, and the synthetic Business browser confirmed Website discovery, install preview, installation, opening and refresh persistence. The full Website authoring/public-host acceptance matrix and Odoo comparison remain outstanding.

### Phase 3 status update — 23 November 2026

Website TypeScript/Vite production build and content suite pass 146/146. Current tests cover editor block ordering, versioned pages/publication, forms and CRM handoff, public media controls, SEO metadata/sitemap behavior, Commerce catalog sourcing, and tenant/publication authorization. The full visual editor, menus, media, theme, anonymous forms, live public route/host mapping, and responsive Odoo comparison have not all been browser-verified. The public route is page-scoped (`/sites/:slug`); custom host/root-page mapping remains unsupported and must be stated accurately in the UI/docs. Website is not release-accepted.

## Website CTA behavior repair — 23 November 2026

Source review found that the draft canvas showed CTA buttons without navigation and public pages rendered empty or rejected CTA destinations as a clickable `#`. Added a shared safe CTA resolver. Drafts show a disabled visual until a valid link is configured; editor Preview exposes the resolved same-site or approved external destination; the public Website omits CTAs without a valid destination. Focused CTA/link and editor helper tests pass 5/5, root typecheck and lint pass, and Website production build/content checks pass 147/147.

### Cloudflare publication delivery — 23 November 2026

The gateway previously served its static SPA fallback for every valid-looking `/sites/:slug`, so unpublished pages initially returned HTTP 200 and published pages missed Express-generated SEO metadata. The worker now forwards only GET and HEAD on the supported public path. Express checks publication availability and returns a route marker on its response. The worker strips request credentials, response cookies and the marker, sets no-store, preserves an application 404 and rejects unmarked upstream loading pages. A manual release now verifies that the expected Render commit is live before rolling out the Cloudflare frontend and gateway. Render still uses verify mode and its readiness probe.

Local gateway tests passed 12/12, Phase 3 HTTP tests passed 9/9, platform validation checked 560 operations, OpenAPI checked 59 operations, lint passed and Render verifier tests passed 5/5. Wrangler dry run was unavailable because its local dependency install requires packages absent from the offline cache. Hosted routing and deployment readiness still need verification.

### Public Website lifecycle and withdrawal — 23 November 2026

Publication restore checks the current Website public-access setting before making a production page active. Anonymous HTML, media, forms and sitemaps use the same publication lookup. Form persistence checks the exact publication ID, tenant, version and current service/workspace state in the insert statement. The disposable API fixture qualified the public workflow by temporarily allowing Website activation in that test database and activating through the ordinary API. It did not edit the shipped service catalog or manually insert entitlement rows. SQLite verified anonymous page reads, inquiry persistence, withdrawal, and refusal to restore while disabled. Hosted Website availability still requires separate release verification.

### Redirects, appointment concurrency, and connected browser checks — 23 November 2026

Renaming and republishing a Website page retains its old HTML path as a same-site 308 redirect to the page's current publication. Publication history restoration can return to the old path. A different page cannot claim the retained Website path, and withdrawn publications disable their redirects. The Worker accepts only a marked relative Website redirect. This uses existing ERP storage and adds no migration. The SQLite and PostgreSQL 17 focused suites passed 10/10, including concurrent booking replay, competing organizer approvals, and the Website redirect lifecycle. Gateway tests passed 12/12.

In a fresh synthetic Business workspace, the in-app browser displayed Calendar and Website as installable. Both required-service previews resolved, installation opened each workspace, and both showed as installed after reload. The browser created a Contact draft, edited its title, and observed the save confirmation. Calendar saved and displayed a synthetic meeting. The Calendar Appointments screen created a synthetic type and booking link. The direct public route displayed date-specific availability, accepted an inquiry, then rendered the pending booking management screen. Browser inspection found and confirmed the Marketplace text-overlap fix. Desktop screenshots were emitted in the browser trace. Full mobile and Odoo comparison, screenshot export, hosted readiness, and the complete workflow matrix remain outstanding.

### Website SEO, page filters, and block insertion

Website editors can select a canonical page from the same workspace. Publishing rejects external URLs, unpublished targets, noindex targets, and targets that declare another canonical page. Public HTML and the page API recheck the target and fall back to the current URL if the target becomes unavailable. The sitemap omits pages with a different valid canonical target. The backend SQLite Phase 3 and SEO suites passed 12/12. The Website build and 147 content checks passed.

The Pages register filters by draft or published status alongside title and slug search. The browser confirmed the Published filter hides the synthetic Contact draft and the Drafts filter shows it. The browser also confirmed that dragging a Heading from the palette before the hero inserts and selects the block, and that its position persisted after save and reload. The browser trace contains a desktop capture. The palette still supports click insertion. The Theme shortcut opens actual draft theme settings.
