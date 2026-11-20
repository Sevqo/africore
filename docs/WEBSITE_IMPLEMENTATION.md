# Website implementation — Phase 3 local checkpoint

Status: **typed page editor and snapshot publication slice implemented; full Website scope is incomplete**.

## Authority and public route

Website drafts are encrypted `website_page` ERP records. Publishing requires the exact current draft version and stores an immutable encrypted snapshot in the existing `ac_publications` / `ac_publication_versions` authority. A unique active slug is enforced per environment. Public rendering reads only active production snapshots for active Business workspaces. Draft preview is rendered in the authenticated editor; it does not mutate the public snapshot. Unpublish deactivates the snapshot. Sandbox publication returns no public URL, avoiding a false live-site claim.

The new public API is `/api/public/sites/:slug`; the SPA handles `/sites/:slug`. Typed React output does not render submitted HTML. Block links are restricted to HTTPS, mailto and single-slash root-relative paths; protocol-relative links are rejected. Image blocks must reference a `/public/` path, so private Documents URLs are rejected. The editor cannot yet select or create such public media because upload/selection is not integrated.

## Interface and supported data

Implemented screens include a page register with search/status/version/SEO columns, six starter templates that create real editable typed sections, a draft canvas, inline title/body edits, supported block insertion, duplicate/reorder/delete, SEO title/description/noindex fields, save draft, draft preview, publish/unpublish and a production-only View Website link. Typed section kinds include hero, heading, text, image/gallery, columns, features, CTA, testimonial, pricing, FAQ, contact/contact form, footer and commerce showcase.

## Open implementation gaps

There is no separate website identity/settings record, multi-website host scoping, nested routes, publication history/restore UI, change-path redirect authority, sitemap/robots generation, canonical URL editor, public contact-form submission/rate protection, persisted media upload/selection/alt-text metadata, public media replacement workflow, Commerce product sourcing for product showcase, usable menu hierarchy editor/publish lifecycle, theme editor/undo/redo, blog/content, or custom domain/HTTPS verification. Several block types currently render as a generic typed text/image/CTA shell rather than a rich block-specific layout. The visible navigation currently exceeds the completed screens. Do not describe these areas as working or the Website app as Odoo-equivalent.

## Tests and visual evidence

`src/__tests__/phase3-apps.test.ts` covers Website service activation, page creation, versioned publication in sandbox, no sandbox public URL, and protocol-relative URL rejection. `npm --prefix website run build` completed the production bundle/prerender and content suite at 135/135. No anonymous production route could be opened or browser visual comparison completed in this checkpoint. Odoo source notes cite the page, menu and routing models; documentation URLs timed out. Supplied block/editor/menu/pages/templates references are Odoo 19 captures.
