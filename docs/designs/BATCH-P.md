# Design — Batch P: Project profiles (any app whose own code manages part of its Neon project)

Status: **DRAFT — awaiting Chris's approval (IN-00)**. Written 2026-10-10. Scope and acceptance: `docs/PLAN.md` →
Batch P. Cards P-1 … P-3. Depends on Batches B, D and V.

The Neon MCP is a general development tool. Some apps Chris builds manage part of their Neon project in their own code:
a migration tool owns the schema, a preview guard pins a branch's endpoint host, a restore script expects branches named a
certain way. For such an app the server must know these facts, or it will fight the app. A **project profile** holds
exactly that. Profiles are **optional**: work on a project with no profile needs none. Appliance Desk is the first
example profile (`docs/APP-NEEDS-APPLIANCE-DESK.md`); it proves the design is complete, it does not shape it.

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| P1 | `docs/APP-NEEDS-APPLIANCE-DESK.md` still matches the app | in `christcr2012/appliance-desk` (read only): `grep -n "DATABASE_URL\|DIRECT_URL" docs/ARCHITECTURE.md`; `sed -n '1,60p' src/lib/preview-database-safety.ts` (the shared preview branch and pinned hosts); `grep -n "vercel-build\|db:migrate" package.json`; `ls prisma/migrations \| wc -l`; `grep -n "restore-" docs/runbooks/RESTORE.md` |
| P2 | The production guard (B-2) reads profile branches through one function | `grep -n "profileBranches\|sharedPreview" src/neon/production.js` |
| P3 | The SQL guard (B-3) can tell which schema/tables a statement touches (for the schema-owner rule) | `grep -n "touchedRelations" src/neon/sql-guard.js` |

## 1. Decisions

**P1. A profile is data, not code.** One row in `known_apps` per app, plus one human-readable file
`docs/APP-NEEDS-<APP>.md` (template: the Appliance Desk file). Adding an app = one data row + one doc + one test fixture;
no new tools. Real Neon IDs (project, branch, endpoint) are entered on the setup page, never committed.

**P2. What a profile holds:** `id`, `name`, `neon_org`, `projects` (IDs, setup page only), `production_branches`
(names, e.g. `main`), `shared_preview_branches` (names, e.g. the one branch every preview deployment uses),
`pinned_endpoints` (endpoint IDs or hosts the app's code checks — setup page only), `schema_owner`
(`{ tool: 'prisma-migrate', migrations_table: '_prisma_migrations', databases: ['appliance_desk'] }`), `env_vars`
(names and kinds per environment, e.g. `DATABASE_URL` pooled for runtime, `DIRECT_URL` direct for migrations — names only,
never values), `app_roles` (role names the app connects as), `branch_naming` (e.g. restore drills use `restore-*`),
`auth` (`'neon-auth' | 'other'` — Appliance Desk uses Better Auth, so Neon Auth must stay off), `required` (settings the
app relies on: default branch protected, minimum history retention, region), `ci_uses_neon` (false for Appliance Desk:
its CI uses throwaway local Postgres), `backups_outside_neon` (informational).

**P3. The app guard** (`src/neon/app-guard.js`) runs inside every write and SQL statement on a profiled project and
refuses, unless the call passes `outsideApp: true` (and still with every other guard):
- DDL on a database the profile's `schema_owner` owns, on a production or shared-preview branch ("Appliance Desk's
  Prisma migrations own this schema; a direct change makes the next `prisma migrate deploy` fail or drift. Write a
  migration in the app instead, or preview it with `neon_dev_migration_preview`.");
- writes to the migrations table itself;
- deleting, resetting, restoring or renaming a production or shared-preview branch, or deleting/moving a pinned endpoint
  ("the app's preview guard checks this host; replacing it breaks every preview until the app is updated");
- resetting the password of an `app_roles` role (use `neon_workflow_rotate_credentials`, which lists the env vars to update);
- enabling Neon Auth when `auth` is `'other'`.
DML on production app tables is not blocked by the app guard (the production guard already needs production access and
confirm) but the preview says "this changes Appliance Desk's live data outside the app; the app's audit history will not
show it". Reads are never blocked. Branches matching `branch_naming` patterns are labelled in results.

**P4. `neon_workflow_app_readiness(app | spec)`** checks every row of a profile — or of an inline `spec` for a project being
built today — and returns per row: done / fixed (with confirm) / needs you (link + steps) / needs a decision (`IN-xx`).
Fixes it can make, each previewed and confirmed: protect the production branch, set history retention to the profile's
minimum ($), set a snapshot schedule ($), turn off scale-to-zero on production when the profile asks ($). It never runs
migrations, never changes the schema, never creates the app's roles' passwords outside `neon_workflow_rotate_credentials`.

**P5. `neon_workflow_project_setup(description)`** is for a **new** project: from a short plain description (name, region or
"near Vercel", databases, whether a migration tool will own the schema, whether previews get their own branches) it
previews and then creates: the project, databases, an app role, default branch protected (plan permitting), dev-branch
defaults, an optional snapshot schedule ($, confirm), and returns a draft profile row (`status: 'draft'`) and the text of
the project's `APP-NEEDS-<APP>.md` for Chris or the project's agent to commit in that project's repo. Connection strings
only through the one-time page. Running it twice changes nothing (finds the project by name and annotation).

**P6. `neon_profile_draft(findings)`** turns what an agent found in a codebase — env var names, the migration tool and its
table, branch names in code, hosts pinned by guards, restore scripts, auth library — into a draft profile and APP-NEEDS
text. It never fetches code itself.

## 2. Schema

```sql
CREATE TABLE IF NOT EXISTS known_apps (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  profile JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
```

Seed (P-1): the Appliance Desk profile generated from `docs/APP-NEEDS-APPLIANCE-DESK.md`, without IDs; the setup page
asks for the project, preview endpoint and production branch IDs (IN-13).

## 4. Work units

### P-1 — `known_apps`, Appliance Desk seed, app guard (M, medium effort)
Tools: `neon_profile_list`, `neon_profile_get`, `neon_profile_update`. Tests: each refusal in P3 on fixtures, and `outsideApp` letting it
through to the other guards; a project without a profile is unaffected; a test lists every seeded fact with the
appliance-desk file it came from (the PR body carries that table).

### P-2 — `neon_workflow_app_readiness` (L, medium effort)
Tests with fixtures for every row of the Appliance Desk file: protected main → done; unprotected → one confirmed fix →
read-back; Neon Auth enabled while `auth: 'other'` → needs you; migrations table present and latest migration recorded →
done; inline spec behaves like a profile.

### P-3 — `neon_workflow_project_setup` and `neon_profile_draft` (M)
Tests: a new project from a description (run twice → nothing new); draft profile and doc text returned, never committed
anywhere; findings with an unknown migration tool are reported, not guessed.

## 5. Stop-and-ask points

1. P1 shows the app changed how it uses Neon: update the profile and the APP-NEEDS file in the same PR; if a new kind of
   app-owned thing appears, amend P3 first.

## 6. Acceptance mapping

| PLAN Batch P line | Evidence |
|---|---|
| Appliance Desk profile complete and traceable | P-1 table in the PR |
| App guard refuses each P3 case without `outsideApp` | `tests/unit/app-guard.test.js` |
| Readiness covers every row | `tests/unit/workflow-app-readiness.test.js` |
| New-project setup idempotent | `tests/unit/workflow-project-setup.test.js` |

## Amendments
