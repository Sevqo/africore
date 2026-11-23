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


## Phase 3 repair checkpoint — 20 November 2026

Latest GitHub Actions main run is [125](https://github.com/Sevqo/africore/actions/runs/44785878428), successful for base commit f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e. It predates the current uncommitted repair changes. Local typecheck, lint, build, OpenAPI/platform validation, SQLite tests (476 pass, 1 PostgreSQL-only skip), Website build/content checks (135/135), Render verifier tests (5/5) and git diff --check passed. Docker is unavailable because the Linux engine pipe is missing. The active Render dashboard tab points to failed deployment `dep-dc08d315efls73b3m2p0` on africore-api. See the updated deployment evidence below. No migration/deploy was performed. Do not alter the verify gate. See [PHASE3_ACCEPTANCE.md](PHASE3_ACCEPTANCE.md).

## Phase 3 continuation — 21 November 2026

The Website form inbox adds additive schema migration `027-website-forms`, a scoped encrypted submissions table and index, PostgreSQL RLS, and revoked public table access. `prepareDatabase('verify')` now requires 027 alongside 021 and 026, so the existing Render verify-mode startup will refuse a deployment until the hosted ledger has 027. No hosted ledger or Render log was available in this run; no claim is made about the original Render failure's root cause. No deployment or hosted migration was attempted.

The guarded development migration planner supports `--phase3` only through the existing development-only branch/snapshot/apply/verification runner, and only when migration 026 is already present. It creates the 027 plan after the established migrations and verifies 021/026/027. The runner was not pointed at a remote database in this task. The migration still needs an isolated PostgreSQL rehearsal, a reviewed backup/readback on the authorized environment, and a separately authorized apply before a production deployment can start.

The Website-only media metering fix and Forms inbox are locally implemented. Current backend, Website build, OpenAPI/platform validation, lint and Render-verifier results are recorded in `PHASE3_ACCEPTANCE.md`. Docker, PostgreSQL, current CI SHA for these uncommitted changes, hosted Render status/readiness and Odoo desktop parity remain unverified.

## Phase 3 local continuation — 21 November 2026, current checks

The latest full backend suite completed **485 passed, 0 failed, 1 PostgreSQL-only skipped** after Calendar event-history authorization coverage. Website production build/content checks passed **138/138**, including Calendar layout cases for overlaps, sequential reuse, overnight clipping and all-day exclusion. `npm run typecheck`, `npm run lint`, `npm run validate:platform` (550 workspace operations), `npm run validate:openapi` (59/59 operations), `npm run test:render-deploy` (5/5 verifier cases), and `git diff --check` passed. Prior browser checks confirmed Website Pages deep-link state and register contents, Calendar recurrence controls, and Website identity persistence in the synthetic workspace. The latest synthetic browser session expired after server restart, so the updated Calendar canvas and history panel did not receive a fresh browser check. Prior browser width was 550px; no Odoo-matched desktop comparison is claimed. Read-only GitHub Actions API inspection confirmed run 125 is still latest: [run 125](https://github.com/Sevqo/africore/actions/runs/44785878428), successful for base `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e`, predating this uncommitted work. Render logs confirm startup failed on an incomplete migration ledger; the individual missing version IDs, hosted readiness and backup status remain unavailable. No migration or deployment was performed.

### Render failure evidence supplied by the operator

The sanitized Render log and authenticated read-only dashboard view show failed deployment `dep-dc08d315efls73b3m2p0` for service `africore-api`, commit `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e`. Render shows **Deploy failed**, with the exact source SHA. Backend TypeScript build, Website production build/content checks (135/135 at that commit), Docker image export and registry push all completed. The failure occurred at service startup: `prepareDatabase()` emitted `Deployment schema is incomplete; run reviewed migrations separately` and the process exited before readiness. At that commit the verifier required `001-workspaces` through `021-people-expansion` plus `026-app15-16`; this exact error is thrown when at least one required ledger version is absent. The failure phase and migration-verification root-cause class are therefore confirmed. The individual missing ledger IDs are not present in the log, so they remain unknown until the hosted `platform_migrations` ledger is read. Current readiness was not independently fetched.

The later local working tree additionally requires `027-website-forms`. Reviewed local migration code is additive: 021 creates an `IF NOT EXISTS` index on `ac_erp_objects` then records its ledger entry; 026 inserts Calendar/Website service definitions and evaluation prices using conflict-safe writes, without entitlements; 027 creates the encrypted-submission table and scope index, enables PostgreSQL RLS and revokes PUBLIC access, then records the ledger entry. Before any hosted change, read the ledger with `SELECT version, applied_at FROM platform_migrations ORDER BY version`, list missing versions in order, confirm a current restorable backup, rehearse the exact migrations against an isolated PostgreSQL database, then obtain the separately required authorization. No hosted SQL, migration, deployment, or readiness check was performed.

## Phase 3 verification snapshot, 21 November 2026

Backend full suite: 486 passed, 0 failed, 1 PostgreSQL-only skip. Focused final Calendar/Website integration suite after appointment reschedule conflict coverage: 5/5 passed. Website production build/content suite: 138/138. Typecheck, lint, OpenAPI drift (59/59), platform route registration (554), Render verifier unit tests (5/5), and `git diff --check` passed. These are local checks, not a CI run for the working tree or a live deployment. Render dashboard shows failed deployment `dep-dc08d315efls73b3m2p0` on commit `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e`; Docker build and push completed, then schema verification stopped startup. Hosted migration ledger IDs, backup/restore readiness and current readiness remain unavailable. No hosted migration, deployment, commit or push was performed.

The API route registry now validates 554 workspace operations after appointment type update was added. This update adds no route. The final `npm run validate:platform` completed successfully at 554 operations; typecheck also passed. Docker engine remains unavailable, and no disposable PostgreSQL run was possible. Render's hosted ledger and backup status were not supplied; the user reports they cannot retrieve them now.
# Final local verification — 21 November 2026

After Calendar appointment rescheduling conflict checks were added, the full repository suite passed 486 tests with 0 failures and 1 PostgreSQL-only skip. The focused Calendar/Website integration file passed 5/5. Typecheck, lint, Website production build/content checks (138/138), OpenAPI drift (59/59), platform route registration (554), Render verifier tests (5/5), and `git diff --check` passed. An initial sandboxed `npm test` run failed because its ephemeral HTTP test servers received `connect EACCES`; rerunning with localhost integration sockets permitted passed.

The operator-provided log and Render dashboard identify `africore-api` deployment `dep-dc08d315efls73b3m2p0`, SHA `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e`: Docker build/image push succeeded; startup failed in `prepareDatabase()` because the verify-mode migration ledger was incomplete, before readiness. The log cannot identify missing ledger versions. Current hosted ledger, backup readiness and `/v1/readiness` are unavailable. Do not disable verification or apply hosted migrations without the read-only ledger, backup confirmation, isolated PostgreSQL rehearsal and separate authorization.

Fresh browser verification used the isolated synthetic demo server on `127.0.0.1:4011` and a new `.tmp/phase3-final-20261121.db` SQLite file. Marketplace showed 16 Business apps including Calendar and Website. Calendar required-service preview/install/open succeeded and displayed the week grid. Website required-service preview/install/open succeeded with optional services omitted; reload preserved its installed route. Screenshots were captured in the task session at 550px width. This is local browser evidence only; no PostgreSQL, hosted readiness, production URL or Odoo-matched viewport was verified. The demo server was stopped after verification.

## Follow-up verification — 21 November 2026

The Website content suite now passes 142/142 after adding active appointment-type selection and same-site URL coverage. The full backend suite was rerun and passed 486, failed 0, with 1 PostgreSQL-only skip. Focused Phase 3 integration passed 5/5, including publication rejection for unpublished internal targets. Typecheck, lint, OpenAPI (59/59), platform routes (554), Render verifier (5/5) and `git diff --check` passed. These checks remain local and uncommitted; Docker, disposable PostgreSQL and hosted readiness remain unverified.

After the gateway route repair, `node --test deploy/cloudflare/worker.test.mjs` passed 11/11, including public Website route, media, form, method and path-scope cases. This did not deploy the Cloudflare Worker or contact Render.

## Sitemap route follow-up — 21 November 2026

The public Website sitemap endpoint is now covered by the same exact-path Cloudflare gateway policy. Local rerun results: backend `npm test` 486 passed, 0 failed, 1 PostgreSQL-only skip; focused Phase 3 HTTP integration 5/5; Website build/content checks 142/142; lint; OpenAPI 59/59; platform route registry 554; Render verifier 5/5; Cloudflare worker 11/11; and `git diff --check` all passed. The production-only endpoint correctly returns 404 for sandbox publications. No successful production sitemap, live edge route, Render readiness, or hosted schema was verified. The Docker daemon and disposable PostgreSQL remain unavailable.

The final browser follow-up found and fixed two client issues: creating a Website template draft now refreshes the page register before setting the new selection, and Calendar event edits omit the read-only organizer ID rejected by the strict API schema. Current synthetic browser checks verified Contact template creation and refresh, sandbox publication history, appointment type creation/booking/rescheduling/cancellation. Website production build/content tests passed 142/142 after both UI fixes; `npm run lint` also passed after them. Browser tests used only `.tmp/phase3-final-20261121.db` at a 550px viewport. No live publication or Odoo-matched visual comparison is claimed.

### Current local regression — 21 November 2026

After the Website Commerce showcase began reading published product cards from Commerce's canonical public catalog, the full backend suite passed **488/488 executed tests**, with **0 failures** and **1 PostgreSQL-only skip**. Focused Calendar/Website integration passed 5/5, including unsafe storefront-slug rejection. Website production build/content passed 142/142; typecheck, lint, OpenAPI 59/59, platform route validation 554, Render verifier 5/5 and `git diff --check` passed. Docker and disposable PostgreSQL remain unavailable. The supplied Render deployment still has no current hosted migration ledger, backup confirmation or readiness result; no hosted action or deployment occurred.

#### Calendar↔Work integration regression — 21 November 2026

After adding Calendar's optional Work task selector/launch action and server-side Work project authorization, typecheck, lint and Website production build/content checks passed (**142/142**). The full backend suite passed **489 tests, 0 failures and 1 PostgreSQL-only skip**. A focused API test installs both apps, creates a synthetic Work project/task, links it to a Calendar event, rejects an unsupported link kind, and confirms an authorized workspace member outside the project receives 404. OpenAPI drift passed 59/59, platform route validation passed 554 operations, Render verifier tests passed 5/5, Cloudflare Worker tests passed 11/11, and `git diff --check` passed. The UI selector/launch action has not been browser exercised. These checks do not qualify Docker, PostgreSQL, live Render or production publication.

The link integration now also includes CRM leads/opportunities. The full backend rerun passed **489 tests, 0 failed, 1 PostgreSQL-only skipped** (490 total), including valid CRM and Work links plus invalid-kind and Work access-denial cases. Typecheck, lint, Website build/content (142/142), OpenAPI (59/59), platform registry (554), Render verifier (5/5), Cloudflare Worker (11/11) and `git diff --check` passed after the UI changes. CRM/Work link selector browser interaction remains outstanding. No Docker/PostgreSQL/hosted deployment check ran.

## Local regression after Calendar/Website workflow additions — 21 November 2026

The permission-filtered People leave overlay and Website draft undo/redo are included in the current tree. Root `npm test` passed **489/490**, with the sole skipped test requiring PostgreSQL; Website production build/content tests passed **144/144**; typecheck, lint/architecture, OpenAPI (59/59), platform route validation (554), Render verifier (5/5), and `git diff --check` passed. The first sandboxed full-suite attempt could not connect its ephemeral local HTTP servers (`EACCES`); rerunning the requested suite with loopback access passed. No hosted Render, PostgreSQL, Docker, production public website, or new browser interaction was verified by this continuation.

## Current GitHub Actions evidence — 21 November 2026

The latest observable repository run is CI run 126 for commit `e061805f57ba8fccfc4afa5adabccf7b96f5079b` ([run 126](https://github.com/Sevqo/africore/actions/runs/44917338258)). Website build, type/lint, local EVM and SQLite jobs passed. The PostgreSQL test job failed. The GitHub connector exposes the run/job status but not the failure log payload, and the sandbox has no Docker engine or usable disposable PostgreSQL service, so the PostgreSQL root cause remains undiagnosed. The current local SQLite suite passes; this is not CI or PostgreSQL verification. Do not cite successful run 125 for this newer SHA.

## Full local regression after Documents links and form throttling — 21 November 2026

npm test passed with 490 passed, 0 failed and 1 PostgreSQL-only skipped (491 total; 21 suites). This run includes the private Calendar-to-Documents permission case and the anonymous Website form rate-control changes. The hardening suite passed 6/6; Website production build/content passed 144/144; typecheck, lint, OpenAPI (59 mounted operations), platform route validation (554 operations), Render verifier (5/5), and diff check passed. Docker/PostgreSQL runtime, the failing PostgreSQL CI job's log, hosted migration ledger/backup status, Render recovery, production Website URL, and full Odoo desktop parity remain unverified. No hosted changes or deployment were made.

### Latest local Phase 3 slices — 21 November 2026

The last full `npm test` run passed 490 tests, failed 0 and skipped one PostgreSQL-only case (491 total), before the gallery-array validation change. After that change, `npm run build`, lint, Website build/content (144/144), and the focused Phase 3 HTTP integration (6/6) passed. The integration includes gallery duplicate/size rejection, active-publication withdrawal protection, and Calendar document authorization. Full PostgreSQL, current-tree CI, production Render, production Website, browser interaction for recent controls, and Odoo desktop comparison remain unverified.

## Local release check — 22 November 2026

Latest `npm test`: 491 passed, 0 failed, 1 PostgreSQL-only skip (492 total, 21 suites). Focused Phase 3 HTTP suite: 7/7. Typecheck/lint/build passed; OpenAPI is 59/59; platform route validation is 554 operations; Render verifier tests are 5/5; Website production build/content checks are 144/144; `git diff --check` passed. Browser-local synthetic acceptance exercised app discovery, install/open, Website draft save/preview/sandbox publish/refresh, Calendar week layout, and Website at mobile width. These do not verify a live production site or Render.

The founder-provided Render log shows deployment `dep-dc08d315efls73b3m2p0` at `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e` reached successful image build/push, then backend startup failed in `prepareDatabase()` because required schema migrations were absent from the verified schema. Exact missing migration IDs cannot be proven without the hosted migration ledger; backup/restore readiness was not confirmed. No migration or deployment was executed. Latest observable CI run 126 is for `e061805f57ba8fccfc4afa5adabccf7b96f5079b`; its PostgreSQL job failed, and no step log was exposed. Docker/isolated PostgreSQL, hosted ledger and readiness remain unverified. Do not alter `AFRICORE_MIGRATIONS_MODE`, bypass readiness or fabricate migration entries.

## Local regression after Website CRM handoff — 22 November 2026

The full serial backend suite passed **492 tests, 0 failures, 1 PostgreSQL-only skip** (493 total, 21 suites). The focused Phase 3 HTTP suite passed **8/8**, including Website inquiry conversion, canonical CRM lead contents, payload clearing and replay without duplication. Typecheck, lint, root build, OpenAPI drift (59/59), platform route validation (555 workspace operations), Render verifier (5/5), Website production build/content (144/144), Cloudflare Worker tests (11/11), and `git diff --check` passed. Docker and disposable PostgreSQL are unavailable; current-tree CI still has an unexplained PostgreSQL failure, and hosted Render ledger/backup/readiness remain unverified. No hosted migration or deployment was run.

After adding Website drag reordering, `npm --prefix website run build` passed including 146/146 content tests; `npm run lint` and `git diff --check` passed. Root full regression remains 492/493 with one PostgreSQL-only skip from immediately before this frontend-only change; platform registry remains 555.

### Calendar appointment migration and current checks — 22 November 2026

`028-calendar-appointments` is additive and creates link, booking request, slot-capacity and history tables with PostgreSQL RLS and PUBLIC privileges revoked. The guarded development migration runner now accepts `--phase3-calendar`, requires 027, and verifies 021/026/027/028. It was not pointed at Render or any hosted database. Focused booking API and edge-gateway tests pass. Full backend regression and Website build results are being recorded for the current tree. The founder-provided Render failure remains confirmed only at `prepareDatabase()` schema verification; the missing hosted ledger entries, backup readiness and current readiness are unknown.

### Current complete local regression — 22 November 2026

`npm test` passed **493, failed 0, skipped 1 PostgreSQL-only test** (494 total; 21 suites). New Calendar public booking coverage passed within that suite. Website production build/content passed 146/146, Cloudflare gateway tests 12/12, Render verifier 5/5, and development-config tests 6/6. The PostgreSQL-only skip is not a PostgreSQL pass. Docker and disposable PostgreSQL remain unavailable, the latest GitHub PostgreSQL failure remains unexplained, and no hosted Render migration/readiness action was run.

### Final local checks — 22 November 2026

`npm run lint`, `npm run validate:openapi` (59/59), `npm run validate:platform` (560 workspace operations), `npm run check:chain`, `npm run test:render-deploy` (5/5), `npm run test:dev` (6/6), and `git diff --check` passed. Both migration scripts passed Node syntax checks; the synthetic migration-plan output contains all four tables from `028-calendar-appointments`, with indexes and PostgreSQL RLS/revocation statements. The new public booking page browser attempt timed out against the local disposable demo; no screenshot or browser pass is claimed. Render deployment remains unverified after the confirmed `prepareDatabase()` migration-verification failure because the hosted ledger and backup readiness are unavailable. No hosted migration, deployment, commit or push was performed.

### Disposable PostgreSQL follow-up — 22 November 2026

A local PostgreSQL 17 cluster and database named `africore_phase3_test` were created under `.tmp`; the full 494-test PostgreSQL suite initially passed 493 and failed only the public booking capacity update because `occupied` was ambiguous in PostgreSQL's `ON CONFLICT DO UPDATE`. The statement now qualifies the target table. The focused public booking lifecycle passed, and the full Phase 3 integration file then passed **9/9** against a freshly recreated disposable PostgreSQL database. A complete full-suite rerun after that SQL fix remains outstanding. The isolated cluster was stopped and no hosted database was accessed. The current-tree GitHub PostgreSQL failure remains separately unresolved.
## Superseding PostgreSQL and Render evidence — 22 November 2026

Full PostgreSQL verification now passes on an isolated local PostgreSQL 17 cluster: 494 passed, 0 failed, 0 skipped, 21 suites, after qualifying the Calendar slot capacity upsert target. The local development database migration ledger was checked read-only and includes 021, 026, 027 and 028. No hosted database access occurred.

The founder-provided Render event for deployment dep-dc08d315efls73b3m2p0 at commit f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e shows image build/push completed and backend startup stopped in prepareDatabase() with “Deployment schema is incomplete; run reviewed migrations separately.” This confirms schema verification blocked startup, but the hosted ledger and restorable-backup state are still unavailable, so exact missing migration versions and current readiness remain unresolved. No migration, readiness bypass or deployment was performed.
## Final local regression update — 23 November 2026

After adding the hosted migration prerequisite preflight and correcting a Nairobi-local analytics test date, a fresh disposable PostgreSQL 17 cluster ran npm run test:pg: 497 passed, 0 failed, 0 skipped, 21 suites. Root build was part of that command. Typecheck, lint, migration-runner syntax and diff checks also pass. The isolated cluster was stopped and removed.

The migration runner now checks the full deployment prerequisite chain before Phase 3 DDL and reports all missing versions in dependency order: 016-procurement through 021-people-expansion, then 026-app15-16 and 027-website-forms before target 028-calendar-appointments. This is a local code hardening only; the runner was not pointed at hosted PostgreSQL. Render's actual migration ledger and backup/restore status remain unavailable, and Phase 3 is not closed.

## Public Calendar SPA route — 23 November 2026

The anonymous booking browser check found `/calendar/book/:token` falling through to JSON 404 in Express. Added `/calendar/{*path}` to the SPA route allowlist and tested both booking and manage deep links through the direct-route HTTP suite (20/20 passed). A follow-up browser connection to an isolated demo port timed out, so the browser-rendered page and public API flow are not verified after this routing repair.

### Phase 3 status update — 23 November 2026

Local Render verifier: 5/5. The supplied failure for `dep-dc08d315efls73b3m2p0` at `f177c55cf2a6d4a1b5276fbb9d86c0cd294dd08e` reached image build/push, then failed in `prepareDatabase()` with the schema-incomplete error. This establishes the failing startup phase, not the exact missing hosted migration. Hosted ledger and backup/restore readiness were not available for inspection. Current local HEAD has no GitHub status checks/workflow runs. Docker build and current Render readiness were not run; the Docker Desktop engine is unavailable. Keep `AFRICORE_MIGRATIONS_MODE=verify` and `/v1/readiness`; no bypass, hosted migration, or deployment occurred.

### Cloudflare publication delivery — 23 November 2026

The gateway previously served its static SPA fallback for every valid-looking `/sites/:slug`, so unpublished pages initially returned HTTP 200 and published pages missed Express-generated SEO metadata. The worker now forwards only GET and HEAD on the supported public path. Express checks publication availability and returns a route marker on its response. The worker strips request credentials, response cookies and the marker, sets no-store, preserves an application 404 and rejects unmarked upstream loading pages. A manual release now verifies that the expected Render commit is live before rolling out the Cloudflare frontend and gateway. Render still uses verify mode and its readiness probe.

Local gateway tests passed 12/12, Phase 3 HTTP tests passed 9/9, platform validation checked 560 operations, OpenAPI checked 59 operations, lint passed and Render verifier tests passed 5/5. Wrangler dry run was unavailable because its local dependency install requires packages absent from the offline cache. Hosted routing and deployment readiness still need verification.

Disposable SQLite runtime smoke: `/v1/health` and `/v1/readiness` returned HTTP 200. A missing Website slug returned 404, and a direct synthetic Calendar booking URL served the HTML shell with HTTP 200. The existing browser session's local port was closed when checked. Installing the locked Wrangler dependencies also failed because the package registry could not be resolved.
