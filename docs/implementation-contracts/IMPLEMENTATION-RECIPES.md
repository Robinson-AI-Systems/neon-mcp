# Implementation recipes — open only the section your card needs

Supporting guidance, not new scope or authorization. AGENTS, PLAN, approved designs and the drift protocol govern.
B-3 historical baseline: `2c14d3f` (PR #20). D-2 current code reconciled at `b42da7c` (PR #50 merged). GitHub had no open PRs/issues; the checkout was clean.
A-1–A-7, B-1 and B-2 are delivered; B-3 is next. Reconcile this snapshot at each card boundary.

## Routing and repeated discovery

| Card needs | Read next | Repeated work this removes |
|---|---|---|
| Any new card | § Existing seams, § Card packet | Guessing signatures and which interfaces already exist |
| Neon read/write | § API recipe; test helpers below | Finding raw SDK names, fixture shapes and pagination again |
| SQL safety | [B-3 worked example](B-3-WORKED-EXAMPLE.md) | Parser shape, connection context, token storage and rollback design |
| Later batch | [Remaining work routes](REMAINING-WORK-ROUTES.md), relevant row only | Searching every design and assuming future helpers exist |
| PR completion | PLAYBOOK Steps 4–9; DRIFT-PROTOCOL B | Rediscovering acceptance/CI/self-review gates |

Do not read all recipes at startup. Copy the relevant link into the card's “Read only these”. Distant cards remain JIT.

## Existing seams (verified at baseline)

| Existing file/export | Actual contract and integration trap |
|---|---|
| `src/core/write.js`: `defineWrite(options)` | Returns `{tool, handler}`. Options include `plan`, `apply`, `readAfter`, `verify`, `inverse`, flags and `needsConfirm`. `plan` returns `{summary,target,projectId,branchId,before}`; target is a string. `apply` gets `{before,requestKey}` and returns `{confirmed,operations}`. `readAfter` receives before; `verify(before,after,args,ctx)` returns true only on evidence. Current `inverse(args,before,ctx)` does **not** receive after. |
| `src/neon/write-neon.js`: `createNeonWriteContext`, `applyNeonWrite` | Inject connection/db/client/all four guards. Context is frozen; compose extra trusted services into a new object. `applyNeonWrite` waits on returned operation IDs; uncertain writes stay pending. |
| `src/neon/production.js`: `classifyTarget(ctx,target)`, `checkProductionAccess(target,ctx,tool)` | Target uses camelCase IDs. `ctx.getBranch({projectId,branchId})` returns the branch object, not `{branch}`. Trusted `getProfile` is optional; caller must not supply branch flags. |
| `src/core/protected-resources.js`: `checkProtectedTarget(target,ctx)` | Needs `ctx.db.getProtectedResources`, independently verified `ctx.selfProject`, connection org and camelCase target IDs. Returns boolean; absent services deny. Applies to SQL reads as well as writes. |
| `src/neon/sql.js`: `createSqlLayer({db,vault,env,fetch,poolFactory})` | Returns `withScopedSql(ctx,options,fn)`; ctx uses `neonOrg`, `projectScope`, unlike write context's database-shaped connection. Options: `projectId,branchId,database,role,pooled,endpointId`. Callback sees only `query(text,params)`. No transaction/authorization implemented here yet. |
| `src/neon/client.js`: `makeNeonClient`, `call`, `listAll`, `requestKey` | Budget required, injected fetch for tests. `call` uses official SDK raw export names. `listAll` accepts normalized page fields and returns `{items,capped,error?}`; don't discard capped/errors. |
| `src/db.js`: `createDb(sql)` | Production uses Neon tagged SQL; tests inject `neonShapedQuery()`. `initSchema()` is additive. `reserveWrite`, `recordWritePreview`, `completeWrite` store safe audit metadata, not SQL/raw customer data. |
| `src/core/registry.js`, `src/tools/index.js` | Namespace exports are `tools` array + `handlers` map; registry rejects duplicate names/missing handlers. Index currently merges server and owner-production modules only. |

**Not yet present:** `src/neon/sql-guard.js`, `sql-run.js`, `spend.js`, `pricing.js`, `errors.js`, `scrub.js`,
`src/core/result-rules.js`, `profiles.js`, summary mappers, `quoteIdent`, universal/HTTPS tool doors.
These are proposed/design paths; PLAYBOOK's reuse list is not evidence that they exist.
Do not replace absent external-target guards with `async () => true` outside test fixtures. The existing internal-only
owner controls have explicitly isolated guards; they do not authorize Neon mutations and must not be copied for SQL/API writes.

## API recipe

1. Read the TOOL-CATALOG row and approved design. Record tool flags, key kind, target, profile and acceptance.
2. Run `node scripts/openapi-find.mjs "<operation words>"`. Inspect just the operation's parameters and referenced schemas
   through `test/helpers/neon-spec.js` `loadNeonSpec().byId.get(operationId)` (offline). Check SDK export spelling too.
3. Write a mapping table: input → `{path,query,body}`; omitted/default/invalid input; scope and secret destination.
   Never omit a branch ID where the API silently selects the default branch. No handcrafted URLs.
4. Add fake responses using `test/helpers/neon-fixtures.js` (`IDS`, `mainBranch`, `devBranch`, `operation`, `responses`).
   `makeFakeNeon` in `test/helpers/fake-neon.js` validates both request and configured response against the vendored spec.
   Configure `fake.when(operationId).resolves(body)`; pass `fake.fetch` to the client; call `fake.assertClean()`.
   Fake operation IDs use **OpenAPI spelling**, e.g. `getConnectionURI`; SDK call uses `getConnectionUri`.
5. Reads: enforce scope/profile before calling, then a bounded summary. Adapt response array names before `listAll`;
   test empty, two pages, repeated cursor, capped results, provider failure, unauthorized connection and secret fields.
6. Writes: `defineWrite` → trusted before read → guards → durable reservation → `applyNeonWrite` → bounded wait →
   fresh read-back → predicate verify → audit completion. Fake before/after must differ in the intended field only.
   Assert exactly one mutation for duplicate request keys and no replay after transport ambiguity.
7. Run targeted unit files, then `npm run check`. Record method/path/operationId and current official source in the PR
   when adding a real operation; do not re-vendor inside an unrelated card.

## Test recipe and focused commands

The actual helper path is **`test/helpers/write-contract.js`**, not the design's older `tests/helpers/` spelling.
`runWriteContract(make = makeContractFixture)` accepts a fixture factory, not the design's illustrative options object.
Its fixture returns `{tool,handler,ctx,log,calls,parse}`; options are `{production,spendCents,blocked,appOwned,verify}`.
The sample checks injected decisions; it does not prove a new tool uses real production/spend/app/secret mechanisms.
For each real write, adapt the factory to that handler and add assertions for its concrete before/after, pending wait,
production confirmation, secret one-time page and real guards. Cover every door that exists; add future doors when built.

Database examples: `tests/db/sql-layer.test.js`, `tests/db/write-log.test.js`.
Use `requireLocalDatabaseUrl()` from `tests/db/local-url.js`, `openIsolatedSchema`/`closeIsolatedSchema`/
`neonShapedQuery`/`rawQuery` from `test/helpers/pg-neon-adapter.js`, and `localPoolFactory` from
`test/helpers/sql-client.js`. The latter refuses non-local hosts. Do not use real Neon credentials or a remote DB.

```bash
npm ci
npx vitest run tests/unit/neon-client.test.js tests/unit/write-contract.test.js
npm run test:db -- tests/db/sql-layer.test.js tests/db/write-log.test.js
npm run check
python3 docs/pr-cards/validate-index.py
```

Replace targeted names with the card's existing/new test paths; new paths must exist before invoking them.
Unit config includes only `tests/unit/**/*.test.js`; DB config is selected by `npm run test:db`.
If local PostgreSQL binaries are absent, record that limit and require the CI db job; do not claim local DB validation.
CI's aggregate `ci` at the exact head remains the merge gate, including for documentation PRs.

## Card packet (add detail without expanding the whole reading list)

Keep the normal 40–100 line card; link a bounded appendix when the mapping/test matrix is longer. Include:

- Baseline SHA, prerequisites actually merged, drift A findings, recipe links, one risk area and migration owner.
- Files labelled **existing** / **proposed**; signatures and trusted-service injection points; every caller affected.
- Input → API/SQL/table-column mapping; validation/default/omission rules; identifiers quoted, values bound.
- Ordered steps, each with a concrete fixture, command and expected outcome; run between ≤150-line slices.
- Before/apply/after evidence and forbidden calls; refusal, concurrency, timeout, mismatch and cleanup tests.
- Owner inputs and when they block merge or use, copied from OWNER-INPUTS (suggestions are not approval).
- Done evidence: named tests, CI head/run, self-review dispositions; successor inherits exact exports/settings/schema.

Do not mark an indexed product card delivered for this guidance alone. Update recipe baselines and changed seams when
implementations land; write successor facts in CHANGES-SINCE-DESIGN when its card remains JIT.

## D-2 current read seams (verified PR #51)

Existing: `src/tools/read-descriptors.js` provides `defineReadTool`, `readId`, `readText` and `readSchema` for project, operation and branch reads. It supplies descriptors, never authorization. `src/tools/project-context.js` owns trusted `projectScope`, `projectClient`, `projectRead`, `projectPages` and summaries. `src/tools/branches.js` exports `createBranchReadHandlers({getClient})`, independently checks the project org and branch IDs before revealing results.

Input mapping: projectId → provider `getProject` and `listProjectBranches` (path.project_id, query.limit/cursor); projectId + branchId → `getProjectBranch`, `listProjectBranchEndpoints`, `listProjectBranchDatabases`, `listProjectBranchRoles` (both path IDs). Test setup: `makeFakeNeon`, `makeNeonClient({fetch:fake.fetch,budget})`, `IDS`, `devBranch`, `devEndpoint`, `database(IDS.dev)`, `role(IDS.dev)`, `responses.getProjectBranch('dev')`. Examples in `tests/unit/branches.test.js` verify GET-only, foreign resource denial, allowlisted outputs and no credentials. Targeted `npx vitest run tests/unit/read-descriptors.test.js tests/unit/branches.test.js tests/unit/projects.test.js tests/unit/project-operations.test.js tests/unit/registry.test.js tests/unit/context-budgets.test.js`, then `npm run check`, then required exact-head CI. Local execution may be unavailable; report that fact and rely on GitHub Actions without claiming local validation.

Next: D-2 writes in cohesive risk groups, retaining B-1 `defineWrite`, `createProjectWriteContext`, `applyNeonWrite`, B-4 spending admission, verified provider read-back and all independent approvals. Expiry forbidden for default/protected/parent; never hard-delete; production restore always preserves prior state. D-3 inherits scoped branch fixtures. Read only the D-2 card and this section; do not treat the old B-3 seam inventory as current code.
