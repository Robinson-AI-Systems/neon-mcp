# Remaining work routes — use one row when writing the JIT card

Baseline `2c14d3f` (2026-10-11). Guidance, not advance execution cards. Exact dependencies remain in work-index.json;
order remains A → B → C → D → V → O → P → W → U → R → E → X. Do not start later work because a recipe exists.
Paths marked proposed must be reconciled once their prerequisite merges; no future helper is asserted to exist today.
Read design §0 + the unit's §4 heading + its relevant decisions, PLAN acceptance and TOOL-CATALOG rows.
Shared recipes: [existing seams/API/tests/card packet](IMPLEMENTATION-RECIPES.md).

## B and C — build the shared interfaces first

| Unit / design heading | Exact starting points; mapping to pin in card | Fixture / completion evidence; successor inherits |
|---|---|---|
| B-3 SQL guard | sql.js, production.js, core/write.js, db.js; [worked example](B-3-WORKED-EXAMPLE.md) | Token/count/LSN/cleanup proof; D-5 safe SQL entrypoints |
| B-4 spend | Proposed neon/spend.js and pricing.js; db settings + change_log.spend_month_cents; defineWrite spend(args,ctx,before) | Compute min/max/current plan → integer micro-dollar rates → monthly cents. Hand fixture 2 extra CU ×730h ×$0.106 =15476 cents; test daily/per-change concurrent admission, Free limits, unknown usage. IN-10 before merge; later $ tools inherit estimator/guard |
| B-5 errors | Proposed neon/errors.js; client call safe errors and sql.js callback catch | One fixture per B10 status/SQLSTATE; nested URI/key-bearing errors scrubbed before output, unknown safe message preserved; do not rethrow raw driver objects. Inherits B-3 SQL error seam; subsequent tools inherit formatter |
| B-6 results/profiles | Proposed core/result-rules.js, profiles.js, neon/scrub.js; core/mcp-server.js, tools/index.js and server.js | Nested x-sensitive fields/patterns, Date/size/cents formatting; read_only direct-name refusal; test logs and stored rows as well as response. C inherits common shaping/filtering |
| B-7 declarations | Existing scripts/check-writes.mjs and tests/unit/check-scripts.test.js | Temporary fixture files for each missing writes/dryRun/spend/secret-route/productionEffect/handler field; each fails, correct declaration passes. No deleting a check to accommodate a new tool |
| B-8 server tools | Existing tools/server.js, owner-production.js, api/neon/setup.js, db.js; split already-built production controls out of remaining scope | Settings input→typed stored setting; protected_resources refused; organization/mode/profile auth per handler. Test missing scope, revoked access and protected setting; preserve owner editor and two-step activation |
| C-1 shaping | B-6 implemented exports (reverify); proposed summaries/handles per BATCH-C; proposed result_store table from BATCH-C §2 (absent at baseline) | fields/detail→allowlisted summary; oversized (>8KB) output→scoped expiring handle, never secret rows. Empty/multipage/oversized/nested-sensitive fixtures; C-2 inherits stable shape |
| C-2 listing/meta | Existing registry.js, tools/index.js, core/mcp-server.js, check-budgets.mjs; BATCH-C headings | Catalog profile counts + compact schemas; by-name call invokes guarded handler. Two-page find/catalog, hidden write by name, handle ownership tests; budget thresholds and actual built counts match catalog |

## D — repeat concrete API/SQL recipes by area

For each D tool write down method/path/operationId, raw SDK export, input→path/query/body, required fields and enums,
server-fetched before state, allowed after predicate and safe inverse. D-5 onward consumes B-3; never directly query via sql.js.
Proposed tool modules belong under `src/tools/` and provider helpers under `src/neon/`; choose exact names in current card.

| Unit | Read BATCH-D heading / integration | Specific failures, forbidden effects and inherited evidence |
|---|---|---|
| D-1 projects/operations/regions | client.js listAll, operations.js; normalize each API collection to recognized array | Empty/two pages/cursor cap, pending/failed operations, org-key vs project-key scope; read-back after write wait |
| D-2 branches | createProjectBranch/getProjectBranch/deleteProjectBranch + approved D decisions | New child fixture vs main/default/protected; annotation reconciliation on uncertain create; no hard_delete, production restore preserves old branch. V inherits recoverable branch lifecycle |
| D-3 computes | Endpoint current state→min/max CU and suspend settings, B-4 estimator | Raising max, changing type, waking pending endpoint; protected parent classified first; dollar preview from before state |
| D-4 databases/roles/connections | sql.js URI mapping, keys.js, core/one-time.js | Password never in tool/log/audit; exact DB owner/name read-back; role creates/resets deliver one-time page; pooled URI never returned |
| D-5 SQL tools | B-3 guard/runner and B-6 results; query/execute/transaction schemas | All public doors reuse same guard; SQL array ordered and transactional, refused class never runs; inherit token expiry/count rollback tests |
| D-6 schema/health | Guarded structured SQL, proposed quoteIdent; BATCH-D D-6 | Identifier containing quote, unknown table, unavailable extension, permissions, row caps; introspection reads read-only. Never interpret user identifier as raw SQL |
| D-7 snapshots | SDK snapshot/restore operation schemas + production guard | Restore preview→pending restore object; **no implicit finalize**; separate finalize tool requires guard/confirm. X inherits recoverable state |
| D-8 project security | Project-wide classification, org/project key capability and B-4 | Before IP allow/public access/JWKS config→exact API body; refuse self-lockout and protected project; no widening default permissions |
| D-9 data/index maintenance | BATCH-D dated gap-check unit; B-3 refused-node alternatives | Branch compare bounds + migration-table absence; concurrent index/reindex only approved dedicated path; SQL query cannot sneak maintenance through |

## V, O, P and W — ownership and multi-step state

Shared multi-step recipe: authenticate → read trusted target → classify/protect → record run/ownership → execute bounded
steps → wait/read-back → persist stage/result → precise cleanup. Failure after step N reports completed and pending stages;
retry resumes only evidence-backed stages. Never infer ownership from a matching branch name/annotation alone.

| Units | Starting points and mappings to pin | Concrete validation / forbidden effects / inheritance |
|---|---|---|
| V-1 | D-2/3 helpers; proposed dev_runs storage from BATCH-V §2; record returned project/branch/endpoint IDs + UTC expiry | Recorded expired dev branch, unrecorded same-annotation branch, object newly protected; cleanup only first, children first. Same request key never creates twice; IN-12 before merge |
| V-2 | V-1 runs + guarded SQL; scenarios map typed seed→tables/counts/FK order | Same seed twice gives same generated rows; FK parent before child; cycle/unknown schema refusal; preview count exact and row limit enforced. No production seeds |
| V-3 | V-1 ownership, snapshot/restore helpers; proposed dev_checkpoints | Reset/checkpoint on dev only; migration preview writes copy, never source. Mid-restore failure retains recoverable state; subsequent V-4 gets safe copy lifecycle |
| V-4 | V-3 copy and B-3 execution; column-policy→mask transformations and query plan | Nullable email/phone fixture, missing policy refuses unmasked personal fields; tuning/integration on copy, cleanup failure reported; no raw personal sample output |
| O-1 | keys.js org selection + API member/project access mapping | Last-admin removal/self-lockout refused; invite/role preview names person and exact rights; project-only key returns useful refusal, never fallback to broader access |
| O-2 | O-1, one-time exchange, D-1 project lifecycle | Create key response→encrypted one-time flow; revoke-own-tool-key refused as designed; transfers preview recipient and production effect. No key in audit or result |
| O-3 | B-4 rates/date and usage page schemas | Integer cents + _display, month boundary/zero usage/unknown metric; alerts notify according to design only; no plan purchase |
| O-4 | O-1/2/3 summaries, catalog setting locations | Empty org, partial inaccessible project, multi-page overview; guided console setting has real destination/instructions, never fabricated “applied” state |
| P-1 | Proposed known_apps BATCH-P §2; production.js getProfile + core write checkApp seam | Stored verified IDs→productionBranches/sharedPreviewBranches/schema/auth ownership; shared preview treated production, missing profile fail closed where required; IN-13 before Appliance Desk use |
| P-2/3 | P-1 typed profile + D/O guarded handlers | Readiness inputs→explicit checks/evidence; setup/draft preview target changes before apply, no conflict with app-managed Prisma/auth; inherit structured ownership refusals |
| W-1 | P-3 + B-3 tokens/restore LSN; proposed workflow_runs per BATCH-W §2 | Safe migration stages on copy before apply; mismatch/timeout/mid-step failure persisted; no repeated already-applied SQL |
| W-2 | W-1 runs + D snapshots/restore | Recovery preserves production old state; test failed finalize/operation pending separately; owner confirm and scope enforced |
| W-3/4/5/6/7 | W-1 runner; health/cost, cleanup, credential rotation, security/go-live, find headings | Empty project, two pages, partial failure, time budget per tool; cleanup precise, new credential secret one-time, go-live shows missing approval. No automatic activation or unknown objects deleted |

## U, R, E and X — future doors must inherit every guard

| Unit | Files/services to inspect at JIT time | Test packet and inheritance |
|---|---|---|
| U-1 | Existing openapi-index.js + client.js, registry; proposed neon/operation-marks.js per BATCH-U | Operation metadata→read/write/access/secret/spend/projectWide policy. Known/unknown/new operation fixtures fail closed; API by-name cannot bypass guarded handler; C-2 neon_call reused |
| R-1 | core OAuth/crypto/db seams + proposed pass routes/storage columns per BATCH-R | Hash-only tokens, narrow mode/profile/project/default lifetime, expiry/revoke/refresh preserved fields; IN-11 before merge; no raw pass in result/log |
| R-2 | Existing core/http.js + registry/guarded handlers; proposed /api/tools, /api/results/{handle}, /api/contract doors from BATCH-R | Body input maps same handler args/context, HTTP errors to RTC; overlapping 80 calls across instances at 60 cap permits exactly 60, 20 get 429. Atomic DB limiter, never in-memory-only |
| R-3 | Approved RTC contract version + local fake-Neon server + CI workflow | Conformance with real doors against fake API; standalone usability, no hub runtime dependency; CI check retained |
| E-1 | BATCH-E §0 feature verification; SDK Auth/Data API schemas, P app ownership, one-time secrets | RLS gap fixture on local Postgres, app-owned auth refused, secret provider config never echoed; no exposure without access/production confirmation |
| E-2 | BATCH-E storage/functions/triggers/log operations + B-6/C results | Empty/two-page logs, >8KB handle, no object bytes; deploy guarded on production; unsupported separately-billed feature guided only |
| X-1 | change_log inverse/restore_lsn + guarded handlers | Missing inverse refuses; already undone idempotent; undo reruns protection/production/spend guards; no blind SQL restore |
| X-2 | Read-only smoke script per BATCH-X | IN-04/05 setup first; record safe pass/fail without infrastructure IDs/keys; no mutation and no real-account CI test |
| X-3 | Explicit approved scratch-only script per BATCH-X | IN-06/owner setup, scratch identity verified; create/read/write/preview/restore/cleanup evidence only there; no production tests or purchases |

## Completion packet for every later card

Include test names and exact expected effects, fixture API calls/SQL counts, clean-state vs after-state checks,
operation pending handling and cleanup evidence. Mark only proven catalog rows built. Update storage/env docs when added;
carry exported signatures, settings and unresolved low-risk findings to successor or CHANGES-SINCE-DESIGN.
Run focused tests → quick gate → full required CI; inspect entire diff and any posted review threads; merge exact head
only when authorized. These routes do not alter owner inputs, architecture, budgets, card ordering or acceptance.


## Concrete implementation contracts — owner-requested review, October 14, 2026

The owner requested the same implementation detail across all six active MCP
repositories, specifically for Sol 5.6. This section fills routine design details
inside the approved roadmap. It is a design supplement, not another roadmap,
process, new countable subsection or claim that code/acceptance is complete.
Existing cards/public schemas and later owner decisions win over historical
recipes; reconcile mechanical drift with current main before coding. Do not
replace working code simply because a proposed filename below differs.

### Shared input, state and result contract

- Freeze the existing subsection IDs and complete scope first. In the current
  card, list each public tool from TOOL-CATALOG, its exact schema, the existing
  wrapped handler/client export and the corresponding provider operation. A
  future path below is proposed until it exists. Build the complete coherent
  outcome; do not publish one helper as a completed subsection.
- Keep public ABI compatibility. For new compound implementations use an internal
  plan `{operation, account, mode, target, steps}`. Each ordered step has a stable
  `id`, exact wrapped `tool`, validated `args`, before-state requirements,
  intended after predicate and inverse-or-reason. Account/mode come from trusted
  context, never caller-supplied credentials. Translate these internal records
  into the existing public tool schema; do not invent a second external envelope.
- Explicit IDs beat free-text guesses. Resolve friendly names with authorized
  reads; zero matches is missing, multiple matches requires disambiguation.
  Reject unknown fields/enums and conflicting targets before dispatch. Omitted
  means retain; explicit empty/false/null clears only where the provider supports
  that operation. Whitelist path/query/body fields; never forward local safety,
  pagination/presentation or request-key arguments into provider payloads.
- A new workflow's observable details use ordered per-step rows with stable IDs,
  target, outcome, safe reason and provider/audit references when actually known.
  Outcomes distinguish `planned`, `refused`, `confirmed`, `unverified`, `failed`,
  `unknown` and `not_attempted`. Aggregate success requires every required step
  to be confirmed; optional unavailable items remain explicitly unavailable.
  An HTTP 200/202/204 or an outer `done:true` alone is never provider confirmation.
- Preview validates the entire plan and uses child `dryRun:true`; provider writes
  are zero. Existing preview audit logging is allowed. Execution requires the
  original operation-specific confirmation/owner authority; a single workflow
  confirm never creates financial, access or production authority. Recheck
  mutable target/protection/account state before each dependent write.
- Execute dependent steps in order. Persist existing run/replay checkpoints
  before/after ambiguous effects where the approved design requires durability.
  A failed dependent step stops its descendants; untouched rows are
  `not_attempted`. Independent read sections can continue and return partial
  coverage. No blind retry after an uncertain POST, no automatic rollback and
  no new background scheduler merely to finish a synchronous workflow.
- If a request times out after dispatch, mark its outcome unknown and reconcile
  the original target/request key before resuming. Reuse the service's replay
  mechanism; a second generic UUID is not recovery. Explicit undo only follows
  recorded, still-valid inverses through wrapped tools and fresh guards.
- Bound existing time/page/byte budgets, return an explicit continuation where
  supported and use connection-owned result handles. A cursor/handle is bound
  to account, connection/grant and query; expired/revoked/foreign ones refuse.
  Do not silently truncate and label the result complete.

### Build and prove one complete outcome

1. Read the exact provider operation in the pinned SDK/OpenAPI/GraphQL fixture;
   capture argument → path/query/body → response selector and credential type in
   the current card. Research genuinely changed provider behavior in official
   primary documentation. The owner is not the source for API facts or pricing.
2. Implement normalization/planning, then wrapped apply/readback/intent comparison,
   then all callers, registry, profile/area metadata, summary/output schema and
   documentation. Reuse existing shared guards, clients, secrets and run stores.
   Add SQL only when the existing design actually needs durable new state.
3. Arrange stateful realistic fakes and capture the actual outbound request.
   Required cases: normal/empty/two pages; denied scope/profile/account; omitted
   versus explicit clearing; preview and missing confirmation with zero writes;
   mismatch/unreadable readback; ambiguous timeout and same-key retry; partial
   failure plus untouched descendants; foreign run/handle; budget exhaustion.
   Add the domain-specific cases below. Do not weaken fakes to fit a guessed API.
4. Validate the assembled outcome through every existing direct/broker/HTTP door
   with shared write-contract and provider-shape tests; use disposable Postgres
   for persistence, atomic claims, refresh/revocation and concurrent reservations.
   Run focused checks at meaningful seams, then the full mandatory gates once
   the coherent tree is ready. Record real command results, never assumed green.
5. Keep implementation, automated verification, deployed exact revision and real
   custom-service/provider acceptance separate. Update the existing card/status/
   queue with precise remaining proof. These design documents close no feature
   status and authorize no real account writes, spending or release.

Answered decisions do not require another approval. Missing credentials, actual
tenant/resource identity, independent financial consent and production activation
are still real gates. Build configurable/synthetic paths where permitted; keep
only their dependent execution closed and continue eligible roadmap work.


### Neon: complete remaining-subsection contracts

Inspected baseline: `6c0b277` (#172). Existing entry seams include
`src/neon/client.js`, `src/neon/sql-run.js`, production classification and keys,
`src/tools/index.js`, `src/tools/connections.js`, `src/tools/role-retirement.js`,
`src/tools/sql-execute.js`, `src/tools/dev-seed.js`, `src/tools/dev-scenarios.js`,
the exact-object/replay stores and owner setup flows. New area modules are
proposed in `src/tools/`; SQL always flows through the current guarded runner.
Do not resurrect early recipes as if those primitives were still unbuilt.

| Subsection | Concrete state/argument/result and build sequence | Domain fixture / forbidden effect |
| --- | --- | --- |
| D-4 | Exact project/branch/database/role and desired owner/action → fresh scope/classification and dependency reads → guarded database/role operation → exact readback, one-time credential delivery. Role retirement follows approved D-4-RETIREMENT-AMENDMENT and IN-16 exactly. | Unknown pooled clients never asserted drained; dependency/ownership inventory complete; protected/shared-preview/self DB denied; no password/URI in result. |
| D-5 | Explicit verified target and SQL/binds/ordered transaction → existing parser/classification/one-use token/statement-count/timeout path → real transaction/readback. No alternate raw SQL adapter. | DML/DDL wrong door, multiple statements, unsafe EXPLAIN, concurrent token use, transaction rollback/connection loss and foreign target; missing role-retirement proof not global blocker under IN-15. |
| D-6 | Structured schema/table/index/extension/health selectors → quoted identifiers and bound values → guarded introspection or explicitly classified maintenance path. Preserve row/page limits. | Identifier quote injection, unsupported extension, denied catalog, absent table and permission failure; absence not inferred from error. |
| D-7 | Exact branch/snapshot/restore target and LSN/time → provider inventory and production classification → guarded snapshot/create/restore → operation state; finalize remains separate explicit action. | Pending restore is not complete; wrong snapshot ancestry/history window; unknown result retains original branch and recovery evidence. |
| D-8 | Project ID and whitelisted security/JWKS/IP/public-access diff → trusted project/key capability/current policy → widening/lockout/production preview → guarded patch and readback. | Project-only key cannot silently upgrade to org key; self-lockout/protected DB and unknown state refuse; unrelated restrictions retained. |
| D-9 | Exact source/target/schema/index/migration selectors → bounded guarded compare/advice/maintenance → actual statement and operation evidence. | Missing migration table explicit; no maintenance via read query; index concurrency and failure state real, never name-based branch safety. |
| V-1 | Run ID/requestKey/project/parent and explicit dev settings → immutable reservation → trusted nondefault/nonprotected classification → exact branch/endpoint create → recorded IDs/UTC expiry → child-first cleanup. | Duplicate worker/uncertain create reconciliation; same annotation without ledger untouched; object became production; expiry already gone; current owner-approved hosting caps preserved. |
| V-2 | Owned dev target + scenario/seed/size or validated source URL → deterministic typed plan and FK order → guarded transaction → recorded seed result. Reuse current scenario preview; finish actual execution under same subsection. | Same requestKey inserts zero twice; six related tables/unique/check constraints; FK cycle refuses; source cap and SSRF; no production/shared-preview seed. |
| V-3 | Owned target/run + reset/checkpoint name/recorded LSN or ordered migrations → exact copy/restore plan → copy-only execution → schema/timing/lock report → precise cleanup or explicit keep+expiry. | Source byte/state unchanged, missing/expired LSN, pending restore, failed second migration retains recovery ledger; no implicit finalize or live migration. |
| V-4 | Source target plus explicit per-sensitive-column masking policy/query/spec → current schema classification → guarded copy → masks before usable publication → tuning/integration on copy → cleanup. | Missing email/secret rule refuses before exposing copy; nullable/unique/FK masking; EXPLAIN ANALYZE never source; cleanup failure reported, no real sample values returned. |
| O-1 | Exact org/member/project-access IDs and intended role → narrowest eligible key, current rights and last-admin check → access/production preview → API write/readback. | Project-only connection gets useful refusal; never fallback to broader key; last admin/self access protected and invitation pending not membership. |
| O-2 | Exact key metadata scope/expiry or project-transfer recipient → owner-authorized plan → one-time encrypted key enrollment or guarded transfer → metadata state. | Own running key revoke/self-lockout refusal; transfer cannot be inferred from recipient prose; private key bytes never arguments/logs/handles. |
| O-3 | Explicit period/org/project and supported usage dimensions → dated trusted price/rate table and bounded usage → integer micro-dollar calculations/cent totals with coverage. | Missing price/metric/currency stays unknown; month/DST boundary and zero use; no raising capacity/paid plan from cost report. |
| O-4 | Scope selection → independent admin/security/usage/activity reads and dated full dashboard map → observed/attention/unreadable rows with registered readback paths. | Partial/inaccessible project, two pages, guided state not auto-verified; no provider write in review. |
| P-1 | Data-only profile with exact verified project/production/shared-preview/schema/auth ownership IDs → stored typed profile → production and app guard intersection. | Shared preview always protected as designed; app-owned Prisma/auth cannot be silently replaced; missing actual IN-13 IDs never guessed from names. |
| P-2 | Profile or typed inline requirements → tables/migrations/extensions/roles/pooling/protection/auth/readiness reads → exact evidence/remediation per row. | Wrong branch/current migration, denied schema, unobservable external env state and partial catalog; no automatic SQL fix. |
| P-3 | Structured project findings/requirements → deterministic guarded resource plan + draft profile/doc text; external IDs privately configured. | Existing database/role reuse, no duplicates on replay, no unsolicited alteration of Better Auth/Prisma or other repo. |
| W-1 | Exact target, SQL or ordered migrations plus requestKey → classify and snapshot/LSN checkpoint → migration preview on owned copy → explicit owner-authorized target execution → durable per-stage readback. | Crash after SQL cannot replay applied statement; changed target after preview invalidates intent; no production or money authority from confirm alone. |
| W-2 | Exact project/branch/recovery point → recovery diff and preserved-old-state plan → explicit restore/finalize stages through guarded tools. | Restore pending/failure versus finalized; history window invalid; original branch retained until safe; no blind SQL undo. |
| W-3 | Exact target/time window → independent schema/compute/usage/cost reads → health findings separated from uncertain/inaccessible components. | No keepalive polling or compute wake merely for metadata; unknown price and partial usage not healthy/free. |
| W-4 | Explicit owned run/age policy → ledger + current protection/expiry reads → exact cleanup plan → children before parent with per-object evidence. | No delete-by-branch-name; newly protected or foreign child blocks its dependent delete; repeat only unfinished owned objects. |
| W-5 | Exact role/key and approved consumers → generate into existing private secret flow → verify replacement/consumer handoff → separately guarded retire old credential. | Never retire before verified handoff; no key/URI in result; uncertainty leaves old credential and explicit recovery. |
| W-6 | Exact profile/project security/go-live spec → read-only checklist and optional separately confirmed existing security tools. | Go-live does not enable production; unknown policy not green; real protected project changes stay closed. |
| W-7 | Typed object kind/query/project filters → authorized paginated metadata search with explicit coverage. | No SQL over all projects, no guessed owner, row/byte/page cap and foreign project omitted without leak. |
| U-1 | Exact pinned operationId + validated path/query/body → operation safety/project scope/secret/spend metadata → native mapping or same guarded API client → readback. | Unknown/mutating project-wide operation denied without full classification; universal does not bypass SQL runner/protected-resource or secret-output rules. |
| R-1 | Existing pass/OAuth flows extended only inside approved scope; preserve project/account/mode/profile/rate/expiry across refresh, hash tokens and one-time display. | Foreign project, missing refreshed field, expiry/revoke; current TEST restriction not broadened by plan approval. |
| R-2 | Existing RTC adapter over wrapped registry with canonical aliases/owned result pages and shared atomic rate storage. | Two handler instances/80 overlapping calls at60 admit60 and deny20; sixth at configured5 denied; wrong/connector credentials and revoked handles refuse. |
| R-3 | Pinned conformance against this service's actual local HTTP handlers and fake Neon; preserve independent provider/Hub acceptance layers. | No reference-server-only credit; bad refresh/error/result identity fails intended check; standalone never depends on core adoption. |
| E-1 | Exact branch and Auth/Data API/config/provider/allowed-domain intent → ownership/protection + RLS/readability preflight → private secret request where needed → guarded enable/update/disable → real state. | App uses other auth refusal; unprotected tables explicit exposure warning; client secret one-use and never returned; supported branch API confirmed from vendor first. |
| E-2 | Exact bucket/function/trigger/log selector and bounded payload/window → scoped provider metadata/deploy operation → safe summaries/readback. | No object bytes/presigned URL in ordinary results; function deploy production-class; unavailable/newly billed operation guided/refused, no speculative endpoint. |
| X-1 | Owned log entry and recorded inverse/restore point → unchanged-current-state check → appropriate wrapped undo with original production/scope/spend guards. | Irreversible delete/missing inverse refuses; history point unavailable; undo-of-undo and foreign log. |
| X-2 | Verified read-only selected-project connection and original consented fixture IDs → explicit inventory of safe reads and gaps. | No role reset, seed, compute wake/write or live SQL fixture; source/deployed/provider acceptance remain distinct. |
| X-3 | Owner-certified isolated scratch project and same run ledger → authorized create/read/seed/checkpoint/restore/cleanup lifecycle only there. | IN-17 certification required where documented; selected-project key cannot delete whole project; no new paid resources or production test. |

### Neon execution example and unresolved owner facts

Synthetic seed intent (adapt to the existing public schema, not a new API):
```json
{"scenario":"rental","seed":7,"size":10,"dryRun":true}
```
The trusted context resolves the exact owned project/branch/run. Preview names
tables, FK order and exact proposed row counts. Execution binds the same plan
to the original request key; after a lost response, inspect that run and SQL
transaction evidence before another insert. Never treat matching generated data
alone as proof that the current connection owns it.

IN-15 and IN-16 are already approved; do not re-request role-retirement or narrow
D-5 independence. IN-09/IN-10 approved defaults are not permission to spend or
raise hosted limits under the later global zero-autonomous-spend policy.
Keep current 0.25 CU/five-minute autosuspend hosting settings. Older dev defaults
allowing max1 CU are not authorization to change actual resources. IN-07 protected
database selection, IN-11 pass rates, IN-12 dev defaults and IN-13 actual app IDs
need reconciliation with later decisions; if still missing, keep dependent real
actions gated. IN-17 isolated-project certification remains a protected owner
setup fact, never an agent-asserted boolean. Do not reclassify it as unfinished
general roadmap approval or a blocker for all synthetic implementation.
