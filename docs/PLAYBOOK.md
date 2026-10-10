# PLAYBOOK — how to deliver one PR card, step by step

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

About 500 production lines (tests/docs not counted), about 15 production files, hard stop ~800 lines, at most one
migration, one risk area (keys / production guard / SQL guard / spend / tools-of-one-area / doors). Measure before
opening the PR:

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

### 4c. Registries that break CI when you forget them

`src/tools/index.js` module list · TOOL-CATALOG row · `profiles` metadata · `src/neon/operation-marks.js` (U-1 onward) ·
`known_apps` seed (P-1) · `work-index.json`.

## Step 5 — Pushing and CI

1. **Push once per CI cycle.** A push cancels the running CI.
2. **After a red run:** read all failures, reproduce each locally with 4b, fix every failure, push once.
3. **Is it mine?** If the same test is red on `main`, it isn't: port the fix or make a tiny separate fix PR.
4. **Same failure twice:** reproduce locally. **Third red run:** evidence-based diagnosis before any further push.
5. "Flake" is not a cause. Never skip, retry-loop or quarantine.
6. Put "CI runs used: N (red: R, cancelled: C)" in the PR description.

**When `main` moves while your PR is open:** sync once at the PR boundary with `git merge origin/main` — never rebase a
pushed branch. Conflicts in STATUS, MASTER-ROADMAP or `work-index.json`: keep both sides, re-run the validator.

## Step 6 — Docs as if merged, then open the PR

DRIFT-PROTOCOL checklist B (CI checks it): card `MERGED (#n)`, STATUS names the next card, `work-index.json` status,
TOOL-CATALOG marks for built tools, ARCHITECTURE for env vars/tables, GO-LIVE-CHECKLIST for new switches,
OWNER-INPUTS for new questions, DECISIONS for decisions. PR title `<type>: <plain description>`. Description in plain
English: what Chris can now ask for; acceptance with evidence; owner decisions (IN-xx or none); review dispositions;
what is not included; CI runs used. Delete the resume note in the final commit.

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

## Step 10 — Waiting and stopping

- External waits are checkpoints: check once, act on anything new, then build the immediate successor.
- A quiet bounded CI wait is allowed: at most 60 seconds per wait, 10 minutes total
  (`timeout 300 gh run watch <id> --exit-status --interval 60 > /tmp/ci-wait.log 2>&1`); timeout means pending.
- Before ending a turn: commit, update the resume note and STATUS (exact head, pending gates, next action), and tell
  Chris in plain English.

## If you get stuck

- Same failure after two focused attempts: stop editing, inspect the evidence, change the hypothesis.
- Neon refuses something the design assumed (an operation, a parameter, a plan limit, a beta feature removed): don't
  improvise. Record what Neon answered (fake Neon fixture from its documented error, or the scratch project in X-3),
  propose a dated amendment, continue other work.
- Docs contradict code: tests are the truth for behavior, AGENTS for rules, PLAN for scope, card and design for how.
