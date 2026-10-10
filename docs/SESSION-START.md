# SESSION-START — one page to begin (or resume) an implementation session

For Sol 5.6 (or any model) implementing a PR card. Read **this page and your card**, then work. Open other rule files
only when a step below names them, a section at a time. `AGENTS.md` still governs; this page is its short form.

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

## 6. Stopping

Stop only for a real gate: a hard limit (§2), a missing production/security/spend/schema decision, or a card over 800
production lines. Before stopping: commit, update the resume note and `docs/STATUS.md`, and say in one plain-English
paragraph what is done and what Chris needs to decide.

## Restart message for Chris to paste when a session stops

> Continue the Neon MCP work. Read `docs/SESSION-START.md`, then your card's resume note
> (`docs/pr-cards/<ID>.progress.md`) if it exists, and pick up at its "Next step". Follow the anti-stall rules.
