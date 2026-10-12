**D-8 independently eligible JWT trust reads — PR #89 (2026-10-12, merge pending):** D-8 has only merged D-1 as prerequisite. `neon_security_list_jwks` now independently verifies project/org and bounded provider entries, refuses foreign/duplicate JWKS IDs and removes credential-bearing URL components from responses; no remote JWKS fetch or provider write. Fake-provider adversarial tests, catalog/registry counts and JIT D-8 card updated. Remaining six project-security tools and connected acceptance not claimed. D-4 pooler role-deletion blocker and D-5 sequencing remain; RTC test identity and real hosted acceptance not resolved. No production/paid changes.

**D-4 ordinary-role credential readback — PR #88 (2026-10-12, merge pending):** Guarded role create/reset now require provider operations completed and independently exact-role / newer-reset-revision readback *before* storing an owner-only one-time secret. Ambiguous provider results retain PENDING and prevent links or replay; fake-Neon adversarial tests added. B-1 final audited readback remains. D-4 deletion still blocked by unobservable pooled clients; public delete absent, D-5 forbidden, no live acceptance. D-7 #87 independently eligible; RTC TEST/preview mismatch and hosted acceptance unchanged.

**D-7 independently eligible snapshot reads — PR #87 (2026-10-12; CI and merge pending):** The approved work index lists D-7 depending on merged D-2, independently of D-4. New `neon_snapshot_list` uses verified project-scoped GET operations for bounded snapshots and complete branch backup schedules; refuses inconsistent provider identities and incomplete inventories and reports capped summaries honestly. No Neon writes, restore/finalize, billing or idle DB wake-up; remaining six snapshot mutations explicitly unimplemented. D-4 stays IN_PROGRESS with `poolerClientsVerified:false`, public role deletion unregistered and D-5 blocked. RTC Hub test-mode identity mismatch and real hosted acceptance remain unverified; production OFF. Exact-head Actions CI/release-policy required before merge.

**D-4 read-only role grant-before-secret handoff — PR #86 (2026-10-12, acceptance pending):** Credential link persistence now occurs only after independently verified SQL SELECT/default grants. When SQL grants cannot be verified, the partial Neon role remains PENDING without a stored owner handoff; encrypted delivery errors also remain PENDING and forbid replay. Adversarial fake-Neon tests cover both. This does not resolve idle pooled-client visibility; `poolerClientsVerified:false`, `clear:false`, and public role deletion stays unregistered. No owner-authorized live account, paid operation, runtime activation or hosted Hub acceptance. Work index reconciled. 

**D-4 duplicate-inventory denial — PR #85 (2026-10-12):** Private role-deletion dependency preflight now refuses duplicate endpoint IDs, database names and role names from provider inventories before SQL; adversarial fake Neon tests prove no inspection on duplicated identities. This strengthens completeness evidence only: idle PgBouncer client absence is still unverified, public role deletion remains unregistered, D-4 IN_PROGRESS. No production, spend or live scratch acceptance. Five-substantive-PR batch #81–#85 ends at the next multiple of five after CI/review and merge.

**RTC read-selector metadata parity — PR #84 (2026-10-12):** RTC HTTPS list/describe metadata now declares supported `fields` and `detail` for read-only tools, matching the existing guarded MCP output shaper; write schemas remain untouched. Real HTTP + registry tests enforce advertised schema and no write metadata widening. RTC1_ENABLED OFF, full Hub conformance and three-route acceptance unverified; no Neon writes, role deletion or spending.

**D-4 compute state drift rejection — PR #83 (2026-10-12):** Privately scoped role-deletion dependency probes now revalidate each independently reread compute's `read_write` type in addition to exact identity, host, active/disabled and pooler state. A type drift to `read_only` aborts before any SQL probe; fake-Neon test proves zero inspected SQL endpoints. This does NOT make idle pooled-client absence independently observable, does not register role deletion or authorize live scratch/production work. D-4 remains IN_PROGRESS.

**RTC batch nested-input preflight — PR #82 (2026-10-12):** All nested read-only HTTPS batch arguments now pass the same strict field/detail normalization as direct calls *before* any batch handler executes; invalid selectors fail the entire batch with 400 and no partial metadata read. Adversarial HTTP-unit regression covers type confusion, oversize selectors and valid normalization. Additionally replaces ECR Public Postgres 17 CI service pulls with the GitHub-documented Docker Hub official Postgres 17 image after post-#81 main CI ECR 429/quota failure; no DB test weakened. Scope, bearer auth, DB rate limit, RTC disablement, D-4 role-deletion prohibition and owner gates unchanged. Full CI and live Hub acceptance remain distinct.

**RTC HTTPS discovery admission — PR #81 (2026-10-12):** The existing three-tool RTC allowlist now runs before catalog search and pagination, so narrow limits cannot hide valid callable reads or advertise forbidden tools. Wire regression covers limit-one discovery, matching search and forbidden write names. This is offline-only interoperability evidence; RTC1_ENABLED remains OFF, role deletion and production gates unchanged. Exact-head and post-merge checks remain required.

**Toolkit Hub RTC 1 bounded HTTPS + hosting policy — PR #80 (2026-10-12):** Owner-requested non-production read_only HTTPS routing reuses existing scoped registry handlers and immutable pass identity, with fixed Vercel rewrites, search/describe/whoami, read-only batch, scoped paginated results and adversarial wire/db tests. Revoked scoped Neon project keys invalidate RTC passes. This is **offline partial RTC interoperability only**; complete Hub conformance, owner-approved direct/relay/sandbox real runs, deployment and pass-revocation acceptance remain UNVERIFIED. RTC1_ENABLED stays OFF. No write, money/spend, production or live Neon tool admitted. Incorporated the separately prepared verified HOSTING-COST-POLICY handoff with AGENTS pointer, exact main `ci` plus `release-policy`, daily checked main-to-live, disabled Vercel previews, Basic/queued and 0.25 CU/300s saved settings **without provisioning or live acceptance claims**. PR #79 was the independently merged daily-live policy change; PR #80 completes this session's number multiple-of-five. No automatic preview or manual deploy. D-4 IN_PROGRESS; deletion blocked by pooled clients.

**Hub RTC 1 read-only pass safety — PR #78 (2026-10-12):** Owner-only encrypted one-time RTC pass issuance (24h max), hash-only storage, stored project-key verification, project scope and immediate owner revocation; distinct from OAuth connector tokens. Added shared Postgres-backed 60/min admission, explicit unsafe read/write denial and adversarial unit/disposable-Postgres tests. RTC HTTP tool routes/conformance/live tests remain NOT VERIFIED; disabled-by-default manifest, existing /api/mcp unchanged. Production, paid actions and role deletion remain OFF.

**Hub RTC 1 scoped adoption — PR #77 (2026-10-12):** Owner requested read-only non-production Toolkit Hub compatibility alongside existing D-4. Added registry-derived RTC metadata, typed discovery/OpenAPI and default-disabled public contract endpoint. Pass-only HTTPS authorization, scoped issuance/revocation and conformance still pending; standalone /api/mcp unchanged. See docs/runbooks/RTC1-HUB-ADOPTION.md. Not a D-4 completion, no production, money-out or live acceptance.

**D-4 role dependency evidence hardening — PR #76 (2026-10-12):** PostgreSQL preflight now rejects null/empty/boolean/overflow counts, invalid global dependency metadata and unverified read-only transactions; repeats active-session sampling and fails on drift. Offline mock and disposable-Postgres coverage. Pooled PgBouncer clients remain unverified and public role deletion unregistered. D-4 IN_PROGRESS; no live scratch or production acceptance. Production OFF.

**D-4 PR #75 final hardening and anti-stall recovery (2026-10-12):** Separated authorization for D-4 role grant DDL from strictly read-only dependency probes so owner-approved production SQL reads remain possible without opening privileged writes. Added exact-head CI one-shot check script and narrow per-batch GitHub REST anti-stall recovery guidance, linked in AGENTS, SESSION-START and PLAYBOOK. Security review, exact-head/postmerge CI and actual merge required before counting #75; real pooler client inventory, role deletion and live scratch acceptance remain gated. Production activation OFF.

**D-4 late-review hardening — PR #75:** Corrected #72/#74 P1/P2: centralized private role SQL execution via B-3 AST/owner gates, verified active read-write compute before role provisioning, B-1 nine-case contract through direct/delegated/HTTPS; explicit pooled-session uncertainty prevents false role deletion readiness. Public role deletion remains blocked pending independent Neon PgBouncer user/session evidence. D-4 IN_PROGRESS; live scratch/production gates unchanged.

**D-4 complete compute deletion inventory — PR #74:** Private owner-authorized all-compute role deletion probe using B-2/B-3 guards, global ownership/session checks from #73, complete Neon endpoint/database/role inventory and exact direct-host binding. No idle auto-wake, pooled visibility guesses or deletion writes. #75 improves role SQL guards; public role deletion remains blocked; D-4 live scratch acceptance remains owner-gated. Production OFF.

**D-4 role-deletion safety probe — PR #73:** Real-Postgres global role ownership, memberships, database owner and fully visible active-session checks with fail-closed bounded inventory. Private preflight only; no role deletion API exposed yet. Next #74 independently verify every compute and wire the audited provider delete. All live/production gates remain closed.

**D-4 scoped read-only roles — PR #72:** Implemented `neon_role_create_read_only` with independent Neon owner/database/direct-compute and full-owner B-1 verification, encrypted one-time password, bounded real-SQL SELECT/default privileges from #71 and strict post-grant evidence. Failures stay pending, no false read-only claim. Fake-Neon unit and real-Postgres grant tests; live scratch and production remain gated. Next verified role deletion and D-4 acceptance.

**D-4 PostgreSQL grants foundation — PR #71:** Added transactional SQL implementation for independently owner-verified chosen schemas, current-table SELECT and future default privileges, with fail-closed privilege/membership checks and throwaway Postgres tests. Not yet exposed as role-create tool, and no real provider acceptance. Next integrate secure role provision/one-time password in #72, then verified deletion dependencies. Production OFF.

**D-4 verified connection introspection / one-time delivery — PR #70:** Adds `neon_connection_get_info` with exact project/branch/endpoint/database/role identity, URI host/SSL binding, redacted metadata, validated pooled alias and safe $DATABASE_URL snippets. Explicit `test:true` uses B-3 authorized read-only SQL (never an unchecked SQL pool). Adds `neon_connection_show_once` requiring owner full profile, B-1 audited confirmation and all protected/app/production gates, and expiring encrypted owner-only secret link. No full URI, password or query token in MCP result or audit. No live Neon provider calls, owner spending, X-3 scratch or production activation. D-4 remains IN_PROGRESS for role read-only grants, role deletion and live acceptance; next session resumes approved dependency order.

**D-4 audited role password reset — PR #69:** `neon_role_reset_password` uses exact Neon identity and revision reads, B-1 owner confirmed write gates, advance encrypted/HTTPS one-time secret storage verification, fixed provider POST and verified password-rotation timestamp before owner link delivery. Preview explicitly warns every role-dependent app may break and consumers are not fully enumerated. No cleartext password in MCP results or audit. No actual provider/scratch/production writes. D-4 remains IN_PROGRESS for verified read-only grants, deletion and connection tools.

**D-4 guarded role creation — PR #68:** Adds `neon_role_create` with full-profile B-1 audited confirmation, provider-verified project/branch and complete role inventory, protected/app/production checks, fixed Neon POST, verified readback, and encrypted, expiring owner-only one-time password link. Secret configuration is preflighted before API mutation; no provider password is retained in MCP results or audit. Fake-Neon and encrypted-secret tests cover success and no-write denials. No real Neon accounts, spending or production activation. D-4 remains IN_PROGRESS for read-only grants, deletion/password reset and connections.

**D-4 guarded databases — PR #67:** Reconciled the preserved D-4 scratch branch onto post-#66 main. Implements three B-1 guarded database lifecycle tools (create, rename/change owner, irreversible delete) with verified organization/project/branch/owner role and inventory, owner preview/confirmation, app/protected/production guards, durable audit, and provider readback. Fake-Neon tests cover no-write denials and exact API mutations. Remaining role/connection tools and owner-gated live scratch acceptance are unfinished. Production remains disabled.

**D-3 post-merge security remediation — PR #66:** Addressed #64 P1/P2 by routing protected compute session visibility through the authorized SQL read guard (owner-protected list, independently verified branch, productionReads switch, parsed SELECT, read-only transaction) before any credentials/SQL pool are acquired. Bind monitoring URI hostname to the exact verified direct endpoint; reject pooled `-pooler` aliases rather than normalizing them for counting. Adversarial regressions require zero SQL calls for blocked resources and unavailable production SQL read policy, and refuse direct/pooler substitution. This is offline CI-only remediation; production disabled, X-3 live scratch acceptance separately owner-gated. Existing unmerged `ai/gpt6/d4-guarded-database-writes` remains preserved for the subsequent D-4 PR after syntax, contracts and verification are completed.

**D-4 read implementation PR #65 (exact-head CI pending):** D-3 implementation closed offline after #62–#64 security reviews, nine-case direct/delegated/HTTP contract and trusted runtime protected-session count; post-merge CI green on #64. Live provider/production/scratch acceptance is separately owner-gated, and legacy pooler writes remain disabled. D-4 JIT card created. Four scoped database/role read names added with independent org/project/branch/object verification, capped allowlists, no passwords/URI, and honest unverified SQL privileges; tested against vendored OpenAPI fake Neon and read-only profile/registry gating. Seven remaining write/connection names not yet implemented. Production OFF.

**D-3 protected interruption visibility — PR #64 (CI acceptance pending):** Real mutation context now wires a trusted compute session-count function. It independently verifies org/project/branch/endpoint, refuses pooled endpoints with potentially invisible client sessions, selects a verified branch database/role, requires PostgreSQL `pg_read_all_stats`, and counts client backends through a securely scoped SQL URI bound to the exact endpoint host/database/role. Production must be independently owner-enabled *before* privileged inspection; otherwise it denies without a provider mutation. Fake Neon + injected SQL regressions cover identity, pooler, unknown privilege/count and no-write denials. These are simulated acceptance tests, NOT real live Neon or production proof. D-3 full live acceptance remains gated on owner-authorized scratch and a verified eligible monitoring role; production OFF.

**PR #63 D-3 shared write-contract and dispatch regression (exact-head acceptance):** Both costed compute create/resize handlers are now exercised by the existing nine-case B-1 write lifecycle helper against fake Neon, including preview, explicit confirmation, replay, failed read-back, production classification, protected/app refusal, spend cap and secret-free output. Dedicated dispatch tests check MCP/delegated neon_call and the shared HTTPS/MCP profile enforcement boundary. PR #62 upstream fixes have now merged; require a fresh exact-head Actions run after the base moved to main. Live provider is NOT used. Production remains disabled. D-3 active-session visibility remains intentionally fail-closed and formal acceptance IN_PROGRESS.

**Review remediation in progress — PR #62:** Addressing eight late #58/#60/#61 findings: reject protected expiring branch creation; historical-source evidence required to confirm; exact project and newly created endpoint read-back; bounded settings on Free plans; absent pg_settings treated as empty; start/suspend/restart nonproduction confirmation follows safety flags; protected interruptions fail closed without independently verified session counts. Adversarial fake-Neon tests added. Shared nine-case and all-door checks still require acceptance; do not resolve threads on unverified changes. Production OFF. D-3 remains IN_PROGRESS.

**D-3 compute lifecycle — PR #61:** Implements start, suspend, restart, delete and narrow audited scale-to-zero/Postgres timeout updates, provider-verified endpoint/branch/project guards, complete endpoint deletion inventory, conservative unknown-connection denial for protected branch interruptions and B-4 estimation for never-suspend changes. Fake-Neon regression covers no-write denials and verified readback. All 10 D-3 catalog tools named; formal D-3 acceptance remains IN_PROGRESS pending final CI, reviewed production connection-count plumbing and deprecation parity (Neon pooler mode sunset 2026-06-20). Production OFF.

**D-3 audited compute capacity — PR #60:** `neon_compute_create` and `neon_compute_resize` now use provider-verified project/branch/endpoint reads, durable B-1 writes and B-4 maximum-CU monthly estimator with a verified organization plan. Writes require all independent protection, production, app, spend and confirmation guards, and verify the exact endpoint after mutation. Fake-Neon tests cover API body, denial/no-write, duplicate RW compute and unknown plan. Remaining compute settings and lifecycle are D-3 next; production OFF.

**D-3 IN_PROGRESS — PR #59:** Three safe compute read/estimate tools: verified organization/project/branch endpoint inventory, exact endpoint history, and hypothetical source-dated CU price bands from validated stored rates. No real Neon account or spend. D-2 acceptance closed against 12/12 tools, historical compare (#57), advanced historical/expiry/compute branch create (#58), full fake-Neon regression and preserved restore safeguards. D-3 lifecycle writes next; production OFF.

**D-2 advanced branch creation — PR #58 (exact-head CI required):** Creation now accepts independently checked parent LSN/UTC history, expiration (next 30 days), protection and optional one compute with explicit min/max CU. Its B-4 estimator combines independently priced branch and compute monthly increases; read-back verifies created branch and optional compute. Corrected branch expiration summary field. Fake-Neon tests cover API mapping and pre-write refusals. Formal D-2 acceptance is contingent on passing all CI gates; production OFF.

**D-2 historical schema compare — PR #57:** Added provider-supported LSN and timestamp selectors independently for compared and base branches. Exclusive locators, malformed/future timestamp refusal and exact fake-Neon query mapping are tested. D-2 create variants and formal closure remain; production OFF.

**D-2 IN_PROGRESS — PR #55:** Both destructive branch history tools implemented behind independent B-1 and B-4 guards: reset from a verified parent and restore from an independently verified source/LSN/UTC timestamp. Both *always* preserve the prior target under a unique branch name, price the additional branch against independently verified Neon plan/count, require confirmation and owner production approval, and read back both target and preserved branch before confirming success. Fake-Neon coverage exercises successful requests, no-write denials, missing history sources, unknown pricing and unverified preserved state. 12/12 D-2 tool names now registered; D-2 acceptance remains IN_PROGRESS for optional point-in-time schema compare / branch creation variants and review of code-to-design parity. No real Neon account or paid operation used; production OFF.

**D-2 IN_PROGRESS — PR #54:** Three new audited branch lifecycle operations: billable branch creation with verified parent, verified Neon plan, complete count and B-4 spend gate; soft-delete refuses default/protected/parent, enumerates impact, never hard-deletes; recover requires provider proof absent from active and present in deleted list, with owner project-wide approval. No real Neon key or branch used. Ten of twelve D-2 tools registered; remaining reset/restore and approved optional create/compare variants. Production OFF; exact-head CI required.

**D-2 IN_PROGRESS — PR #53:** Two guarded branch settings tools: UTC expiration only on verified unprotected non-default leaf within 30 days, and project-default transfer with production approval and both old/new default verified. B-1 audited confirmation, app/protected/production checks, and fail-closed Neon read-back. Seven of twelve D-2 tools implemented; five remaining (create/delete/recover/reset/restore). No real Neon API writes or activation; production OFF.

**D-2 IN_PROGRESS — PR #52:** Three additional tools: branch schema comparison, audited rename and protection. Trusted provider `getBranch` enables B-2 production classification. Write flows use defineWrite, app/protected/production checks and exact provider read-back; all account-changing actions remain disabled without owner authorization. Five of 12 D-2 tool names now implemented, with schema time variants and lifecycle still pending. Next: branch create (verified billable plan/allowance), expiry/default/soft-delete/recovery/restore. No live Neon account used; exact-head CI required.

**D-2 IN_PROGRESS — PR #51:** Shared Neon read-descriptor helper used by D-1 and D-2; two verified scoped branch tools (list/get); fake-Neon contract tests and permanent efficiency/anti-stall instruction improvements. Two of 12 D-2 tools implemented; remaining ten belong to the next guarded slices. Connector-only workspace: local tests not executed; exact-head Actions unit/db/check/ci required. Production stays OFF; owner-approval and spend gates remain unchanged. Next: source-backed branch create/rename/protection, then expiry/delete/recover/restore and schema comparison.

**D-1 complete — PR #50 (batch #46–#50):** All 13 approved D-1 read and guarded project mutation tools are registered. Project settings, history retention and quotas now use the pinned Neon nested settings schema, provider read-back, production/protected/app guards and fail-closed verified spending estimates; increasing history retention requires a trusted storage forecast, and quota edits only tighten limits. Project create price plan is verified from the Neon organization API when no independently verified local plan is available. Automated tests use fake Neon and disposable PostgreSQL only; actual scratch-account validation and owner production approvals remain pending separately. Production OFF. Next: D-2 branches, write its JIT card at session start.

**D-1d guarded project lifecycle (PR #49):** Create/rename/recover/soft-delete external Neon tools added through B-1 audited preview and exact provider reads; delete previews branches/databases and seven-day recovery. Production, protected and app-owned restrictions remain mandatory. Project creation requires independently verified plan and B-4 dollar cap, and secrets go exclusively to the owner one-time page. D-1 remains IN_PROGRESS: settings, retention, quotas. Production OFF.

**D-1c guarded project mutation admission (PR #48):** B-1 now requires atomic B-4 spending and audit reservation before any billable write. Trusted project mutation context enforces self-project, protected-resource and production checks, durable caps, and fail-closed app ownership. No public project writes yet; production OFF. Next: guarded project mutations.

**D-1b operation history and project settings (PR #47):** Two scoped operation tools with bounded/filtered history and at-most-45-second wait, plus a project settings read with strict allowlist. All paths use trusted project keys, budgeted SDK and scrubbed dispatch. D-1 remains IN_PROGRESS: guarded project changes next. Production OFF.

**D-1a project discovery (PR #46):** Scoped project list, region discovery and summary overview read from the pinned API through encrypted stored keys and durable API budgets. Project and organization boundaries fail closed; responses are allowlisted and paginated safely. D-1 remains IN_PROGRESS: operation reads and guarded mutations follow. Production stays OFF.

**C-2 complete (PR #45, batch #41–#45):** Compact and catalog connection listings; scoped search/describe/call/read batch; pinned `gpt-tokenizer@3.4.0` o200k BPE enforces description, schema, <5,000 compact, <20,000 everyday listing and 100-item ≤8KB/secret-free stored handle checks. Implemented profile counts match TOOL-CATALOG. Next: D-1 projects, operations and regions. No production activation, paid resources or live Neon changes.

**C-2d listing modes (PR #44):** `catalog` lists all authorized tools and `compact` exposes only guarded meta, whoami, result retrieval and future read-only workflows; `?listing=` override changes display only. OAuth defaults catalog for Claude-identified clients, compact for other clients, with user selection preserved. Token/schema budgets follow. Production stays OFF.

**C-2c read-only batch (PR #43):** `neon_batch` preflights every requested name, denies entire batches containing writes or nested gateways and dispatches at most ten reads through the ordinary scoped, scrubbed wrapper. Next: compact listing and exact token/schema budget verification. Production remains OFF.

**C-2b guarded meta-call (PR #42):** `neon_call` delegates only to the same authenticated, profile-filtered MCP dispatch path; nested `neon_call`/`neon_batch` are denied, output scrub and scope are retained. Next: read-only batch, listing mode and enforced token budgets. No production activation.

**C-2a discovery (PR #41):** Authenticated, profile/production-filtered `neon_search_tools` and `neon_describe_tool` provide bounded discovery and the public schema without exposing denied tools. C-2 remains IN_PROGRESS; next `neon_call`, guarded batch, listing modes and budgets. Production remains OFF.

**C-1c scoped result retrieval (PR #40):** `neon_get_result` retrieves only the authenticated caller's nonsecret stored results, with bounded item/encoded-fragment pages, optional safe field projection, MCP annotations and structured content for output-schema tools. C-1 complete. Next: C-2 listing modes, meta-tools, token budgets; production remains disabled.

**C-1b scoped result handles (PR #39):** read results above 8KB are scrubbed and stored for 24h in additive result_store keyed by a hashed authenticated connection scope; default MCP output is small and carries an opaque handle. Bounded SQL row and text shaping utility, expiry cleanup and Postgres isolation tests. C-1c retrieves handles and adds annotations next. No live Neon accounts.

**C-1a result selection (PR #38):** typed provider summaries and safe `detail`/dotted `fields` are applied after secret scrubbing at MCP dispatch. Unknown paths are reported; protected prototype keys are rejected. C-1 remains IN_PROGRESS: result-store handles and annotations follow; production OFF.

**B-8d guarded owner settings (PR #37):** full unscoped organization owner with a stored org key can preview/confirm reductions of spending caps or SQL read policy, with database compare-and-swap and audit. No limit increase, pricing, protected-list editing or production activation. B-8 complete; next C-1 context-efficient results, handles and annotations.

**B-8c key re-probe (PR #36):** owner-only production-deployment read verifies active stored key scopes via Neon SDK, returning nonsecret capabilities; never enables production. Next guarded settings edits; no live accounts accessed by CI.

**B-7 declaration enforcement (PR #33):** static check-writes now verifies production effects, spend/secret flags, one-time route for secret tools, org-key profile, destructive profile, registered handlers and duplicate names. Unit negative fixtures cover each B13 violation. Next B-8 server tools (JIT, split into read and guarded-write PRs).

**B-6 result safety and profile filtering (PR #32):** shared nested provider secret scrub, audit snapshot minimization, safe additive money/size/Denver-time display, metadata-based profile enforcement and home-page counts. No SQL tools published, no owner approvals changed. Next: B-7 declaration enforcement.

# STATUS — current work, blockers and next action

**B-8b guarded connection revocation (PR #35):** `neon_revoke_connection` uses trusted organization scoping, durable B-1 preview/confirm/reservation/verify, and immediately revokes live connector/pass grants for one selected client; no token material in results or audits. Limited to full on a production deployment. Settings writes and live-key access re-probe remain B-8 work; no Neon resources touched.

**B-8a server reads (PR #34):** Four safe read tools: scoped connection summaries, audit changes, allowlisted stored settings, and structured dashboard guidance. Database queries enforce organization isolation and exclude token hashes. No live Neon use or new writes. Next B-8b guarded administration.

**Workflow guidance (#31, docs only):** AGENTS, SESSION-START §6 and PLAYBOOK Step 4 now direct agents without a local checkout, terminal or PostgreSQL to use authenticated GitHub REST for branch/PR/file operations and GitHub Actions check/unit/disposable-db logs as remote test evidence. They must state local tests were unavailable, fix CI failures, self-review and merge only on green exact-head `ci`. This adds no product capability and does not change B-6 as the next approved unit.


**B-5 plain-English errors completed (#30):** `src/neon/errors.js` now normalizes Neon 401/403/404/409/423/422/429, plan/branch constraints and 14 PostgreSQL SQLSTATE families to redacted, actionable messages with safe technical IDs. The Neon client uses the formatter; the private SQL read runner maps driver failures and reconnects only once on an AST-verified read-only connection reset, never a write. Tests cover mapping, redaction and replay limits. Next: B-6 result shaping, secret removal and profile filtering (JIT card); no live Neon account, new tools, production activation or spend.


**B-3 private SQL foundation completed (#22/#23/#24/#26–#29).** PR #29 seeds persisted `sql.affected_rows_tolerance` = 0 and validates configured limits before any token/audit/SQL; rollback compares actual counts against the trusted policy. Durable child preview/token, SQL read, internal guarded apply, WAL checkpoint, B-4 spend adapter and explicit estimate fallback are in code with tests. **Next B-5 plain-English errors** (JIT card). D-5 still owns tool registration and actual `defineWrite`/authenticated context injection; X-3 owns real scratch Neon restore proof. No production activation or live Neon changes.

**B-3d SQL estimate fallback (#28):** on an independently verified branch-limit or budget-capacity problem, private read-only EXPLAIN produces estimated DML counts and a clearly inexact, 30-minute, one-use token. Production apply requires `acceptEstimate:true`; exact previews retain zero-tolerance row-count rollback. No SQL tool published and no real Neon account used. Remaining B-3: owner-configurable SQL affected-row tolerance (default zero), complete successor interface checks; later D-5 owns public registration and trusted admission wiring.

**B-3d spending admission adapter (#27):** private `createSqlAdmissions` wires SQL preview cost reservation to B-4's atomic per-org/day cap and explicit owner confirmation, and SQL apply approval to B-4 persisted policy. No tool exposed or production turned on. Next B-3d work: branch-limit/budget estimate fallback and concrete D-5 guards/read-back wiring.

**B-3d guarded apply foundation merged (#26):** private SQL apply now checks protected/production/app/spend admission, atomically claims one-use bound exact token, persists restore WAL LSN before running SQL, compares exact row counts in one transaction and rolls back mismatch; ambiguous commits remain pending. Unit/real-Postgres tests added. No public SQL tools or production activation. Remaining B-3d: documented branch-limit/price estimate fallback and D-5 provider-backed admission/read-back integration; do not claim full B-3 finished until all gates pass.

**B-3a classifier merged (#22):** parser-only fail-closed classification with 100+ fixtures; B-3 remains IN_PROGRESS. SQL read runner, disposable exact preview, bound token, LSN and guarded apply still pending; no SQL tool exposed. **IN-09 and IN-10 defaults approved by owner 2026-10-11**, but neither stored runtime setting has yet been verified or applied. Production activation stays OFF. **B-3b authorized read runner merged (#23):** database-seeded IN-09 defaults (200 rows, production SELECT enabled), protected-resource + trusted-branch checks, read-only transaction and rollback, safe SQL errors. Remains unexposed until D-5; exact preview, durable token and guarded apply still pending. **B-3c exact child SQL previews / durable tokens merged (#24):** temporary branch creation, bounded operations, SQL counts, schema diff digest, cleanup, 30-minute one-use hash-bound tokens in additive change_log storage; requires explicit previewAdmission guard before API writes, not yet wired to MCP. **B-4 spending guard (#25):** owner-approved $25/change, $50/day limits now seeded and enforceable by private pricing/guard modules with atomic PostgreSQL daily admission, confirmed previews and dated micro-dollar pricing. No spending tools are exposed, and no live spend was authorized. Next: B-3d guarded SQL apply (preview token, restore LSN, count rollback), then B-5 errors.

**B-2 completed (#18/#19/#20):** trusted production classifier, absolute protection, secure owner resource editor and owner-production access two-step request/passphrase mechanism. All production flags remain OFF; X-2/X-3 and IN-07/08 approval gates are enforced by default. Only two internal control tools are newly visible to full-profile connectors on an approved production deployment; no Neon project write tools yet.

**B-2b protected-resources owner editor merged (#19):** owner-only form secured by same-origin POST and passphrase, own-project environment/host verification, immutable automatic self protection, safe list editing and tests. Production access still disabled; B-2c is next.

**B-2a production classification and absolute self-protection merged (#18):** safe target verification uses only Neon-fetched default/protected flags plus trusted profiles; protected list and own-project identity fail closed. No write tools or production access enabled. B-2b owner authorization remains.

**B-1 guarded write lifecycle merged (#17):** durable atomic change-log reservation, request-key deduplication, confirmation, fail-closed safety interfaces and operation-aware Neon adapter; test fixtures exercise all nine contract cases. No new write tool is exposed.

**A-7 deployment instructions merged (#16):** owner-only, preview-first guidance in `docs/DEPLOY.md`; no infrastructure, keys, credentials, or live access created. Batch A documentation complete; Batch B safety layer next.

Updated 2026-10-11. **A-6 SQL connection layer merged (#15):** guarded Neon URI lookup, self-database
host exclusion, statement/lock timeouts, credential-safe error/result handling and connection cleanup,
with fake-Neon and disposable PostgreSQL verification. No SQL MCP tool is exposed.
**A-5c owner setup and first read tools merged (#14):** passphrase/Origin-guarded
key setup, revocation, one-time secret viewing/submission and exactly two scoped read-only MCP tools.
**A-5b one-time secret exchange merged (#13):** inbound and outbound ciphertext, expiry, org-bound
single-use consumption through guarded backend functions, disposable database and fake-unit tests.
**A-5a encrypted key storage merged (#12):** authenticated ciphertext, scoped organization and
project key persistence, verified Neon identity/reach, fail-closed missing credentials, and fake/isolated-Postgres tests.
**A-4b shared budget and API description tooling merged (#11):** database-atomic 500/minute API admission
across serverless instances, secret-safe key hashing, pinned OpenAPI lookup/diff tools, isolated-Postgres coverage.
**A-4a official Neon client and operation waiter merged (#10):**
SDK raw calls only through one entrypoint; retries only for 423/429, ambiguous writes never automatically
resent, request keys, bounded waits and budget enforcement by injected fail-closed budget. No live account was called.
**A-3b OAuth endpoints merged (#9):** secure OAuth authorization, registration, token exchange and refresh
routes, metadata, and a default-deny MCP endpoint exist in code. **A-3a OAuth primitives merged (#8):** OAuth client registration, hashed grants, one-use codes,
atomic refresh and database-backed login attempts now exist. **A-2 database schema merged (#7):** the 11 additive foundation tables, partial key uniqueness and
expiry indexes exist in code and are verified by isolated-Postgres tests. No live database is provisioned; OAuth and setup endpoints exist in code and two safe owner read tools are registered, and no real Neon account was accessed.

## Next

- **Next: B-3 — SQL guard and preview/apply safety.** IN-09 (200-row production read-only SQL) and IN-10 ($25/change, $50/day) approved 2026-10-11, not yet applied. B-3 runner/preview/apply and B-4 spending guard remain to implement. No real-account activation.
- **Answered 2026-10-10 (Chris):** IN-00 — plan approved ("I approve the plans"); IN-01 — **no automated review** ("I don't want the automated review at this time"); the repository stays public as Chris created it; the implementer self-reviews every diff.
- **Queue:** A → B → C → D → V → O → P → W → U → R → E → X (`MASTER-ROADMAP.md`).

## Environment

- Repo: `Robinson-AI-Systems/neon-mcp`, default branch `main`; every change goes through an `ai/*` branch and a PR.
- CI: `.github/workflows/ci.yml` — jobs `check`, `unit`, `db` and the aggregate `ci` (the merge gate). Proof that it
  really fails and passes: PR #1 description (red-proof run and final green run).
- Commands: `npm ci`, `npm run check`, `npm test`, `npm run test:db` (`docs/ARCHITECTURE.md` "Test harness").
- Vercel project, this server's own Neon database and Neon API keys: not created yet (IN-02, IN-03, IN-04).
- Runtime: Node 24.x (Vercel stopped deploying Node 20 on 2026-10-01; see DECISIONS).

## Implementation guidance

Concrete recipes, remaining-unit routes and a B-3 worked example live in
`implementation-contracts/IMPLEMENTATION-RECIPES.md`; startup and card-writing instructions link them.
Documentation only; no product card is completed by this guidance. Baseline inspected: PR #20 main.
IN-09 remains an owner decision **before B-3 merges** (OWNER-INPUTS), not merely before real use.

## Recent work (newest first)

**2026-10-11 — A-7 documentation (#16):** clear owner-only deployment and rollback instructions; README link, exact environment variables, approved preview checks and hard production/spend gates. No cloud resources created.

**2026-10-11 — A-6 SQL connection layer (#15):** one guarded API URI lookup, host comparison protecting
this server's own DB, 15-second statement/5-second lock limits and guaranteed cleanup; no SQL tools exposed.


**2026-10-11 — A-5c setup and read-only tools (#14):** owner page for key addition/revocation and one-time
secrets, passphrase lockout, strict same-origin POST, scoped organization and project selection, first two MCP tools.


**2026-10-11 — A-5b one-time secrets (#13):** an outbound encrypted view-once link, inbound secret
request submission and consume-once retrieval, scoped by organization and 10-minute expiry. No secret in any URL.


**2026-10-11 — A-5a encrypted key vault (#12):** AES-256-GCM AAD scope binding; stored key ciphertext only; API
identity and project visibility verified via fake/real-capable Neon client with database-backed budget; key reach tests.


**2026-10-11 — A-4b budget and OpenAPI tools (#11):** rate_limits-backed atomic per-key admission, 501st call
refused, SHA-256 key identifier, prune of expired windows, offline method lookup and bounded public-spec drift compare.


**2026-10-11 — A-4a client and waiter (#10):** SDK 7.0.1 raw wrapper with no automatic SDK retries,
explicit 423/429 backoff, write uncertainty reconciliation, stable request keys, bounded operation waiter,
cursor-aware pagination and fake-Neon unit tests. Budget must be supplied or calls fail closed; A-4b persists it.


**2026-10-11 — A-3b endpoints (#9):** OAuth authorization, registration, token rotation, metadata and
MCP bearer boundary (zero tools); production gate and project scope fail closed; unit and disposable-Postgres tests.


**2026-10-11 — A-3a primitives (#8):** OAuth PKCE, hash/redirect helpers, connector-client and code tables,
atomic refresh with connection settings, login attempt persistence and unit/isolated-Postgres tests.


**2026-10-11 — A-2 schema (#7):** additive, idempotent internal tables and indexes, no key material or real Neon
calls; test coverage includes Postgres uniqueness/revocation, connector defaults, protected mode and ciphertext columns.


**2026-10-10 — CI cadence (docs + CI config PR):** never push while a PR's CI run is in progress (SESSION-START §6,
PLAYBOOK Step 5); obsolete PR runs are cancelled, runs on `main` never are. Next action unchanged.

**2026-10-10 — A-1 foundation merged (#1), by Claude (Opus 5.5):** `package.json` (Node 24.x, ES modules, exact
versions) and `package-lock.json`; Neon's API description vendored (fallback source; the live URL was unreachable — BATCH-A
amendment); `test/helpers/fake-neon.js` (validates requests, operations, 423/429), schema-valid fixtures, proof that the
real `@neon/sdk` works through it; secret scan with planted-key tests; docs, index, lint, write-safety, core-import and
budget checks with tests; throwaway Postgres harness (read-only transactions, timeouts, rollback proven on real
Postgres); CI with a deliberately failing test run recorded red, then green. Cards A-2 and A-3 written.


**2026-10-10 — Gap check against prior toolkits:** every Neon tool name Chris built or planned in any Robinson toolkit
(333 names across `robinsons-toolkit-mcp`, `robinsonai-mcp-servers`, `robinsons-toolkit-api`) mapped in
`audits/2026-10-10-prior-tools.md`: 300 covered, 30 dropped with reasons, 3 gaps added as card D-9
(`neon_branch_compare_data`, `neon_schema_list_migrations`, `neon_health_reindex`); SQL guard amendment (BATCH-B). Needs from
Cortiware, oldReplit, Household-Assistant and Appliance Desk checked. Totals now **173 hand-built + 4 universal = 177
tools, 53 cards** (old-toolkit decision note dropped) (the entry below is the original plan's count).

**2026-10-10 — Plan written (initial commits):** research audit (Neon API ≈180 operations, the old toolkit's 204 tools
with 13 verified bugs including 17 unreachable tools and a SQL path that never authenticates, the official Neon
connector compared, credentials, coverage matrix), AGENTS, START-HERE, SESSION-START, PLAYBOOK, drift protocol, PLAN,
MASTER-ROADMAP, 12 batch designs, TOOL-CATALOG (170 hand-built tools + 4 universal), Appliance Desk project profile,
owner inputs, go-live checklist, decisions, roadmap, owner guide, work index with validator (53 cards), first card A-1.

## Blocked

Nothing in engineering. Owner inputs open: IN-02 … IN-13 (IN-14 answered: not needed)
(`OWNER-INPUTS.md`); none blocks A-2 … A-4.
