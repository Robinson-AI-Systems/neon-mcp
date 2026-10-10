# Gap check — every Neon tool Chris built or planned (2026-10-10)

Chris (2026-10-10): "check what tools I had built, or had planned, for these tool sets across my various Robinson's
Toolkit repositories and close any gaps … don't limit yourself to repos in my organization." This file lists every
prior Neon tool **name** found, where it came from, and what it becomes in this plan. `docs/TOOLKIT-NAME-MAP.md` (D-1,
design D11) is generated from the mapping table below.

## Summary

| | Count |
|---|---|
| Distinct prior Neon tool names (all sources, deduplicated) | **333** |
| — built in at least one toolkit | 281 |
| — planned, generated or named in docs only (never built) | 52 |
| Covered by a tool already in the catalog (many through the guarded `neon_sql_execute`, per the DDL decision) | **300** |
| Covered by the universal `neon_api_*` tools only | **0** |
| Dropped, with reason | **30** |
| **Gaps → added** | **3** (`neon_branch_compare_data`, `neon_schema_list_migrations`, `neon_health_reindex` — new card D-9) |
| Catalog rows extended instead of new tools | 2 (`neon_schema_enable_extension` `update: true`; `neon_schema_list_objects` lists publications) |
| Guard design fixed | BATCH-B amendment 2026-10-10 (`REINDEX` had no working tool; unplaced statement types; fail-closed default) |

Catalog after the check: **173 hand-built + 4 universal = 177 tools** (was 170 + 4); work index **54 cards** (was 53).
Not counted above: 16 cross-service `compound_*` tools that touched Neon (hub territory, mapped below) and the generic
`postgres_*` namespace (111 tools, not Neon-specific, checked below for capability gaps only).

## Sources read (read-only local clones; the personal-account copies `christcr2012/*` have the same HEAD)

| Code | Source | Commit | What was read |
|---|---|---|---|
| TKM | `Robinson-AI-Systems/robinsons-toolkit-mcp` | `6c590f9c7895ea3bf2ce9e5d37bf300f5bd03cff` | `registry/neon.json` (204), `registry/postgres.json` (111), `registry/compound.json` (46), `handlers/neon.js`, `ClaudeBuildPlan.md`, `EXPANSION_ROADMAP.md`, `EXPANSION_INDEX.md`, `EXPANSION_QUICK_GUIDE.md`, `TOOLS_REFERENCE.md`, `README.md`, `CLAUDE.md`, `Creation Docs/` (5 files) |
| TS | `Robinson-AI-Systems/robinsonai-mcp-servers` | `8d84fa13a6b6ccbb70a3d67e4a8df484ae710096` | `packages/robinsons-toolkit-mcp/src/categories/neon/tools.ts`, `temp-neon-*.txt`, `temp-neon-mcp.ts`, `test-results-neon.json` (166 tested, 166 passed — shape-only tests), `audit-*.json`, `IMPLEMENTATION-PLAN.md`, `TOOL-NAMING-STANDARD.md`, `TOOL_COUNT_INVESTIGATION.md`, `docs/neon.md`; `standalone/integration-servers/neon-mcp/src/index.ts` (same 165 names); root `neon-tools-list.txt`, `NEON-FIX-SUMMARY.md`, `test-neon-api.mjs`, `.augment/` plans; `archived/credit-optimizer-mcp/src/tools-index.json` (GEN) |
| API | `Robinson-AI-Systems/robinsons-toolkit-api` | `d7f7d9f7c55041f9a8eafb4760a72c07048bce97` | `TOOLS-REGISTRY.json` (167 Neon names = TS + 2), `lib/neon.js`, `api/handlers/neon.js`, `implemented-tools.txt` (no Neon entries), `openapi*` |
| PLAN | TKM `ClaudeBuildPlan.md` "neon" section | as TKM | 34 planned names (17 never built) |
| CD | TKM `Creation Docs/` | as TKM | `neon_copy_environment` (named as an example) |
| DOC | TS planning docs | as TS | naming-standard and plan examples (`neon_database_*`, `neon_execute_query`, `neon_full_setup`, `neon_run_migration`, …) |
| GEN | TS `archived/credit-optimizer-mcp/src/tools-index.json` | as TS | 41 names generated as resource × verb; several have no Neon operation behind them |

Projects checked for what they need from Neon: `appliance-desk` `574fe981`, `Cortiware` `49aca911`, `oldReplit`
`9395352e`, `Household-Assistant` `ab8962d4` (see the last section).

Excluded as noise (not tool names): `neon_go`, `neon_jdbc`, `neon_node`, `neon_psql`, `neon_python`, `neon_rust`
(connection-snippet format values), `neon_snake_case` (script variable), `neon_a`, `neon_databases` (test-log labels),
and bare prefixes in `robinsons-toolkit-api` (`neon_get`, `neon_list`, …). `github-name-migrations.json` has no Neon
renames; obvious renames (`primary` → `default`, `endpoint` → compute, backup → snapshot) are normalized in the table.

## The three gaps and why they are real

| Added tool | Prior name(s) | Why it is not already covered |
|---|---|---|
| `neon_branch_compare_data` (read, D-9) | `neon_get_branch_data_diff` (TS, API); also used by `neon_validate_backup` | `neon_branch_compare_schema` compares schema only; `neon_workflow_recover_data` compares rows only inside a recovery. Builders need it after `neon_dev_seed`, a migration preview or a snapshot restore. It was deferred in ROADMAP ("point-in-time row diff"); promoted |
| `neon_schema_list_migrations` (read, D-9) | `neon_list_migrations` (TS, API) | Cortiware and Appliance Desk run `prisma migrate deploy` at build; a failed row in `_prisma_migrations` stops every deploy. No catalog tool reads that table; `neon_sql_query` could, but only if the agent knows each tool's table and failure rule |
| `neon_health_reindex` (write, D-9) | `neon_reindex_database` (TS, API); `postgres_reindex_table` (TKM, generic) | `neon_health_check` reports index bloat, but the SQL guard refused `REINDEX` and pointed at `neon_health_vacuum_analyze`, which cannot reindex — the fix was unreachable. Now a guarded tool (`CONCURRENTLY` by default, production confirm) |

## Dropped (30), with evidence

| Group | Names | Evidence |
|---|---|---|
| Neon has no API for it | metrics (`neon_get_real_time_metrics`), Postgres logs (`neon_get_endpoint_logs`), alerts (`neon_set_monitoring_alerts`, `neon_get_alert_history`) | Neon monitoring docs (https://neon.com/docs/introduction/monitoring, read 2026-10-10): the Monitoring dashboard is console-only; metrics and logs leave Neon through export integrations; only operations and Data API advisors are API-readable. Export integrations are a guided setting (`neon_where_is_setting`) |
| Project webhooks never existed | `neon_list_webhooks`, `neon_create_webhook`, `neon_delete_webhook`, `neon_test_webhook`, `neon_get_webhook_logs` | research audit N5 (no `/projects/{id}/webhooks` in Neon's API description) |
| No setting exists | `neon_enable_encryption`, `neon_enable_ssl_enforcement`, `neon_set_password_policy` | "Neon requires that all connections use SSL/TLS encryption"; storage "is encrypted using an AES-256 block cipher" — https://neon.com/docs/security/security-overview (read 2026-10-10); role passwords are generated by Neon (no policy setting in the API description) |
| Deprecated / nothing to switch | `neon_set_endpoint_pooling` | "The pooled endpoint is always available" — https://neon.com/docs/connect/connection-pooling (read 2026-10-10) |
| No such operation | `neon_clone_project`, `neon_merge_branches`, `neon_merge_branch_to_parent`, `neon_export_backup`, `neon_update_api_key` | Not in Neon's API description (research audit Appendix A); branches are the copy primitive; schema changes move with `neon_workflow_safe_migration`; migration-SQL generation is a ROADMAP item |
| Not actionable on Neon | `neon_get_checkpoint_stats`, `neon_get_wal_stats` | WAL and checkpoints are handled by Neon's storage layer (safekeepers, pageservers) |
| Generated CRUD names | `neon_create_/update_/delete_consumption`, `neon_create_/update_/delete_operation` | GEN index paired every resource with every verb; consumption and operations are read-only in Neon |
| Belongs elsewhere or speculative | `neon_create_migration` (migration files live in the app repo), `neon_generate_crud_sql` (agent writes it), `neon_suggest_partitioning`, `neon_suggest_materialized_views` (no signal behind them; `neon_health_check`, `neon_sql_explain`, `neon_dev_tune_query` give the facts) | — |

## Cross-service `compound_*` tools that touched Neon (TKM, 16) — hub territory

These belong to Robinson's Toolkit (the hub, its Batch C); this server supplies the Neon step:
`compound_scaffold_feature` → `neon_dev_branch_create`; `compound_neon_safe_migration`, `compound_full_feature_deploy` →
`neon_dev_migration_preview` / `neon_workflow_safe_migration`; `compound_staging_refresh` → `neon_branch_reset_from_parent`;
`compound_provision_new_project` → `neon_workflow_project_setup` (+ `neon_connection_show_once`; writing `DATABASE_URL` into Vercel
is a hub workflow); `compound_provision_tenant` → `neon_sql_execute` (CREATE SCHEMA); `compound_database_health_report` →
`neon_workflow_database_health`; `compound_cost_audit` → `neon_workflow_usage_and_cost`; `compound_project_health_check`,
`compound_full_health_dashboard` → `neon_whoami` + `neon_health_check`; `compound_weekly_engineering_report` →
`neon_branch_list` + `neon_admin_activity`; `compound_sync_users_to_audience`, `compound_geocode_and_store`,
`compound_dispatch_job`, `compound_complete_job`, `compound_driver_onboard` (YardSync app data) → `neon_sql_query` /
`neon_sql_execute`. No gap.

## Generic `postgres_*` namespace (TKM, 111) — not Neon-specific, capability check only

It runs SQL on any `POSTGRES_CONNECTION_STRING`, so it is not counted as Neon tools. On a Neon database every
capability is reached by `neon_sql_*`, `neon_schema_*`, `neon_health_*`, `neon_role_*` and `neon_database_*` tools, with these notes:
`postgres_reindex_table` → `neon_health_reindex` (added); `postgres_create_user` / `postgres_drop_user` /
`postgres_alter_user_password` → `neon_role_create` / `neon_role_delete` / `neon_role_reset_password` (passwords never in SQL; role
statements are refused by the guard); `postgres_create_database` / `drop_database` / `rename_database` /
`change_database_owner` → `neon_database_*`; `postgres_drop_extension` → `neon_schema_disable_extension`;
`postgres_cluster_table` → `neon_sql_execute` (destructive class); `postgres_nextval` / `postgres_setval` → `neon_sql_execute`
(write class per the amendment); `postgres_advisory_lock` / `unlock`, `postgres_notify`, `postgres_set_session_config`
→ refused by the guard by design (session-scoped effects are meaningless over a stateless pooled connection);
`postgres_list_subscriptions`, `postgres_get_bgwriter_stats`, `postgres_show_config` → `neon_sql_query`;
`postgres_permissions_audit`, `postgres_schema_audit`, `postgres_performance_report` → `neon_security_review`,
`neon_workflow_database_health`. No further gap.

## Needs found in other projects

| Project | What it needs from Neon | Covered by |
|---|---|---|
| Appliance Desk | Already written up in `docs/APP-NEEDS-APPLIANCE-DESK.md` (first profile): protected production branch, shared preview branch, Prisma migrations, restore runbook | Batch P profile, `neon_workflow_app_readiness`, `neon_snapshot_*`, `neon_workflow_recover_data`; `neon_schema_list_migrations` (new) shows a failed Prisma migration before a deploy breaks |
| Cortiware | Two Prisma schemas (tenant and provider apps), each with a pooled `DATABASE_URL` and a direct `DIRECT_DATABASE_URL`; `prisma migrate deploy` at Vercel build behind `RUN_DB_MIGRATIONS=true`; `db:seed:preview` seeds "Neon preview branches"; `/api/health/db` connection check; multi-tenant rows | `neon_connection_get_info` (pooled and direct hosts), `neon_connection_show_once`; `neon_schema_list_migrations` (new); `neon_dev_seed` / `neon_dev_branch_create`; `neon_workflow_branch_cleanup` (previews of deleted git branches); `neon_security_review` (RLS coverage) |
| oldReplit | One pooled `DATABASE_URL` (PgBouncer) for Prisma on Vercel | `neon_connection_get_info` |
| Household-Assistant | Design notes only (no code, no Neon): per-user data isolation for every record | `neon_security_review` / `neon_workflow_secure_project` (RLS gaps) when it is built |

No project needs a tool beyond the three added. (Only `.env.example` files were read; real `.env` files were not
opened.)

## Mapping table (every prior name)

Origin codes as in "Sources read". Disposition: **covered** (a catalog tool does it, named), **dropped** (reason),
**GAP → added** (new catalog tool).

| Prior name | Origin | Disposition | New tool / reason |
|---|---|---|---|
| `neon_add_column` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_add_enum_value` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_add_foreign_key` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_add_ip_to_allowlist` | TKM | covered | `neon_security_set_ip_allow` |
| `neon_alter_column_type` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_analyze_database` | TKM TS API | covered | `neon_health_vacuum_analyze` |
| `neon_analyze_deadlocks` | TKM TS API | covered | `neon_sql_list_activity` + `neon_health_check` |
| `neon_analyze_join_performance` | TS API | covered | `neon_dev_tune_query` |
| `neon_analyze_query_plan` | TS API | covered | `neon_sql_explain` |
| `neon_analyze_table_statistics` | TS API | covered | `neon_health_check` |
| `neon_apply_schema_from_file` | PLAN | covered | `neon_workflow_safe_migration` (SQL from a public URL) / `neon_dev_migration_preview` |
| `neon_backup_and_rotate` | PLAN | covered | `neon_snapshot_set_schedule` (retention) |
| `neon_backup_create` | TKM | covered | `neon_snapshot_create` |
| `neon_backup_database` | TS API | covered | `neon_snapshot_create` |
| `neon_bulk_insert_embeddings` | TKM | covered | `neon_sql_execute_transaction` |
| `neon_cancel_query` | TKM | covered | `neon_sql_stop_query` |
| `neon_check_api_key` | TKM TS API | covered | `neon_check_key_access` |
| `neon_check_unused_indexes` | TKM | covered | `neon_health_check` |
| `neon_clone_branch` | TKM | covered | `neon_branch_create` |
| `neon_clone_branch_with_data` | PLAN | covered | `neon_branch_create` (schema-only option) + `neon_dev_seed` |
| `neon_clone_project` | TS API | dropped | Neon has no project-copy operation; a branch is the copy (`neon_branch_create`, `neon_dev_branch_create`) |
| `neon_clone_project_for_feature` | PLAN | covered | `neon_dev_branch_create` |
| `neon_compare_query_plans` | PLAN | covered | `neon_sql_explain` (twice) / `neon_dev_tune_query` |
| `neon_complete_database_migration` | TKM TS API | covered | `neon_workflow_safe_migration` (old one could never apply, N4) |
| `neon_complete_query_tuning` | TS API | covered | `neon_dev_tune_query` + `neon_schema_create_index` |
| `neon_connection_string_all_formats` | TKM | covered | `neon_connection_get_info` |
| `neon_copy_environment` | CD | covered | `neon_dev_branch_create` |
| `neon_copy_table_data` | TKM | covered | `neon_sql_execute` (INSERT … SELECT); across branches: `neon_workflow_recover_data` |
| `neon_count_rows` | TKM | covered | `neon_sql_query` |
| `neon_create_api_key` | TKM TS API GEN | covered | `neon_apikey_create` |
| `neon_create_api_key_for_project` | TS API | covered | `neon_apikey_create` |
| `neon_create_backup` | TS API | covered | `neon_snapshot_create` |
| `neon_create_branch` | TKM TS API GEN | covered | `neon_branch_create` |
| `neon_create_consumption` | GEN | dropped | generated CRUD name; consumption is read-only |
| `neon_create_database` | TKM TS API GEN | covered | `neon_database_create` |
| `neon_create_endpoint` | TKM TS API GEN | covered | `neon_compute_create` |
| `neon_create_enum` | TKM PLAN | covered | `neon_sql_execute` (DDL decision) |
| `neon_create_from_template` | TS API | covered | `neon_workflow_project_setup` |
| `neon_create_fts_index` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_create_index` | TKM | covered | `neon_schema_create_index` |
| `neon_create_migration` | TS API | dropped | writing migration files belongs in the app's repository (Prisma/Drizzle), not in Neon |
| `neon_create_operation` | GEN | dropped | generated CRUD name; Neon operations are created by Neon, not by callers |
| `neon_create_project` | TKM TS API GEN | covered | `neon_project_create` |
| `neon_create_project_for_rad` | TKM TS API | covered | `neon_workflow_project_setup` |
| `neon_create_publication` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_create_read_replica` | TKM TS API | covered | `neon_compute_create` |
| `neon_create_readonly_role` | TKM | covered | `neon_role_create_read_only` |
| `neon_create_replication_slot` | TKM | covered | `neon_sql_execute` (`pg_create_logical_replication_slot`, after `neon_security_set_logical_replication`) |
| `neon_create_rls_policy` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_create_role` | TKM TS API GEN | covered | `neon_role_create` |
| `neon_create_schema` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_create_table` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_create_vector_index` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_create_vector_table` | TKM PLAN | covered | `neon_sql_execute` (DDL decision) |
| `neon_create_view` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_create_webhook` | TKM TS API | dropped | Neon has no project webhooks API (N5) |
| `neon_database_create` | DOC | covered | `neon_database_create` |
| `neon_database_delete` | DOC | covered | `neon_database_delete` |
| `neon_database_get` | DOC | covered | `neon_database_get` |
| `neon_database_list` | DOC | covered | `neon_database_list` |
| `neon_delete_api_key` | GEN | covered | `neon_apikey_revoke` |
| `neon_delete_backup` | TS API | covered | `neon_snapshot_delete` |
| `neon_delete_branch` | TKM TS API GEN | covered | `neon_branch_delete` |
| `neon_delete_consumption` | GEN | dropped | generated CRUD name; consumption is read-only |
| `neon_delete_database` | TKM TS API GEN | covered | `neon_database_delete` |
| `neon_delete_endpoint` | TKM TS API GEN | covered | `neon_compute_delete` |
| `neon_delete_operation` | GEN | dropped | generated CRUD name; operations cannot be deleted |
| `neon_delete_project` | TKM TS API GEN | covered | `neon_project_delete` |
| `neon_delete_role` | TKM TS API GEN | covered | `neon_role_delete` |
| `neon_delete_rows` | TKM | covered | `neon_sql_execute` |
| `neon_delete_webhook` | TKM TS API | dropped | Neon has no project webhooks API (N5) |
| `neon_deploy_schema` | TKM TS API | covered | `neon_workflow_safe_migration` |
| `neon_describe_branch` | TKM TS API | covered | `neon_branch_get` |
| `neon_describe_project` | TKM TS API | covered | `neon_project_overview` |
| `neon_describe_table_schema` | TKM TS API | covered | `neon_schema_describe_table` |
| `neon_detect_missing_indexes` | TKM TS API | covered | `neon_health_suggest_indexes` |
| `neon_detect_n_plus_one` | TS API | covered | `neon_sql_list_slow_queries` (most frequent) |
| `neon_disable_extension` | TKM TS API | covered | `neon_schema_disable_extension` |
| `neon_disable_rls` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_drop_column` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_drop_constraint` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_drop_index` | TKM | covered | `neon_schema_drop_index` |
| `neon_drop_publication` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_drop_replication_slot` | TKM | covered | `neon_sql_execute` (`pg_drop_replication_slot`) |
| `neon_drop_rls_policy` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_drop_table` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_drop_view` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_dump_schema` | PLAN | covered | `neon_schema_get_ddl` |
| `neon_enable_2fa` | TS API | covered | `neon_where_is_setting` (two-step login is console-only) |
| `neon_enable_encryption` | TS API | dropped | Neon encrypts all data at rest and in transit with no setting; no API exists |
| `neon_enable_extension` | TKM TS API | covered | `neon_schema_enable_extension` |
| `neon_enable_full_text_search` | TKM | covered | `neon_schema_enable_extension` |
| `neon_enable_ip_allowlist` | TKM TS API | covered | `neon_security_set_ip_allow` |
| `neon_enable_logical_replication` | TKM | covered | `neon_security_set_logical_replication` |
| `neon_enable_pgvector` | TKM PLAN | covered | `neon_schema_enable_extension` |
| `neon_enable_rls` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_enable_ssl_enforcement` | TS API | dropped | Neon always requires TLS; there is nothing to enforce |
| `neon_execute_query` | DOC | covered | `neon_sql_query` |
| `neon_execute_sql` | DOC GEN | covered | `neon_sql_query` / `neon_sql_execute` |
| `neon_explain_and_optimize` | PLAN | covered | `neon_dev_tune_query` |
| `neon_explain_sql_statement` | TKM TS API | covered | `neon_sql_explain` |
| `neon_export_backup` | TS API | dropped | Neon has no export-to-external-storage operation; an off-Neon copy is `pg_dump` from the app or CI, which `neon_workflow_go_live_check` notes |
| `neon_export_cost_report` | TS API | covered | `neon_billing_usage` |
| `neon_export_metrics` | TS API | covered | `neon_where_is_setting` (Datadog/OpenTelemetry export is a console integration) |
| `neon_export_table_csv` | TKM | covered | `neon_sql_query` + `neon_get_result` (handles) |
| `neon_find_missing_indexes` | TKM | covered | `neon_health_suggest_indexes` |
| `neon_full_database_health_report` | PLAN | covered | `neon_workflow_database_health` |
| `neon_full_health_report` | TKM | covered | `neon_workflow_database_health` |
| `neon_full_setup` | DOC | covered | `neon_workflow_project_setup` |
| `neon_full_text_search` | TKM | covered | `neon_sql_query` |
| `neon_generate_crud_sql` | PLAN | dropped | text template the agent writes itself; `neon_schema_describe_table` + `neon_schema_generate_types` give it what it needs |
| `neon_generate_typescript_types` | TKM | covered | `neon_schema_generate_types` |
| `neon_get_account_consumption` | TKM | covered | `neon_billing_usage` |
| `neon_get_alert_history` | TS API | dropped | Neon has no alerting API |
| `neon_get_all_settings` | TKM | covered | `neon_health_check` |
| `neon_get_api_key` | GEN | covered | `neon_apikey_list` |
| `neon_get_audit_log` | TS API | covered | `neon_admin_activity` |
| `neon_get_auth_config` | TKM | covered | `neon_auth_get` |
| `neon_get_autovacuum_status` | PLAN | covered | `neon_health_check` |
| `neon_get_backup_status` | TS API | covered | `neon_snapshot_list` |
| `neon_get_billing_history` | TKM TS API | covered | `neon_where_is_setting` (invoices are console-only) |
| `neon_get_branch` | GEN | covered | `neon_branch_get` |
| `neon_get_branch_connections` | TS API | covered | `neon_sql_list_activity` |
| `neon_get_branch_data_diff` | TS API | **GAP → added** | `neon_branch_compare_data` |
| `neon_get_branch_details` | TKM TS API | covered | `neon_branch_get` |
| `neon_get_branch_diff_full` | PLAN | covered | `neon_branch_compare_schema` |
| `neon_get_branch_history` | TKM TS API | covered | `neon_operation_list` (filter by branch) |
| `neon_get_branch_schema_diff` | TKM TS API | covered | `neon_branch_compare_schema` |
| `neon_get_branch_size` | TS API | covered | `neon_branch_get` |
| `neon_get_cache_hit_ratio` | TKM TS API | covered | `neon_health_check` |
| `neon_get_checkpoint_stats` | TS API | dropped | checkpoints and WAL are managed by Neon's storage layer (safekeepers/pageservers); the numbers are not actionable on Neon |
| `neon_get_compliance_report` | TS API | covered | `neon_admin_review_security` |
| `neon_get_compute_metrics` | TS API | covered | `neon_billing_usage` (compute hours) + `neon_health_check` |
| `neon_get_connection_examples` | TS API | covered | `neon_connection_get_info` |
| `neon_get_connection_pooler_config` | TKM TS API | covered | `neon_compute_get` |
| `neon_get_connection_stats` | TKM TS API | covered | `neon_health_check` |
| `neon_get_connection_string` | TKM TS API | covered | `neon_connection_get_info` / `neon_connection_show_once` |
| `neon_get_connection_uri` | TKM TS API | covered | `neon_connection_get_info` / `neon_connection_show_once` |
| `neon_get_connection_uri_formatted` | API | covered | `neon_connection_get_info` |
| `neon_get_consumption` | GEN | covered | `neon_billing_usage` |
| `neon_get_cost_breakdown` | TKM TS API | covered | `neon_billing_usage` |
| `neon_get_cost_forecast` | TS API | covered | `neon_billing_usage` (month-end projection) |
| `neon_get_cost_optimization_tips` | TS API | covered | `neon_workflow_usage_and_cost` |
| `neon_get_current_user` | TKM API | covered | `neon_whoami` |
| `neon_get_database` | DOC GEN | covered | `neon_database_get` |
| `neon_get_database_activity` | TKM TS API | covered | `neon_sql_list_activity` |
| `neon_get_database_locks` | TKM TS API | covered | `neon_sql_list_activity` |
| `neon_get_database_size` | TKM TS API | covered | `neon_database_list` |
| `neon_get_database_stats` | TKM TS API | covered | `neon_health_check` |
| `neon_get_database_tables` | TKM TS API | covered | `neon_schema_list_tables` |
| `neon_get_endpoint` | GEN | covered | `neon_compute_get` |
| `neon_get_endpoint_logs` | TS API | dropped | Neon has no Postgres log API (log export integrations only) — monitoring docs; Functions/storage logs: `neon_log_query` |
| `neon_get_endpoint_metrics` | TS API | covered | `neon_billing_usage` (compute hours) + `neon_health_check` |
| `neon_get_extension_details` | TS API | covered | `neon_schema_list_extensions` |
| `neon_get_foreign_keys` | TKM PLAN | covered | `neon_schema_describe_table` |
| `neon_get_formatted_connection_uri` | DOC | covered | `neon_connection_get_info` |
| `neon_get_full_schema_dump` | TKM | covered | `neon_schema_get_ddl` |
| `neon_get_function_definition` | TKM | covered | `neon_schema_get_ddl` |
| `neon_get_index_bloat` | PLAN | covered | `neon_health_check` |
| `neon_get_index_health` | TKM | covered | `neon_health_check` |
| `neon_get_index_usage` | TKM TS API | covered | `neon_health_check` |
| `neon_get_installed_extensions` | TKM | covered | `neon_schema_list_extensions` |
| `neon_get_io_metrics` | TS API | covered | `neon_health_check` |
| `neon_get_ip_allowlist` | TKM TS API | covered | `neon_project_get_settings` |
| `neon_get_long_running_queries` | TKM PLAN | covered | `neon_sql_list_activity` |
| `neon_get_operation` | GEN | covered | `neon_operation_get` |
| `neon_get_org_billing` | TKM | covered | `neon_billing_usage` |
| `neon_get_org_consumption` | TKM | covered | `neon_billing_usage` |
| `neon_get_performance_insights` | TKM TS API | covered | `neon_workflow_database_health` |
| `neon_get_project` | GEN | covered | `neon_project_overview` |
| `neon_get_project_consumption` | TKM TS API | covered | `neon_billing_usage` |
| `neon_get_project_operations` | TKM TS API | covered | `neon_operation_list` |
| `neon_get_project_permissions` | TS API | covered | `neon_access_list` |
| `neon_get_project_quotas` | TKM TS API | covered | `neon_project_get_settings` |
| `neon_get_query_plan` | TKM | covered | `neon_sql_explain` |
| `neon_get_query_statistics` | TS API | covered | `neon_sql_list_slow_queries` |
| `neon_get_real_time_metrics` | TS API | dropped | Neon has no metrics API (Monitoring page is console-only; export via integrations) — monitoring docs |
| `neon_get_replication_lag` | TS API PLAN | covered | `neon_health_check` (replication) |
| `neon_get_replication_slots` | TKM | covered | `neon_health_check` (replication) |
| `neon_get_resource_recommendations` | TS API | covered | `neon_workflow_usage_and_cost` |
| `neon_get_rls_policies` | TKM | covered | `neon_schema_list_objects` (policies) |
| `neon_get_role` | GEN | covered | `neon_role_get` |
| `neon_get_role_permissions` | TS API | covered | `neon_role_get` |
| `neon_get_sample_rows` | TKM | covered | `neon_sql_query` |
| `neon_get_security_scan` | TS API | covered | `neon_security_review` |
| `neon_get_sequences` | TKM PLAN | covered | `neon_schema_list_objects` (sequences) |
| `neon_get_slow_query_log` | TS API | covered | `neon_sql_list_slow_queries` |
| `neon_get_storage_metrics` | TS API | covered | `neon_billing_usage` (storage) + `neon_schema_list_tables` |
| `neon_get_table_bloat` | TKM TS API | covered | `neon_health_check` |
| `neon_get_table_ddl` | TKM | covered | `neon_schema_get_ddl` |
| `neon_get_table_dependencies` | TKM TS API PLAN | covered | `neon_schema_describe_table` |
| `neon_get_table_io_stats` | TKM | covered | `neon_health_check` |
| `neon_get_table_row_counts` | TKM PLAN | covered | `neon_schema_list_tables` |
| `neon_get_table_statistics` | TKM | covered | `neon_health_check` |
| `neon_get_table_stats` | PLAN | covered | `neon_health_check` |
| `neon_get_temp_file_usage` | TKM | covered | `neon_health_check` |
| `neon_get_transaction_id_age` | TKM | covered | `neon_health_check` |
| `neon_get_vacuum_stats` | TKM PLAN | covered | `neon_health_check` |
| `neon_get_wait_events` | TKM | covered | `neon_health_check` |
| `neon_get_wal_stats` | TS API | dropped | checkpoints and WAL are managed by Neon's storage layer; not actionable on Neon |
| `neon_get_webhook_logs` | TS API | dropped | Neon has no project webhooks API (N5) |
| `neon_grant_role_permissions` | TS API | covered | `neon_sql_execute` (DDL decision) |
| `neon_grant_schema_access` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_grant_table_access` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_insert_embedding` | TKM | covered | `neon_sql_execute` |
| `neon_insert_row` | TKM | covered | `neon_sql_execute` |
| `neon_kill_database_query` | TKM TS API | covered | `neon_sql_stop_query` |
| `neon_list_all_db_roles` | TKM | covered | `neon_role_list` (+ `neon_sql_query` on pg_roles) |
| `neon_list_api_key` | GEN | covered | `neon_apikey_list` |
| `neon_list_api_keys` | TKM TS API | covered | `neon_apikey_list` |
| `neon_list_backups` | TS API | covered | `neon_snapshot_list` |
| `neon_list_branch` | GEN | covered | `neon_branch_list` |
| `neon_list_branch_computes` | TS API | covered | `neon_compute_list` |
| `neon_list_branch_endpoints` | TKM | covered | `neon_compute_list` |
| `neon_list_branch_history` | PLAN | covered | `neon_operation_list` (filter by branch) |
| `neon_list_branches` | TKM TS API | covered | `neon_branch_list` |
| `neon_list_constraints` | TKM | covered | `neon_schema_describe_table` |
| `neon_list_consumption` | GEN | covered | `neon_billing_usage` |
| `neon_list_database` | GEN | covered | `neon_database_list` |
| `neon_list_databases` | TKM TS API | covered | `neon_database_list` |
| `neon_list_endpoint` | GEN | covered | `neon_compute_list` |
| `neon_list_endpoints` | TKM | covered | `neon_compute_list` |
| `neon_list_enums` | TKM PLAN | covered | `neon_schema_list_objects` (enums) |
| `neon_list_extensions` | TKM TS API | covered | `neon_schema_list_extensions` |
| `neon_list_functions` | TKM PLAN | covered | `neon_schema_list_objects` (functions) |
| `neon_list_indexes` | TKM | covered | `neon_schema_describe_table` |
| `neon_list_migrations` | TS API | **GAP → added** | `neon_schema_list_migrations` |
| `neon_list_operation` | GEN | covered | `neon_operation_list` |
| `neon_list_org_members` | TKM | covered | `neon_member_list` |
| `neon_list_org_projects` | TKM | covered | `neon_project_list` |
| `neon_list_organizations` | TKM TS API | covered | `neon_org_list` |
| `neon_list_project` | GEN | covered | `neon_project_list` |
| `neon_list_project_shares` | TKM TS API | covered | `neon_access_list` |
| `neon_list_projects` | TKM TS API | covered | `neon_project_list` |
| `neon_list_projects_by_consumption` | TKM | covered | `neon_billing_usage` |
| `neon_list_publications` | TKM | covered | `neon_schema_list_objects` (publications, added to its row 2026-10-10) |
| `neon_list_read_replicas` | TKM TS API | covered | `neon_compute_list` |
| `neon_list_replication_slots` | TKM | covered | `neon_health_check` (replication) |
| `neon_list_role` | GEN | covered | `neon_role_list` |
| `neon_list_role_privileges` | TKM | covered | `neon_role_get` |
| `neon_list_roles` | TKM TS API | covered | `neon_role_list` |
| `neon_list_schemas` | TKM | covered | `neon_schema_list_schemas` |
| `neon_list_shared_projects` | TKM TS API | covered | `neon_project_list` |
| `neon_list_slow_queries` | TKM TS API | covered | `neon_sql_list_slow_queries` |
| `neon_list_slow_queries_by_calls` | TKM | covered | `neon_sql_list_slow_queries` |
| `neon_list_templates` | TS API | covered | `neon_workflow_project_setup` |
| `neon_list_triggers` | TKM PLAN | covered | `neon_schema_list_objects` (triggers) |
| `neon_list_vector_tables` | TKM | covered | `neon_schema_search` |
| `neon_list_views` | TKM PLAN | covered | `neon_schema_list_objects` (views) |
| `neon_list_webhooks` | TKM TS API | dropped | Neon has no project webhooks API (research audit N5) |
| `neon_merge_branch_to_parent` | PLAN | dropped | Neon has no branch merge; schema changes move with `neon_workflow_safe_migration` (diff from `neon_branch_compare_schema`) |
| `neon_merge_branches` | TS API | dropped | Neon has no branch merge; schema changes move with `neon_workflow_safe_migration` (diff from `neon_branch_compare_schema`) |
| `neon_optimize_query` | TS API | covered | `neon_dev_tune_query` |
| `neon_performance_tuning_report` | TKM | covered | `neon_workflow_database_health` |
| `neon_prepare_database_migration` | TKM TS API | covered | `neon_dev_migration_preview` |
| `neon_prepare_query_tuning` | TS API | covered | `neon_dev_tune_query` |
| `neon_project_security_audit` | TKM | covered | `neon_security_review` |
| `neon_promote_branch` | TS API | covered | `neon_branch_set_default` |
| `neon_provision_neon_auth` | TKM TS API | covered | `neon_auth_enable` (old one faked it, N11) |
| `neon_refresh_materialized_view` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_reindex_database` | TS API | **GAP → added** | `neon_health_reindex` |
| `neon_remove_ip_from_allowlist` | TKM | covered | `neon_security_set_ip_allow` |
| `neon_rename_column` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_rename_table` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_reset_from_parent` | TKM TS API | covered | `neon_branch_reset_from_parent` |
| `neon_reset_query_stats` | TKM | covered | `neon_sql_execute` (`pg_stat_statements_reset()`, write class — BATCH-B amendment 2026-10-10) |
| `neon_reset_role_password` | TKM TS API | covered | `neon_role_reset_password` |
| `neon_restart_endpoint` | TKM TS API | covered | `neon_compute_restart` |
| `neon_restore_backup` | TS API | covered | `neon_snapshot_restore` |
| `neon_restore_branch` | TS API | covered | `neon_branch_recover` |
| `neon_restore_branch_to_timestamp` | TKM TS API | covered | `neon_branch_restore` |
| `neon_revoke_api_key` | TKM TS API | covered | `neon_apikey_revoke` |
| `neon_revoke_project_share` | TKM TS API | covered | `neon_access_revoke_share` |
| `neon_revoke_role_permissions` | TS API | covered | `neon_sql_execute` (DDL decision) |
| `neon_revoke_table_access` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_rollback_migration` | TS API | covered | `neon_undo_change` / `neon_branch_restore` (restore point recorded by `neon_workflow_safe_migration`) |
| `neon_rotate_credentials` | TKM TS API | covered | `neon_workflow_rotate_credentials` |
| `neon_run_migration` | DOC | covered | `neon_workflow_safe_migration` |
| `neon_run_sql` | TKM TS API | covered | `neon_sql_query` / `neon_sql_execute` |
| `neon_run_sql_batch` | TKM PLAN | covered | `neon_sql_execute_transaction` |
| `neon_run_sql_transaction` | TKM TS API | covered | `neon_sql_execute_transaction` |
| `neon_safe_migration` | TKM PLAN | covered | `neon_workflow_safe_migration` |
| `neon_schedule_backup` | TS API | covered | `neon_snapshot_set_schedule` |
| `neon_search_schema` | TKM PLAN | covered | `neon_schema_search` |
| `neon_select_rows` | TKM | covered | `neon_sql_query` |
| `neon_set_branch_as_primary` | TKM | covered | `neon_branch_set_default` (Neon renamed primary to default, N6) |
| `neon_set_branch_compute_settings` | TS API | covered | `neon_compute_update_settings` / `neon_compute_resize` |
| `neon_set_branch_protection` | TS API | covered | `neon_branch_set_protected` |
| `neon_set_branch_retention` | TS API | covered | `neon_branch_set_expiration` / `neon_project_set_history_retention` |
| `neon_set_budget_limits` | TS API | covered | `neon_project_set_quotas` |
| `neon_set_column_default` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_set_column_not_null` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_set_cost_alerts` | TS API | covered | `neon_billing_set_spending_alert` |
| `neon_set_endpoint_autoscaling` | TKM TS API | covered | `neon_compute_resize` |
| `neon_set_endpoint_pooling` | TKM TS API | dropped | nothing to switch: "the pooled endpoint is always available" (neon.com/docs/connect/connection-pooling); `neon_connection_get_info` gives the pooled host |
| `neon_set_monitoring_alerts` | TS API | dropped | Neon has no alerting API except the spending alert (`neon_billing_set_spending_alert`) |
| `neon_set_password_policy` | TS API | dropped | Neon generates role passwords itself; no password-policy setting or API exists |
| `neon_set_project_settings` | TS API | covered | `neon_project_update_settings` |
| `neon_setup_rad_database` | TKM TS API | covered | `neon_workflow_project_setup` |
| `neon_setup_rag_schema` | TKM | covered | `neon_schema_enable_extension` + `neon_workflow_safe_migration` |
| `neon_share_project` | TKM TS API | covered | `neon_access_share_project` |
| `neon_similarity_search` | PLAN | covered | `neon_sql_query` |
| `neon_similarity_search_cosine` | TKM | covered | `neon_sql_query` |
| `neon_similarity_search_l2` | TKM | covered | `neon_sql_query` |
| `neon_start_endpoint` | TKM TS API | covered | `neon_compute_start` |
| `neon_suggest_indexes` | TKM TS API | covered | `neon_health_suggest_indexes` |
| `neon_suggest_materialized_views` | TS API | dropped | speculative advice; `neon_sql_list_slow_queries` and `neon_dev_tune_query` give the facts |
| `neon_suggest_partitioning` | TS API | dropped | speculative advice with no Neon or Postgres signal behind it; `neon_health_check` and `neon_sql_explain` give the facts |
| `neon_suggest_query_rewrite` | TS API | covered | `neon_dev_tune_query` |
| `neon_suggest_vacuum_strategy` | TS API | covered | `neon_health_check` |
| `neon_suspend_endpoint` | TKM TS API | covered | `neon_compute_suspend` |
| `neon_test_connection` | TKM TS API | covered | `neon_connection_get_info` (`test: true`) |
| `neon_test_webhook` | TS API | dropped | Neon has no project webhooks API (N5) |
| `neon_trigram_search` | TKM | covered | `neon_sql_query` |
| `neon_truncate_table` | TKM | covered | `neon_sql_execute` (DDL decision) |
| `neon_update_api_key` | GEN | dropped | Neon has no operation to edit an API key (keys are created and revoked only) |
| `neon_update_auth_config` | TKM | covered | `neon_auth_update_config` |
| `neon_update_branch` | TKM TS API GEN | covered | `neon_branch_rename` / `neon_branch_set_protected` / `neon_branch_set_expiration` |
| `neon_update_connection_pooler_config` | TKM TS API | covered | `neon_compute_update_settings` |
| `neon_update_consumption` | GEN | dropped | generated CRUD name; consumption is read-only |
| `neon_update_database` | DOC GEN | covered | `neon_database_update` |
| `neon_update_endpoint` | TKM TS API GEN | covered | `neon_compute_update_settings` / `neon_compute_resize` |
| `neon_update_extension` | TS API | covered | `neon_schema_enable_extension` (`update: true`, added to its row 2026-10-10) |
| `neon_update_ip_allowlist` | TKM | covered | `neon_security_set_ip_allow` |
| `neon_update_operation` | GEN | dropped | generated CRUD name; operations cannot be edited |
| `neon_update_project` | TKM TS API GEN | covered | `neon_project_rename` / `neon_project_update_settings` |
| `neon_update_role` | TS API GEN | covered | `neon_sql_execute` (GRANT/REVOKE, access class) |
| `neon_update_rows` | TKM | covered | `neon_sql_execute` |
| `neon_upsert_embeddings` | PLAN | covered | `neon_sql_execute_transaction` |
| `neon_upsert_rows` | TKM | covered | `neon_sql_execute` |
| `neon_vacuum_database` | TKM TS API | covered | `neon_health_vacuum_analyze` |
| `neon_validate_backup` | TS API | covered | `neon_snapshot_restore` (new branch) + `neon_branch_compare_data` |
| `neon_verify_schema` | TKM TS API | covered | `neon_branch_compare_schema` / `neon_dev_check_integration` |
