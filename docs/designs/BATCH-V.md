# Design — Batch V: Developer tools (build and test with Neon)

Status: **APPROVED** (Chris, 2026-10-10). Written 2026-10-10. Scope and acceptance: `docs/PLAN.md` →
Batch V. Cards V-1 … V-4. Depends on Batch D (branches, SQL guard and schema tools exist). Tool list:
`docs/TOOL-CATALOG.md` section Developer tools. Follows the Robinson Tool Contract §10.

These are the jobs an agent does while **building** something on Neon, for any project — a new app, a prototype, a
migration, a test suite — not the jobs of running a production database. The manifest says `devTools: true`.

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| V1 | Branch create accepts `expires_at` (max 30 days), `init_source: "schema-only"`, `annotation_value`, and an endpoint with `autoscaling_limit_max_cu` | `node scripts/openapi-find.mjs "create branch"`; read `BranchCreateRequest` |
| V2 | Branch restore to the branch's own LSN works (`source_branch_id` = itself, `source_lsn`) | `openapi-find "restore branch"`; B-0 row B5 |
| V3 | Anonymized branches (`POST /projects/{id}/branch_anonymized`, masking rules, `start_anonymization`, status) exist; still beta | `openapi-find "anonymized"`; if removed, `neon_dev_anonymized_copy` is dropped and recorded |
| V4 | `GET /projects/{id}/branches?search=` finds branches by name and branch objects return their annotations (needed to find run objects after a lost response) | `openapi-find "list branches"`; fixture check |

## 1. Decisions

**V1. Developer tools refuse production before reading anything else.** Every `neon_dev_*` tool first runs
`classifyTarget` (B-2) on its target; a production or shared-preview branch, or a protected resource, is refused with
code `refused_by_guard` and a pointer to the production tool that would do the job with confirmation. A dev tool may
**read from** production only where its purpose is to copy it safely (`neon_dev_branch_create` with a production parent,
`neon_dev_anonymized_copy`), and never writes to it.

**V2. Runs are recorded, not guessed.** Every object a dev tool creates belongs to a run (`dev_runs`) and is recorded
(`dev_run_objects`) with its type, ID, parent and expiry; branches are also annotated `rtc_run=<runId>` (contract §10). A
caller may pass its own `runId` (the hub does, to tie one environment together across servers). Cleanup uses the recorded
IDs, never a search.

**V3. Dev branches always expire.** `neon_dev_branch_create` sets `expires_at` (default from the setting `dev.ttl_hours`,
24 h; maximum 30 days, Neon's limit) so Neon deletes forgotten branches by itself; it is never protected and never set as
default. Default compute: 0.25–1 CU with scale-to-zero after 5 minutes (setting `dev.compute`, IN-12). It returns
connection info without a password; the secret goes through `neon_connection_show_once` or, later, a hub workflow that writes
it into a Vercel preview environment variable (ROADMAP).

**V4. Seed scenarios are deterministic and previewed.** `neon_dev_seed(branch, scenario | description | sourceUrl, size)`
uses a seeded random generator (same seed → same rows). Scenario kinds (`src/dev/scenarios.js`):
- **Demo schemas** for prototypes, each creating its own tables in a new schema: `saas` (organizations, users, plans,
  subscriptions, invoices), `store` (customers, products, orders, order items, refunds), `rental` (customers, items,
  agreements, payments, service visits), `blog` (authors, posts, comments, tags).
- **`auto`**: fills an **existing** schema — reads tables, columns, types, constraints and foreign keys from the catalog,
  inserts in foreign-key order, realistic values by column name and type (names, emails on `example.com`, phones in the
  555-01xx range, US addresses, money as integer cents when the column name ends in `_cents`), respects unique and check
  constraints (a row that violates one is skipped and counted).
- **From a file**: rows from a public CSV or JSON URL into one table (downloaded server-side, 10 MB cap).
The preview lists every table and row count; a run is capped at `dev.seed_max_rows` (default 10,000). A plain description
is matched to a scenario and the preview says which.

**V5. Cleanup is precise.** `neon_dev_cleanup(runId | 'all-runs-older-than-days')`: deletes recorded branches children first
(soft delete, recoverable 7 days), then recorded databases and roles on branches the run did not create; reports each
object (deleted / already gone, e.g. expired / failed with reason). It never deletes anything that is not recorded, and
refuses anything that has become production since (someone protected it or made it default).

**V6. Checkpoints are LSNs.** `neon_dev_checkpoint(branch, name)` records `pg_current_wal_lsn()` in `dev_checkpoints`;
`neon_dev_restore_checkpoint` restores the branch to that LSN (Neon branch restore from itself). The compute restarts briefly;
the preview says so. Checkpoints older than the project's history window are refused in words.

**V7. Migration preview never touches the target.** `neon_dev_migration_preview(target, sql | migrations)` creates a
throwaway child of the target (recorded in a run), applies the SQL — or, for a migrations folder, the files not yet listed
in the target's `_prisma_migrations` (or another named migrations table), fetched from public raw URLs the caller gives
(never private code) — in order, then reports: each statement's class (B-3), errors, timing, the schema diff
(`compare_schema`), and **lock warnings** (statements that take `ACCESS EXCLUSIVE` on tables with more than
`dev.lock_warn_rows` rows, default 100,000, from `pg_class.reltuples`). `keep: true` keeps the branch (recorded, expiring).

**V8. Masked copies of production.** `neon_dev_anonymized_copy(source, maskingRules)` uses Neon's anonymized branches (beta).
Before creating anything it lists columns whose names or types look personal (`email`, `phone`, `name`, `address`,
`street`, `city`, `zip`, `postal`, `ssn`, `dob`, `birth`, `ip`, `token`, `password`, `secret`, `note`) on the source and
refuses unless each has a masking rule or is named in `unmasked` by the caller. Always `confirm` (it copies production
data); the result branch is a normal dev branch (expiring, recorded).

**V9. Query tuning on a copy.** `neon_dev_tune_query(target, sql)` creates a throwaway child, runs `EXPLAIN (ANALYZE,
BUFFERS)` there (safe: it is a copy), proposes up to 3 indexes (from the plan's sequential scans and the predicates),
creates them on the copy, re-runs, and returns before/after timings and the exact `CREATE INDEX CONCURRENTLY` for
`neon_schema_create_index`. The copy is deleted at the end.

**V10. Integration check.** `neon_dev_check_integration(spec)` reads, without changing anything: tables present, latest
migration applied (from the migrations table), extensions, roles, whether the app's env var name points at a pooled host
(from the spec, not from a secret), default branch protected, dev branch expiry, Neon Auth and Data API state, plan limits
(branches, computes). Each item: ok / missing with the exact tool call or console steps.

## 2. Schema

```sql
CREATE TABLE IF NOT EXISTS dev_runs (id TEXT PRIMARY KEY, neon_org TEXT NOT NULL, project_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), connection TEXT, description TEXT,
  status TEXT NOT NULL DEFAULT 'active', cleaned_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS dev_run_objects (run_id TEXT NOT NULL, object_type TEXT NOT NULL,   -- branch | database | role | compute
  object_id TEXT NOT NULL, parent_id TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ,
  cleaned BOOLEAN NOT NULL DEFAULT FALSE, cleaned_note TEXT, PRIMARY KEY (run_id, object_type, object_id));
CREATE TABLE IF NOT EXISTS dev_checkpoints (id TEXT PRIMARY KEY, run_id TEXT, project_id TEXT NOT NULL,
  branch_id TEXT NOT NULL, name TEXT NOT NULL, lsn TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
```

Settings seeded (insert when missing): `dev` = `{ ttl_hours: 24, compute: { min_cu: 0.25, max_cu: 1, suspend_seconds:
300 }, seed_max_rows: 10000, lock_warn_rows: 100000 }`.

## 4. Work units (each: production-refusal test per tool; write-contract for every write; fake-Neon + real Postgres)

### V-1 — Dev branches, runs, cleanup (M, medium effort)
Tools: `neon_dev_branch_create`, `neon_dev_list_runs`, `neon_dev_cleanup`. Tests: expiry always set and ≤30 days; annotation present;
a retried create with the same request key finds the first branch; cleanup touches only recorded objects (an unrecorded
branch with the same annotation is left alone); children deleted first; an object that became protected is refused;
expired branches reported as already gone.

### V-2 — Seed scenarios (M, medium effort)
Tools: `neon_dev_list_scenarios`, `neon_dev_seed`. Tests: each scenario's preview lists exact tables and counts; same seed → same
rows; `auto` respects foreign-key order and unique constraints on a real Postgres schema with 6 related tables; file
import caps size; seeding twice with the same `requestKey` inserts nothing new.

### V-3 — Reset, checkpoints, migration preview (M, medium effort)
Tools: `neon_dev_reset_branch`, `neon_dev_checkpoint`, `neon_dev_restore_checkpoint`, `neon_dev_migration_preview`. Tests: restore calls
Neon with the recorded LSN; pending-migration detection from a `_prisma_migrations` fixture; lock warning on a big table;
the target is never written (fake Neon records no write to it; Postgres target unchanged).

### V-4 — Masked copies, query tuning, integration check (M)
Tools: `neon_dev_anonymized_copy`, `neon_dev_tune_query`, `neon_dev_check_integration`. Tests: refused when an `email` column has no
rule; tuning never writes to the target and returns a valid CREATE INDEX; integration check items on fixtures (all ok /
each missing).

## 5. Stop-and-ask points
1. Any V0 row false: amend before that card.
2. A scenario would need data that looks like real people's (real names list, real addresses): use generated values only.

## 6. Acceptance mapping

| PLAN Batch V line | Evidence |
|---|---|
| Every dev tool refuses production | production-refusal test per tool |
| Cleanup touches only recorded objects | `tests/unit/dev-cleanup.test.js` |
| Dev branches always expire | `tests/unit/dev-branch.test.js` |
| Migration preview never writes the target | `tests/db/dev-migration-preview.test.js` |

## Amendments
