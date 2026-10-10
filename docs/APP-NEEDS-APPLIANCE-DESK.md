# What Appliance Desk needs from Neon, and which tool handles each

Audited 2026-10-10 against `christcr2012/appliance-desk` on disk (read only): `docs/ARCHITECTURE.md` (Infrastructure,
"Database access pattern (Prisma + Neon)", O02A), `docs/DATABASE.md`, `docs/GO-LIVE-CHECKLIST.md` §6, `docs/ROADMAP.md`
(Neon ↔ Vercel preview branching, protecting `main`), `docs/runbooks/RESTORE.md`,
`docs/archive/DECISIONS-before-2026-10-03-history.md` (2026-09-26 region and protection entries; 2026-09-28 restore
drill incident), `src/lib/preview-database-safety.ts`, `prisma.config.ts`, `package.json` (`vercel-build`, `db:*`
scripts), `scripts/check-migrations.mjs`, `prisma/migrations/` (81 migrations, no `CREATE EXTENSION`).

This is an **example project profile**, and the completeness check used to prove the Neon MCP can do everything a real
app needs. The server itself is a general development tool; profiles are optional and any app Chris builds can have one
(Batch P, `docs/designs/BATCH-P.md`; `neon_profile_draft` drafts one from a codebase). This file is also the template for
future profiles.

**Rule for this file:** every row names the tool or workflow that covers it, or says plainly that Neon has no API for it
and how the server guides Chris instead. Batch P turns this table into data (`known_apps`) and into one check,
`neon_workflow_app_readiness`. When the app's Neon use changes, this file and the `known_apps` seed change in the same PR (P-1
owns the seed). **No real Neon IDs or host names appear here**: Chris enters them on the setup page (IN-13).

## What the app does in Neon by itself (the MCP must not duplicate or fight it)

| The app… | Evidence | What the MCP does |
|---|---|---|
| Owns its schema through **Prisma migrations** (81 so far), applied automatically by `prisma migrate deploy` inside `vercel-build`, using the **direct** (unpooled) URL; Prisma records each migration in `_prisma_migrations` | ARCHITECTURE "Production migrations run automatically now"; `package.json` `vercel-build`; `prisma.config.ts` | App guard refuses direct DDL on the app's database on its production and shared-preview branches and any write to `_prisma_migrations`, unless `outsideApp: true`. `neon_dev_migration_preview` previews pending migrations on a throwaway branch; `neon_workflow_safe_migration` stops after the preview for this app |
| Blocks destructive migrations (`DROP TABLE/COLUMN/DATABASE`, `TRUNCATE`, renames, `SET NOT NULL`) unless recorded as reviewed | `scripts/check-migrations.mjs` | The SQL guard's `destructive` class uses the same list (plus more), so the server's previews flag exactly what the app's check would |
| Uses the **pooled** URL (`DATABASE_URL`) at runtime and the **direct** URL (`DIRECT_URL`) for migrations | ARCHITECTURE "Environment variables" | Profile `env_vars` holds the names and kinds (never values); `neon_connection_get_info` shows both hosts; `neon_workflow_rotate_credentials` lists both variables per Vercel environment |
| Points every Vercel **preview** at one shared, isolated preview branch and refuses any other host (`assertPreviewDatabaseUrls` pins that branch's endpoint hosts) | `src/lib/preview-database-safety.ts`; ARCHITECTURE O02A | Profile marks it a **shared preview** branch (guarded like production: writes need production access and confirm) and its endpoint as **pinned** (deleting or moving it is refused without `outsideApp`, because every preview would break) |
| Production branch `main` is **protected** (since 2026-09-29, after upgrading to the Launch plan) | ARCHITECTURE "Branch protection"; GO-LIVE §6 | Production guard treats it as production; readiness re-checks `protected: true` |
| Runs restore drills only into branches named `restore-…`, verified through the Neon API before writing | `docs/runbooks/RESTORE.md` | Profile `branch_naming`; results label `restore-*` branches; `neon_snapshot_restore` never finalizes |
| Keeps its own daily backup export in Vercel Blob, separate from Neon | ARCHITECTURE "Daily database backup" | Nothing to do in Neon; readiness mentions it as "backup beyond Neon: yes (app-managed)" |
| CI never touches Neon (throwaway local Postgres only) | `docs/DATABASE.md` | Profile `ci_uses_neon: false`; this server never offers to wire Neon into the app's CI |
| Uses **Better Auth**, not Neon Auth | ARCHITECTURE "Auth" | Profile `auth: 'other'` → `neon_auth_enable` refused on its branches without `outsideApp` |

## Everything to set up in Neon for the app, and who does it

| # | Need (source) | Today | Covered by | API or guided? |
|---|---|---|---|---|
| N1 | One Neon project in **AWS US East 1** (next to Vercel's default function region), database `appliance_desk`, default branch `main` (DECISIONS 2026-09-26) | Exists | `neon_project_overview`, `neon_workflow_app_readiness` (region check) | API |
| N2 | Production branch protected (GO-LIVE §6) | Done 2026-09-29 | `neon_branch_set_protected`, readiness | API |
| N3 | Pooled URL in Vercel `DATABASE_URL` and direct URL in `DIRECT_URL`, per environment (ARCHITECTURE) | Set | `neon_connection_get_info` (no password); `neon_connection_show_once` puts a full string on the one-time page; writing it into Vercel directly is a hub workflow (ROADMAP) | API + one paste by Chris |
| N4 | Migrations applied by the app's own build, never by hand (ARCHITECTURE 2026-09-27) | Working | App guard (no direct DDL); `neon_dev_migration_preview` for previews; readiness reads `_prisma_migrations` to report the latest applied migration | API (read-only SQL) |
| N5 | A snapshot right before any risky migration (ARCHITECTURE "Restore point") | By hand | `neon_snapshot_create`; readiness suggests `neon_snapshot_set_schedule` | API |
| N6 | A restore window long enough: the plan's history window (6 hours on Free; up to 7 days on Launch) (ARCHITECTURE "Restore point") | Not checked here | `neon_project_get_settings` shows it; `neon_project_set_history_retention` ($, production) | API |
| N7 | Restores never finalized on production without Chris (2026-09-28 incident) | Rule in the app's AGENTS | `neon_snapshot_restore` never finalizes; `neon_snapshot_finalize_restore` and `neon_branch_restore` on production need production access, confirm and preserve the old state | API |
| N8 | Restore drills into `restore-*` branches with an empty database (RESTORE runbook) | Runbook | `neon_branch_create` (name `restore-…`), `neon_database_create`; the app's script verifies the branch itself | API |
| N9 | The shared preview branch stays isolated from production and its endpoint stays the same (O02A) | Verified | Profile `shared_preview_branches`, `pinned_endpoints`; app guard | API |
| N10 | Optional: one fresh branch per preview deployment (ROADMAP; Chris's call on timing; 10 branches included on Launch, about 2 in use) | Not turned on | Guided (Neon-managed Vercel integration settings); `neon_dev_branch_create` for agents' own work; `neon_billing_estimate_change` shows the branch cost past 10 | Guided (console) |
| N11 | Production compute: scale-to-zero choice (cold starts vs cost) | Neon default | `neon_compute_get`, `neon_compute_update_settings` ($, production) | API |
| N12 | Password rotation when needed (the app rotated after identifiers leaked into git history, DECISIONS) | Advised | `neon_workflow_rotate_credentials` (new password on the one-time page, lists `DATABASE_URL` and `DIRECT_URL` for each Vercel environment) | API + paste by Chris |
| N13 | The restore script's own Neon key (`NEON_API_KEY` + `NEON_PROJECT_ID`, RESTORE runbook step 3) | Used ad hoc | `neon_apikey_create` (project-scoped, shown once on the one-time page) | API |
| N14 | Plan and spend: Launch plan since 2026-09-29; bill as expected | Launch | `neon_billing_usage`, `neon_workflow_usage_and_cost`; plan changes guided only | API (usage) / guided (plan) |
| N15 | Seed/test accounts removed from production before launch, only with Chris's OK (GO-LIVE §6) | Pending | `neon_sql_execute` on production: production access + exact preview on a throwaway branch + confirm; the preview says the change is outside the app's own audit history | API (guarded) |
| N16 | No Neon Auth on the app's branches (uses Better Auth) | Off | App guard; readiness checks `neon_auth_get` | API |
| N17 | IP allow: not available on Launch (Scale only); the app is reached only through Vercel functions, which have no fixed addresses | n/a | `neon_security_review` reports "not on this plan"; `neon_security_set_ip_allow` preview warns that it would block Vercel | API |
| N18 | Logical replication off (nothing replicates out) | Off | `neon_security_review` | API |
| N19 | Monitoring: slow queries and health after launch | n/a | `neon_health_check`, `neon_sql_list_slow_queries`, `neon_workflow_database_health` (read-only) | API |
| N20 | Neon IDs never committed to the app's repo (its secret scan flags them) | Rule | This server's results show IDs, but agents must not paste them into the app's repo; this repo's own scan flags them too (A-1) | — |

## The one-sentence checks Chris will use

- *"Is Neon ready for Appliance Desk?"* → `neon_workflow_app_readiness(app: "appliance-desk")`: every row above as done /
  needs you (with link and steps) / needs a decision (IN-xx), and the fixes it can make for him (each previewed, each
  needing confirm).
- *"Try the next migration first."* → `neon_dev_migration_preview` with the app's pending migrations (from public raw URLs of
  the repo), production untouched.
- *"Get back what was there before the last deploy."* → `neon_workflow_recover_data` (new branch, compare, then only with
  confirm copy rows back or swap in).
