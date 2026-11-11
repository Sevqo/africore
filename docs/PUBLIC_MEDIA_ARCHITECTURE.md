# Public-use image custody

Wave 3 uses separately uploaded public-use raster images. Private Documents files, employment attachments, arbitrary URLs, SVG, HTML and original-file downloads are not inputs to this library.

## Decode and publication boundaries

The browser prepares a selected JPEG/PNG/WebP locally before explicit upload. The server independently validates canonical base64, a maximum input of 512 KiB, raster signatures, a 16-million-pixel limit and a single static image. Sharp 0.35.5 decodes, applies orientation, resizes inside 1200 × 1200 and re-encodes WebP without metadata-retention options. Processing has a five-second native timeout and a process-wide maximum of two transforms. Output is capped at 512 KiB. These bounds reduce resource exposure; they are not a malware-scanning guarantee.

The [Sharp constructor](https://sharp.pixelplumbing.com/api-constructor/) documents decoder/pixel controls, and [output options](https://sharp.pixelplumbing.com/api-output/) documents its default metadata removal. [Sharp security guidance](https://sharp.pixelplumbing.com/security/) remains relevant to dependency maintenance. No image-processing request fetches a remote URL.

Current human Business owner/administrator and active Commerce authorization are checked before decoding and again in the atomic operation. The upload route owns its transaction so the native decoder does not hold the database write lock. Usage caps, retained-content limits and idempotency are enforced within that operation. Upload requires separate public-use and rights acknowledgements; this records the uploader's declaration, not independent rights verification.

Image metadata and canonical bytes use separate context-bound encrypted payloads. Metadata queries and publication reviews do not load every image body. Content digests detect corruption; tenant/environment bindings prevent cross-scope reads. Named descriptive revisions can reuse the same pixels without rewriting older alt text or custody. Exact repeated submissions deduplicate; changed input with a reused key conflicts.

## Public versus private access

Upload does not expose a globally public asset URL. Store publication includes reviewed image references and alt text. Public delivery rechecks current active Business workspace, services, publication, asset state and (for product images) active listing/product/currency. Private merchant previews require current owner/administrator authority and authenticated transport. They use short-lived in-memory object URLs that are revoked on cleanup.

Responses contain canonical WebP only, with no-store, nosniff, inline disposition and a restrictive asset CSP. Withdrawal immediately stops subsequent public delivery, including through older publication references; it cannot erase images already seen or retained by recipients. Encrypted custody and append-only history remain. Deactivation preserves authorized private history while preventing new uploads and publications. Public storefront delivery stops with service deactivation.

Evaluation limits are 500 retained named assets and 50 MiB of canonical image content per workspace/environment. Withdrawal does not reduce retained-content accounting. Permanent erasure, scanning, external CDN custody and custom-domain deployment are separate work.

## Schema and deployment

Migration 018 adds `ac_public_media` and immutable `ac_public_media_events`, scoped indexes, PostgreSQL RLS/PUBLIC revocation and payload/history protection. It is additive. It is applied only to isolated local fixtures at this checkpoint; approved hosted Neon remains at 016. Guarded development backup/migration/readback and backend-before-frontend deployment are still required. Never point normal tests at Neon.

## Development dependency maintenance

Installation exposed two pre-existing development-tool advisories: [follow-redirects](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p) and [minimatch](https://github.com/advisories/GHSA-g3hv-75wg-m249). Narrow overrides select follow-redirects 1.16.2 under solc and minimatch 11.0.1 under typescript-estree. The older ESLint minimatch 3 API is untouched. npm reported zero known vulnerabilities after installation; lint and the isolated chain check passed with these overrides. This is dated package-audit evidence, not a guarantee that every dependency has no defect.
