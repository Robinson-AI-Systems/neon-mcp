**D-4 owner-approved retirement (IN-16):** Canonical role deletion is registered under full-owner B-1 gates with one-use durable exact preview and explicit interruption acknowledgement. No claim of idle pooled-client absence. Legacy nondisruptive proof remains unavailable; source/CI/deployed/provider acceptance are separate. Earlier unregistered notes below describe historical checkpoints.

**D-4 private role-deletion inventory (#85):** Before opening any role-dependency SQL, provider endpoint IDs, branch database names and role names must each be unique; repeated identities make the full inventory untrusted. `neon_role_delete` is still NOT registered; pooled-client safety remains unverified.

**D-4 private role deletion preflight (#83):** The unregistered `neon_role_delete` dependency inspector now verifies each compute remains `read_write` on its independent exact-endpoint reread, not just initial inventory. A changed compute type aborts before any SQL. Role deletion is still NOT registered: idle pooled-client absence remains unverified.

**C-2 listing modes (#44):** Connections default to compact except Claude-identified clients (catalog); authenticated `?listing=` override affects display only, never authorization. Compact includes guarded meta tools, identity and stored-result retrieval.

# Tool catalog

Every tool this server will have, by area — the product scope. The implementing model builds exactly these; anything
else goes in `docs/ROADMAP.md` and the PR report. One row per tool (so the totals can be counted by a script:
`python3 -c` snippet at the end). When a tool merges, its Card cell gains `built #<PR>`.

**B-7 (#33):** Static CI now enforces all write declarations and handler reachability; secret-producing tools require the separately authenticated setup-page route.

**B-6 shared result/profile policy (built #32):** Read-only never sees or invokes writes; org-key tools are full-only. Output scrub removes nested credentials; homepage reports counts by profile.

**Built so far:** two A-5 read tools and two owner-only B-2 internal permission controls (#20). A-1 (#1) created the empty registry (`src/tools/index.js`) and the starting
`scripts/check-writes.mjs` (every registered tool named `neon_*`, declares `writes`; write tools expose `dryRun`/`confirm`
and a write contract) and `scripts/check-budgets.mjs` (descriptions ≤160 characters, catalog ≤20,000 tokens). The first
tools are `neon_whoami` and `neon_list_accounts` (A-5).

Tools serve three audiences (Robinson Tool Contract §3, tagged on every tool): **B** builder (building or testing with
Neon), **Ow** owner (setting up and administering the account), **Op** operator (day-to-day use).

**Flags** (B-1 … B-4 define them exactly; `scripts/check-writes.mjs` enforces the metadata):

| Flag | Meaning |
|---|---|
| `—` | Reads only. Never changes anything in Neon or in a database |
| `P` | Writes; previews with `dryRun: true`; no `confirm` needed when no other flag asks for one |
| `C` | Always needs `confirm: true` (after a preview) |
| `C*` | Needs `confirm` only in the cases stated in the row (otherwise `P`) |
| `Pr` | **Production guard:** when the target is production (B-2: the default branch, a protected branch, anything on them, project-wide settings, a profile's production or shared-preview branch) the call is refused unless production access is enabled for the organization, and then needs `confirm` |
| `D` | Destructive or irreversible (deletions are recoverable for 7 days where Neon allows; the preview says which) |
| `$` | Can raise the Neon bill: `confirm` with a dollar preview from the stored price table; refused above the per-change spend cap (B-4) |
| `A` | Widens someone's access or sends a message to a person: always `confirm`; preview names who gains what |
| `S` | Produces a secret: never in the result; shown once on the setup page's one-time-secret page (A-5) |
| `Dev` | Developer tool: refuses production targets before reading anything (contract §10) |

**Profile:** `R` read_only and up · `E` everyday and up · `F` full only. Every read tool is in `R`.
**Key:** tools marked `org key` need the organization API key (IN-04); all others work with a project-scoped key.


## Server about itself (`neon_*`) — 18

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_whoami` | Organization, key kinds held (last 4 only), connection mode (preview/production), profile, listing, API description date, price-table date, today's Neon API budget | — | B Ow Op | R | A-5 (built #14) |
| `neon_list_accounts` | Organizations this server holds keys for, key kinds and projects covered, whether production access is enabled | — | Ow Op | R | A-5 |
| `neon_check_key_access` | Re-probe every stored key: what each can reach (projects, org actions), which tools are blocked and which key kind would fix it | — | Ow | R | B-8 (built #36) |
| `neon_list_connections` | Claude connections and passes: organization, mode, profile, listing, rate limit, last used | — | Ow | R | B-8 (built #34) |
| `neon_revoke_connection` | Switch a connection or pass off at once | C | Ow | F | B-8 (built #35) |
| `neon_enable_production` | Request production access for one organization (NOT activation; needs owner passphrase and typed approval within ten minutes, plus release gates after X-2/X-3) | C | Ow | F | B-2 (built #20) |
| `neon_disable_production` | Stop production permission immediately and invalidate pending owner approval | C | Ow | F | B-2 (built #20) |
| `neon_recent_changes` | What changed through this server (filter by tool, project, branch, date; previews hidden unless asked) | — | Ow Op | R | B-8 (built #34) |
| `neon_undo_change` | Undo one change-log entry with a clean opposite (recover a deleted branch, restore a setting, roll a branch back to the recorded point before a SQL change); says plainly when there is none | C | Op | E | X-1 |
| `neon_search_tools` | Find tools by plain words; one line each with flags (compact mode's front door) | — | B Ow Op | R | C-2 (built #41) |
| `neon_describe_tool` | Full instructions and arguments for one tool | — | B Ow Op | R | C-2 (built #41) |
| `neon_call` | Run any tool in the profile by name, through the same guards | as the tool | B Ow Op | R | C-2 (built #42) |
| `neon_batch` | Up to 10 read calls in one round trip | — | B Op | R | C-2 (built #43) |
| `neon_get_result` | Page through a big result kept behind a handle (24 hours, same connection only) | — | B Op | R | C-1 (built #40) |
| `neon_create_pass` | Make a short-lived pass for the HTTPS API and Robinson's Toolkit (shown once on the setup page; preview mode, read-only, 24 h by default; RTC §2) | C A S | Ow | F | R-1 |
| `neon_where_is_setting` | Structured steps (link, numbered actions, expected result, read-back check) for any dashboard-only setting: plan, payment, SSO, integrations, two-step login | — | Ow Op | R | B-8 (built #34) |
| `neon_get_settings` | This server's stored settings: protected resources, price table and its date, spend cap, dev-branch defaults, SQL limits, wait limits | — | Ow | R | B-8 (built #34) |
| `neon_update_settings` | Change a stored setting (never the protected-resources list, which only the setup page edits) | C | Ow | F | B-8 (built #37; tightening only) |

## Projects (`neon_project_*`) — 11

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_project_list` | Organization projects, or live readbacks of active enrolled projects when only project keys exist; explicit cap and exact selected-project key routing | — | Ow Op | R | D-1 (built #46) |
| `neon_project_overview` | One project in one call: branches with production marks, computes and sizes, databases, roles, key settings, storage, plan limits that matter, recent operations | — | B Ow Op | R | D-1 (built #46) |
| `neon_project_create` | New project (region default from settings, Neon's default Postgres version); compute size previewed in dollars; connection string only via the one-time page | C $ S | B Ow | F | D-1 (built #49) |
| `neon_project_rename` | Rename a project | P | Ow Op | E | D-1 (built #49) |
| `neon_project_delete` | Delete a project (recoverable for 7 days; preview lists every branch and database lost) | C D Pr | Ow | F | D-1 (built #49) |
| `neon_project_recover` | Bring back a project deleted in the last 7 days | C | Ow | F | D-1 (built #49) |
| `neon_project_list_regions` | Regions Neon offers now, with which backend services each supports | — | B | R | D-1 (built #46) |
| `neon_project_get_settings` | Project-wide settings: IP allow, public/VPC blocking, logical replication, maintenance window, preload libraries (and available ones), quotas, history retention, default compute settings, audit level, HIPAA | — | Ow Op | R | D-1 (built #47) |
| `neon_project_update_settings` | Maintenance window, preload libraries, default compute settings for new computes (spend increases go through the spend guard) | C Pr $ | Ow | F | D-1 (built #50) |
| `neon_project_set_history_retention` | How far back restores can reach (Neon bills instant-restore storage; preview shows the price) | C Pr $ | Ow | F | D-1 (built #50) |
| `neon_project_set_quotas` | Per-project consumption quotas; reaching one suspends computes (preview says what would stop today) | C Pr | Ow | F | D-1 (built #50) |

## Operations (`neon_operation_*`) — 2

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_operation_list` | Recent operations on a project (what Neon did, when, status), filter by branch or compute | — | Op | R | D-1 (built #47) |
| `neon_operation_get` | One operation; `waitSeconds` (≤45) waits for it to finish and then reads the target back | — | B Op | R | D-1 (built #47) |

## Branches (`neon_branch_*`) — 13

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_branch_list` | Branches with default/protected/expiring marks, parent, size, compute state, last reset, annotations; count vs the plan's included branches | — | B Op | R | D-2 (built #51, plan/count refinements pending) |
| `neon_branch_get` | One branch with its computes, databases, roles, storage and restore status | — | B Op | R | D-2 (built #51, status refinements pending) |
| `neon_branch_create` | Create from verified parent with B-4 pricing using current project-key-readable provider subscription evidence or a verified stored plan, denying plan conflicts; optional compute, expiry and point-in-time variants | C* $ | B Op | E | D-2 (built #54, variants #58; scoped-plan #141) |
| `neon_branch_rename` | Rename a branch (confirm on production: integrations and apps may look it up by name) | C* Pr | Op | E | D-2 (built #52) |
| `neon_branch_set_protected` | Protect or unprotect with audited confirmation and production guard | C* Pr | Ow | F | D-2 (built #52) |
| `neon_branch_set_expiration` | Set, change or remove expiry (max 30 days; refuses default, protected or parent) | P | B Op | E | D-2 (built #53) |
| `neon_branch_set_default` | Make a branch the project's default after owner production approval | C Pr | Ow | F | D-2 (built #53) |
| `neon_branch_delete` | Soft-delete only; refuses default/protected/parent; previews computes and databases | C D Pr | Op | F | D-2 (built #54) |
| `neon_branch_recover` | Owner-approved recover of independently verified soft-deleted branch within grace period | C | Op | F | D-2 (built #54) |
| `neon_branch_reset_from_parent` | Reset from verified parent; always preserve prior state under a uniquely named new branch and apply guarded spend limits | C D Pr $ | B Op | F | D-2 (built #55) |
| `neon_branch_restore` | Restore verified source/head/LSN/UTC timestamp; always preserve prior state and verify both branches | C D Pr $ | Op | F | D-2 (built #55) |
| `neon_branch_compare_schema` | Compare verified branches for one database at HEAD, LSN or past UTC time independently on each side | — | B Op | R | D-2 (built #52, historical variants #57) |
| `neon_branch_compare_data` | Row differences for chosen tables between two branches (or a branch and a point in time): counts, then added / removed / changed rows by primary key, capped with a handle; tables without a primary key compare by count and checksum only | — | B Op | R | D-9 |

## Computes (`neon_compute_*`) — 10

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_compute_list` | Computes in a project or on a branch: type, size range, state, scale-to-zero time, last active | — | Op | R | D-3 (built #59) |
| `neon_compute_get` | One compute with its settings and recent operations | — | Op | R | D-3 (built #59) |
| `neon_compute_create` | Create a compute; dollar preview and exact new endpoint ID/project read-back (review hardened #62) | C $ | B Ow | F | D-3 (built #60) |
| `neon_compute_resize` | Change autoscaling minimum/maximum (raising: dollar preview; production: confirm) | C* $ Pr | Ow Op | F | D-3 (built #60) |
| `neon_compute_update_settings` | Scale-to-zero delay (never-suspend requires verified spending), bounded PostgreSQL timeouts (including Free/no overrides); deprecated pooler mode not written | C* $ Pr | Op | E | D-3 (built #61) |
| `neon_compute_start` | Wake a suspended compute (no extra confirmation for development branches) | P | Op | E | D-3 (built #61) |
| `neon_compute_suspend` | Suspend compute; on owner-authorized unpooled protected/default branches require independently verified full-statistics session count (otherwise deny) | C* Pr | Op | E | D-3 (built #61) |
| `neon_compute_restart` | Restart compute; independently count unpooled production sessions with full statistics privilege, or deny safely | C* Pr | Op | E | D-3 (built #61) |
| `neon_compute_delete` | Delete a compute (connection strings using its host stop working) | C D Pr | Op | F | D-3 (built #61) |
| `neon_compute_estimate_cost` | Dollar estimate for a size range and hours per day from the stored price table | — | B Ow | R | D-3 (built #59) |

D-2/D-3 post-merge security review #62: expiring protected branches are refused pre-write; historical branch creation cannot be confirmed without exact source evidence. Compute creation rejects wrong endpoint/project read-back. All production gates remain disabled by default.

## Databases and Postgres roles (`neon_database_*`, `neon_role_*`) — 11

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_database_list` | Scoped bounded database names and owners (size not independently available) | — | B Op | R | D-4 (built #65) |
| `neon_database_get` | Exact verified database details and owner, no secrets | — | Op | R | D-4 (built #65) |
| `neon_database_create` | New database only with exact existing owner/branch identity and durable audit | P | B Op | F | D-4 (built #67) |
| `neon_database_update` | Guarded rename/owner change; verified before-and-after and production confirmation | C* Pr | Op | F | D-4 (built #67) |
| `neon_database_delete` | Permanently delete verified database after destructive confirmation and complete inventory | C D Pr | Op | F | D-4 (built #67) |
| `neon_role_list` | Scoped bounded Postgres roles on a branch (never passwords) | — | B Op | R | D-4 (built #65) |
| `neon_role_get` | Exact role metadata; privileges shown as unverified until separately authorized SQL | — | Op | R | D-4 (built #65) |
| `neon_role_create` | New login role; its password only on the one-time page | P S | B Op | E | D-4 (built #68, verified secret handoff #88) |
| `neon_role_create_read_only` | Scoped current SELECT and owner-specific future defaults through fixed audited B-3 SQL, one-time password; production DDL gated | C A S | B Ow | F | D-4 (built #72, hardened #75, handoff ordering #86) |
| `neon_role_retirement_review` | Verified databases and computes relevant to retiring a role; pooled-client clearance remains unknown | — | Ow | F | D-4 (provider inventory #128; optional PostgreSQL dependencies #142) |
| `neon_role_delete` | Confirmed retirement after a one-use owner/connection/identity-bound preview, named membership losses and explicit unknown-pooled-client interruption acknowledgement; ownership/references/visible sessions refuse | C D A Pr | Ow | F | D-4 (implemented; provider acceptance pending) |
| `neon_role_reset_password` | New password for a role; old one stops working; new one only on the one-time page; preview warns dependent apps | C Pr S | Op | E | D-4 (built #69, verified reset handoff #88) |

## Connections (`neon_connection_*`) — 2

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_connection_get_info` | Independently verified direct/pooled host, database, role, SSL, safe environment snippets; `test: true` uses authorized server-side SQL | — | B Op | R | D-4 (built #70) |
| `neon_connection_show_once` | Encrypted expiring owner-only one-time page for exact validated URI, never returned in MCP text | C S | B Op | F | D-4 (built #70) |

## SQL (`neon_sql_*`) — 8

The SQL guard (`docs/designs/BATCH-B.md` B-3) classifies every statement with the real PostgreSQL parser.

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_sql_query` | Read-only SQL (SELECT, SHOW, EXPLAIN without ANALYZE) inside a READ ONLY transaction, row cap and time limit; production reads allowed by setting (IN-09) | — | B Op | R | D-5 (built #126; live SQL unverified) |
| `neon_sql_execute` | Owner-confirmed audited single SQL change; exact five-part provider target, required affected-row bounds and independent readback SELECT; development mismatch rolls back; production additionally needs consumed exact child-preview token and WAL restore LSN | C D Pr A | Ow | F | D-5 (built #140; live pending) |
| `neon_sql_execute_transaction` | Owner-confirmed 1–20 statement atomic SQL batch with individual affected-row bounds, shared independent postcondition, B-3 rollback on mismatch and B-1/production token protections | C D Pr A | Ow | F | D-5 (built #140; live pending) |
| `neon_sql_explain` | Query plan for SELECT or DML. SELECT alone permits ANALYZE; UPDATE/DELETE/INSERT/MERGE always use non-executing EXPLAIN ANALYZE FALSE in a READ ONLY transaction, never execute writes | — | B Op | R | D-5 (built #127; guarded DML explain #137; runtime proof pending) |
| `neon_sql_preview_change` | Owner-confirmed B-1/B-4 guarded disposable branch rehearsal: exact changed-row counts, optional schema comparison, verified child deletion, durable one-use preview token; no parent changes, metered usage remains explicitly approved | C D $ | Ow | F | D-5 (built #139; live not accepted) |
| `neon_sql_list_activity` | Running queries, waits and locks, oldest first | — | Op | R | D-5 (built #127; runtime proof pending) |
| `neon_sql_stop_query` | Cancel one verified active query on its exact database with owner confirmation and readback; backend termination is deliberately not offered | C Pr D | Op | F | D-5 (built #130; live cancellation unverified) |
| `neon_sql_list_slow_queries` | Slowest and most frequent queries from `pg_stat_statements` (offers to enable the extension when missing) | — | B Op | R | D-5 |

## Schema (`neon_schema_*`) — 13

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_schema_list_schemas` | Schemas in a database (system schemas hidden) | — | B Op | R | D-6 (built #143; live SQL acceptance pending) |
| `neon_schema_list_tables` | Tables with row estimates and sizes | — | B Op | R | D-6 (built #143; live SQL acceptance pending) |
| `neon_schema_describe_table` | Columns, types, defaults, indexes, constraints, foreign keys, triggers, RLS policies for one table | — | B Op | R | D-6 (built #143; live SQL acceptance pending) |
| `neon_schema_get_ddl` | Verified bounded structural DDL sketches (explicitly not executable migrations/full backups) | — | B | R | D-6 (built #147; live SQL acceptance pending) |
| `neon_schema_search` | Find tables and columns by name | — | B Op | R | D-6 (built #144; custom service acceptance pending) |
| `neon_schema_list_objects` | Views, materialized views, functions, enums, sequences, triggers, policies or publications (by kind) | — | B Op | R | D-6 (built #144; custom service acceptance pending) |
| `neon_schema_list_extensions` | Installed and available extensions with versions | — | B Op | R | D-6 (built #143; live SQL acceptance pending) |
| `neon_schema_enable_extension` | Install an extension, or update an installed one to a newer version with `update: true` (production: confirm) | C* Pr | B Op | E | D-6 |
| `neon_schema_disable_extension` | Remove an extension (preview lists dependent objects) | C D Pr | Op | F | D-6 |
| `neon_schema_create_index` | Create an index, CONCURRENTLY by default (production: confirm) | C* Pr | B Op | E | D-6 |
| `neon_schema_drop_index` | Drop an index (preview shows its recent use) | C D Pr | Op | F | D-6 |
| `neon_schema_generate_types` | TypeScript types (or Zod schemas) generated from the tables | — | B | R | D-6 (built #146, real PostgreSQL metadata test; live acceptance pending) |
| `neon_schema_list_migrations` | Verified Prisma, Drizzle, Knex, Flyway and golang-migrate history; bounded applied/failed/rolled-back metadata and comparable missing expected names; never applies changes | — | B Op | R | D-9 (built #149; hosted acceptance pending) |

## Health (`neon_health_*`) — 4

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_health_check` | Database health in one call (any of 15 checks): sizes, cache hit rate, connections, locks, long-running queries, bloat, autovacuum, unused/duplicate indexes, transaction-ID age, replication | — | Op | R | D-6 (built #145; hosted acceptance pending) |
| `neon_health_suggest_indexes` | Index suggestions from scan statistics and slow queries, each with the exact CREATE INDEX statement | — | B Op | R | D-6 |
| `neon_health_vacuum_analyze` | VACUUM (ANALYZE) a table or database (production: confirm; load warning) | C* Pr | Op | E | D-6 |
| `neon_health_reindex` | Rebuild a bloated or invalid index, or all indexes of a table, `CONCURRENTLY` by default (preview shows sizes before and the bloat estimate; production: confirm; never a whole database or system catalogs) | C* Pr | Op | E | D-9 |

## Snapshots (`neon_snapshot_*`) — 7

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_snapshot_list` | Scoped bounded project snapshots and independently read backup schedules for every verified branch; no compute wake-up | — | Op | R | D-7 (built #87) |
| `neon_snapshot_create` | Full-owner time-limited manual snapshot of verified unprotected dev branch, requires unchanged pre-existing branch identity/protection through readback (#118), observed logical size, dated $0.09/GB-month conservative B-4 spend approval and exact readback; historical/LSN variants still gated | C $ | Ow | F | D-7 (built #99; offline) |
| `neon_snapshot_update` | Owner-guarded name-only rename of a verified manual development snapshot, preserves expiration and billing; exact readback proves unrelated snapshot and existing branch metadata unchanged (#117) | P | Op | F | D-7 (built #98; expiry changes still gated) |
| `neon_snapshot_delete` | Owner-guarded manual development snapshot deletion; exact after-readback proof that unrelated snapshot metadata and branch name/default/protection are unchanged, protected/default/scheduled/source-vanished snapshots refuse, no automatic retry (#117) | C D | Op | F | D-7 (built #97) |
| `neon_snapshot_restore` | Full-owner B-4 priced staging to a separate non-finalized development review branch, no compute reassignment or original replacement; ID-correlated unchanged existing branch names/protection/default flags and exact readback (#116) | C $ | Ow | F | D-7 (built #100, offline) |
| `neon_snapshot_finalize_restore` | Swap a restored branch in for the original: production computes move to it (restart). The 2026-09-28 Appliance Desk incident action — always asks | C D Pr | Ow | F | D-7 |
| `neon_snapshot_set_schedule` | B-1 owner-confirmed shortening of existing finite dev snapshot retention or removal of one redundant cadence only when daily-or-better 24h recovery remains; never adds/extends, rejects unknown fields and verifies complete identity-correlated schedule and branch readback (#120) | C D | Ow | F | D-7 (built #102–#103; offline; expansions deferred) |

## Project security (`neon_security_*`) — 7

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_security_review` | Verified network/JWKS/branch, audit, computes and configured issuer exposure; optional verified branch/endpoint/database/role adds bounded PostgreSQL RLS and policy-count aggregates, not policy effectiveness. Actual JWT, clients, log delivery and costs remain unverified | — | Ow Op | R | D-8 (built #90; impact #96; issuer map #104; policy validation #114; RLS #136) |
| `neon_security_set_ip_allow` | Guarded Scale-plan add/remove/replace with live entitlement, unknown provider field refusal, network-block effectiveness warning, stale access-state proof and verified readback | C Pr A | Ow | F | D-8 (built #92; live plan #95; network safety #105) |
| `neon_security_set_logical_replication` | Turn on logical replication (cannot be turned off; restarts computes) | C D Pr | Ow | F | D-8 |
| `neon_security_set_public_access` | Guarded preview/confirm of public internet/VPC access with verified current flags and exact readback; refuses both-path lockout | C Pr | Ow | F | D-8 (built offline #91) |
| `neon_security_list_jwks` | Project-verified trusted JWKS issuers, refusing foreign/duplicate entries, invalid audience or duplicate roles, and redacting credential-bearing URLs | — | B Ow | R | D-8 (built #89) |
| `neon_security_set_jwks` | Guarded branch-scoped issuer add (explicit JWT audience/no auto roles) or exact trust revocation, independently rechecks complete child branch identity/protection before POST and after trust creation (#119) | C Pr A | B Ow | F | D-8 (built offline #93; race fix #94) |
| `neon_security_set_audit_log_level` | Full-owner audited reduction only (full→extended/base, extended→base), rejects unknown/current/stale audit state, prevents concurrent other-policy changes, independently verifies exact level; increases and unknown billable impact remain gated | C Pr | Ow | F | D-8 (built offline #138) |

## Owner and administration (Batch O) — 23

For the account owner, not only developers (contract §11). Settings with an API are real tools; every dashboard-only
setting is a guided setting (`neon_where_is_setting`, structured steps, read-back where Neon exposes the value). All tools
here need the organization key unless marked otherwise.

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_admin_overview` | The whole account in one view: organizations, plan as far as readable, members and roles, API keys (names, ages), protected branches per project, usage this month and its dollar estimate, spending alert, security items, every guided setting's state — ok / needs attention / can't read | — | Ow | R | O-4 |
| `neon_org_list` | Organizations this key can see, with plan where readable, and your role in each | — | Ow | R | O-1 |
| `neon_member_list` | Members with roles, and pending invitations | — | Ow | R | O-1 |
| `neon_member_invite` | Invite people by email (Neon emails them) with a role | C A | Ow | F | O-1 |
| `neon_member_set_role` | Change a member's organization role | C A | Ow | F | O-1 |
| `neon_member_remove` | Remove a member from the organization | C D | Ow | F | O-1 |
| `neon_access_list` | Who can reach one project: organization role, explicit project role, effective permission, email shares | — | Ow | R | O-1 |
| `neon_access_set_project_role` | Give a member an explicit role on one project, or clear it | C A | Ow | F | O-1 |
| `neon_access_share_project` | Share a project with someone by email (legacy sharing) | C A | Ow | F | O-1 |
| `neon_access_revoke_share` | Remove an email share | C | Ow | F | O-1 |
| `neon_apikey_list` | Personal and organization API keys: names, kind, project, created, last used (never the key) | — | Ow | R | O-2 |
| `neon_apikey_create` | New personal, organization or project-scoped key; shown once on the setup page, or stored directly as one of this server's keys | C A S | Ow | F | O-2 |
| `neon_apikey_revoke` | Revoke a key at once (refused for a key this server itself uses, unless replaced first) | C D | Ow | F | O-2 |
| `neon_transfer_request_create` | Create a request to hand a project to another Neon account (claim link on the one-time page) | C A Pr S | Ow | F | O-2 |
| `neon_transfer_projects_between_orgs` | Move projects from one of your organizations to another | C A Pr | Ow | F | O-2 |
| `neon_billing_usage` | Consumption by project or branch for a period (compute hours, storage, history, transfer, extra branches, snapshots) with dollars from the price table and a month-end projection | — | Ow Op | R | O-3 |
| `neon_billing_get_spending_alert` | The organization's monthly spending alert (Neon emails at 80% and 100%; computes keep running) | — | Ow | R | O-3 |
| `neon_billing_set_spending_alert` | Set, change or remove the spending alert amount | C | Ow | F | O-3 |
| `neon_billing_estimate_change` | Dollar preview of a planned change (compute size, scale-to-zero, history, branches, snapshots) before doing it | — | B Ow | R | O-3 |
| `neon_admin_list_guided_settings` | Every dashboard-only setting the map covers, by console page | — | Ow | R | O-4 |
| `neon_admin_check_setting` | Read back a guided setting's value where Neon exposes it (after Chris changes it) | — | Ow | R | O-4 |
| `neon_admin_review_security` | Organization-wide security: members and roles, admins count, old or unused API keys, unprotected default branches, IP allow and public access per project, connections and passes to this server; guided checks for SSO and two-step login | — | Ow | R | O-4 |
| `neon_admin_activity` | What happened across projects: Neon operations plus this server's change log, by day | — | Ow Op | R | O-4 |

## Neon backend services: Auth, Data API, storage, Functions, triggers, logs (Batch E) — 17

Neon made these generally available on 2026-09-18. Hand-built tools cover the common reads and setup; less common writes
use the universal tools (same guards) until the change log shows repeated use (ROADMAP).

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_auth_get` | Neon Auth on a branch: enabled, configuration, email/password and plugins, trusted domains, OAuth providers (no secrets), webhook settings | — | B Op | R | E-1 |
| `neon_auth_enable` | Turn on Neon Auth for a branch (creates the `neon_auth` schema; refused where a profile says the app uses another auth system) | C* Pr | B | F | E-1 |
| `neon_auth_disable` | Turn off Neon Auth for a branch | C D Pr | B | F | E-1 |
| `neon_auth_update_config` | Sign-in settings: email/password, magic link, organization and phone plugins, allow localhost | C* Pr | B Op | F | E-1 |
| `neon_auth_set_trusted_domains` | Add or remove redirect domains (adding widens where sign-ins may return) | C* Pr A | B Op | F | E-1 |
| `neon_auth_set_oauth_provider` | Add or update an OAuth provider; the client secret is typed on the setup page, never in chat | C A | B Op | F | E-1 |
| `neon_auth_list_users` | Sign-in users on a branch (email, created, role) read from the `neon_auth` schema | — | Op | R | E-1 |
| `neon_dataapi_get` | Data API on a database: enabled, URL, settings | — | B Op | R | E-1 |
| `neon_dataapi_enable` | Expose a database's tables over Neon's REST Data API (preview lists exposed schemas and RLS gaps) | C A Pr | B | F | E-1 |
| `neon_dataapi_update` | Change Data API settings | C A Pr | B | F | E-1 |
| `neon_dataapi_disable` | Turn off the Data API for a database (apps using it break) | C Pr | B | F | E-1 |
| `neon_storage_list_buckets` | Object storage buckets on a branch and the branch's storage state | — | B Op | R | E-2 |
| `neon_storage_list_objects` | Objects in a bucket (key, size, modified), by prefix; never the bytes | — | B Op | R | E-2 |
| `neon_function_list` | Neon Functions on a branch with status, last deployment, custom domains | — | B Op | R | E-2 |
| `neon_function_deploy` | Deploy code to a Function from a public URL or a repository archive (production: confirm) | C* Pr | B | F | E-2 |
| `neon_trigger_list` | Function triggers (schedules, object-created) on a branch | — | B Op | R | E-2 |
| `neon_log_query` | Query Function and storage logs with field filters (lists fields and values on request) | — | B Op | R | E-2 |

## Developer tools (`neon_dev_*`) — 12 (`docs/designs/BATCH-V.md`)

Building with Neon on any project. Everything a run creates is recorded and annotated `rtc_run=<runId>`; cleanup touches
only recorded objects. Every tool refuses production targets (B-2) before reading anything.

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_dev_branch_create` | Throwaway branch for a feature or test run: from a parent (data or schema-only), small compute, expiry (default 24 h), recorded in a run; connection info without password | P Dev | B | E | V-1 |
| `neon_dev_list_runs` | Runs and what each created, with expiry and cleanup state | — | B | R | V-1 |
| `neon_dev_cleanup` | Delete exactly what a run created (branches first-child-first, then databases/roles on kept branches); per-object report | C Dev | B | E | V-1 |
| `neon_dev_list_scenarios` | Seed scenarios available, with what each creates | — | B | R | V-2 |
| `neon_dev_seed` | Fill a dev branch with realistic data from a named scenario, a plain description mapped to scenarios, or rows from a public CSV/JSON URL; preview lists every table and row count | P Dev | B | E | V-2 |
| `neon_dev_reset_branch` | Reset a dev branch to its parent's latest state (no production confirm needed; refuses production) | P Dev | B | E | V-3 |
| `neon_dev_checkpoint` | Record a named checkpoint (LSN) on a dev branch before a test | P Dev | B | E | V-3 |
| `neon_dev_restore_checkpoint` | Put a dev branch back to a checkpoint in seconds | P Dev | B | E | V-3 |
| `neon_dev_migration_preview` | Run migration SQL (or a migrations folder's pending files from a public URL) on a throwaway branch: schema diff, errors, timing, lock warnings; keeps or deletes the branch | P Dev | B | E | V-3 |
| `neon_dev_anonymized_copy` | Masked copy of a production branch for development (Neon anonymized branches, beta): masking rules previewed; refused when a column that looks personal has no rule | C Dev | B | E | V-4 |
| `neon_dev_tune_query` | Tune a slow query on a throwaway copy: plan, index candidates tried there, before/after timings; nothing changes on the original | P Dev | B | E | V-4 |
| `neon_dev_check_integration` | Is a project ready for an app being built (spec: tables/migrations present, extensions, roles, pooled URL, protection, expiry, Auth/Data API)? Read-only, with exact steps | — | B | R | V-4 |

## Project profiles (`neon_profile_*`, readiness and setup) — 6

Optional, for any app whose own code manages part of its Neon project (Batch P; first profile:
`docs/APP-NEEDS-APPLIANCE-DESK.md`).

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_profile_list` | Profiled projects on this server and what each app owns in Neon | — | Ow Op | R | P-1 |
| `neon_profile_get` | One profile: production and shared-preview branches, schema owner (e.g. Prisma), databases, roles, naming rules, required settings | — | Ow Op | R | P-1 |
| `neon_profile_update` | Change a profile after the app's own code changes | C | Ow | F | P-1 |
| `neon_profile_draft` | Draft a profile from what an agent found in a codebase (env var names, migration tool, branch names, guards) | — | B | E | P-3 |
| `neon_workflow_app_readiness` | Is Neon set up for this app (a profile or an inline spec)? Each need: done / fixed (with confirm) / needs you (link + steps) / needs a decision (`IN-xx`) | C* (only when applying a fix) | B Ow | E | P-2 |
| `neon_workflow_project_setup` | Start Neon for a **new** project from a plain description: project, region, databases, roles, protected default branch, dev branch defaults, snapshot schedule; returns a draft profile and the text for its `APP-NEEDS` file | C $ S | B Ow | F | P-3 |

## Workflows (`neon_workflow_*`) — 9

Each does a whole job server-side and answers in plain English; read-only ones are `R`.

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_workflow_safe_migration` | Change a schema safely: preview on a throwaway branch with the schema diff and lock warnings, record a restore point, apply to the target in one transaction with confirm, verify, keep undo; for profiled apps it only previews (the app's own migrations apply) | C Pr D | B Op | E | W-1 |
| `neon_workflow_recover_data` | "Get back what was there on Tuesday": find the point in time, restore it to a new branch, compare rows and schema with today, then (only with confirm) copy rows back or swap the branch in | C D Pr | Op | F | W-2 |
| `neon_workflow_database_health` | Health of every database in a project, plain-English findings and the exact fixes (each fix a separate confirmed call) | — | Op | R | W-3 |
| `neon_workflow_usage_and_cost` | This month so far and projected, by project and branch, top cost drivers and savings (idle computes, scale-to-zero, stale branches, retention) | — | Ow Op | R | W-3 |
| `neon_workflow_branch_cleanup` | Find stale branches (old, idle, expired runs, previews of deleted git branches); never default, protected or profiled; preview then delete with confirm (recoverable 7 days) | C D | B Op | E | W-4 |
| `neon_workflow_rotate_credentials` | Rotate a role's password: new secret only on the one-time page, the list of places that must be updated (from the profile), check after Chris updates them | C Pr S | Op | E | W-5 |
| `neon_workflow_secure_project` | Review a project's security and offer each fix (protect default branch, public access, IP allow where the plan allows, unused roles, RLS gaps); each fix previewed and confirmed | C* | Ow | F | W-6 |
| `neon_workflow_go_live_check` | Is a project ready for real data: default branch protected, history long enough, snapshot schedule, production compute not scaling to zero if latency matters, pooled URL used, spending alert set, backups beyond Neon noted | C* (fixes only) | Ow | E | W-6 |
| `neon_workflow_find` | One search box: a project, branch, compute, host name, database, role, operation or snapshot ID or name → what it is and where | — | Op | R | W-7 |

## Everything else in Neon: the universal tools (`neon_api_*`) — 4

Driven by Neon's published API description (vendored with its date and hash, A-4). They reach every operation that is not
hand-built — VPC endpoints, Auth users and webhooks, email provider, storage writes, Function custom domains, trigger
writes, credentials, AI Gateway, anything Neon adds — with the same guards.

| Tool | What it does | Flags | Aud | Profile | Card |
| --- | --- | --- | --- | --- | --- |
| `neon_api_search` | Find Neon API operations by plain words: method, path, summary, and whether it reads, changes, deletes, costs money or touches production | — | B Ow Op | R | U-1 |
| `neon_api_describe` | Parameters for one operation, trimmed, from Neon's own description | — | B Ow Op | R | U-1 |
| `neon_api_read` | Any GET operation, with the same summaries, `fields`, size cap and handles | — | B Ow Op | R | U-1 |
| `neon_api_write` | Any POST/PATCH/PUT/DELETE operation through the full safety layer | C (always) | B Ow Op | F | U-1 |

How `neon_api_write` stays safe (U-1): always `confirm`, `dryRun` supported; the request is checked against the vendored
description (unknown operation or parameter → refused); the production guard reads the target branch/project first;
operations in the spend table (`src/neon/spend-operations.js`) get the dollar preview, and unknown create/update
operations on computes, projects, snapshots or branches are treated as spend until classified; operations returning
secrets put them on the one-time page; deprecated operations are refused; if a hand-built tool covers the operation,
`neon_api_write` refuses and names it; only in `full`; passes need `allow_writes`.

## Things Neon has no API for

Handled by `neon_where_is_setting` as structured steps, never faked: changing plan, payment method, billing address and
invoices; buying AI Gateway credits; SSO/SAML; email-domain auto-provisioning; your login methods and two-step login;
organization rename and deletion; personal account deletion; the Vercel integration (Neon-managed or Vercel-managed) and
its preview-branch settings; the GitHub integration; metrics/log export integrations; HIPAA enablement and the BAA;
support tickets. The full map (every console settings page) is built in O-4 (`src/data/dashboard-map.js`).

## Not rebuilt (decisions)

- Old toolkit structured DDL and row tools (`neon_add_column`, `neon_create_table`, `neon_insert_row`,
  `neon_delete_rows`, … 34 tools): one guarded `neon_sql_execute` plus `neon_workflow_safe_migration` is safer and cheaper on
  context than 34 thin wrappers. pgvector and full-text tools: `neon_schema_enable_extension` plus `neon_sql_*`.
- Official connector's docs search (`search`, `fetch`, `list_docs_resources`, `get_doc_resource`) and `send_feedback`:
  ROADMAP (research server).
- Project webhooks (old toolkit): Neon has no such API (research audit N5).
- Other prior-toolkit tools with no Neon API behind them (gap check 2026-10-10, `docs/audits/2026-10-10-prior-tools.md`):
  metrics and Postgres logs, alerts, encryption/SSL/password-policy switches, project clone, branch merge, backup export,
  checkpoint/WAL statistics; and two speculative advice tools (partitioning, materialized views).

**Implemented registry at #149 (source capability listing, deployment acceptance separate):** `read_only` 45; `everyday` 53; `full` 83. These are implemented tools, not the 177-tool planned catalog; verified by exact-head CI.

## Totals

**173 hand-built tools plus 4 universal `neon_api_*` tools = 177**, plus guided settings for every dashboard-only setting.
By section: server 18, projects 11, operations 2, branches 13, computes 10, databases and roles 11, connections 2, SQL 8,
schema 13, health 4, snapshots 7, project security 7, owner and administration 23, backend services 17, developer tools
12, project profiles 6, workflows 9, universal 4. By profile column: `read_only` 79 tools, `everyday` 120 (79 + 41),
`full` 177 (B-6 prints the exact numbers from the registry; a mismatch with this file fails `check-budgets`). In compact mode (`docs/designs/BATCH-C.md`) an agent loads about 20 tools up
front and reaches the rest through `neon_search_tools` / `neon_call`.

Count check (run from the repo root; prints each section and the total):

```bash
python3 - <<'EOF'
import re
sec=None; counts={}
for line in open('docs/TOOL-CATALOG.md'):
    if line.startswith('## '): sec=line[3:].split(' — ')[0].strip()
    m=re.match(r'\| `([a-z_]+)` \|', line)
    if m and sec: counts[sec]=counts.get(sec,0)+1
for k,v in counts.items(): print(v, k)
print(sum(counts.values()), 'total')
EOF
```

C-1a (#38): common read tools accept `detail: summary|full` and comma-separated dotted `fields` at MCP registration; selection occurs after secret removal. Large-result handles are C-1b.

C-1b (#39): oversize read responses use 24-hour, same-connection, secret-scrubbed handles; retrieval is exposed only in C-1c (#40).
