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
