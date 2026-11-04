# Master implementation checkpoint — 4 November 2026

The full owner specification is retained in MASTER_IMPLEMENTATION_PROGRAM.md. Execute Authentication Recovery (A/B), Stabilization (C), Wave1 maturity (D/E), then Wave2 foundation/applications/integration (F/G/H), followed by qualified deployment (I). The October visual QA waiver does not establish verification of these new workflows. No Stage2/3 feature implementation begins before founder authentication is verified.

## Checkpoint status

| Checkpoint | Status | Evidence / next requirement |
| --- | --- | --- |
| A: inventory and diagnosis | Findings established; deployed backend environment still inferred from public endpoint plus existing configured branch | Managed Neon SDK/server verifier; read-only actual identity/schema audit; observed temporary edge429 and later successful config200 |
| B: auth recovery | Accepted for the evaluation release | Founder login/refresh and controlled verification/reset/login confirmed; managed identity persisted; no credential rewrite. See chronological evidence below. |
| C: stabilization | Shared failures repaired; read acceptance passed | Search geometry/focus and request status classification verified;46service/workspace read checks,37successful/7inactive/2no-safe-read. Independent writes/providers remain separately qualified. |
| D/E: Wave1 maturity | In progress, independently tested checkpoints | CRM details/conversion/board committed; single-location stock counts under final qualification. Remaining teams, quotations, reporting, workflows and other master requirements retained. |
| F/G: Wave2 | Planned; not implemented | Work, Accounting, People, Procurement, Documents, BusinessID share existing services and authorization |
| H: cross-app qualification | Planned | Complete synthetic twelve-app business scenario plus negative/concurrent/replay tests |
| I: release | Stage1 repair first; staged releases thereafter | Existing Cloudflare/Render/approved Neon development, backup/readback and backend-before-frontend for backend changes |

## Functional inventory

- React19/Vite7 website; Express5/TypeScript backend; SQLite/local and PostgreSQL adapters; existing11 additive migrations. No separate replacement project.
- Optional six-app registry/install history/direct/shared service references; immutable service price selections and authoritative usage meters. Existing free app installation remains distinct from services/setup/charging.
- Current canonical customers/orders/invoices, payment evidence/allocations/credits, journal observations, exact stock/reservations/incoming, CRM entries, quotations and draft-invoice links. Existing scoped events, durable outbox/workflow runs, preferences, notifications and exact-action approvals.
- Existing managed Neon authentication and local legacy test fixtures are mutually selected; hosted managed deployment disables local-password endpoints. Official auth SDK0.7.0-beta, in-memory JWT restoration and server issuer/audience/signature/revocation checks. Current memberships authorize resources independently of provider identity.
- Existing Business/Personal/Developer shells, scoped API Explorer, trust Passport/credentials/disclosure and encrypted evidence custody are reusable.

## Confirmed broken / incomplete

- Auth configuration previously made one15-second GET attempt and turned every non200 into Authentication service unavailable. Reported failure reproduced as three edge429 responses; direct backend woke successfully after23seconds and a subsequent config read returned200. The precise origin of that initial429 is not established by the captured headers/body; Render cold start is a contributing observation, not a proven attribution of the429.
- Existing account error offered only Sign in and no retry; transient infrastructure failures happened before credentials could be checked. New retry path remains bounded and never automatically retries credential writes or switches providers.
- Founder identity exists once in the deployed development auth schema, verified/not banned, with one password credential association, a stable application link and Business owner membership. No identity/password/session/role was altered.
- The external Neon Console URL observed before the owner prohibited external-browser use selected br-square-meadow-b42xcnk2; deployed endpoint/local guarded connection target br-jolly-lake-b4ff04st. Historical architecture identifies the former as production and the latter as the explicitly approved evaluation development branch. No claim is made to have newly inspected production. No further external browser actions are permitted; use isolated in-app browser only.
- Founder password entry, mailbox receipt/verification/recovery, expiry and actual user session persistence require explicit qualified outcomes; old synthetic session reads do not establish them. Existing synthetic managed session still reads all three workspace kinds after warm-up.
- Search uses a custom overlay; portal/focus/keyboard behavior and silent failed-source search handling need audit in C. The broad service failure shares auth discovery as a confirmed prerequisite; each service still requires independent audit.

## Missing/partial shared domains

- Work: workflow follow-ups exist; full projects/tasks/subtasks/team ACLs/boards/discussions/calendar are missing.
- Accounting: observational payment journal exists; a configurable balanced double-entry ledger, chart of accounts, posting rules/locks/reversals and supplier payable integration are missing. Reuse existing documents/payments; do not create competing invoices.
- People: workspace team directory exists; employee-private records/departments/attendance/leave and restricted attachments are missing. Project membership must not grant HR access.
- Procurement: products/suppliers-as-contacts/incoming plans exist; reviewed purchase requests/orders, partial receipts and supplier bills are missing. No automatic order/payment.
- Documents: bounded encrypted evidence custody exists; folders, per-record ACLs, file versions, sharing and retention/recoverable trash need a unified model and storage assessment.
- BusinessID: Passport/credentials/consent/disclosure already exist; build an app over these domains rather than duplicate identities or imply institutional recognition.

## Integrity and migration risks

Preserve original identifiers, memberships, provider subjects, encryption keys, issued-document snapshots and append-only evidence. No email auto-merge, auth-provider migration, production branch changes, paid upgrades or live-provider activation. Current hosted environment is evaluation on an explicitly approved development branch; a public HTTPS hostname does not make it the production Neon branch. New high-integrity domains require additive migrations with encrypted backup/readback, rollback readers that understand posted history, exact decimals, workspace locks, idempotency and current-authority tests. New stored files need backend access/type/size checks, version/retention policies and truthful malware/physical-deletion limitations.

## Research

Reviewed current official Neon overview/authentication-flow, BetterAuth PostgreSQL adapter and Render Free limitations. Managed auth owns neon_auth; self-hosted BetterAuth setup/migrations must not be installed into this provider. Remaining Odoo20/Shopify/KRA research belongs to the corresponding stage before implementation. Full program references remain unchanged.

4November deployment update: frontend repair f10c2e2 published as Cloudflare dcb8c224-94a5-4db8-a013-ef89983cade8; CI41780295991 allfive jobs passed. Exact deployed bundle/config/security boundaries verified. Founder password entry and resulting workspace/refresh/mailbox/recovery acceptance remain pending in the isolated in-app tab. Do not advance to later product stages based only on this infrastructure repair.

4November managed acceptance: founder login+refresh confirmed; controlled new managed identity persisted and verified, Personal membership resolved, test sign-out worked, owner reported password reset and subsequent sign-in successful. CheckpointB's account-recovery blocker is resolved. Do not equate this with full device/provider certification. The normalized/thrown verification error and stale-session signup guards are verified locally and await the current release.

CheckpointC work: global search uses a body portal, preserving the existing focus trap and trigger restoration. Eight responsive widths320/375/390/430/768/1024/1440/1920 were checked; requested768 measured769 on this host. All samples stayed inside the viewport, covered the sidebar and avoided horizontal overflow. Real synthetic customer/product results, Shift-Tab containment, Escape/focus restoration and opening the canonical customer were checked. Source failures have an explicit partial-results status/retry and are not shown as no results. Shared HTTP errors preserve auth, inactive-service, permission, conflict, validation, rate-limit and unavailable categories; no financial write retry is added.

A preliminary read-only service audit covered46eligible service/workspace combinations:34successful reads,7inactive-service402,3workspace-kind403 and2verification_apientries with no safe collection GET. A corrected kind-aware rerun encountered Render hibernate-rate-limited before account bootstrap; repeat after the gateway resilience release. Shared reads do not qualify all independent write/provider workflows, and invalid-input-only checks must never be called successful provider verification. Stage2/3 implementation remains pending.


## Stabilization release — 4 November 2026

Source 0b3ed3c8eb910d139125baed936b2c24d5361cba is confirmed on main. GitHub Actions 41814387346 completed successfully. Cloudflare version 611659ea-172e-43a9-8acc-12c86d2c148a is live. Home, login and app HTML reference the release bundle; main and Accounts asset SHA-256 match the local build. Managed provider discovery returns200 with the expected trusted endpoint. The isolated sandbox browser renders the deployed sign-in form. No backend deployment, migration or identity rewrite was performed.

Final hosted acceptance is BLOCKED by upstream availability: gateway account GET returns503 backend_unavailable, while direct Render requests return429 HTML with cf-mitigated:challenge. A managed synthetic account audit also failed503 after four reads with three20-second startup intervals. These results do not qualify current protected-endpoint behavior or service workflows. No challenge bypass, unlimited polling, paid upgrade or external-browser control was attempted. The owner was asked for Render service status/latest error lines because no Render credential is available in this session. Earlier founder and controlled verification/reset acceptance remains valid history, but CheckpointC is not complete. Wave1 maturity and Wave2 expansion remain pending behind stabilization.

Release evidence: evidence/auth-recovery/stabilization-deployed.json and deployed-login.png.


### Manual Render deployment recovery

After the owner manually deployed Render, hosted checks at 2026-11-04T10:36:59Z returned expected anonymous account401 and direct backend403, with no challenge. Release asset hashes and edge managed configuration still match. The kind-aware managed read-only service audit completed46eligible service/workspace combinations:37successful reads,7expected inactive-service402,0permission denials and2verification_api combinations with no safe collection GET. No unexpected failures were observed. This supersedes the temporary availability blocker above. It does not qualify financial writes, independent workflows, provider verification or physical devices. No services were activated and no financial records were changed. Detailed sanitized evidence: evidence/auth-recovery/stabilization-deployed.json and service-read-audit.json.


Wave1 maturity is now in progress after founder/controlled-mailbox acceptance and recovered hosted service reads. CRM conversion, detail editing, loaded-record filtering and keyboard-accessible opportunity board are implemented locally; see WAVE_1_MATURITY_REPORT.md for exact scope and test evidence. This is an incremental checkpoint, not full Wave1/Wave2 completion. The sandbox Render dashboard confirms0b3ed3c Live. GitHub has an active Git Operations/Actions incident matching repeated internal push failures; no force push, history rewrite or branch-protection weakening was attempted.

GitHub publication recovered: a normal fast-forward push accepted reports951e4dd/862aa3b and CRMcheckpointf7cb36d on main after the provider incident. No force push or repository security change was needed.
