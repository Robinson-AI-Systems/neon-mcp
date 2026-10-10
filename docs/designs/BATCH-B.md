# Design — Batch B: Trust layer (safety layer, production guard, SQL guard, spend guard, errors, shaping, profiles)

Status: **APPROVED** (Chris, 2026-10-10). Written 2026-10-10. Scope and acceptance: `docs/PLAN.md` →
Batch B. Cards B-1 … B-8. Depends on Batch A. This is the batch that makes the server safe to point at Chris's real
databases; every later tool is built on it.

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| B1 | `src/core/write.js` (copied in A-1) exports `defineWrite`, `guard`, `gone`, `safetyNote` | `grep -n "^export" src/core/write.js` |
| B2 | `change_log` has `production`, `spend_month_cents`, `request_key`, `operation_ids`, `confirmed`, `restore_lsn`, `inverse` (Batch A §2) | `grep -n "change_log" src/db.js` |
| B3 | Neon branches expose `default` and `protected`; `primary` is deprecated | `node scripts/openapi-find.mjs "retrieve branch"` then read the `Branch` schema |
| B4 | `libpg-query` parses PostgreSQL 17/18 syntax and returns node types used below (`SelectStmt`, `DeleteStmt`, `DropStmt`, `TruncateStmt`, `AlterTableStmt`, `TransactionStmt`, `VariableSetStmt`, `ExplainStmt`, `DoStmt`, `CallStmt`, `CopyStmt`) | `node -e "import('libpg-query').then(async m=>{await m.loadModule?.();console.log(JSON.stringify(await m.parse('delete from t')))})"` |
| B5 | `SELECT pg_current_wal_lsn()` on a Neon compute returns an LSN that `POST …/branches/{id}/restore` accepts as `source_lsn` | Neon docs "branching with LSN" (cite in the PR) and a fake-neon fixture; X-3 proves it in the scratch project |
| B6 | Branch create accepts `expires_at` and `annotation_value`; a throwaway preview branch with a 0.25 CU compute starts in a few seconds | `openapi-find "create branch"`; timing recorded in X-3 |

## 1. Decisions

**B1. Every write tool is built with `defineWrite`** — preview with `dryRun`, confirmation, apply, operation wait,
read-back, verify, change-log row — extended for Neon with metadata the guards read:
`{ writes: true, destructive, productionEffect: 'none' | 'write', spend: (args, ctx, before) → estimate | null,
access: boolean, secret: boolean, key: 'project' | 'org', projectWide: boolean, inverse: (args, before, after) →
{ tool, args } | null }`. `plan()` always reads the target from Neon first (never trusts arguments for what exists).
`readAfter()` runs after `waitForOperations` (A10); a pending wait gives `confirmed: 'pending'` and a change-log row that
`neon_operation_get` later completes.

**B2. "Production" is decided by one function, from Neon's own data** (`src/neon/production.js`,
`classifyTarget(ctx, target)`), never from names or arguments. A target is **production** when any of these is true:
1. the branch is the project's default branch (`default: true`);
2. the branch is protected (`protected: true`);
3. the target lives on such a branch: a compute, database, role, snapshot finalize, Neon Auth, Data API, Function,
   trigger, bucket;
4. the tool is `projectWide` (project settings, history retention, quotas, IP allow, public access, logical
   replication, JWKS, audit level, project delete, transfers) — every project has a default branch, so project-wide
   changes always reach production;
5. a project profile (Batch P) lists the branch as a production branch, or as a **shared preview** branch (e.g.
   Appliance Desk's preview branch that every preview deployment uses). Shared previews are guarded like production;
   the message says "shared preview".

Only tools with `productionEffect: 'write'` are guarded: creating a branch *from* production, taking a snapshot of it or
reading it is not a production write.

**B3. Production writes need production access, and then `confirm`.** In `preview` mode (every connection's default) a
production write returns `refused_by_guard` with the exact steps to enable production access. Production access is per
organization and turns on only in two steps: `neon_enable_production` (confirm) **and** the passphrase re-entered on the
setup page within 10 minutes; a tool alone can never enable it (A13: never on a preview deployment of this server). Then
a connection must be created (or re-authorized) in `production` mode. In production mode every production write needs
`confirm: true` even where the same tool on a non-production branch would not; results carry `"target": "PRODUCTION"` at
the top; change-log rows are marked `production`.

**B4. Self-protection is absolute.** The stored setting `protected_resources` (`[{ kind: 'self' | 'robinson' | 'other',
org, project_id, branch_id?, label }]`) lists resources no tool may change — this server's own Neon project (added
automatically, A15) and the other Robinson servers' databases (IN-07). Any write whose target matches is refused with
`refused_by_guard`, **even with confirm and production access**; SQL of any kind against them is refused. The list is
read by `neon_get_settings` and edited **only on the setup page** behind the passphrase (`neon_update_settings` refuses
that key).

**B5. The SQL guard classifies every statement with the real PostgreSQL parser** (`src/neon/sql-guard.js`,
`libpg-query`). Unparseable SQL is refused with the parser's message. One string = one statement in `neon_sql_query` and
`neon_sql_execute`; several statements go in `neon_sql_execute_transaction` as an array. Classes:

| Class | Statements (parser node types) | Rule |
|---|---|---|
| `read` | `SelectStmt` without `INTO` or locking clause, `VariableShowStmt`, `ExplainStmt` whose inner statement is `read` (ANALYZE allowed) | `neon_sql_query`, inside `BEGIN READ ONLY`, row cap, statement timeout. Production reads allowed when setting `sql.production_reads` is true (IN-09) |
| `write` | `InsertStmt`; `UpdateStmt`/`DeleteStmt` **with** a `WHERE` that is not a constant-true expression; `MergeStmt`; locking `SELECT`; `SELECT … INTO` | Non-production: preview (EXPLAIN estimate), no confirm. Production: B3 + exact-count preview (B6) + guarded apply (B7) |
| `ddl` | `CreateStmt`, `IndexStmt` (non-concurrent), `ViewStmt`, `CreateFunctionStmt`, `CreateSchemaStmt`, `CommentStmt`, `AlterTableStmt` with only additive subcommands (add column, add constraint, set default, attach), `CreatePublicationStmt`, `GrantStmt` (also **access**) | Non-production: preview, no confirm (grant: confirm). Production: B3 + schema-diff preview on a throwaway branch + lock warning + guarded apply. Profiled app's schema: refused without `outsideApp: true` (P-1) |
| `destructive` | `DropStmt` (any object), `TruncateStmt`, `UpdateStmt`/`DeleteStmt` without `WHERE` (or `WHERE true`, `WHERE 1=1`), `AlterTableStmt` with `DROP COLUMN`, `ALTER COLUMN TYPE`, `SET NOT NULL`, `DROP CONSTRAINT`, `SET UNLOGGED`; `RenameStmt`; `RevokeStmt`; `DropOwnedStmt`; `ReassignOwnedStmt`; `DoStmt` and `CallStmt` (opaque code); `VacuumStmt` with `FULL`; `ClusterStmt` | Always `confirm`. Production: B3 + exact preview (B6) + guarded apply (B7). Full-table `UPDATE`/`DELETE` additionally need `allowFullTable: true` |
| `refused` | `TransactionStmt` (the tool controls transactions), `VariableSetStmt` (except `SET LOCAL` of `statement_timeout`/`lock_timeout`/`search_path` inside `neon_sql_execute_transaction`), `AlterSystemStmt`, `CreateRoleStmt`/`AlterRoleStmt`/`DropRoleStmt` (use `neon_role_*`; a password in SQL would be logged), `CopyStmt`, `LoadStmt`, `CheckPointStmt`, `ListenStmt`/`NotifyStmt`, `CreatedbStmt`/`DropdbStmt` (use `neon_database_*`), `CreateExtensionStmt`/`AlterExtensionStmt`/`DropExtensionStmt` (use `neon_schema_*_extension`), non-FULL `VacuumStmt` (use `neon_health_vacuum_analyze`), `ReindexStmt` (use `neon_health_reindex`), `IndexStmt` with `CONCURRENTLY` (use `neon_schema_create_index`) | Refused with the name of the right tool |

Function calls anywhere in a statement are checked against a deny list — `pg_terminate_backend`, `pg_cancel_backend`
(use `neon_sql_stop_query`), `pg_reload_conf`, `set_config`, `pg_advisory_lock*`, `dblink*`, `lo_import`, `lo_export`,
`pg_read_file`, `pg_read_binary_file`, `pg_ls_dir`, `pg_sleep` over 5 seconds — refused with the right tool where one
exists. The READ ONLY transaction is the second line of defense for `read` (Postgres itself rejects writes inside
functions).

**B6. Exact previews on a throwaway branch.** For `write`, `ddl` and `destructive` SQL on production (and for
`destructive` SQL anywhere when the caller asks with `exactPreview: true`), the preview creates a child branch of the
target at its head (`expires_at` now + 1 hour, annotation `rtc_preview=<requestKey>`, 0.25 CU compute), runs the
statements there in one transaction, records affected rows per statement, takes `compare_schema` for DDL, and deletes
the child. The preview result carries `previewToken` (stored on its change-log row: SQL hash, target, expected rows,
schema diff hash) and says in words what will happen ("This will delete 37 rows from invoices on PRODUCTION branch
main."). If the plan's branch limit is reached or the budget runs out, the preview falls back to an `EXPLAIN` estimate,
says the exact count is unavailable, and the apply call then also needs `acceptEstimate: true`. The temporary branch's
cost is shown (under one cent for a short preview at Neon's published rate).

**B7. Guarded apply.** A production SQL write applies only when the call passes `confirm: true` and the `previewToken`
from a preview of the **same** SQL on the **same** target in the last 30 minutes. The server: records
`pg_current_wal_lsn()` (the restore point, stored as `restore_lsn`, used by undo X-1 and `neon_workflow_recover_data`); opens
one transaction with `SET LOCAL lock_timeout` and `statement_timeout` from settings; runs the statements; compares
affected rows with the preview's expected rows within `sql.affected_rows_tolerance` (default 0 = exact); on a difference
rolls back and reports both numbers; otherwise commits and reads back (row counts or schema). Non-production writes use
the same transaction wrapper without the token or the restore point.

**B8. Spend guard** (`src/neon/spend.js`). The stored setting `pricing` holds Neon's published rates with their source
URL and the date they were read (seeded from `https://neon.com/pricing` on 2026-10-10: Launch $0.106/CU-hour, Scale
$0.222/CU-hour, storage $0.35/GB-month, instant restore $0.20/GB-month, scheduled snapshots $0.09/GB-month, extra branches
$1.50/branch-month with 10 included on Launch and 25 on Scale, egress $0.10/GB after 500 GB) and the organization's plan
(read from `GET /organizations/{id}` `plan` when an org key exists, else the setting). Rates are integer micro-dollars;
totals are cents. Every `$` tool's `spend()` computes the **worst-case monthly increase** from the target's current
state (read in `plan()`), e.g. raising a compute's maximum from 2 to 4 CU with scale-to-zero off = 2 × 730 h × $0.106 =
$154.76/month. Where Neon's charge depends on usage that cannot be known (history storage, snapshot size), the preview
gives the rate, last month's usage of that metric when readable (`neon_billing_usage`), and says it is an estimate. Rules:
every `$` change needs `confirm`; a change whose worst-case increase is above `spend.cap_per_change_cents` (default
$25, IN-10) or that would take today's confirmed increases above `spend.cap_per_day_cents` (default $50) is refused with
the numbers and how to raise the cap. Free-plan accounts: the preview says the plan limit that would block it instead.
Plan changes, payment details and purchases have **no tool** (guided only; buying is a hard limit).

**B9. Access guard.** Tools marked `A` (invites, role changes, shares, API keys, Data API, JWKS, trusted domains,
presigned links, passes) always need `confirm`; the preview names the person or address and exactly what they gain.

**B10. Plain-English errors** (`src/neon/errors.js`, shape copied from the Workspace server): what happened, likely
cause, what to do, one technical line with Neon's request ID or the SQLSTATE. Rules: 401 (key revoked or wrong — "add a
new key on the setup page"); 403 (this key kind cannot do this — names the kind that can, from A5); 404; 409/423
(another operation is running — "wait and retry; `neon_operation_list` shows it"); 422 with the parameter; 429; plan limits in
Neon's message (protected branches, branch count, compute size, project count) → the plan page link; "cannot delete a
branch that has children"; compute waking (connection reset on first query → one automatic reconnect for reads only).
SQLSTATE: `42P01`, `42703`, `42501` (permission), `23505`, `23503`, `23502`, `25006` (write in read-only), `57014`
(timeout), `55P03` (lock not available), `53300` (too many connections — "use the pooled host"), `28P01`, `3D000`,
`40001`, `40P01`, `08*`. Unknown errors fall back to Neon's or Postgres's own message, unchanged.

**B11. Result shaping and secret removal** (`src/core/result-rules.js` + `src/neon/scrub.js`): `_display` beside money
(dollars) and sizes (GB/MB), `_local` (America/Denver) beside timestamps; production targets marked; secrets removed
**by field name** (`password`, `connection_uri`, `connection_uris`, `uri` in connection responses, `key` in key-create
responses, `api_token`, `s3_secret_access_key`, `secret_server_key`, `auth_data`, presigned `url`) and **by pattern**
(`postgres(ql)?://user:password@…` → `postgresql://user:[hidden]@host/db`, `npg_…` role passwords, `napi_…` API keys)
in every result, error, log line and change-log row. Fields Neon marks `x-sensitive` that are personal data (emails) are
kept in results for the owner but never written to the change log's `before`/`after` beyond the record's ID.

**B12. Profiles** (`read_only`, `everyday`, `full`) come from each tool's `profiles` metadata (TOOL-CATALOG Profile
column); `read_only` lists no write tool and refuses one called by name. Org-key tools are `full` only. Profile counts
print on the home page and must match TOOL-CATALOG's totals (C-2's budget check compares them).

**B13. Writes are declared, not guessed.** Every tool declares `writes`; `scripts/check-writes.mjs` fails when a tool
lacks it, a write lacks `dryRun`, a `$` tool lacks `spend`, an `S` tool lacks the one-time-page path, a write lacks
`productionEffect`, a registered tool has no reachable handler (research audit N1), or a destructive tool has
`profiles` containing `read_only`.

## 2. Schema

None new (Batch A tables). Settings rows seeded by `initSettings()` (insert only when missing; never overwritten):
`protected_resources`, `pricing`, `spend` (`cap_per_change_cents: 2500`, `cap_per_day_cents: 5000`), `sql`
(`row_cap: 200`, `row_cap_with_handle: 5000`, `statement_timeout_ms: 15000`, `lock_timeout_ms: 5000`,
`production_reads: true`, `affected_rows_tolerance: 0`), `operation_wait_seconds: 20`,
`neon_api_budget_per_minute: 500`, `default_region: "aws-us-east-1"`. `production_enabled` lives on `neon_orgs` (A-2).

## 3. Shared primitives — the write-contract helper (`tests/helpers/write-contract.js`)

`runWriteContract({ tool, args, fixtures, production?, spendCents?, appOwned?, protectedTarget?, secret?, inverse? })`
runs nine checks every write tool must pass, through every door that exists at the time (direct handler; `neon_call`
after C-2; HTTPS after R-2):

1. `dryRun: true` → no write call on fake Neon (and no SQL write on Postgres); a preview change-log row.
2. Without `confirm` (when needed) → nothing changed; `needs_confirmation` with a plain summary.
3. With `confirm` → exactly one write call; operations awaited (bounded); read-back returned; change-log row with the
   request key; the same call again within 10 minutes returns the first result without a second write.
4. Read-back mismatch → `confirmed: false` with a warning; operation still running → `confirmed: 'pending'`.
5. Production target on a `preview`-mode connection → `refused_by_guard`; in `production` mode → needs `confirm` even
   when the non-production case would not; result marked PRODUCTION.
6. Protected resource (self / Robinson) → refused even with `confirm` and production access.
7. `$` tools → dollar line from the stored price table and the target's current state (never arguments); per-change and
   daily caps enforced.
8. App-owned target (profile, Batch P) → refused without `outsideApp: true`.
9. `S` tools → no secret anywhere in the result, the change log or logs; a one-time-page link instead.

## 4. Work units

### B-1 — Safety layer and change log (L, medium effort)
Files: `src/core/write.js` (extended), `src/neon/write-neon.js` (operation-aware read-back, request-key dedupe,
`findExisting` on uncertain creates), `tests/helpers/write-contract.js`.
Tests: the nine checks against a sample non-production write, a sample production write and a sample `$` write
(guards 5–8 stubbed until their cards land, then switched on in each card).

### B-2 — Production guard and self-protection (M, medium effort)
Files: `src/neon/production.js`, `src/core/protected-resources.js`, `api/neon/setup.js` (protected-resources editor;
production enable second step), `src/tools/server.js` (`neon_enable_production`, `neon_disable_production`).
Tests: default branch, protected branch, compute on a protected branch, project-wide tool, profile production branch,
shared preview → production; a child branch → not; fixture where deprecated `primary` and `default` disagree (uses
`default`); preview-mode refusal names the steps; enable needs both steps within 10 minutes and never works on a
preview deployment; protected resource refused with confirm and production access; `neon_update_settings` cannot edit
`protected_resources`.

### B-3 — SQL guard (L, medium effort)
Files: `src/neon/sql-guard.js` (classify), `src/neon/sql-run.js` (read-only runner, preview on throwaway branch,
guarded apply, restore point).
Tests (classification table-driven, ≥60 statements, one per row of B5 plus tricky ones: `DELETE … WHERE 1=1`,
`WITH d AS (DELETE …) SELECT …` → write, `SELECT … FOR UPDATE` → write, `EXPLAIN ANALYZE DELETE` → destructive,
`SELECT pg_terminate_backend(1)` → refused, two statements in one string → refused, comment-hidden statements,
dollar-quoted `DO` → destructive); on real Postgres: a write inside `neon_sql_query` fails with 25006 in plain words; guarded
apply rolls back when affected rows differ from expected; restore LSN recorded; `previewToken` for different SQL or a
different target is refused; preview branch deleted after success and after failure (fake Neon); fallback to estimate
needs `acceptEstimate`.

### B-4 — Spend guard (M)
Files: `src/neon/spend.js`, `src/neon/pricing.js` (seed + reader).
Tests: compute raise worst case (hand-computed numbers); scale-to-zero off; extra branch past the included count;
snapshot schedule estimate says "estimate"; per-change cap and daily cap refuse with the numbers; Free plan answers with
the limit, not dollars; changing the price table needs confirm and is logged.

### B-5 — Plain-English errors (M)
Tests: one per rule using real error shapes (from Neon's description examples and real Postgres); unknown errors pass
through unchanged; no error text ever contains a connection string.

### B-6 — Result shaping, secret removal and profiles (M)
Files: `src/core/result-rules.js`, `src/neon/scrub.js`, `src/core/profiles.js`.
Tests: every secret field and pattern removed from nested results (fixtures: project create, branch create with
compute, role create, reset password, key create, credential create); emails kept in results but not in change-log
rows; Denver times across a daylight-saving change; sizes; `read_only` lists no write and refuses one by name; counts on
the home page.

### B-7 — check-writes and the declarations (S)
Done when: `npm run check` fails on each violation in B13 (prove once each, then remove).

### B-8 — Server tools (S) — may group with B-6
Tools: `neon_check_key_access`, `neon_list_connections`, `neon_revoke_connection`, `neon_recent_changes`,
`neon_where_is_setting` (data file `src/data/dashboard-map.js`, structured steps `{ setting, url, steps: [{ n, action,
target, value? }], expected, verifyWith? }`, seeded with every guided row of `docs/APP-NEEDS-APPLIANCE-DESK.md` and the
plan/payment/SSO/integration pages; O-4 completes the map), `neon_get_settings`, `neon_update_settings` (plus
`neon_enable_production`/`neon_disable_production` from B-2).
Tests: per tool through the write-contract helper; `neon_update_settings` refuses `protected_resources`; where-is-setting
returns structured steps for "change plan" and never claims it is done.

## 5. Stop-and-ask points

1. Any B0 row false: amend before that card (B5 false → undo of SQL becomes "copy rows back" only; amend X-1).
2. A `$` tool whose current state cannot be read before acting: stop that tool; propose an amendment.
3. Any change to the defaults that are owner inputs (spend caps IN-10, production reads IN-09, what `read_only`
   contains).

## 6. Acceptance mapping

| PLAN Batch B line | Evidence |
|---|---|
| Nine write-contract checks exist and run | `tests/unit/write-contract.test.js` |
| Production guard, two-step enable, self-protection | `tests/unit/production-guard.test.js`, `tests/db/production-enable.test.js` |
| SQL guard classification and guarded apply | `tests/unit/sql-guard.test.js`, `tests/db/sql-run.test.js` |
| Spend guard with dollar previews and caps | `tests/unit/spend.test.js` |
| Errors, shaping, secret removal, profiles | their unit test files; key-scan test |
| check-writes enforces declarations | B-7 PR evidence |

## Amendments

(Dated entries only.)

**2026-10-10 — Gap check against prior toolkits** (`docs/audits/2026-10-10-prior-tools.md`). Mapping the old toolkits'
structured DDL, grant, RLS, replication and statistics tools to `neon_sql_execute` showed statements B5 did not place, and
that `ReindexStmt` pointed at a tool that cannot reindex. Changes to B5 (B-3 adds one test row each):
1. `ReindexStmt` → refused with "use `neon_health_reindex`" (new tool, D-9); `AlterExtensionStmt` → refused with "use
   `neon_schema_enable_extension` (`update: true`)".
2. `ddl` also covers `CreateEnumStmt`, `AlterEnumStmt` (add value), `CompositeTypeStmt`, `CreateSeqStmt`,
   `CreateTrigStmt`, `CreatePolicyStmt`, `CreateTableAsStmt`, and `AlterTableStmt` `ENABLE ROW LEVEL SECURITY`;
   `write` also covers `RefreshMatViewStmt`; `destructive` also covers `AlterPolicyStmt`, `AlterTableStmt`
   `DISABLE`/`NO FORCE ROW LEVEL SECURITY`, and `AlterSeqStmt`.
3. Function calls that change server state without a table write are classed by the function, never as `read`:
   `pg_stat_statements_reset`, `pg_stat_reset*`, `setval`, `pg_create_logical_replication_slot` → `write` (so only
   `neon_sql_execute`, never `neon_sql_query`); `pg_drop_replication_slot` → `destructive`.
4. **Fail closed:** any parser node type not named in B5 is classed `destructive` (always confirm, exact preview on
   production) until a reviewed amendment places it; the result says it was unclassified.
