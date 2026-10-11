# B-3 worked example — SQL guard, next eligible engineering unit

Preparation only; **not an execution card, approved new interface, or delivered behavior**.
Baseline: `2c14d3f`, 2026-10-11. B-2 is merged through #20; B-3 is next.
Write the actual JIT card from BATCH-B decisions B5–B7, its dated amendment, PLAN Batch B and current code.
IN-09 is awaiting Chris **before B-3 merges** (OWNER-INPUTS); do not seed the suggested production-read default as approval.
This documentation PR can merge independently. No live keys, accounts, resources or spend are used here.

## Drift A findings to carry into the real card

| Assumption | Baseline reality | Action |
|---|---|---|
| SQL runner already authorizes statements | `src/neon/sql.js` only handles credentials, scope, self-host, timeouts and cleanup | New guard/runner must own parsing, all-resource protection and transactions |
| SQL errors reach caller with SQLSTATE | Layer catches callback exceptions and emits a generic connection error | Preserve sanitized SQLSTATE deliberately or return sanitized failure from inside callback; never expose raw query/URI/parser literals |
| Change log can hold a preview token | `restore_lsn` exists; preview SQL hash/expiry/target/count/diff token fields and methods do not | Select additive storage and atomic org-bound methods in the JIT card; design says token stored on change-log row |
| SQL helpers can reuse `quoteIdent` | No implementation at baseline | Propose helper owner/export; reject invalid identifiers; quote identifiers and bind values |
| Recursive AST has same class as root | `WITH ... DELETE ... SELECT` root is SelectStmt with nested DeleteStmt | Walk CTEs, subqueries, function calls and EXPLAIN, not just root |
| Temporary branch cleanup may assume expiry support | Vendored `expires_at` is Early Access; deletion defaults recoverable | Refuse safely when required safety/cost support unavailable; follow design fallback only for branch limit/budget. Never silently omit expiry or send hard_delete |
| Exact preview is “dryRun = no writes anywhere” | B6 intentionally creates/writes/deletes a disposable child | Separate target mutation from allowed preview-child mutations in contract assertions; target must remain unchanged. Document the explicit B6 exception, never generalize it to ordinary writes |

`defineWrite` does not return provider payloads or preview tokens today. B-3's card must name how safe token/row-count
outputs fit the lifecycle and how failure/rollback maps to false vs pending; do not add a runner that bypasses the wrapper.
Only SQL safety helpers are B-3 scope; exposing SQL tools belongs to D-5.

## Proposed files and interfaces (implementer reconciles at card start)

- **Existing:** `src/neon/sql.js`, `production.js`, `client.js`, `operations.js`, `write-neon.js`, `src/core/write.js`,
  `protected-resources.js`, `src/db.js`; tests/unit/sql-layer.test.js and tests/db/sql-layer.test.js.
- **Proposed:** `src/neon/sql-guard.js`: `classifySql(text)` → normalized class, access/full-table flags, safe reason;
  explicit unknown-node marker. Parser must produce exactly one statement per input string.
- **Proposed:** `src/neon/sql-run.js`: injected scoped SQL callback, trusted classification/protection services,
  settings/token store, Neon client and clock. Read, preview and apply entrypoints must share authorization.
- **Proposed tests:** `tests/unit/sql-guard.test.js`, `tests/unit/sql-run.test.js`, `tests/db/sql-run.test.js`.
  Token methods/columns in `src/db.js` and any supporting quoting helper must be named in the actual card, not assumed here.

Keep generic write lifecycle in core; Neon/SQL semantics stay under neon. Trusted services come from server context,
never args. Convert connection fields explicitly to `neonOrg,projectScope` at the SQL boundary.

## Input → service/API/storage mapping

| Input or trusted value | Destination and verification |
|---|---|
| Project/branch | Scope check + protected-resource check + `classifyTarget`; branch returned by trusted getBranch must match requested ID |
| Database/role/endpoint | Existing SQL options → SDK `getConnectionUri`, GET `/projects/{project_id}/connection_uri`, OpenAPI `getConnectionURI`; query `branch_id,database_name,role_name,pooled,endpoint_id?` |
| SQL text / transaction array | Parse each element; root `parse(text).stmts[i].stmt`; exact hash binds ordered SQL and bound parameters, not formatted display text. No raw SQL in audit summaries |
| Production exact preview | SDK `createProjectBranch`, POST `/projects/{project_id}/branches`; path project ID, body branch parent_id = verified target, expires_at UTC +1h, annotation_value, endpoints read_write 0.25 CU. Inspect referenced endpoint/annotation schemas before fixture authoring |
| DDL preview comparison | `getProjectBranchSchemaComparison`, GET `/projects/{project_id}/branches/{branch_id}/compare_schema`; path preview child, query `base_branch_id` target and required `db_name` |
| Cleanup | `deleteProjectBranch`, DELETE `/projects/{project_id}/branches/{branch_id}` on **returned child ID only**; omit hard_delete. Wait for operations and record failed/pending cleanup; never claim clean success |
| previewToken | Proposed durable change-log storage: opaque reference bound to org, SQL/params hash, project/branch/database/role, timestamp, expected counts and schema diff hash; validate within 30 min. Caller cannot supply expected counts as authority |
| Restore point | `SELECT pg_current_wal_lsn()` on authorized target before production apply; persist `change_log.restore_lsn` using org-bound audit row. Existing completeWrite does not do this |
| Confirm/count tolerance | Trusted SQL setting + `confirm: true`; compare each statement's affected rows with stored preview; mismatch ⇒ ROLLBACK, no COMMIT |

Neon mappings above are verified against the pinned spec; no live service was called. Exact SDK/body shapes must pass
fake-Neon validation. Look up create/delete/compare with `openapi-find`; load only referenced schemas, not the whole YAML.

## Ordered implementation and validation slices

1. **Parser only:** load libpg-query 18.1.5 with `await loadModule()` then `await parse(text)`. Probe SELECT, CTE,
   EXPLAIN and constant-true predicates. Table-drive ≥60 statements including the full B5 amendment. Run new sql-guard
   unit file after each small slice. No registry change and no connections in classifier tests.
2. **Authorized read runner:** check scope, all protected resources, trusted production classification and IN-09 setting
   before acquiring URI. Inside callback BEGIN READ ONLY, SET LOCAL bounded settings, execute bound query, cap rows,
   COMMIT; any failure ROLLBACK and release. Real Postgres must reject hidden writes (25006). No raw errors escape.
3. **Durable previews:** add token metadata/methods additively; initialize schema twice in DB tests. Test org isolation,
   expiry, SQL/parameter/target mismatch and atomic audit updates. Keep suggested production reads disabled pending IN-09.
4. **Disposable exact preview:** verified child create → operation wait → execute only there → collect per-statement
   counts/schema diff → guaranteed cleanup. Fake API counts plus real localhost SQL effects prove target untouched.
   Test create/compute wait/SQL/compare/delete failure separately. Preview budget fallback must say estimate and need acceptEstimate.
5. **Guarded apply:** valid current token + production mode/enabled + confirm; persist LSN, transaction, timeouts,
   row-count comparison, COMMIT only on match, read-back and audit. Duplicate request keys reserve once. Ambiguous commit
   stays pending, never automatically replays. Missing token storage/settings/guard ⇒ no SQL mutation.
6. **Reconcile seams:** run original SQL-layer, production guard, write-contract, write-log tests and new files; update
   card, ARCHITECTURE for storage, CHANGES-SINCE-DESIGN for D-5 consumers, STATUS and index. Respect PR size limit;
   if B-3 needs slices, each leaves unexposed helpers safe and explicitly carries uncompleted B6/B7 acceptance forward.

```bash
# After the proposed files exist:
npx vitest run tests/unit/sql-guard.test.js tests/unit/sql-run.test.js
npm run test:db -- tests/db/sql-run.test.js
# Existing regressions:
npx vitest run tests/unit/sql-layer.test.js tests/unit/production-guard.test.js tests/unit/write-contract.test.js
npm run test:db -- tests/db/sql-layer.test.js tests/db/write-log.test.js
npm run check
```

## Concrete fixtures and outcomes

Use fake Neon IDS/mainBranch/devBranch; SQL fixture table in an isolated localhost schema:
`CREATE TABLE invoices (id integer PRIMARY KEY, cents integer NOT NULL)`;
insert `(1,100),(2,200),(3,300)` via bound parameters. This is test data, never presented as account data.

| Case | Expected evidence / forbidden effect |
|---|---|
| `SELECT id FROM invoices ORDER BY id` | read; read-only transaction; ordered IDs 1,2,3; configured cap honored |
| `DELETE FROM invoices WHERE id = $1`, params `[2]` | write; preview 1 row; apply matches, IDs 1,3; target unchanged during child preview |
| Preview `DELETE FROM invoices WHERE cents >= $1` with `[200]` (2 rows), then insert `(4,400)` before apply | 3 affected vs 2 expected: mismatch rolls back entire apply; IDs 1,2,3,4 remain |
| `DELETE FROM invoices`, `WHERE true`, `WHERE 1=1` | destructive/full-table; confirm plus allowFullTable required |
| `SELECT ... FOR UPDATE`, SELECT INTO, mutating CTE | cannot enter read path; CTE inherits stronger nested class, with destructive flags for unbounded delete |
| `EXPLAIN ANALYZE DELETE FROM invoices` | destructive; never execute against target as a read/estimate |
| `SELECT pg_terminate_backend(1)`; SET; COPY; role password DDL | refused before connection; correct tool guidance; no raw secret SQL in logs/errors |
| Dollar-quoted DO, comment-hidden second statement | DO destructive; two statements refused; strings/comments parsed, never regex-split |
| Hidden-writing function in SELECT on local DB | real READ ONLY rejects 25006; no mutation, sanitized failure and cleanup |
| Token expired/different org, SQL, params, role or branch | no apply, no restore/commit; expected counts cannot be replaced by caller |
| Self DB/protected list match, missing trusted guard | refused for reads and writes; zero URI requests/SQL target operations |
| Missing confirm/production access, missing estimate acceptance | zero target mutations; explicit refusal/confirmation response |
| Preview failure after child exists | deletion attempted exactly for child; target not deleted; residual child/pending cleanup recorded |

BATCH-B amendment treats unknown node types as destructive, not read. Never weaken it to make a fixture pass.
For ≥60-case table, include every named B5 node/subcommand/function family and amendment, nested variants and refusal guidance.
Do not assume rows returned by RETURNING equal affected rows; assert driver rowCount per statement.

## Completion and successor inheritance

B-3 completion requires all PLAN SQL acceptance, ≥60 classifier cases, real read-only rejection, mismatch rollback,
LSN persistence, token binding, cleanup/fallback failures, no secrets and exact-head green ci with self-review.
IN-09 must be resolved before merging behavior with its production-read default. Scratch LSN restore proof stays X-3;
unit/local DB evidence cannot claim a live restore worked. B-4 remains spending work, D-5 inherits public guard/runner
exports, token semantics and tests; V/W/X later inherit preview isolation, restore LSN and count rollback behavior.
