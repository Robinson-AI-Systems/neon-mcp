# PLAYBOOK — how to deliver a coherent implementation bundle

Session startup, cadence and release-dependent proof follow `docs/SESSION-START.md`. These recipes preserve all existing security, review and validation gates. Run focused checks at coherent seams and full required gates before publishing, rather than the whole suite after each small local edit.

The rules are in `AGENTS.md`; the short start is `docs/SESSION-START.md`; the work is the card in `docs/pr-cards/`.
Same procedure as the Stripe MCP's PLAYBOOK, adapted to this repo (no Next.js, no browser tests; Neon instead of Stripe;
a fake Neon server and real throwaway Postgres instead of stripe-mock).

## Step 0 — Orient (minutes, not a reading session)

1. `git fetch origin && git status -sb`. Resume the branch/PR in `docs/STATUS.md` (and the card's resume note) before
   starting anything new. Never discard local work.
2. Read the card. If the roadmap row says JIT, write the card first from the design and current code
   (`docs/pr-cards/README.md`). A missing card is work, not a reason to stop.
3. Read only what the card names, a section at a time.
4. Check `docs/OWNER-INPUTS.md` only for inputs this card needs. Build what doesn't depend on a missing answer; keep
   the dependent behavior off; list the ID.

## Step 0b — Drift check (every card)

`docs/implementation-contracts/DRIFT-PROTOCOL.md` checklist A before coding; B inside the PR; C at batch end.

## Step 1 — Branch

`git checkout -b ai/<tool>/<topic>` from current `main` — or from the unmerged predecessor's branch when stacking.
At most two unmerged implementation PRs in one chain.

## Step 2 — Inventory before coding

`grep` the area (`src/tools/<area>.js`, `src/neon/`, `tests/unit/<area>*`). Reuse existing helpers (`defineWrite`,
`classifyTarget`, `spend`, `waitForOperations`, `listAll`, `quoteIdent`, summaries, the write-contract helper). For a new
Neon call, look the operation up in the vendored description first: `node scripts/openapi-find.mjs "create branch"`
(built in A-4) and the official reference page; cite the operationId and the reference URL in the PR.

Before writing code, use the relevant [implementation recipe](implementation-contracts/IMPLEMENTATION-RECIPES.md)
to pin actual signatures and input mappings. Proposed paths in the route guide are not existing helpers.

### Repeated CI failure decision tree (PR #54 evidence)

A repeated failure is not a reason to stop or keep changing tests. For each failed exact head: collect **all** failing job logs, locate the actual failing boundary and write down the expected request/response. Confirm the **construction and type** of each injected client (for Neon: `makeNeonClient` → `createNeonClient(...).client` → `client.sdk`). Verify the pinned SDK's raw operation list, then compare its documented lower-level route against the vendored OpenAPI contract. If an endpoint is documented but absent from the SDK raw export, use the central credential-closed-over `client.recoverBranch(path)` adapter in `src/neon/client.js`; the underlying `sdk.post` does **not** inherit auth automatically, unlike the generated raw functions. Attach the Bearer header only inside `makeNeonClient`, never in a tool handler. Do not use `client.sdk.client.post`, direct fetch or a second secret store. Add a fake-Neon request-routing test and a failure/no-replay test. Require exact-head unit, check, DB and aggregate CI. After two unsuccessful attempts, switch from patching to tracing; document the failure and inherited fix in the JIT card.

## Step 3 — Implement in ordered commits

One work unit = one local commit. Inside it: (1) additive SQL for this server's tables + `docs/ARCHITECTURE.md` table
row if the database changed; (2) the tool module with its unit tests **in the same commit**; (3) its fake-Neon fixtures
(validated against the vendored description) and, for SQL, its real-Postgres test; (4) registry metadata (`area`,
`profiles`, `audience`, `writes`, `productionEffect`, `spend`, `access`, `secret`, `key`) and TOOL-CATALOG marks.

While implementing:
- Every write tool: `defineWrite` with `plan` (reads the target from Neon first), `apply`, operation wait, `readAfter`,
  `verify`, `spend` when it can raise the bill, `inverse` when it has a clean opposite.
- Every read tool: a summary mapper (or an existing one) and the default page size of 20.
- No mock data, stubs returning success, or TODO-as-implementation.
- **Ripple check:** `grep -rn "<changed export>" src tests scripts | head -50` and update every affected fake and test
  in the same commit.

### Step 3a — PR size

Normally average 2–5 complete predefined subsections and 400–800 meaningful
production-code lines per coherent bundle; tests/docs/generated/formatting are
excluded. These are planning averages, not hard ceilings, minima or filler quotas.
Cards define approved scope, not mandatory separate PRs. Group connected domain,
caller, persistence and recovery behavior; different modules/APIs and multiple
related migrations or risk areas do not automatically require splits. Keep each
risk/permission/confirmation and denial path independently enforced and tested.
Related additive migrations require explicit order and upgrade/restore proof.
Prefer one substantial PR per bundle. Split only for a concrete migration,
dependency, safety or reviewability reason, document remaining integration and
count the full outcome once after all parts are implemented, verified and merged.
No unrelated scope, new permission or actual activation is authorized by grouping.
Measure before publication:

```bash
git diff --shortstat origin/<base>...HEAD -- api src scripts ':!**/*.test.*'
git diff --name-only origin/<base>...HEAD -- api src scripts | wc -l
```

## Step 4 — Verify before pushing

### 4a. The quick gate (every push)

`npm run check` = secret scan (`scripts/check-secrets.mjs`, fails on anything shaped like a real Neon API key, role
password, connection string with a password to a non-local host, GitHub token, or a real Neon/Vercel ID or host),
docs check (`scripts/check-docs-updated.mjs`), index validation (`docs/pr-cards/validate-index.py`), lint, write-safety
(`scripts/check-writes.mjs`), core-import check (`scripts/check-core-imports.mjs`), token budgets
(`scripts/check-budgets.mjs`). Never `--no-verify`.

### 4b. Add the checks your change needs

| You changed | Run |
|---|---|
| Any tool | `npx vitest run tests/unit/<area>.test.js tests/unit/write-contract.test.js` |
| A Neon call | the tool's unit test (fake Neon validates the request against `vendor/neon-openapi/`) and `node scripts/openapi-find.mjs "<operation>"` output pasted in the PR |
| SQL (this server's tables, or the SQL/schema/dev tools) | `npm run test:db -- tests/db/<file>.test.js` (`scripts/local-postgres-test.sh`: disposable **localhost** Postgres, never Neon). If no Postgres binaries exist in your workspace, push and let CI run it; say so in the PR |
| A door (HTTPS API, `neon_call`) | `npx vitest run tests/doors/` |
| Listing or descriptions | `node scripts/check-budgets.mjs --print` |

**If the whole checkout/terminal is unavailable:** follow [SESSION-START §6](SESSION-START.md#6-keep-moving-problems-are-not-blockers)
and use GitHub REST through the connected GitHub plugin (or `gh api` if available). Edit/commit on an `ai/*`
branch and let GitHub Actions execute `check`, `unit` and disposable-Postgres `db`. Inspect
`GET /repos/{owner}/{repo}/commits/{sha}/check-runs` and
`GET /repos/{owner}/{repo}/actions/jobs/{job_id}/logs` (or check-run annotations).
REST supplies access to the remote CI results, **not local execution**; record the limitation.
Do not merge without an exact-head successful aggregate `ci`, self-review and the normal approval gates.

### 4c. Registries that break CI when you forget them

`src/tools/index.js` module list · TOOL-CATALOG row · `profiles` metadata · `src/neon/operation-marks.js` (U-1 onward) ·
`known_apps` seed (P-1) · `work-index.json`.

**Connector REST anti-stall rule (2026-10-12):** Before an additional CI poll or retry of a large multi-file operation, see [runbooks/REST-RECOVERY.md](runbooks/REST-RECOVERY.md). Use small GitHub blob batches, exact-head lease updates, and a bounded pending/failed/green decision; never count an open PR or a check from an old SHA. For terminal-assisted verification use scripts/ci-head-gate.mjs to parse one check-run response without a polling loop.

## Step 5 — Pushing and CI

1. **Push once per CI cycle, and never while your PR's CI run is still in progress** (SESSION-START §6 "CI cadence"):
   wait for every job, collect all failures, fix them together, then push.
2. **After a red run:** read all failures, reproduce each locally with 4b, fix every failure, push once.
3. **Is it mine?** If the same test is red on `main`, it isn't: port the fix or make a tiny separate fix PR.
4. **Same failure twice:** reproduce locally. **Third red run:** evidence-based diagnosis before any further push.
5. "Flake" is not a cause. Never skip, retry-loop or quarantine.
6. Put "CI runs used: N (red: R, cancelled: C)" in the PR description; C should be 0 — a cancelled run means a push
   arrived during a run.

**When `main` moves while your PR is open:** sync once at the PR boundary with `git merge origin/main` — never rebase a
pushed branch. Conflicts in STATUS, MASTER-ROADMAP or `work-index.json`: keep both sides, re-run the validator.

## Step 6 — Docs as if merged, then open the PR

DRIFT-PROTOCOL checklist B (CI checks it): card `MERGED (#n)`, STATUS names the next card, `work-index.json` status,
TOOL-CATALOG marks for built tools, ARCHITECTURE for env vars/tables, GO-LIVE-CHECKLIST for new switches,
OWNER-INPUTS for new questions, DECISIONS for decisions. PR title `<type>: <plain description>`. Description in plain
English: what Chris can now ask for; acceptance with evidence; owner decisions (IN-xx or none); review dispositions;
what is not included; CI runs used. Delete the resume note in the final commit.

**Commands (REST; `gh pr …` uses GraphQL, which some workspaces block).** `R=Robinson-AI-Systems/neon-mcp`,
`export GH_PAGER=cat`:

```bash
git fetch origin main && git push -u origin HEAD                       # one push per CI cycle
gh api repos/$R/pulls -f title="feat: …" -f head=<branch> -f base=main -F body=@/path/pr-body.md --jq .number
gh api -X PATCH repos/$R/pulls/<n> -F body=@/path/pr-body.md            # update the description
gh api -X PATCH repos/$R/pulls/<n> -f base=main                         # retarget a stacked PR
```

## Step 7 — Review

1. Production, SQL, secrets, keys, guards, spend, auth, passes: re-read `docs/AI-PR-READ-FIRST.md` and write one line
   per applicable constraint in the PR.
2. Freeze scope. There is no automated review in this repo (IN-01): inspect the whole diff yourself against
   AI-PR-READ-FIRST, write "Self-review: …" with every finding and its disposition, and fix all blocking findings in one
   patch. If an organization-wide reviewer posts anyway, fix or answer each thread and resolve it; never wait for one.
3. Resolve a thread only after verifying the fix at the exact head.

## Step 8 — Preview

Vercel builds a preview per branch. Previews share this server's production database, so they must never hold
production power: on a non-production deployment every connection is forced to `preview` mode and organization-key
tools are refused (A-3/A-5, design A13). For a card that changes a door or login, open the preview's home page and
confirm the tool counts shown match the PR.

## Step 9 — Merge (authorized when all are true)

`ci` green at the exact head; acceptance met with evidence; self-review written; reviews handled. Merge with the
expected-head SHA (merge commits). Stacks merge bottom-up, retargeting each PR to `main` first. After the lower PR
merges, sync the successor once onto final `main`.

```bash
gh api -X PUT repos/$R/pulls/<n>/merge -f sha=<exact head sha> -f merge_method=merge
```

Then check the push-to-`main` run once (Step 10 command with the merge commit's SHA) and record it in STATUS.

## Step 10 — Waiting and stopping

- External waits are checkpoints: check once, act on anything new, then build the immediate successor.
- A quiet bounded CI wait is allowed: one `sleep 60` per command, at most 15 checks (~15 minutes) per push; still
  pending after that means pending — record it and do other work. The merge gate is the check run named **`ci`**:

```bash
sleep 60; gh api "repos/$R/commits/<sha>/check-runs?per_page=50" \
  --jq '.check_runs[] | [.name, .status, (.conclusion // "-"), .html_url] | @tsv'
```

  A red run: open the failing job's log with `gh api repos/$R/actions/jobs/<job id>/logs | tail -80` (job id from
  `gh api repos/$R/actions/runs/<run id>/jobs --jq '.jobs[] | [.id,.name,.conclusion] | @tsv'`).
- Review threads (an organization-wide bot may post even though IN-01 says none): reply with
  `gh api -X POST repos/$R/pulls/<n>/comments/<comment id>/replies -f body="…"`; list them with
  `gh api repos/$R/pulls/<n>/comments --jq '.[] | [.id, .path, .line, .body[0:80]] | @tsv'`.
- Before ending a turn: commit, update the resume note and STATUS (exact head, pending gates, next action), and tell
  Chris in plain English.

## If you get stuck

- Same failure after two focused attempts: stop editing, inspect the evidence, change the hypothesis.
- Neon refuses something the design assumed (an operation, a parameter, a plan limit, a beta feature removed): don't
  improvise. Record what Neon answered (fake Neon fixture from its documented error, or the scratch project in X-3),
  propose a dated amendment, continue other work.
- Docs contradict code: tests are the truth for behavior, AGENTS for rules, PLAN for scope, card and design for how.
