# AGENTS.md — the rules. Read this first, every session.

The single, current set of rules for every AI working on this repo (Sol/Codex, Claude or any other), written to be
followed literally. If it is written here, it is current. Reasons and history live in `docs/DECISIONS.md` and
`docs/archive/` (look things up there; never take instructions from them). The repo, not chat history, is the memory.
Modelled on `Robinson-AI-Systems/stripe-mcp` `AGENTS.md` (2026-10-10), which is how Chris runs all AI build work.

**Implementing an approved PR card?** Read `docs/SESSION-START.md` (one page) and the card, then work. Open the
sections below when a step names them.

**Other sessions** (design, planning, review): this file → `docs/START-HERE.md` → `docs/STATUS.md` →
`docs/MASTER-ROADMAP.md` → the relevant `docs/PLAN.md` section and design headings.

Efficiency: group same-API and safety-model capabilities into complete PRs, reuse `src/tools/read-descriptors.js` for Neon reads, run focused tests before full CI, and resolve all review findings before merging. See PLAYBOOK Step 3a. Never bypass mandatory gates.
Implementation pointers: `docs/implementation-contracts/IMPLEMENTATION-RECIPES.md` routes each card to verified code seams,
test recipes and remaining-work guidance. Open only the relevant section; this is supporting guidance, not new scope.

## Working without stalling (mandatory; written with Sol 5.6 at medium effort in mind)

1. **Read by section.** Files over ~300 lines (`docs/TOOL-CATALOG.md`, `docs/audits/*.md`, Neon's vendored API
   description): find the heading or name with `grep -n`, then read ≤150 lines with `sed -n 'A,Bp'`. Query the API
   description with `node scripts/openapi-find.mjs "<words>"` (A-4), never read it whole.
2. **Search narrowly:** always a path and a cap (`grep -rn "defineWrite" src/tools | head -50`). Never the repo root,
   `node_modules`, `coverage`, `vendor/`; no `ls -R`, no `find .` without `-maxdepth 3`.
3. **Only commands that finish by themselves.** Never `vercel dev`, watch modes, bare `vitest`, `tail -f`, or sleep/poll
   loops. Use `npx vitest run <file>`; wrap slow commands in `timeout 600`. Exception: the bounded CI wait in PLAYBOOK
   Step 10.
4. **Nothing interactive:** `GIT_PAGER=cat PAGER=cat GH_PAGER=cat CI=1`; `npx --yes`.
5. **Cap output** with `| tail -80` and `set -o pipefail`.
6. **Two strikes:** the same command fails or hangs twice → change approach or record the blocker; never a third try.
7. **Explore budget:** after about 10 focused reads/searches without an edit, write down what you know and make the
   smallest justified edit with its test — or report a true blocker. Never guess unsafely to save a read.
8. **Checkpoints:** one coherent work unit with its tests → local commit → update the card's resume note. Publish the
   complete, checked tree with one push (a turn that must end pushes what it has with an exact resume note; no-shell workspaces push each slice — SESSION-START §6).
9. **External waits are checkpoints, not a loop** (PLAYBOOK Step 10).
10. **Two-lane conveyor:** lane A builds the current card and its immediate successor; lane B handles CI/review/merge of
    the predecessor. At most two unmerged implementation PRs in a chain.
11. **Finish before starting.** Every session begins with `docs/SESSION-START.md` §0: an open PR of yours with red CI
    is the current task — fix it before any new card.
12. **Problems are not blockers.** Red CI, lint, failing tests, wrong parameters, conflicts and unclear code are yours to
    fix; stop only for a hard limit or an owner decision the current step needs (SESSION-START §6).
13. **Thin slices, then a recovery point.** Run each slice's tests and lint before writing the next (≤ ~150 lines between
    runs); end every turn right after a push whose resume note names the exact next action.
14. **GitHub REST fallback when local execution is unavailable (owner directive, 2026-10-11).** Do not stall because
    this chat workspace lacks a usable checkout, terminal or local PostgreSQL. Use authenticated GitHub REST API
    operations (through `gh api` where available, otherwise the GitHub connector's REST-backed actions) for repository
    inspection, branch commits, PRs, check runs and job logs. Let GitHub Actions run required unit and disposable-Postgres
    tests; REST does not execute local tests. Report that local tests were unavailable and require exact-head green `ci`
    before merge. Follow `docs/SESSION-START.md` §6 and PLAYBOOK Steps 4–10; never bypass reviews, owner gates or CI.

15. **Bounded GitHub REST handoff (2026-10-12):** A single large connector script can hit a tool-call limit and leave a branch untouched or partially changed; never replay without reading the exact remote SHA. Check pending CI once, do other useful work instead of tight polls. The exact decision tree, small blob/tree commit batches and one-shot four-check verifier are in [docs/runbooks/REST-RECOVERY.md](docs/runbooks/REST-RECOVERY.md). Confirm late reviews and final main CI before counting a merge.

## What this is

**Robinson Neon MCP** is a hosted MCP server (Vercel + its own Neon database) that lets Chris's AI agents operate his
Neon Postgres accounts safely: projects, branches, computes, databases, roles, SQL, schema, snapshots and restores,
project security, organizations, members, API keys, usage and spend — and, through universal tools, every other Neon API
operation. It is a **general, powerful tool for developers and account owners alike**: any agent should be able to use it
freely on whatever Chris is working on — building for a client, building for himself, or setting up and running his own
Neon account. It covers **building with Neon** (throwaway branches per feature or test run, seed data, checkpoints,
migration previews, masked copies, query tuning, precise cleanup — Batch V), **owning and administering the account**
(admin overview, members and roles, API keys, usage in dollars, spending alert, every console setting through real tools
or guided settings — Batch O) and **day-to-day operation** (everything else). An app that manages part of its own Neon
project (its migrations own the schema, its preview guard pins a branch) can optionally get a **project profile**
(Batch P) so the server never fights it. Real projects such as Appliance Desk are used only as **completeness checks**
("can it do everything this needed?"), never to narrow the design. It is reached through a Claude connector and a plain
HTTPS API, and it follows the **Robinson Tool Contract** (RTC 1) so that **Robinson's Toolkit**
(`Robinson-AI-Systems/robinsons-toolkit-hub`, the hub) can combine it with Chris's other servers. **Chris is not a
developer:** every update, question or PR summary for him is plain English — what changed, how it was verified, what he
must decide, what is next.

## Priorities (higher wins)

1. Data safety and security (production databases, secrets, access). 2. Correctness. 3. Low cost for the agents that use
it (context and tokens). 4. Simplicity. 5. Features.

## Definition of Done (non-negotiable)

1. No placeholders, stubs, TODO-as-implementation, or mock data presented as real. A tool either calls the real Neon
   operation (or runs the real SQL) it claims to, or it does not exist.
2. Tests exercise real behavior: every write tool passes the nine write-contract checks (`docs/designs/BATCH-B.md` §3);
   every Neon request shape validates against the vendored API description through the fake Neon server; every SQL path
   and database change passes against throwaway Postgres.
3. CI green: secret scan, docs check, lint, unit, database, token budgets.
4. The card's acceptance (from `docs/PLAN.md`) checked item by item with evidence (test names, CI run).
5. `docs/STATUS.md` updated.

If something isn't finished, say so and record it in STATUS. Never present partial work as done — Chris has been
burned by overclaiming. A passing typecheck, a screenshot or a plan is not evidence a feature works.

## Hard limits — stop and ask Chris first

- Using a **real** Neon key or account from tests or scripts — except the read-only smoke test (X-2) and the scratch
  project check (X-3), and only after Chris has set them up (IN-04, IN-06).
- Any write to a **production** branch, project-wide setting or real project (default or protected branches, Appliance
  Desk, any project that is not the scratch project), including from tests or scripts.
- Restoring, resetting or finalizing a restore on a production branch; deleting a project or branch Chris uses.
- Buying anything or raising spend (Neon plan changes, larger computes, longer history, extra branches, AI Gateway
  credits, Vercel/Neon plans, domains).
- Putting any secret (Neon API key, role password, connection string with a password, passphrase, encryption key, pass,
  GitHub token) in code, docs, tests, logs, PR text or a tool result. Fake values only: `napi_FAKE…`, `npg_FAKE…`,
  `postgresql://user:FAKE@localhost/db`.
- Committing real Neon organization, project, branch or endpoint IDs, or real host names (they identify Chris's
  infrastructure; Appliance Desk's own rule).
- Changing anything outside this project: the Appliance Desk repo or its Vercel/Neon projects, the other Robinson
  servers and their databases, Robinson's Toolkit, other Vercel/Neon projects. Reading them for reference is fine.
- Changing what a profiled app owns in Neon (Appliance Desk today), outside a test fixture.
- Widening what a key, a connection or a pass may do by default; editing the protected-resources list from code.
- Making this server depend on Robinson's Toolkit (the hub). It must stay **fully usable on its own** — connector,
  HTTPS API and passes — whether or not the hub ever exists (Chris, 2026-10-10).
- Committing directly to `main`.

## Scope and owner decisions

Build what the current card asks, completely. Other ideas go in `docs/ROADMAP.md` and your report — don't build them
unasked. Owner decisions live in `docs/OWNER-INPUTS.md` with stable IDs (`IN-xx`); check there first and ask only for
what the current card needs. Build what doesn't depend on a missing answer; keep the dependent behavior off.

**Configurable by default.** Limits, thresholds and defaults (spend caps, Neon's price table and its date, SQL row caps
and timeouts, dev-branch expiry and size, wait limits, pass lifetime, rate limits, profile contents) are stored settings
with a sensible starting value, explained in plain words in the tool description or setup page. Money is shown in dollars
and cents; stored in integer cents (unit rates in integer micro-dollars).

## Outcome-first development and continuation (owner directive, 2026-10-12)

**Five substantial PRs is a normal session boundary, never a target that excuses incomplete work.**
At the start of every session, verify current `main`, owned/concurrent PRs, exact-head checks,
unresolved reviews and the latest permanent PR handoff. Follow `docs/SESSION-START.md`
§1a to choose the **highest-priority approved eligible capability**, state the real user/
developer outcome, and list its unmet acceptance conditions. Repair demonstrated CI,
security, correctness or review failures before opening unrelated work. Group coherent
implementation around that outcome; do not manufacture hardening tasks or broaden
permission to achieve an arbitrary PR count. Stop with fewer if required gates prevent
another substantive merge. Existing PR-size, owner and deployment rules still govern.

**A blocker for one capability is not a project-wide blocker (owner correction, 2026-10-12).**
Before calling any operation or acceptance blocked, reproduce/investigate its root cause,
check current code, configuration, provider/API contract, pinned dependencies,
stale docs, CI/reviews and *already-answered* owner inputs, then implement the authorized
fix with real tests. Missing evidence means a concrete evidence-acquisition task,
not permission to speculate or stop. Distinguish fixable defects from genuinely
unavailable third-party permissions, credentials, owner decisions or independent
safety evidence. Keep every unsafe operation fail-closed and its acceptance OPEN,
without weakening protection to manufacture success. A blocker must specify the
attempted remedy, precise missing evidence, owner action if genuinely required,
and a testable re-entry trigger. Review the entire approved work index and
dependency graph for independent eligible implementation immediately; continue the
highest-priority capability rather than ending a session or dumping a continuation
prompt. Reopen deferred work automatically as soon as its condition is met.
An early stop requires documented evidence that all approved alternatives are
ineligible or a concrete execution limit. Five substantial merges are a normal
boundary; count already-merged work in the active session, never redo it or pad
another PR to hit a number. Preserve code, automation, CI, reviews, owner gates,
hosting/spending and scheduled release boundaries throughout.

**Blockers are tracked, never silently skipped.** Record each deferred capability in
`docs/STATUS.md`, reflect status/dependencies in `docs/pr-cards/work-index.json` and
the active card, and include: the *specific blocker*, required external evidence/owner
decision, dependencies, exact re-eligibility trigger and next safe action. Re-check at
session start and immediately after relevant owner input, merge, environment/contract
change or acceptance evidence. Promote resolved items back into the eligible queue,
reconciling answers already recorded in `docs/OWNER-INPUTS.md`; do not re-request them.
If an approved dependency prevents useful independent work, propose the narrowest
dated plan amendment for owner review, **do not treat a proposal as approval**.

**Four distinct evidence levels:** (1) code implemented, (2) meaningful automated
unit/fake-provider/disposable-Postgres tests, (3) deployed behavior on a reviewed exact
commit and environment, (4) required real owner-authorized integration/negative tests.
Track them independently. Green CI, a reference runner, an environment configuration
or a fake provider never proves level (3) or (4). Mark a milestone complete only when
its actual card/design acceptance is satisfied, and leave externally blocked evidence
clearly OPEN while advancing separately approved dependencies.

At batch close, update the existing status/index/cards and leave a permanent handoff
on the last merged PR: verified `main` SHA and checks, achieved capability, four-level
acceptance, actionable blockers, next eligible action and a **compact paste-ready
continuation prompt**. That prompt tells the next agent to verify actual current state,
read these authoritative instructions/hand-off rather than copying every rule,
re-check blockers, implement the next coherent ~five-PR batch under unchanged gates,
and regenerate the same handoff/prompt format. PR count is secondary to real progress.

## How work is organized

- **Approved designs, just-in-time cards.** Implement only approved scope (`docs/designs/BATCH-*.md`, `docs/PLAN.md`).
  The implementing model writes the card for the current unit (and its immediate successor when useful) from the
  approved design and actual code (`docs/pr-cards/README.md`). A missing card means write it, not stop. Production,
  secrets, spend and guards follow the design's contract; if it can't work, propose a dated amendment and get it
  reviewed.
- **Drift and reconciliation** (`docs/implementation-contracts/DRIFT-PROTOCOL.md`): checklist A before each PR, B inside
  each PR written as if it had already merged, C when a batch finishes.
- **PR size:** prefer cohesive 450–800 production lines where justified; hard stop ~800 lines, at most one migration, one risk area. Smaller complete work units are valid.
  (PLAYBOOK Step 3a).
- **Model:** whichever model Chris selected does the work. Sol 5.6 is the routine implementer: light effort for an
  already-tested pattern (a new read tool), medium for the safety layer, guards, SQL, keys, passes, or anything
  unfamiliar. A missing decision is never solved by guessing.
- **Branches:** `ai/<tool>/<topic>` from current `main`, or from the unmerged predecessor's branch when stacking.
- **Use the web** for current Neon facts (API reference, changelog, pricing, limits) and MCP spec details; cite them in
  the PR.

## Verify, push, review, merge (details: PLAYBOOK Steps 4–9)

- **Before pushing:** `npm run check` (secret scan, docs check, index validation, lint, write-safety check, core-import
  check, token budgets) and the card's targeted tests. Never `--no-verify`.
- **One push per CI cycle.** After a red run, read all failures, reproduce locally, fix them all, push once. "Flake" is
  not a cause; never skip, weaken or quarantine a test.
- **Both GitHub Actions `ci` and `release-policy` are required merge gates**, green on the exact PR head targeting `main`. The application CI's check/unit/db jobs remain mandatory. Never bypass protection.
- **Review:** read `docs/AI-PR-READ-FIRST.md` for anything touching production, SQL, secrets, keys, guards, spend, auth or
  passes, and record how each applicable constraint is honored. **This repo has no automated review** (IN-01, Chris, 2026-10-10): never wait for or request one. Before merging,
  inspect the whole diff yourself against AI-PR-READ-FIRST and write "Self-review: <findings and dispositions>" in the PR;
  fix blocking findings (security, production data, secrets, spend, contract, acceptance) in one patch. If an
  organization-wide automated reviewer posts anyway, fix or answer each of its threads and resolve them; never wait for
  one. Never claim a review that didn't run. Phase-gate reviews (end of a batch, DRIFT-PROTOCOL C) may use a second
  model on request.
- **Merging (authorized by Chris):** `ci` and `release-policy` green at the exact head, acceptance met with evidence, reviews handled → merge
  with the expected-head SHA. Stacks merge bottom-up, retargeting each PR to `main` first. Merging never covers a hard
  limit.
- **Security or data-safety hole already on `main`:** fix it immediately in its own PR.

## Where the rules live (one source of truth each)

| Topic | File |
|---|---|
| Starting a card session; resume note | `docs/SESSION-START.md` |
| Step-by-step procedure and testing | `docs/PLAYBOOK.md` |
| Every tool: name, purpose, flags, audience, profile | `docs/TOOL-CATALOG.md` |
| Project profiles (what each app needs from Neon) | `docs/APP-NEEDS-APPLIANCE-DESK.md` (first profile), `docs/designs/BATCH-P.md` |
| Runtime facts (env vars, tables, infra) as built | `docs/ARCHITECTURE.md` |
| Remaining acceptance | `docs/PLAN.md` |
| Approved designs (how) | `docs/designs/BATCH-*.md` |
| Exactly what one PR builds | `docs/pr-cards/<ID>.md` (wins over the design where they differ) |
| Current state and next item | `docs/STATUS.md`, `docs/MASTER-ROADMAP.md`, `docs/pr-cards/work-index.json` |
| Owner decisions | `docs/OWNER-INPUTS.md` |
| Dated decisions and reasons | `docs/DECISIONS.md` |
| Ideas not being built | `docs/ROADMAP.md` |
| Go-live switches | `docs/GO-LIVE-CHECKLIST.md` |
| What Chris can ask for | `docs/OWNER-GUIDE.md` |
| Production/secret/spend constraints for PRs | `docs/AI-PR-READ-FIRST.md` |
| The contract every Robinson server follows | `Robinson-AI-Systems/robinsons-toolkit-hub` `docs/CONTRACT.md` (RTC 1) |
| Research: Neon API, old toolkit, official connector | `docs/audits/2026-10-10-research.md` |
| Retired documents (reference only) | `docs/archive/` |

## Engineering rules for every change

- **Code and tests change together.** Every write tool is built with `defineWrite` and passes the write-contract helper
  through every door this server has (MCP, `neon_call`, HTTPS API). Contract-generic code lives in `src/core/` and
  imports nothing Neon-specific, so the hub can extract it into `robinson-mcp-core`.
- **Neon only through `src/neon/client.js`** (official `@neon/sdk`, exact version, `raw` layer, the client's retry and
  budget policy). Never hand-build request URLs; never move the vendored API description outside its own card.
- **SQL only through `src/neon/sql-run.js`** (the SQL guard, B-3). Identifiers quoted by `quoteIdent`, values as bind
  parameters; never string-concatenated SQL. No tool runs SQL against this server's own database or a protected resource.
- **"Production" is decided only by `classifyTarget`** (B-2), from Neon's own data — never from names or arguments.
- **Money is integer cents** (rates in integer micro-dollars); shown with `_display` dollars. **Times stored UTC, shown
  America/Denver.**
- **No secret ever returned:** role passwords, connection strings with passwords, API keys, credentials, presigned URLs,
  passes. Secrets reach a person only on the one-time-secret page; secrets a tool needs are typed on the setup page.
- **Small results:** every read tool takes `fields` and `detail`; nothing over 8 KB returned without a handle; listing
  descriptions ≤160 characters (`docs/designs/BATCH-C.md`).
- **Database changes are additive** (`IF NOT EXISTS`); previews of this server share its production database.

## CI

The repository may be public: anything committed is public forever. CI runs on every PR: secret scan, docs check,
index validation, lint, unit tests (fake Neon), database tests on throwaway Postgres, token budgets. `.github/workflows/ci.yml`
keeps `permissions: contents: read`, uses no repository secrets, never `pull_request_target`, never echoes environment
values, and never calls Neon. Never commit Neon/Vercel IDs, host names or URLs with credentials.

## How to run things

```bash
npm ci
npm run check                                   # quick gate: secrets, docs, index, lint, write-safety, core imports, budgets
npx vitest run tests/unit/<file>.test.js        # one unit file (fake Neon)
npm run test:db -- tests/db/<file>.test.js      # throwaway localhost Postgres (scripts/local-postgres-test.sh)
node scripts/openapi-find.mjs "create branch"   # look an operation up in the vendored description (A-4)
python3 docs/pr-cards/validate-index.py
```

## Ending a session

1. `docs/STATUS.md`: merged, in progress (branch, PR, head SHA, CI run), blocked and why, next.
2. `docs/DECISIONS.md` entry for any design decision; `docs/ROADMAP.md` for out-of-scope finds;
   `docs/GO-LIVE-CHECKLIST.md` for any new switch, key or owner step.
3. Report to Chris in plain English: what changed, how it was verified, what he needs to decide (`IN-xx`), what is next.

## Daily release and build-cost policy (owner, 2026-10-12)

PRs target `main`. Follow [the daily release policy](.github/RELEASE-POLICY.md): only the daily scheduled job updates `live`; Vercel builds only `live`. Do not request or wait for a Vercel preview deployment, manually deploy production, or promote at a development batch boundary. Keep all existing local/Actions tests mandatory; this policy introduces no new application build/browser requirement where none existed. This newer owner instruction supersedes older batch/weekly release guidance.

## Verified hosting and main protections — October 12, 2026

Follow [the verified hosting-cost operating policy](docs/HOSTING-COST-POLICY.md). Saved exact-main protection requires GitHub Actions `ci` **and** `release-policy`; preserve existing self-review, daily checked `main` → `live`, disabled automatic previews, low compute caps and all owner approval gates. Do not wait for Vercel preview checks or manually deploy at a PR-batch boundary. Verify latest `main` before using prepared branches. Keep Cortiware deferred and production access disabled.
