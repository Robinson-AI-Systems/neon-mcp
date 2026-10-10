# Design — Batch D: Neon core (projects, branches, computes, databases, roles, connections, SQL, schema, snapshots, project security)

Status: **APPROVED** (Chris, 2026-10-10). Written 2026-10-10. Scope and acceptance: `docs/PLAN.md` →
Batch D. Cards D-1 … D-9. Depends on Batches B and C. Tool list: `docs/TOOL-CATALOG.md` sections Projects, Operations,
Branches, Computes, Databases and Postgres roles, Connections, SQL, Schema, Health, Snapshots, Project security.

"Port" means: take the matching old toolkit tool (`robinsons-toolkit-mcp` `handlers/neon.js`) only as a reminder of what
existed; rebuild through `src/neon/client.js` and `src/neon/sql.js`. Never copy its `n()` fetch wrapper or `runSQL`
(research audit N2, N8).

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| D1 | Every operation each card names exists in the vendored description with the parameters named here | `node scripts/openapi-find.mjs "<words>"` per tool; record method + path + operationId in the card |
| D2 | Branch delete is soft (7-day recovery) unless `hard_delete=true`; `POST …/branches/{id}/recover` and `POST /projects/{id}/recover` exist | `openapi-find "delete branch"`, `"recover"` |
| D3 | Branch restore requires `source_branch_id`; restoring a branch from itself needs `source_timestamp` or `source_lsn`; `preserve_under_name` exists | `openapi-find "restore branch"`; read `BranchRestoreRequest` |
| D4 | Snapshot restore creates a new branch with `finalize_restore` default false; `finalize_restore` is a separate operation (beta) | `openapi-find "restore snapshot"`, `"finalize restore"` |
| D5 | `GET /projects/{id}/branches/{id}/compare_schema` takes `base_branch_id`, `db_name` and optional LSN/timestamps | `openapi-find "compare schema"` |
| D6 | `GET /projects/{id}/connection_uri` takes `branch_id`, `endpoint_id`, `database_name`, `role_name`, `pooled` | `openapi-find "connection uri"` |
| D7 | Enabling logical replication cannot be undone (Neon docs, "Logical replication" guide) | cite the page in the D-8 PR; if Neon now allows disabling, drop the `D` flag and amend |

## 1. Decisions

**D1. Every read goes through a summary mapper and every write through `defineWrite`.** Tools never return raw Neon
objects in summary mode; `detail: 'full'` returns the object after the scrubber (B-6).

**D2. Deletions never pass `hard_delete`.** The change log stores `recover` as the inverse (project or branch), and the
preview says "recoverable for 7 days, until <date, Denver time>". A request to delete permanently is refused (Neon's
grace period is the safety net; Chris can delete permanently in the console).

**D3. Restores on production always keep the old state.** `neon_branch_restore` and `neon_branch_reset_from_parent` on a
production branch always pass `preserve_under_name` (default `<name>-before-<Denver date-time>`; the caller may name it,
never omit it). On non-production branches it is optional (default on).

**D4. `neon_snapshot_restore` never finalizes.** It always restores to a new branch (`finalize_restore: false`). Swapping a
restored branch in is only `neon_snapshot_finalize_restore`: production-guarded, its preview lists the computes that will
move and restart and the name the old branch will get. This is the action an unsupervised AI ran on Appliance Desk's
production on 2026-09-28 (research audit §7).

**D5. Connection strings are never returned.** `neon_connection_get_info` returns host, pooled host, database, role, SSL mode
and snippets that read `process.env.DATABASE_URL` (Node, Prisma, Drizzle, Python, psql). `neon_connection_show_once` gets the
URI server-side and puts it on the one-time page. Role creation and password reset do the same with the password.
(`neon_get_connection_string`-style results were bug N7.)

**D6. SQL tools are thin over the SQL guard.** `neon_sql_query`, `neon_sql_execute`, `neon_sql_execute_transaction`, `neon_sql_explain`,
`neon_sql_preview_change` call `src/neon/sql-run.js` (B-3); they add only argument schemas and summaries. `neon_sql_explain`
uses ANALYZE only when the guard classifies the statement as `read`; for writes it runs plain EXPLAIN and points to
`neon_sql_preview_change` (bug N3). Identifiers in catalog queries are passed as bind parameters (`$1`) or quoted by one helper
(`quoteIdent`), never concatenated (bug N8).

**D7. Schema and health tools are fixed, reviewed catalog queries** (`src/neon/catalog-queries.js`), each with a unit
test against real Postgres: `information_schema` and `pg_catalog` reads only, run through `neon_sql_query`'s read-only path.
`neon_schema_create_index` runs `CREATE INDEX CONCURRENTLY` (outside a transaction, the one exception, with a lock timeout and
a check that the index is valid afterwards; an invalid index is reported and dropped only with confirm).
`neon_health_check` offers 15 named checks; checks that need `pg_stat_statements` say so and point to
`neon_schema_enable_extension`.

**D8. Computes: sizes and scale-to-zero are spend.** `neon_compute_resize` and `neon_compute_update_settings` compute the
worst-case monthly change (B-4) from the compute's current limits; lowering is not spend but on production still needs
`confirm` (a smaller compute can slow the app). `neon_compute_suspend`/`restart` on production list the open connections that
will drop (from `pg_stat_activity` when SQL access is available).

**D9. Branch creation and limits.** `neon_branch_create` reads the branch count and the plan's included branches (price
table) and previews the extra $1.50/branch-month when it goes over; it annotates `rtc_request`. Expiry rules follow Neon
(max 30 days; never on default/protected/parent branches) and are checked before calling Neon.

**D10. Project security tools read before they write.** `neon_security_set_ip_allow` reads the current list and computes the
change (`replace` / `add` / `remove`); the preview warns when the list would not include addresses the profile says the
app needs (for a Vercel app: Vercel functions have no fixed IPs unless Secure Compute — the preview says IP allow will
block it) and when the plan does not include IP Allow. `neon_security_set_logical_replication` only enables (D7).

**D11. Old-name map.** D-1 adds `docs/TOOLKIT-NAME-MAP.md`: every prior `neon_*` name from every Robinson toolkit (333,
gap check `docs/audits/2026-10-10-prior-tools.md`) → new name, or "removed, because …" (research audit §2, bugs N1–N13,
"Not rebuilt" in TOOL-CATALOG). It is generated from the gap check's mapping table, not rewritten by hand.

## 4. Work units (each: unit tests, write-contract for every write, fake-Neon fixtures validated against the vendored description, TOOL-CATALOG marks)

### D-1 — Projects, operations, regions (M)
Tools: `neon_project_*` (11), `neon_operation_list`, `neon_operation_get` (13). Plus `docs/TOOLKIT-NAME-MAP.md`.
Extra tests: `neon_project_delete` preview lists every branch and database and the recovery date; `neon_project_create` result has
no connection URI (key-scan) and offers the one-time link; `neon_operation_get` with `waitSeconds` stops at the budget.

### D-2 — Branches (M, medium effort)
Tools: `neon_branch_*` (12). Extra tests: production restore always preserves; expiry refused on default/protected/parent;
delete refused with children (Neon's rule, checked before calling); `neon_branch_compare_schema` renders a readable diff;
unprotecting is production-guarded, protecting is not.

### D-3 — Computes (M)
Tools: `neon_compute_*` (10). Extra tests: hand-computed dollar previews; production suspend lists connections; delete
preview warns that connection strings using the host stop working.

### D-4 — Databases, roles, connections (M, medium effort)
Tools: `neon_database_*` (5), `neon_role_*` (6), `neon_connection_*` (2). Extra tests: no password or URI in any result (key-scan);
`neon_role_create_read_only` grants SELECT on chosen schemas and default privileges for future tables (real Postgres);
`neon_role_reset_password` preview lists the profile's places that use the role.

### D-5 — SQL tools (M, medium effort)
Tools: `neon_sql_*` (8). Extra tests: end-to-end through the guard on real Postgres; `neon_sql_explain` on a DELETE never deletes
(regression for N3); `neon_sql_stop_query` refuses a PID that is not on the target database.

### D-6 — Schema and health (M)
Tools: `neon_schema_*` (12), `neon_health_*` (3). Extra tests: every catalog query runs on real Postgres 17; `neon_schema_generate_types`
output compiles with `tsc --noEmit` in the test; concurrent index creation path.

### D-7 — Snapshots (S)
Tools: `neon_snapshot_*` (7). Extra tests: restore never finalizes; finalize is production-guarded and its preview lists the
computes that move; schedule change is `$`.

### D-8 — Project security (S)
Tools: `neon_security_*` (7). Extra tests: IP allow add/remove computes the exact new list; preview warning for Vercel apps;
logical replication preview says it cannot be undone.

### D-9 — Data checks and index maintenance (S) — added by the gap check 2026-10-10
Tools: `neon_branch_compare_data`, `neon_schema_list_migrations`, `neon_health_reindex` (3). Prior tools they replace:
`neon_get_branch_data_diff`, `neon_list_migrations`, `neon_reindex_database` (TS toolkit, `robinsonai-mcp-servers`).
- `neon_branch_compare_data`: one read-only connection per side (`sql/read` path); per table `count(*)` first, then rows
  keyed by primary key in pages of 500, compared by `md5(row::text)`; tables over `rowLimit` (default 50 000) or without
  a primary key report count and an ordered checksum only; result capped at 8 KB with a handle (C-1). Point-in-time side
  uses a throwaway child branch at that timestamp (`B6` mechanics, deleted afterwards). Never reads a protected
  resource (B4).
- `neon_schema_list_migrations`: detects the migration table by name (`_prisma_migrations`, `__drizzle_migrations`,
  `knex_migrations`, `flyway_schema_history`, `schema_migrations`), reads it read-only and reports applied / failed
  (`finished_at IS NULL` or `rolled_back_at` for Prisma) / rolled back; with `expected: [names]` also lists names not
  applied. A failed Prisma migration is reported in words ("deploys stop until it is resolved; fix with
  `prisma migrate resolve` in the app") — the tool never edits the table.
- `neon_health_reindex`: `REINDEX INDEX|TABLE … CONCURRENTLY` by default (never `DATABASE`/`SYSTEM`); preview reads index
  sizes and the bloat estimate from the `neon_health_check` query; production: B3 + confirm; runs outside a transaction (as
  `neon_schema_create_index` does) with `lock_timeout` from settings; an invalid leftover `_ccnew` index after a failure is
  reported with the exact drop statement.
Extra tests: data compare on real Postgres with added/removed/changed rows and a table without a primary key;
migration detection for Prisma (including a failed row) and Drizzle fixtures; reindex concurrently on real Postgres and
the production confirm path through the write-contract helper.

## 5. Stop-and-ask points

1. Any D0 row false: amend before that card.
2. An operation the catalog names does not exist in the vendored description: drop the tool, record it, point
   `neon_api_*` or `neon_where_is_setting` at it.

## 6. Acceptance mapping

| PLAN Batch D line | Evidence |
|---|---|
| Every listed tool built, catalog marked | TOOL-CATALOG Card column `built #n` (D-1 … D-9) |
| No secrets in results | key-scan test over the D suites |
| Old-toolkit bugs N2, N3, N6, N7, N8, N10 cannot recur | regression tests named in D-2, D-4, D-5 |
| Production restores preserve; snapshot restore never finalizes | `tests/unit/branches.test.js`, `tests/unit/snapshots.test.js` |

## Amendments

**2026-10-10 — Gap check against prior toolkits.** Card D-9 added (`neon_branch_compare_data`, `neon_schema_list_migrations`,
`neon_health_reindex`); `neon_schema_enable_extension` gains `update: true`; `neon_schema_list_objects` lists publications; D11 now
covers all 333 prior names. Reasons: `docs/audits/2026-10-10-prior-tools.md`, DECISIONS 2026-10-10.
