# 2026-11-01 — Code/documentation truth and repository housekeeping plan

Status: IN_PROGRESS; documentation and release-state reconciliation, not an original countable product subsection. Owner explicitly requested auditing documentation against current code, completing recoverable agent work, updating source-of-truth docs and cleaning Git. Branch: `ai/gpt6/doc-code-audit-20261101`; baseline main/live `1c810cb0ca69fffc9be088d4c8e9834d2dd7d720`; verified Vercel READY production from this SHA (`dpl_9Mwm4LGqpQajD4cSD9DrnmuWgj4U`). No open Neon MCP PR at session start. Original 53 cards and added CAP-1..CAP-5 remain separate; no engineering acceptance is invented.

## Frozen acceptance criteria (before any documentation change)

- [ ] Scan all active owner, architecture, roadmap, status, deployment, connection and acceptance documentation against actual route/tool/OAuth/config sources and current release. Record exact mismatches, distinguish historical dated notes from current claims, and correct current instructions, counts and labels without rewriting historical evidence.
- [ ] Current documentation and agent entrypoints must not call the October 19 `live` SHA current, call `main` ahead of `live`, call October 21 source PRs unmerged, or describe RTC 1 as the newly adopted normative contract after October 31 RTC 2 adoption. Current runtime RTC conformance remains explicitly *unproven* and must not be falsely upgraded.
- [ ] Reconcile existing outstanding PR work; ensure no open PRs silently ignored and no unmerged source work discarded. Record exact previous branch refs and compare ancestry. Delete only clearly fully merged, owner-safe remote head branches with no unmerged work; preserve diverged/archive/other agent work pending explicit verification, and do not touch `main`, `live`, production data, provider keys or unrelated repositories.
- [ ] Distinguish code implemented, local tests, exact PR CI, published READY source, real custom direct desktop/mobile use, provider reads/writes, scratch owner acceptance and six CG + five CAP unfinished requirements. Do not count documentation as full cards.
- [ ] Add a reproducible documentation-source drift check or test for the most material facts where feasible; run focused diagnostics and full `npm run check`, `npm test`, disposable PG/RTC suites using this isolated Playground or exact-head GitHub CI. No overlapping shared database tests; no weakened tests.
- [ ] Use native custom Git workspace for branching, committing and pushing; self-review full diff; exact-head CI and release-policy must be green before any merge, with review threads addressed. Scheduled checked `main`→`live` promotion only.

## Evidence and scope boundaries

Open Neon MCP PRs at session start: none (including previously open #191, now merged). Main/latest READY Vercel SHA `1c810cb0ca69fffc9be088d4c8e9834d2dd7d720`. Existing Git branches `docs/hub-contract-reference-20261019` and `docs/neon-hub-completion-boundary-20261019` have zero ahead of `main`; multiple older `ai/gpt6` and archive branches diverge and need preserved unique-history review. The currently adopted RTC 2 is an owner decision only: `docs/HUB-COMPATIBILITY.md` explicitly states no server code/conformance change from PR #197. Production service is not automatic product acceptance. No hidden provider operations, paid changes, new provider creds or irreversible tenant migrations authorized here.


## Observed findings and performed reconciliation

- Inventory: 96 active Markdown documents (97 including the archived document) were scanned for stale deploy SHA, source-only claims, RTC dialect statements, missing registered tools and inaccurate infrastructure setup; actual `api/` route filenames and code owners were inspected. The original roadmap has 58 cards (20 MERGED, 12 IN_PROGRESS, 21 PLANNED, 5 APPROVED); all six cross-cutting CG gates remain OPEN. Original CAP-1..CAP-5 are APPROVED but not implemented.
- Source-versus-doc anchor: `api/mcp.js`, `api/oauth/revoke.js`, `src/core/oauth-revocation.js`, `api/rtc.js`, `api/contract.js` and `api/openapi.json.js` exist. The old START-HERE `api/tools/*` path did not exist and was replaced with the actual RTC and OAuth route map. Current merged OAuth work #193/#194 is included in the checked READY deployment but independent clients/provider grants remain unaccepted.
- Corrected current README, STATUS, MASTER-ROADMAP, DEPLOY, GO-LIVE-CHECKLIST and ARCHITECTURE: they no longer present October 19 live lag as current. Latest independently observed Production was READY at exact Git `main`/`live` `1c810cb0ca69fffc9be088d4c8e9834d2dd7d720` before this PR. Older dated source and acceptance entries remain historical, not silently rewritten.
- Documented RTC 2 as the October 31 **adopted** normative successor, not implemented runtime behavior: froze RTC 1 implementation continues pending R-card engineering and independently accepted RTC 2 conformance. Kept Hub LIVE integration nonblocking for standalone service.
- Corrected the owner guide's O-1 source-only conditional, D-8 release heading, snapshot catalog availability and TOOL-CATALOG's implemented/178-planned distinction. The source-checked profile counts remain read_only 50, everyday 58, full 122; check-budgets protects the exact catalog-heading grammar.
- Added `scripts/check-doc-code-truth.mjs` plus tests and integrated them with normal `npm run check` / `check:session`. The check fails on missing actual route files, stale active route descriptions, stale roadmap count, missing CG/CAP coverage and RTC 2 prematurely reported as implemented.
- Reviewed all old remote branch tips with comparisons against main. Two obsolete documentation branches, `docs/hub-contract-reference-20261019` and `docs/neon-hub-completion-boundary-20261019`, were each zero-ahead and independently verified absent after safe native-Git remote deletion. Diverged O-1, O-2, V-2/3/4, policy and archive branches have unique commits; preserve them pending source-by-source reconciliation. The housekeeping archive explicitly says never to merge it.
- No open PR was found at session start (including merged #191–#197); no other agent's active PR or red CI was left in progress. This scan did **not** claim all unfinished feature cards, user migrations or live acceptance passed. No credential, provider mutation, production data, spend, release branch promotion or outside repo was touched.

## Local verification (isolated custom GitHub Playground)

- `npm ci --ignore-scripts --no-audit --no-fund` — PASS from checked lockfile.
- `npm run check` — PASS after correcting one exact TOOL-CATALOG heading that the existing validator requires; all write-policy, secrets, documentation, lint, budget, developer-evidence and session guards intact. The validator reported 131 guarded tools and profiles 50 / 58 / 122.
- `npm test` — PASS with exit code 0 (fake/provider unit suite).
- `npm run test:db` — PASS with exit code 0 in a single non-overlapping disposable PostgreSQL run.
- Exact PR-head `ci`, `release-policy`, review and merge remain independently required. No READY deployment of this audit PR or live provider acceptance claimed.

## Unfinished engineering and real-world work

- 38 not-yet-MERGED indexed cards (12 in progress, 21 planned and five approved CAP units); no source-only partial card promoted for this documentation work.
- CG-1..CG-6 all OPEN: independently tested desktop/mobile direct MCP, principal/tenant lifecycle, end-user-owned authority, full provider-side RTC 2 transition/conformance, released custom Neon provider reads/writes and approved scratch cleanup, and explicit public security/distribution criteria. RTC 1 source availability is not an RTC 2 PASS.
- The STATUS release acceptance queue and original IN-07/08/11/12/13/17 owner gates must be re-evaluated from their original evidence, without demanding the owner repeat previously approved IN-06 scratch enrollment. Public onboarding, production activation and payments remain OFF.
- Historical divergent branches are retained because ahead/behind graph comparison cannot establish content parity. Inspect by original card/PR before cherry-picking or deleting; do not merge the `archive/housekeeping-2026-10-13` branch.
