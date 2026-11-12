# Website builder implementation boundary

Design checkpoint, 12 November 2026. This does not register or advertise a working Website app. The complete requirement remains section 8 of WAVE_3_MASTER_PLAN.md.

## Website-only publishing

Website is a general business page builder and requires its own service, not Commerce or Payments. Optional product-collection sections reference an explicitly selected, currently published Commerce store. They never create a second product catalog, cart, order or payment flow. Deactivated Commerce removes the collection projection without exposing private product fields.

Reuse public raster validation and encrypted custody from publishing/assets.ts. Its current access helper explicitly requires Commerce; adding Website must use a reviewed caller-selected service capability, never a client-supplied authorization service name. Current human owner/administrator authority, workspace/environment, public-use declarations, limits and withdrawal continue to apply. Website publication grants no access to private Documents, People or arbitrary remote media. Public images require a current site publication reference on each request.

## Typed documents and editor

Site settings and page drafts use strict, bounded schemas. Pages have unique normalized paths, navigation titles, SEO fields and ordered section identities. Allowlisted section kinds cover hero, text, image, feature list, testimonial list, pricing, contact, FAQ, footer, form, blog index and an optional Commerce collection. Named tokens control spacing, typography, layout and colors. No arbitrary scripts, unsafe HTML, CSS injection, event handlers, embedded credentials or remote iframe execution are accepted.

The editor has a section/page navigator, controlled live preview and property inspector, with responsive previews and accessible keyboard alternatives to drag/reorder. Inline text remains escaped React content. Duplicate/hide/reorder operate on stable section identities. Undo/redo is bounded local draft history; it cannot undo a committed public publication or silently replay a write. Save binds an expected server version and scope. A stale save conflicts rather than overwriting another editor. Navigation/identity changes discard stale asynchronous responses. Dirty-state warnings and offline status describe actual unsaved work; no durable offline publishing queue is implied.

## Publication history and public delivery

An additive migration must retain immutable site publication versions with encryption/context bindings, explicit actor, version and canonical manifest hash. Publication review binds the exact current pages, settings and public media references. Publishing copies only the validated public projection. Rollback creates a new reviewed publication referencing an earlier snapshot; it never rewrites history. Unpublish and media withdrawal stop subsequent delivery while retaining private history.

Website and Commerce need distinct public namespaces and correctly scoped publication lookup. Do not reinterpret existing Commerce ciphertext or source IDs as Website content. Source-specific public projections can share renderer helpers and media custody without changing historical Commerce snapshot contexts. Public response CSP must match the controlled renderer; unknown pages/assets return 404. SEO metadata, canonical links, sitemap, robots policy and redirects derive from the current publication, not arbitrary user URLs. Redirects are bounded, same-site normalized paths with cycle/duplicate detection.

Custom domain states must distinguish requested ownership, verified DNS, configured routing and active TLS. A DNS record alone is not proof of working routing/certificates. Do not claim a custom host is live until the actual edge mapping and HTTPS request qualify. No paid domain purchase or hosting upgrade is authorized. Default AfriCore-hosted publication must work independently of custom domains.

## Contact forms and analytics

Contact forms submit to a narrowly scoped current-publication endpoint with bounded fields, request-size/rate/retention controls, spam defenses and explicit form notice. Store submissions encrypted and privately scoped; preserve source page/form/publication and observation time. Submitted email is unverified and must not merge a Neon identity, establish marketing consent, create a verified customer or grant access. Merchant review can explicitly create/link a canonical CRM entry. No outbound email/SMS/WhatsApp delivery is claimed without a separately configured, authorized provider. Public responses contain no staff/internal notes or other submissions.

Analytics must label the source and coverage, avoid third-party tracking by default and never treat page views as provider-confirmed revenue. Optional tracking needs its actual consent/configuration behavior. Accessibility checks should report concrete detectable issues (missing heading/alt/label/contrast and keyboard order) and retain manual qualification limits.

## Qualification and release

Test both database engines for current membership, revoked service/configuring authority, wrong workspace/environment, stale draft saves, bounded idempotency, immutable publication/rollback, withdrawn media, unknown paths, unsafe links/content, form privacy/abuse and optional Commerce deactivation. Exercise save/undo/redo/reorder/preview/review/publish/unpublish in the isolated browser on desktop and narrow mobile. Verify actual served HTML/metadata, image authorization and gateway behavior. Apply no hosted migration until guarded encrypted backup/readback and release qualification are ready. Register the app/service only with its real tested interface and explicit remaining capability states.
