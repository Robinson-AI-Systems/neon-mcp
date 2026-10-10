# Design — Batch W: Workflows in Chris's language

Status: **DRAFT — awaiting Chris's approval (IN-00)**. Written 2026-10-10. Scope and acceptance: `docs/PLAN.md` →
Batch W. Cards W-1 … W-7. Depends on Batches D, V, O, P. Tool list: `docs/TOOL-CATALOG.md` section Workflows.

Each workflow does a whole job server-side and answers in plain English, with `structuredContent` for agents (Batch C).
Read-only workflows are in `read_only`. Write workflows preview everything first, in one preview, and confirm once for
the whole plan (each step still passes its own guards and writes its own change-log row).

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| W1 | Every tool a workflow calls exists and passes its write-contract | `grep -n "<tool name>" src/tools/*.js` per workflow |
| W2 | `waitForOperations` and the time-budget helper exist | `grep -n "export" src/neon/operations.js src/core/budget.js` |

## 1. Decisions

**W1. Workflows call tools through the registry** (the wrapped handlers), never Neon or SQL directly, so guards apply
once and consistently. A workflow that needs something no tool does gets the tool built in its area batch first (or uses
Batch U), never inline calls.

**W2. Time budget 50 s** (Vercel limit). Out of time → return what is done, with a note and the exact call that continues
(workflows store their progress in `workflow_runs`, keyed by request key).

**W3. One preview, one confirm, then stop on the first failure.** A write workflow runs every step with `dryRun: true`,
shows one combined preview (each step's own preview line), and with `confirm: true` runs the steps in order. If a step
fails, it stops, reports exactly what was done, and lists the undo for each completed step (X-1).

**W4. Safe migration** (`neon_workflow_safe_migration(target, sql | migrations)`): (1) `neon_dev_migration_preview` on a throwaway
branch (schema diff, errors, lock warnings); (2) if the target is a profiled app's schema-owned database → stop here and
say how the app applies it (P3); (3) record a restore point (snapshot of the target, or the LSN when snapshots are not
available on the plan); (4) apply through `neon_sql_execute_transaction` with the preview token (B-7); (5) compare the target's
schema with the preview branch's (`neon_branch_compare_schema`) — they must match; (6) report, with undo (restore to the
recorded point, preserving the after-state under a name). Fixes old-toolkit bug N4.

**W5. Recover data** (`neon_workflow_recover_data(target, when, what?)`): find the restore window (history retention) and the
nearest snapshot; restore the point in time to a **new** branch (`neon_branch_restore` from the target's history into a new
branch, or `neon_snapshot_restore`); compare row counts and schema of the named tables between the new branch and today; then
offer, each with confirm: copy specific rows back (generated `INSERT … SELECT` through the guarded SQL apply, run on the
target with the restored branch's data fetched server-side), or swap the restored branch in (`neon_snapshot_finalize_restore`
/ `neon_branch_restore` with preserve). Never swaps without a preview listing what changed since.

**W6. Usage and cost** (`neon_workflow_usage_and_cost`): month to date and projection (O-3), per project and branch, top cost
drivers, and savings with their dollar effect: computes that never scale to zero, oversized maximums, stale branches
(W-4's finder), history retention longer than any restore actually used, scheduled snapshots nobody restores.

**W7. Branch cleanup** (`neon_workflow_branch_cleanup(project, olderThanDays?)`): candidates = non-default, non-protected,
non-profiled branches that are older than N days (default 14) and idle (no compute activity in that time), or expired dev
runs, or named like preview branches whose git branch is gone (when the caller passes the list of live git branches);
preview lists each with size and last activity; delete with confirm (soft, 7 days).

**W8. Credential rotation** (`neon_workflow_rotate_credentials(project, branch, role)`): preview lists every place the profile
says uses the role (env var names per environment) and warns that the app will fail until they are updated; with confirm:
`neon_role_reset_password` (new secret on the one-time page), then a checklist for Chris (or, later, a hub workflow that
writes the Vercel env vars — ROADMAP); `neon_connection_get_info(test: true)` confirms the new password works server-side.

**W9. Secure project / go-live check.** `neon_workflow_secure_project` runs `neon_security_review` and offers each fix as a
confirmed step. `neon_workflow_go_live_check` checks a project is ready for real data (default branch protected, history
retention, snapshot schedule, production compute scale-to-zero choice, pooled URL for runtime and direct URL for
migrations per the profile, spending alert set, backups beyond Neon noted, Neon Auth/Data API exposure) and runs
`neon_workflow_app_readiness` for each profile on the project.

**W10. Find** (`neon_workflow_find(text)`): IDs by prefix (`br-`, `ep-`, project IDs, operation UUIDs), host names (endpoint
host → compute → branch → project), names (projects, branches, databases, roles, snapshots) across the organization, with
the matching records and their production marks.

## 2. Schema

```sql
CREATE TABLE IF NOT EXISTS workflow_runs (request_key TEXT PRIMARY KEY, workflow TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  state JSONB NOT NULL, finished_at TIMESTAMPTZ);
```

## 4. Work units (tests: normal case, empty project, more than one page, a step failing part-way, time budget exceeded)

| Card | Workflow(s) | Notes |
|---|---|---|
| W-1 (L, medium effort) | `neon_workflow_safe_migration` | regression for N4: apply really changes the target, and only after confirm; profiled schema stops after the preview |
| W-2 (L, medium effort) | `neon_workflow_recover_data` | rows copied back match the restored branch; swap only with confirm and a "what changed since" list |
| W-3 (M) | `neon_workflow_database_health`, `neon_workflow_usage_and_cost` | hand-computed dollars; findings in words |
| W-4 (M) | `neon_workflow_branch_cleanup` | never default/protected/profiled; idle detection from compute activity |
| W-5 (M, medium effort) | `neon_workflow_rotate_credentials` | secret only on the one-time page; env var list from the profile |
| W-6 (M) | `neon_workflow_secure_project`, `neon_workflow_go_live_check` | each fix a confirmed step; delegates to readiness |
| W-7 (S) | `neon_workflow_find` | host → branch lookup; ID prefixes |

## 5. Stop-and-ask points

1. A workflow would need a tool that does not exist: build it in its area batch first (or Batch U).

## 6. Acceptance mapping

| PLAN Batch W line | Evidence |
|---|---|
| Safe migration applies only after preview and confirm, verifies, keeps undo | `tests/unit/workflow-safe-migration.test.js` |
| Recovery never swaps production without confirm | `tests/unit/workflow-recover-data.test.js` |
| All writes confirmed and logged | write-contract via `neon_call` for each write workflow |

## Amendments
