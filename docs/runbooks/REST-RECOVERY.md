# REST/Actions stalled-session recovery and exact-head CI gate (2026-10-12)

Applies to sessions without local checkout or working GitHub DNS. Supplements SESSION-START sections 0/5/6 and PLAYBOOK Steps 5–10. Owner, protected-resource, production, spending and review gates remain mandatory.

## Observed failure and correction

The October 12 session hit a per-execution tool-call limit during an oversized multi-file GitHub commit script. The resulting error did not prove any changes had landed, so its branch head had to be checked before retrying. There were also repeated identical queued/in-progress CI polls without new work, followed by a chat interruption while PR #75 was still open. The checked exact-head CI was green, so the remaining step was review reconciliation and merge—not another idle poll. These are workflow problems, not evidence GitHub Actions was stuck.

A separate #75 P2 review found the role SQL admission had applied privilege-changing production DDL rules to authorized read-only deletion dependency probes. Fix with operation-specific admission and regression tests; do not disable owner or SQL guards.

## Decision procedure — bounded and idempotent

1. Read main SHA, open PRs belonging to your branch prefix, current PR head, four check-runs for the exact SHA, reviews and resume note. Never rely on the last chat's assumed head.
2. Red: collect all failed-job logs or annotations ONCE, fix real causes and tests in one commit. If two corrections fail the same case, trace actual client/dispatch/SDK boundary instead of editing assertions blindly.
3. Green: inspect late review findings and base drift, fix any new ones before merging with an expected head SHA. Verify all four post-merge main checks.
4. Pending: DO NOT run a tight polling loop. Do one useful independent task (diff review, reconcile docs, prepare next dependency, handoff note) before another check. If no useful task remains, record an exact pending-head checkpoint and stop instead of consuming turns with identical queries.
5. Tool-call cap/interruption: fetch branch HEAD, PR head, commit tree and file SHAs. Determine if a subset of the previous operation landed. Resume from the last VERIFIED SHA only; never blindly rerun a multi-call commit or force-push.

## Small GitHub REST batches

Connector-only workspaces: retrieve required files in a small batch, create blobs in batches of 2–4, then one exact-parent tree, one commit and one update_ref using expected_sha. Do not combine a 10–20-file fetch/blob/tree/commit/ref/PR pipeline into one code-mode execution. Each batch should produce a compact SHA/changed-path report; inspect remote state if it throws. GitHub REST does not execute local tests or mount a checkout.

When gh and Node are available, run this **once per observed head state**:

    gh api repos/Robinson-AI-Systems/neon-mcp/commits/<FULL_SHA>/check-runs | node scripts/ci-head-gate.mjs <FULL_SHA>

This tool does not poll or access network. It requires check, unit, db and ci for one identical 40-character SHA. Exit 0 = green, 1 = failure, 2 = pending, 3 = missing, stale, duplicated or malformed evidence. With only the GitHub connector, apply the same four-check comparison to its structured result.

## Recovery and handoff contract

After every branch commit, state: verified main SHA; PR number, branch and head SHA; merged PRs counted toward five; exact-head and post-merge check/unit/db/ci; unresolved review IDs; last changed paths; single next action; production/live scratch/spending/owner gate status. Save this in the card progress note or PR handoff and carry it into the next chat prompt if interrupted.

Report only successfully merged PRs as merged. Session scope/count comes only from the current owner prompt; record true blockers and issue a concise continuation prompt at the clean handoff. Never promise asynchronous work.
