# Online deployment verification

Status: implementation and deployment verification in progress. No URL or live acceptance is claimed by this document until appended with actual observations.

Implemented checks cover the edge API/body/auth forwarding, spoofed forwarding header removal, no-store responses, redirect/loading-page rejection, malformed upstream origin fail-closed behavior, HTTPS redirect, static SPA fallback and backend origin lock. Existing product regression/build/typecheck/contract gates remain mandatory. Docker build must be verified on a working container builder; the local Docker daemon is unavailable.

Separate results are required for actual HTTPS assets/direct routes, trusted Neon origin, existing managed identity/workspaces, database reads, signup/recovery mailbox delivery, user-entered founder sign-in and physical mobile browser. Browser viewport emulation is not a real iPhone test.

## Local checks — 2026-10-27
Backend:209 discovered,208 passed,1PostgreSQL-only skip; disposable SQLite with hosted URLs explicitly disabled. Website:17/17 tests and production build/prerender passed. Typecheck, lint, startup3/3, legacy59/workspace148 contract checks and edge gateway3/3 passed. Read-only approved Neon development probe: verified TLS,3managed users,1matching verified owner,7workspaces,7memberships and1identity link. No rows or passwords changed. Docker daemon is unavailable locally; hosted builder must verify the repaired Dockerfile. Initial Cloudflare upload was rejected for legacy wildcard _redirects; replaced it with comments and native Worker SPA routing.

## Hosted initialization correction
Cloudflare URL was issued and static pages rendered. Render built the Docker image successfully, but startup migration replay timed out and its deploy was marked failed, despite a brief successful readiness interval. Added fail-closed read-only hosted schema verification; no database reset or identity repair was attempted. Backend stability must be rechecked after this correction. The new schema-mode unit test/build/lint passed. GitHub CI for4452a29 passed all five existing checks, including PostgreSQL and local chain.

## Deployed evaluation and session repair
Actual frontend: https://africore-web.cypriankiprop41.workers.dev ; backend: https://africore-api.onrender.com ; Render service srv-dbgcrl6c6qcc73f1hi50. Render schema-verification deploy ea93f45 succeeded and is Live. Cloudflare version4b18a1a3-ece1-4f30-a053-5f06a44e6e0a contains the session fix. Exact frontend origin is registered in Neon development; localhost retained. Existing provider/subjects, keys, production branch and passwords unchanged.

Stable HTTPS checks: auth/config200(providerneon), unauthenticated account401, direct backend auth/config403(gateway_required), database readiness200throughCloudflare. Synthetic session restored using explicit owner approval: account200, Personal summary200, Business intelligence200, Developer applications200; automation, Passport and CSV endpoints also200. Installed official SDK reproduced cached /token failure; repaired shared sessionIdentity accepted its session JWT against all three actual hosted workspaces. Website build/prerender and20/20frontend tests passed, including three new session regressions; lint/cycle check passed54modules.

Public homepage/login/app/personal/product direct routes returned200HTML/no-store. Hosted homepage and login inspected at390px: no horizontal overflow or broken completed images. CSS, logo, font and product composition visibly loaded. Frontend artifact scan100files found no configured private secrets. Initial broad network smoke probes hit initialization timeouts and are not counted as complete asset inventory qualification. Physical mobile/Safari, user-entered founder password, actual mailbox OTP/reset completion and real outbound webhook receiver remain unverified. Shared Neon email is development-only. Optional AI/payment/storage/publisher credentials were not uploaded or activated.

No paid resources activated. Render Free sleeps while idle; scheduled/background execution pauses and in-memory legacy Orbit work is not restart durable. One verified local AfriCore API process was stopped to prevent competing polling. Existing unrelated services unchanged. GitHub deployment workflow is prepared as a manual main-only evaluation pipeline; scoped Cloudflare token/account variable and Render deploy-hook secrets are not configured, so automatic deployment is not claimed. Existing CI for4452a29passed all five checks; later commit CI must be checked separately.

# Current local candidate — Business ID + Commerce, 20 November 2026

The local tree starts from committed `main` SHA `cdfa55f77e17843eb2b4e166e9cdeaee4310e24a`. Public GitHub Actions run [44607759099](https://github.com/Sevqo/africore/actions/runs/44607759099), run 123, completed successfully across the workflow jobs for that exact committed SHA, including PostgreSQL. It includes the previously fixed CRM forecast query. The local Promotions register and Cards/List UI changes in this working tree were made after that run and are not hosted-CI verified.

## Current candidate checks

| Check | Result |
|---|---|
| `npm run typecheck` | Passed |
| `npm run lint` | Passed; ESLint, architecture (215 frontend modules) and test-isolation checks |
| `npm run validate:openapi` | Passed, 59/59 mounted operations |
| `npm run validate:platform` | Passed, 528 workspace operations; includes backend build |
| `npm test` | Passed, 472 passed, 0 failed, 1 PostgreSQL-only skip (473 total) |
| `npm --prefix website run build` | Passed; TypeScript, Vite production build, 82 prerendered pages and content/app suite 135/135 |
| Business ID + Commerce focused app tests | Passed, 10/10 (`node --test tests/commerce-app.test.mjs tests/business-id-quality.test.mjs` from `website`) |
| `npm run test:dev` | Passed, 6/6 |
| `npm run test:render-deploy` | Passed, 5/5 verifier tests; this tests verifier behavior, not a live deployment |
| `node --test deploy/cloudflare/worker.test.mjs` | Passed, 10/10 |
| `npm run check:chain` | Passed; ephemeral local EVM contract 1/1, Trust integration 21/21 and independent credential verification |
| `git diff --check` | Passed; Git emitted only normal LF/CRLF working-copy notices |

The first sandboxed `npm test` attempt failed before application assertions because ephemeral localhost listeners returned `EACCES` (367 harness failures). The same command rerun with the repository's isolated local loopback test permission passed as shown above. `npm run check:chain` likewise required that permission for its local Hardhat RPC at 127.0.0.1:18545; the authorized rerun passed. No test used a production database. PostgreSQL is represented by the successful pre-change CI run, while one current-worktree PostgreSQL-only test remains skipped locally.

## Hosting and visual status

No Render API/log integration or deployment credentials are available in this task. Therefore the latest Render deployment SHA, build/startup phase, `/v1/readiness` result and hosted migration ledger are **unverified**. The `render.yaml` and Dockerfile retain the Docker runtime, `/v1/readiness` health check, and `AFRICORE_MIGRATIONS_MODE=verify`; the manual deployment pipeline verifies an exact SHA. No deployment or migration was triggered. Docker Desktop's Linux engine is unavailable (`docker info` cannot connect to `dockerDesktopLinuxEngine`), so the image was not built locally. Migration `021-people-expansion` remains unconfirmed, not a diagnosed cause.

The supplied Business ID and Commerce Odoo screenshots were reviewed. No fresh authenticated running-app capture or matched-viewport side-by-side comparison was performed after these changes; visual acceptance and founder acceptance remain open. Existing approved UI evidence is from an earlier checkpoint and is not claimed to cover Promotions or Cards/List.

No production record, provider, credentials, commit, push, hosted migration or deployment was changed. The current changes are local and uncommitted.

## Local verification — 2026-11-19, Documents / CI / Render diagnostic

## Combined Analytics 2.12B + Automations 2.13B — 2026-11-19 local verification

The latest observable Actions run remains [44587770893](https://github.com/Sevqo/africore/actions/runs/44587770893), run 122 on `main` at `9a17f04d193b90b4923dfee9dff1901fa883f9ab`. SQLite, local chain, website and type/lint/deploy-verifier jobs passed; PostgreSQL failed in CRM forecast because Postgres rejects grouping by output aliases and required `ac_crm_entries.data` in the `GROUP BY`. `src/operations/crm-expansion.ts` now groups the board/report/pivot aggregates by selected-column positions. This workspace's full `npm test` passed 472, failed 0, skipped 1 PostgreSQL-only test; that skip leaves the SQL fix unqualified against PostgreSQL. No hosted rerun exists for the unpushed changes.

For the current workspace, `npm run typecheck`, `npm run lint`, `npm run validate:openapi` (59/59), `npm run validate:platform` (528 operations), `npm --prefix website run build` (135/135 content checks), `npm run test:dev` (6/6), `npm run test:render-deploy` (5/5), `node --test deploy/cloudflare/worker.test.mjs` (10/10) and `git diff --check` passed. The full task validation remains incomplete: no PostgreSQL service or Docker engine was available, no matched-size authenticated browser comparison was made for Analytics/Automations, and hosted Render logs/migration state could not be inspected. No deploy, migration, commit or push was performed.

The latest observable main-branch run is [44587770893](https://github.com/Sevqo/africore/actions/runs/44587770893), run 122, for commit `9a17f04d193b90b4923dfee9dff1901fa883f9ab`. SQLite tests, local EVM/independent verification, website build and the type/lint/deployment-verifier job passed. `Tests (PostgreSQL)` failed in CRM forecast coverage: `/crm/forecast` returned 500 because PostgreSQL rejected grouping by the selected aliases and reported that `ac_crm_entries.data` must appear in `GROUP BY`. The earlier `json_extract` portability fix remains present; this is a separate SQL portability defect. CRM forecast board/report/pivot aggregates now group by selected-column positions. Local Business workflow coverage passes 53/53. There is no hosted rerun for the current unpushed fix, so GitHub CI is not yet green for the current workspace state.

`npm run test:render-deploy` passed 5/5 tests for live exact-SHA verification, SHA mismatch, terminal failure, timeout and credential redaction. The deploy workflow retains manual main-only dispatch, Cloudflare-before-Render sequencing, Render hook SHA polling and required secret/variable checks. No real Render status/logs or migration ledger were accessible, no deployment was triggered, and migration `021-people-expansion` remains unconfirmed as a cause. `docker info` could not connect to the Docker Linux engine; image build and container startup remain unverified.

The refreshed isolated loopback runtime returned `ok` from `/v1/health` and `/v1/readiness`. Authenticated local browser checks showed Work Timesheets and Reporting loading without “Resource not found”; Documents Requests showed “No other current member can submit to the selected source and folder” for the owner-only tenant. The Documents preview rendered a synthetic one-page PDF at desktop and 550px width; authorized download completed. No work entry, document request, notification or production record was created. These observations are local only.

Final command matrix for this code change:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed: ESLint, architecture (215 frontend modules), and test isolation |
| `npm run validate:openapi` | Passed: 59/59 mounted route operations documented |
| `npm run validate:platform` | Passed: 528 workspace operations validated against Express registrations |
| `npm test` | Passed: 472 passed, 0 failed, 1 PostgreSQL-only skip; 473 tests total |
| `npm run build` | Passed |
| `npm --prefix website run build` | Passed: production bundle, 82 prerendered pages, website content 135/135 |
| `npm run test:dev` | Passed 6/6 |
| `node --test deploy/cloudflare/worker.test.mjs` | Passed 10/10 |
| `npm run test:render-deploy` | Passed 5/5 |
| `npm run check:chain` | Passed: contract 1/1, trust integration 21/21, independent credential verification confirmed |
| `git diff --check` | Passed |

The first sandboxed `npm test` attempt failed because the runner denied temporary loopback listeners (`EACCES`); it was rerun successfully with local loopback test permission. The single PostgreSQL-only test was skipped because this environment had no working Docker Linux engine / PostgreSQL service, so this run did not validate the SQL fix against Postgres. The website bundler printed two removable upstream Zod pure-annotation warnings; the build completed successfully. `npm run check:chain` used only the local ephemeral chain (chain ID 31337) and ignored `.tmp` artifacts. An isolated `npm ci --omit=dev` check also could not finish: registry DNS returned `ENOTFOUND registry.npmjs.org`, and the offline retry hit Windows `EPERM` while creating `node_modules`; production-only dependency installation is therefore unverified.

Hosted GitHub CI, Docker build, Render deployment, hosted migration verification, founder acceptance and production readiness remain unverified.


## Authenticated refinement deployment — 2026-10-27

Application commit3451fdac6c5b42200458c2675b83a158b175d450 was pushed to main with the configured cypriankiprop41@gmail.com Git identity. GitHub Actions run40574152381 succeeded: PostgreSQL, SQLite, Type check/lint/startup/gateway, Website build and local EVM/independent verification (all five jobs).

Existing Cloudflare Worker africore-web published version eca89b18-a110-459a-9b7f-48448e55103d at https://africore-web.cypriankiprop41.workers.dev. Existing free Render service srv-dbgcrl6c6qcc73f1hi50 deployed the same3451fda revision; deployment dep-dbgg62g473hc73dunctg visibly reported Deploy succeeded | Live. No new secret, domain, paid instance or schema migration was required.

Post-deployment probes: homepage/login/auth-config/readiness200; anonymous account401; direct backend account403. The approved synthetic managed Neon session resolved account200 and Personal/Business/Developer resources200. Additional assertions confirmed Personal series and member/invitation arrays from the new backend. No hosted financial or founder records were changed by these read-only checks. Deployed explicit browser demo displayed the compact dashboard and truthful synthetic/test labels.

Frontend final23/23 checks, backend213cases(212SQLitepass+1PG-only skip;213PostgreSQLpass), all required local gates passed. Local disposable PostgreSQL stopped. Free Render sleep/cold-start, manual invitation delivery, physical iPhone/mailbox qualification and production authorization limits remain as documented. Automatic deployment secrets were not added; this release used existing manual deployment paths.


## Cloudflare UI release — 12 November 2026

Owner explicitly authorized commit and deployment after local acceptance. UI source commit `38e2353` was pushed to main and deployed to the existing `africore-web` Worker at https://africore-web.cypriankiprop41.workers.dev. Active version `5114299d-952b-40ca-995e-d20b28150353` receives 100% of traffic according to Wrangler deployment listing. Cloudflare gateway tests 10/10 and dry-run passed; 96 changed assets uploaded successfully.

Node HTTPS checks: homepage, login, Personal and Developer route HTML and auth configuration returned 200. Five checked content-hashed CSS/workspace assets returned 200 and exactly matched the local tested build SHA-256. Anonymous account API repeatedly returned 503 backend_unavailable; its cause is not established and hosted sign-in/backend acceptance is not claimed. Python HTTP client was denied by the edge; successful checks used Node. No keys, bindings, migrations or hosted records were changed. See evidence/ui-transformation/deployed.json. Earlier “not deployed” statements describe the preceding local acceptance checkpoint and are superseded by this release entry.

## Phase 3 local diagnostics — 20 November 2026

- **GitHub Actions:** current latest `main` run is [124](https://github.com/Sevqo/africore/actions/runs/44770499305), `success`, exact base SHA `d986a01a92f539756f31148c72c34f8ce3b36e97`. It covers the committed Business ID/Commerce change, not this working tree. Existing run 124 jobs report Website build, SQLite tests/platform contracts, PostgreSQL tests, typecheck/lint/development checks and independent EVM verification all green.
- **Local checks:** `npm run typecheck`, `npm run lint`, `npm run build`, `npm run validate:openapi` (59 routes), `npm run validate:platform` (538 workspace operations), `npm test` (476 passed, 1 PostgreSQL-only skipped), `npm --prefix website run build` (includes 135/135 content checks), `npm run test:render-deploy` (5/5), and `git diff --check` passed on the working tree. Full backend test initially failed under the default sandbox because local ephemeral HTTP listeners were denied (`EACCES`); the same suite passed with explicitly permitted local loopback access.
- **PostgreSQL:** local disposable PostgreSQL service is not available in this task; no candidate-specific PostgreSQL test was run. The GitHub baseline PostgreSQL result is not evidence for local edits.
- **Docker:** Docker CLI is installed, but Docker Desktop Linux engine is not listening (`dockerDesktopLinuxEngine` pipe absent). No image build or container startup was verified.
- **Render:** Render logs/deploy API credentials were not available through an authorized tool. No Render deployment or hosted migration was attempted. Readiness remains enabled at `/v1/readiness`; `AFRICORE_MIGRATIONS_MODE=verify` stays fail-closed. The verifier now requires `026-app15-16`, so the operator must apply that additive migration using the existing reviewed migration procedure before deploying this code, then inspect the Render build/start logs, verify exact commit and readiness, and confirm the migration ledger. No migration is run automatically.
- **Odoo docs:** requested official Odoo 20 URLs timed out/unavailable in the reader. Focused pinned Community source findings and limits are in `docs/odoo-reference/notes/calendar.md` and `website_builder.md`; the supplied captures are Odoo 19. No full parity claim.
- **UI:** no browser screenshot at matched sizes and no anonymous production `/sites/:slug` route was verified.
