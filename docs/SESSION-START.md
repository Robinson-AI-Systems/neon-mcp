# SESSION-START — one page to begin (or resume) an implementation session

For Sol 5.6 (or any model) implementing a PR card. Read **this page and your card**, then work. Open other rule files
only when a step below names them, a section at a time. `AGENTS.md` still governs; this page is its short form.

## 0. First thing, every session: finish what is already open

Your session can end at any moment (the chat stops between actions), so the next session starts here, not at a new card.

1. `R=$(git remote get-url origin | sed -E 's#.*github.com[:/]##; s#\.git$##')` then
   `gh api "repos/$R/pulls?state=open" --jq '.[]|select(.head.ref|startswith("ai/<tool>/"))|"\(.number) \(.head.ref) \(.head.sha)"'`
   with `<tool>` = your own branch prefix (`sol`, `gpt6`, `claude` …). **Yours** = branches under your own prefix,
   including ones a previous session of yours opened (one agent that used several prefixes, e.g. `sol` and `gpt6`,
   checks each). Another agent's PR is not yours: leave it alone unless Chris asks.
2. For each of your open PRs, first fetch its exact head — `git fetch origin <branch> && git checkout -B <branch>
   FETCH_HEAD`, confirm `git rev-parse HEAD` equals the PR's head SHA — and read its resume note (§4). Then check `ci`
   at that head
   (`gh api "repos/$R/commits/<sha>/check-runs" --jq '.check_runs[]|"\(.id) \(.name) \(.conclusion)"'`).
   - **Red → that is your task now.** Read every failure (job logs may not download; use
     `gh api "repos/$R/check-runs/<id>/annotations"`), reproduce locally, fix all of them, push once, re-check.
   - **Green and acceptance met → bring it up to date, then merge** (PLAYBOOK Steps 5 and 9): if
     `gh api "repos/$R/compare/main...<sha>" --jq .behind_by` is above 0, `git fetch origin main && git merge origin/main`,
     run the checks, push, and merge only when `ci` is green at that new head. **Pending →** build the next slice meanwhile.
   - Review threads open → fix or answer each, then resolve.
3. Continue from the resume note's "Next step". Only when nothing of yours is open: §1 and the next card.

## 1. Find your place (2 minutes)

Work happens in whatever workspace you were given (a cloud agent workspace, a Vercel Sandbox, a laptop). Code reaches
GitHub only as git commits pushed to an `ai/*` branch. Never copy source files through tool output.

1. `git fetch origin && git status -sb && git log --oneline -5`; `npm ci` once per checkout. In a shallow or
   single-branch clone, also `git fetch origin main:refs/remotes/origin/main` (the docs check compares with it).
2. `sed -n '1,40p' docs/STATUS.md` → the **Next** section names the card.
3. Resume note? `ls docs/pr-cards/*.progress.md 2>/dev/null` — if your card has one, continue from its "Next step".
   Do not restart work it lists as done.
4. Read your card (`docs/pr-cards/<ID>.md`). If the roadmap says JIT (no card yet), write it first from the design
   (`docs/pr-cards/README.md`, 40–100 lines). Read only what the card's "Read only these" list says.

## 2. Never do these without Chris (AGENTS "Hard limits")

A real Neon key or account from tests or scripts (except X-2/X-3 once Chris set them up); any write to a production
branch, project-wide setting or a real project other than the scratch project; restoring, resetting or finalizing on
production; buying anything or raising spend; a secret anywhere in code, docs, tests, logs, PR text or tool results; real
Neon/Vercel IDs or host names in the repo; changing Appliance Desk, the other Robinson servers or their databases;
widening default key, connection or pass permissions; committing to `main`; skipping, disabling or weakening tests.

## 3. The work loop

1. Branch `ai/<tool>/<topic>` from latest `main` (or the card's base).
2. Drift check: `docs/implementation-contracts/DRIFT-PROTOCOL.md` **checklist A** (table in the PR, card corrected
   first).
3. Build one work unit → its tests → run them (`npx vitest run <files>`; `npm run test:db -- <file>` when it touches
   SQL — this server's own tables or the SQL tools; it starts a throwaway local Postgres when `initdb` exists, also as
   root, else push and let CI's `db` job run it) → `npm run check` → **commit locally** → update the resume note
   (§4). Repeat. Red → fix one failing file at a time, then the full check once.
   Test tools you already have (A-1): `makeFakeNeon()` in `test/helpers/fake-neon.js` (pass its `fetch` to the Neon
   client; it fails on any request Neon's description does not allow), fixtures in `test/helpers/neon-fixtures.js`,
   `openIsolatedSchema()` / `neonShapedQuery()` in `test/helpers/pg-neon-adapter.js`.
4. **Code first, then docs.** In an implementation PR, edit only the docs checklist B names.
5. When the card is complete: update the docs **as if this PR had already merged** (card `MERGED (#n)`, STATUS,
   `work-index.json`, TOOL-CATALOG marks, ARCHITECTURE when infra changed — checklist B), push once, open the PR,
   then follow PLAYBOOK Steps 5–9 (open the PR, wait for CI and merge with the REST commands there; the merge gate is
   the check named `ci`, green at the exact head).

## 4. Resume note — so stopping never loses your place

Keep `docs/pr-cards/<ID>.progress.md` (≤20 lines) on your branch and update it after every commit:

```
Card: B-3 · Branch: ai/sol/b-3-sql-guard · Last commit: <sha> <subject>
Done: 1 classifier table (62 statements pass) · 2 read-only runner
Next step: 3 preview on throwaway branch — write previewOnBranch() and its fake-Neon test
Blocked: none
```

Delete it in the card's final commit.

## 5. Anti-stall rules (AGENTS "Working without stalling" — mandatory)

- Files over ~300 lines by section only (`grep -n` the heading, then `sed -n 'A,Bp'`, ≤150 lines). Never read
  `vendor/neon-openapi/*` whole; query it with `node scripts/openapi-find.mjs "<words>"` once A-4 exists.
- Every search has a path and `| head -50`. Only commands that finish by themselves; `timeout 600` for slow ones.
- Pipe long output through `| tail -80`. Same command fails twice → change approach or record the blocker.
- After ~10 reads/searches without an edit, make the smallest next edit.
- CI and reviews: check once, act on what is new, then do other work.

## 6. Keep moving: problems are not blockers

| Engineering problem — **fix it yourself, never stop** | Real blocker — stop and ask Chris |
|---|---|
| Red CI, lint errors, a failing or outdated test, a wrong API parameter, a merge conflict, a failure that "looks flaky", unclear existing code, a missing card (write it), docs that disagree with code, a card that is too big (split it and record the split) | A hard limit (§2); an owner decision (`IN-xx`) the **current step** truly needs; a design that cannot work (write a dated amendment, then continue other work while it waits) |

**Validate in thin slices.** Write the smallest piece plus its test, then run that test and lint the files you touched
(`npx vitest run <file>`, `npx eslint <files>`) **before** writing the next piece. Never write more than about 150
production lines without running tests. Look up every external API parameter before coding it — in the vendored API description
(`node scripts/openapi-find.mjs "<words>"` once it exists), or, for calls the design routes through a pinned official
package instead, in that package's types and documentation — a wrong parameter is the most common CI failure.
Run the full `npm run check` and `npm test` before every push: CI should only confirm what you already know.

**No shell?** If your workspace cannot run commands (you edit through a GitHub connector), you cannot validate locally:
open the PR as a **draft** after the first slice and push **each slice** — CI is your test runner (this replaces "one push
per CI cycle"). Read failures from check-run annotations and fix them before adding the next slice.

**Leave an exact recovery point.** Never end a turn with a plan, a promise ("I'll now …") or a summary while work
remains. End every turn right after a push whose resume note's "Next step" is the exact next action — a command or a
file and function, e.g. "CI red at 8adb4bf: `tests/unit/billing.test.js` expects old message; update it, then lint
`src/tools/billing.js`".

**Stopping** happens only for a real blocker. Before stopping: update the resume note and `docs/STATUS.md`, then
commit and push them with the work, and say in one plain-English paragraph what is done and exactly what Chris needs to decide.

## Restart message for Chris to paste when a session stops

> Continue the Neon MCP work. Read `docs/SESSION-START.md` and do §0 first: finish any open PR of yours (fix red
> CI, then merge) before starting the next card. Then keep going card after card; stop only for a real blocker (§6).