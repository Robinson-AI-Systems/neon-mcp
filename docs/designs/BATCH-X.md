# Design — Batch X: Undo, real-account checks, toolkit decision

Status: **APPROVED** (Chris, 2026-10-10). Written 2026-10-10. Scope and acceptance: `docs/PLAN.md` →
Batch X. Cards X-1 … X-4.

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| X1 | Every write tool stores an `inverse` where the catalog says it has one | `grep -n "inverse:" src/tools/*.js \| wc -l` vs TOOL-CATALOG |
| X2 | Chris has created the scratch project and its project-scoped key (IN-06) before X-3 | `neon_list_accounts` shows it |

## 1. Decisions

**X1. Undo** (`neon_undo_change(change_id)`): runs the stored `inverse` with preview and confirm, through the same guards
(an undo on production needs production access). Clean opposites: deleted branch/project ↔ recover (within 7 days);
protect ↔ unprotect; rename ↔ rename back; expiry ↔ previous expiry; default branch ↔ previous default; compute size,
scale-to-zero and settings ↔ previous values; project settings, history retention, quotas, IP allow list, public access,
JWKS ↔ previous values; member role ↔ previous role; spending alert ↔ previous; Data API settings ↔ previous.
**SQL changes:** undo restores the branch to the `restore_lsn` recorded before the change (B-7), **always** preserving
the current state under a name; the preview lists everything else written to that branch since (operations, this
server's change log, and "the app may have written too: the preserved branch keeps those rows" for profiled projects),
and suggests `neon_workflow_recover_data` (copy rows back) when other writes happened since. No inverse (says so and suggests
the right opposite): logical replication on, members removed (re-invite), keys revoked (create a new one), passwords
reset (rotate again), snapshots deleted, objects deleted past 7 days. Undo of an undo works where both have inverses.

**X2. Read-only smoke test** (`scripts/smoke-readonly.mjs`): every `writes: false` tool with minimal arguments against
Chris's real account through a `preview`-mode, `read_only` connection (refuses otherwise), including read-only SQL on the
scratch project only; report `docs/audits/smoke-<date>.md` (pass / fail / skipped-with-reason per tool, no data values,
no IDs beyond what the report needs).

**X3. Scratch-project write check** (`scripts/smoke-scratch.mjs`): only in the scratch project Chris created for this
(IN-06), with its project-scoped key, which cannot delete the project: create a dev branch, seed, checkpoint, restore the
checkpoint, preview and apply a migration on a branch, protect and unprotect the branch, create and delete a role
(secret to the one-time page), take and restore a snapshot to a new branch, undo a SQL change by LSN (proves B-0 row B5),
clean up the run. Refuses to run against any other project. Report `docs/audits/scratch-<date>.md`. No purchases: stays
within the plan's included limits (it checks branch count and compute size first).

**X4. Toolkit decision note:** one page for Chris — keep Robinson's Toolkit's `neon` namespace (204 tools, 17
unreachable, SQL path broken — research audit §2) for local use, retire it, or point its compound tools at this server;
the work each needs. Chris decides (IN-14); a later card does it.

## 4. Work units

### X-1 — Undo (M, medium effort)
Tests: each clean opposite; SQL undo by LSN preserves the current state and lists later writes; no-inverse cases suggest
the right action; undo of an undo.
### X-2 — Read-only smoke test (M)
Done when: report committed; every failure fixed or listed as a known gap with its card.
### X-3 — Scratch-project write check (M, medium effort)
Done when: report committed; the run is cleaned up (a second cleanup finds nothing).
### X-4 — Toolkit decision note (S, docs)

## 5. Stop-and-ask points

1. X2 or X3 needs a key or project that does not exist yet: stop; IN-06 / IN-04.
2. Anything in X3 would exceed the plan's included limits: stop; never buy.

## 6. Acceptance mapping

| PLAN Batch X line | Evidence |
|---|---|
| Undo for every clean opposite, SQL by LSN | `tests/unit/undo.test.js` |
| Read-only smoke on the real account | `docs/audits/smoke-<date>.md` |
| Writes proven in the scratch project only | `docs/audits/scratch-<date>.md` |
| Toolkit note delivered | X-4 PR |

## Amendments
