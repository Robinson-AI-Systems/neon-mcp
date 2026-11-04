### 2026-11-04 — CAP-1 continuation after merged PRs #204–#206

Existing draft #203 was brought forward from last verified green
head `b6de963f90711f06f2ab24ae3a4852070c966a7a` to actual
merged `main` `3fe41498633cbe4f16044d10a9cb6b350814148d`
by no-conflict native feature-branch merge
`85a428613bc17d388811e357fcdb4c844ab8ece6`.
Preserve merged fleet compliance docs (#204), public identity
(#205) and CI shard layout (#206). Under the frozen original
CAP-1 plan, finish runtime routing of 17 official SDK names
through exact installed case aliases; 14 still absent raw methods
remain denied. Source-only and live acceptance are distinct;
no CG gate or original whole-card completion credit yet.

### 2026-11-03 late — CAP-1 raw SDK case-alias interoperability (draft #203)

The first full test run exposed six regressions because the initial
194-name guard excluded installed raw SDK exports with acronym-casing
differences (for example `getConnectionUri` versus published
`getConnectionURI`). A direct audit of the installed `@neon/sdk/raw`
7.0.1 exposed 23 function names outside the canonical published
operation IDs: 3 SDK client helpers and **20 actual case-only API aliases**.
The corrected method guard now protects **214 runtime spellings**
representing the **same 194 unique source operations**. The 20 aliases
are exactly 12 writes and 8 reads. The checked generator discovers
each unlisted alias, verifies one unambiguous canonical operation, and
actually executes the installed SDK wrapper against a fake transport
to assert the *exact canonical HTTP method and path* before allowing
that spelling. Unknown exports fail the check instead of being silently
authorized.

All 94 canonical raw-SDK mutations and 12 installed alias mutations
reject omitted/false write intent or missing request keys before rate
budget or HTTP. Existing connection-info read tests are restored.
The 31 canonical-name missing generic routes remain separately
reported: an available differently cased spelling is **not**
independent evidence of a generic canonical handler or live provider
permission. The result is source interoperability and fail-closed
engineering only; CAP-1 original completion, real Neon provider rights
and all CG acceptance remain OPEN.

### 2026-11-03 late — CAP-1 pinned operation method write guard (draft PR #203)

The common Neon SDK `call()` wrapper previously accepted an omitted
`write` option for mutating raw SDK operations; synthetic calls to
`createProject` and `updateProject` ran successfully without
an idempotency/request key. The source now uses
`src/neon/operation-methods.js` to check the exact HTTP method for
**194** uniquely pinned control-plane operations (163 vendored plus
31 newer official SDK method/path gaps, deduplicated). The checked
offline generator `scripts/verify-neon-method-guards.mjs` rebuilds
that table from the independently source-verified CAP-1 inventory and
is part of `npm run check`; mismatched, unknown and duplicated
method metadata fail before a provider request.

The production `call()` entrypoint independently requires the
literal `write:true` for every non-GET operation, then the existing
nonempty request key and non-replay behavior. It does not trust an
omitted or false caller classification and does not authorize a
previously unsupported SDK operation. Tests cover **all 94**
mutating raw-export methods: omitted/false write flags and missing
request keys are rejected before **any** rate-budget consumption or
fake provider HTTP. Additional negative cases exercise inherited and
unknown operation identifiers. The 159 raw exports, four explicitly
guarded fallback routes and 31 generic unsupported operations retain
their separate source/proof states.

These are source and injected-client safety checks, not a new real
provider credential, product permission, customer release, deployed
runtime acceptance or full CAP-1 completion. No Neon provider or
production database was contacted. Original frozen CAP-1 criteria,
source-versus-live evidence and CG-1–CG-6 remain OPEN.

### 2026-11-03 evening — CAP-1 shared API budget admission source fix (draft #203)

In-process actual SDK client tests exposed a missing-admission
and truthy-string bypass in the shared durable API budget. Both
the database adapter and common wrapper now accept only explicit
boolean admission, fail closed before any provider HTTP on
malformed/unavailable ledger responses, and keep genuine 429
distinct from generic storage-fault 503. The existing PostgreSQL
concurrent budget counter and user permission/spend safeguards
remain unchanged. This advances existing CAP-1 criterion 4
without declaring authorization, live/provider or original-card
acceptance complete.

### 2026-11-03 evening — CAP-1 shared client uncertain-write recovery safety fix (draft #203)

A reproducible fake provider failure showed that `call()` could
confirm a failed project update by reusing a matching annotation
from an unrelated branch. Restrict branch-annotation recovery to
`createProjectBranch`; every other ambiguous write remains
unconfirmed, pending owner/provider readback by its real
operation-specific policy, and is not replayed. Targeted
regressions verify cross-operation refusal and intended branch
recovery. This is real shared-client source safety engineering
against original CAP-1 criterion 4, but does not complete per-operation
permissions, independent readback or any CG gate.

### 2026-11-03 evening — CAP-1 installed raw SDK simulated denial/replay proof (draft #203)

The CAP-1 checked synthetic method/path artifact now independently
exercises one-call sanitized 403 denials on 159 installed raw wrapper
operations and ambiguous HTTP 503 on 94 write operations without
mutation replay. Counts remain explicitly *in-process fake SDK*
evidence, not actual credential authority, provider behavior,
per-registered-tool policy/readback or real-client acceptance. CAP-1
and all downstream dependent CAP-2/CAP-3/CG completion remain open,
with no new subsection or source-to-live credit. This extension is
under the existing original frozen CAP-1 plan.

### 2026-11-03 — synthetic runtime-checkable installed SDK call paths (draft #203)

CAP-1's source inventory now has a deterministic **real wrapper
executed against fake HTTP** supplement: 159 raw SDK operations
called via the installed SDK with exact captured method/path and a
single fake budget, 4 source-declared fallback stubs invoked, and
31 missing generic SDK dispatch calls denied before requests. The
15 advanced product-interface records are not treated as generic
control-plane operations. Re-run `npm run check` to compare
`docs/capabilities/sdk-runtime-dispatch.json`. These do NOT
establish credential authority, real protective guards, response
shape or actual Neon permission, and no original CAP-1 or CG
completion credit is granted. Draft #203 remains source-only.

### 2026-11-03 — CAP-1 declared wire/request/response evidence (draft #203)

The source inventory now pins all 163 runtime-vendored method contracts
and 193 official SDK contracts to their full OpenAPI source, with
source checked parameters, required request bodies, statuses, response
schemas and declared authentication schemes. **17** common operations
differ in declared wire details and are individually enumerated in the
generated gap report. This is a CAP-1 original prerequisite engineering
advance, not completion credit or a production runtime SDK upgrade.
The separate advanced-host sources and independently accepted client,
provider authorization, guard and readback tests still need work.
Draft #202 remains an independent R-2 effort; main/live remains at
merged #201 until independently verified otherwise.

### 2026-11-03 CAP-1 installed SDK feasibility checkpoint — draft #203

The checked-in source-only inventory now independently matches the actual
installed `@neon/sdk/raw` 7.0.1 exports and parsed guarded fallback routes:
194 distinct control-plane operations, 159 callable raw exports, 4
fallback-only declarations, and 31 lacking a generic SDK dispatch path.
The 31 are explicit implementation/proof gaps, not real provider denials.
No CAP-1 original criterion or subsequent CAP-2/CAP-3/CG acceptance is
closed. Existing CAP-1 frozen plan and #201 merged main/live baseline
remain authoritative; draft #203 is still unmerged and unreleased.

### 2026-11-03 CAP-1 source evidence refinement — draft #203, not merged

Corrected an operation-to-handler attribution false positive in the original
CAP-1 draft by parsing actual provider call sites, recording path/line and
attributing only the enclosing registered handler. Shared helpers and
self-referential inventory tests no longer inflate evidence. The 209-row
source inventory now records 44 parsed-source candidates, 19 with direct
handler attribution and 25 unassigned helper references; none are verified
executions. CAP-1 and downstream CAP-2/3 remain IN_PROGRESS/unstarted,
respectively, and every CG gate stays OPEN. Merge/release status remains
separate from the unchanged PR #201 main/live baseline.


### 2026-11-03 authoritative merged-tree documentation baseline

Read-only Vercel project/deployment/alias records subsequently verified
a READY production deployment on the same exact merged main/live SHA
69c46b71b6ab35e483f42338618146d1a377d074; the prior commit-null
uncertainty for this particular deployment is resolved. Direct native
client/Neon provider acceptance remains unverified.


Latest independently checked remote \`main\` and \`live\`:
\`69c46b71b6ab35e483f42338618146d1a377d074\`, merged Neon PR
**#201** (custom GitHub native Git + Playground and Vercel fast-path process
maintenance), after PR **#200** (RAS D-001 design adoption). Neither
completed an original engineering subsection or any CG gate. Unmerged
drafts **#202** (R-2 staged client/RTC implementation) and **#203**
(CAP-1 partial source inventory) have separate branch/CI status and must
not be represented as merged source. Current serving SHA, independent
native-client and provider acceptance remain unverified. Start all subsequent
work by reconciling the last actual merged PR and documentation as specified
in SESSION-START §0; refresh affected documentation as the implementation
evolves and after verified merges.


### 2026-11-03 CAP-1 source inventory implementation (partial original unit)

A separate approved CAP-1 plan was frozen at native-Git commit
50342cc66d5b698334b6952c7f1e0f431eb7c7af. Source-stage inventory and
tests now cross-check pinned Neon control-plane operations, separately documented
newer product workflows, registered-tool reference candidates, credential
unknowns, and truthful source/live evidence. See the original CAP-1 card and
generated docs/capabilities/CAP-1-REPORT.md. The full current-provider
operation/credential proof is still pending. This milestone adds **zero**
completed roadmap items; CAP-2/CAP-3 remain dependent. Draft PR #202 / R-2
is unaffected.


The subsequent source-only reference comparison in draft PR #203 checks
Neon's official SDK OpenAPI revision
167229f949438fb942809b72dd410888c70943a9 with 193 operations
against the existing runtime's 163, locating 31 SDK-only and one
pinned-only methods (162 shared signatures). These are explicit
unimplemented/unverified CAP-1 operation rows, mapped in the generated
gap report and a 193-signature reference file. This does NOT re-vendor
the runtime spec, complete CAP-1/CAP-2/CAP-3, merge PR #203, deploy
a release or grant live provider permissions.


### Current development execution route — custom GitHub native Git + Playground and Vercel (2026-11-02)

The owner directed every Neon implementing agent to use the [custom-connector native workflow](runbooks/CUSTOM-GITHUB-VERCEL-FAST-PATH.md): persistent Git clone/workspace with attached isolated runtime for full original-card implementation and tests; single SHA-pinned Playground checks; GitHub exact-head PR/CI/merge; and Vercel project/deployment/alias read-only evidence. Unlike the old REST fallback, this route has actual executable commands and local disposable-Postgres capability **when attached and verified**. If capacity/attachment fails, use count-checked atomic GitHub commits plus mandatory Actions DB/CI, not invented local passes. This changes **execution efficiency, not roadmap order, accepted subsection count, release policy, source/live proof, or owner permissions**.

### Server release provenance for connected coding agents — 2026-11-02 design

The RAS Standard now adopts the GitHub MCP VER-1 pattern: `initialize.serverInfo.version` and `neon_whoami.server_release` tell agents the current deployed version and SHA, with safe current-release change-history directions. Design lives in [the adoption crosswalk](designs/RAS-MCP-D001-ADOPTION.md). Implement within A-3/A-7/R-2/O-4 and verify via CG-1/4/5 and checked released source, not from main's latest commit. Keep missing SHA visibly unknown. Documentation alone grants no implementation credit.



### Developer-only sign-in/grants must not bleed into customer sign-in

The 2026-11-02 owner clarification places developer sign-in and test-grant creation behind separately authenticated **backend developer-only** access, never the public user login, public client onboarding or customer-facing menus. Existing `/api/developer/connect` is a real *mobile OAuth handoff* and must be inventoried and given a customer-appropriate route before `/api/developer/*` is locked down; avoid breaking legitimate mobile clients. Handle through existing A-3 / CAP-2/3/5 / R-2 and CG-1/2/6, not a new invented subsection. No code or access policy is switched by this roadmap note.



## RAS MCP Standard D-001 alignment — design accepted for implementation planning, 2026-11-02

See [the design crosswalk](designs/RAS-MCP-D001-ADOPTION.md) and [adoption acceptance plan](audits/2026-11-02-ras-standard-adoption-plan.md). The living Standard is in Library D-001; RTC 2 is the frozen, adopted discovery/connection wire specification. These **do not** add a new product bundle, rearrange the original D/V/O/P/W/U/R/E/X priority or mark any card complete.

Implementation owners: A-3/A-7 for native client/public+confidential PKCE, protected client setup, canonical branded issuer and pages; B/O/C for scoped write confirmation, retention/journaling, two-store parity, health posture, bounded lazy listing and result storage; R-1/R-2/R-3 for exact RTC 2 pass/HTTPS manifest/cursor/content-page, cross-door guard and fixture-backed conformance; X-2/X-3 and CG-1..CG-6 for genuine client/provider/source-vs-deployment/release and nine-section RAS production readiness. Existing CAP-1..CAP-5 preserve full user-owned provider authority, not implementation-agent developer restrictions. External website `/tools` publication and fleet watcher remain owned by their respective repositories; this repo supplies truthful manifest/health and page proof. No live Hub integration required for Neon completion.

**Status now:** design-only; current RTC 1 and OAuth source remain as built. Neon Unleashed name/Coral accent/slug are already claimed in Library D-005; canonical branded issuer is a **target**, not verified live. Migration to it requires separate release/owner timing and protection for old connections; public/paid operation remains separately gated.


**Owner-approved D-4 update (IN-16):** Confirmed role retirement is now implemented with exact one-use consent, dependency checks and explicit unknown-pooled-client interruption acknowledgement. Known application migration evidence and actual checked-deployment/provider/idle-pool acceptance remain OPEN; do not treat historical unregistered notes below as a current implementation blocker. D-5 remains independently approved.

## Maximum legitimate authority — owner-approved 2026-10-21

[MAXIMUM-AUTHORITY](designs/MAXIMUM-AUTHORITY.md) adds five indexed APPROVED,
NOT IMPLEMENTED units CAP-1..CAP-5: operation inventory; ordinary fullest authority;
secure additional credential lifecycle; advanced functional gaps; independent proof.
Existing acceptance and unfinished original cards retain priority. Named-tool counts
do not establish provider API coverage. No runtime grant or release change is implied.


# MASTER ROADMAP — the one handoff

## Gateway dependency correction — 2026-10-12

RTC interface work and authorized nonproduction Hub route acceptance are independent of K-3 package adoption.
Follow current STATUS/index and service isolation/owner gates. Optional reuse must not block provider capability
or require replacing service-owned dispatch/state. Hub's H-1–H-3 work belongs in its repository.

Written 2026-10-10 for an empty repository. [STATUS](STATUS.md) holds current state; [PLAN](PLAN.md) holds acceptance.

## What is next

**Current checked deployment checkpoint (2026-11-01):** `main` and `live` both contain merged PRs #189–#197 at `1c810cb0ca69fffc9be088d4c8e9834d2dd7d720`; Vercel Production reports that exact commit READY. Auth/registration/revocation source fixes (#193/#194) and original completion gate plan (#191) have merged, but independent direct desktop/mobile/provider and tenant acceptance still remain OPEN. RTC 2 was adopted on October 31 as a contract decision only (#197), with server conformance work still pending. The prior October 19 statement that `live` lagged `main` is historical; inspect deployed SHA at every session. The five approved CAP-1–CAP-5 cards and six noncountable CG overlays remain unfinished alongside original D/V/O/P/W/U/R/E/X work.

**Next engineering and acceptance:** Reconcile and execute all eligible deployed queue rows from STATUS, particularly previously approved scratch classification/guarded write evidence; advance still-IN_PROGRESS original D/V/O cards by genuine whole outcomes; proceed through the remaining P/W/U/R/E/X cards in the index. Real **native desktop/mobile direct MCP**, multi-user identity/isolation, user-owned delegated permissions, full RTC 1 provider-side conformance and independently proved provider operations must not be lost behind hand-built tool milestones. Their six explicit noncountable completion gates are in [COMPLETION-GATES.md](COMPLETION-GATES.md); [PLAN](PLAN.md) makes them acceptance requirements. Hub registration/relay is Hub-owned, not a Neon completion criterion. Public distribution is separately gated and not approved.

**Historical roadmap notes:** Earlier D-8-read-only, D-4-unregistered and D-5-blocked descriptions have been superseded by later code/cards and owner decisions IN-15/IN-16; review current work-index/card/STATUS rather than reusing them as present facts. Do not mark unfinished cards merged to improve counts, or interpret a READY deployment or adapter success as direct-MCP acceptance.

## Order and why

| Stage | Batches | Why in this place | Owner gate |
|---|---|---|---|
| 1 Foundation | A | Nothing works without it (A-1 merged) | IN-02/IN-03/IN-04 only before A-5 is tried for real |
| 2 Safety | B → C | Every later tool is built on the safety layer (production, SQL and spend guards) and the context rules | IN-07 (protected resources list), IN-09 (production reads), IN-10 (spend caps) — mechanisms build without them |
| 3 Everyday Neon and building | D → V | The everyday jobs (projects, branches, computes, SQL, schema, snapshots, security), then the developer tools that make building any project on Neon fast (throwaway branches, seeds, checkpoints, migration previews, masked copies, cleanup) | IN-12 (dev branch defaults) |
| 4 Owning the account | O | Members, keys, usage in dollars, spending alert, the admin overview and every console setting as a guided step | IN-04 (organization key, only to use these for real) |
| 5 Projects | P → W | Optional project profiles (Appliance Desk is the first example) and the one-sentence jobs | IN-13 (Appliance Desk profile details, only to use it for real) |
| 6 Everything else | U → R | Universal access to every other Neon operation; the contract doors Robinson's Toolkit uses | IN-11 (pass rate limit) |
| 7 Later | E → X | Neon's new backend services (the universal tools reach them meanwhile); undo, real-account checks close out | IN-05, IN-06 |
| Production | GO-LIVE-CHECKLIST | Only after Chris enables production access per organization | IN-08 |

## Implementing agent — paste this

> Read `docs/SESSION-START.md`, STATUS and the next card (plus its resume note `docs/pr-cards/<ID>.progress.md` if
> present). Find the cited design headings and named code/tests in bounded sections. Run the drift protocol checklist A
> against latest main. If no card exists, write one short card from the approved design (`docs/pr-cards/README.md`) with
> exact current paths, production/secret/spend/guard boundaries, meaningful tests and completion evidence. Routine
> details are yours to implement; a missing production, security, spend or schema decision needs a reviewed amendment,
> not a guess. Implement a coherent unit, run the targeted checks, push once. While checks run, implement only the
> eligible immediate successor. Fix blocking findings in one patch, refresh exact-head gates, merge when authorized and
> green. Update the card, STATUS and `work-index.json` as if merged. Plan around the accepted capability,
> not the number of PRs; finish the normal five-substantive-merge session at its boundary,
> or earlier for a true safety/dependency gate or project completion. Leave a permanent
> PR handoff and a concise continuation prompt using SESSION-START §1a; never claim
> deployed or live acceptance based on mocks or CI.

## Work coverage

`docs/pr-cards/work-index.json` is the machine-readable list of the ORIGINAL roadmap subsections (`python3 docs/pr-cards/validate-index.py`); the noncountable [cross-cutting completion gates](COMPLETION-GATES.md) supplement those cards, not replace or inflate them. **JIT** =
covered by the design; write the card when its predecessor is real.

| Batch | Cards | Card status |
|---|---|---|
| A Foundation | A-1 repo, CI, fake Neon, checks · A-2 schema · A-3 login · A-4 Neon client + vendored description + waiter + budget · A-5 key store, setup page, one-time secrets · A-6 SQL connection layer · A-7 DEPLOY.md | A-1 MERGED (#1), A-2 MERGED (#7), A-3 MERGED (#8/#9), A-4 MERGED (#10/#11), A-5 MERGED (#12/#13/#14), A-6 MERGED (#15), A-7 MERGED (#16) |
| B Trust | B-1 safety layer · B-2 production guard + self-protection · B-3 SQL guard · B-4 spend guard · B-5 errors · B-6 shaping, secrets, profiles · B-7 check-writes · B-8 server tools | B-1 MERGED (#17), remainder JIT |
| C Context | C-1 small results · C-2 listing modes + budgets | JIT |
| D Neon core | D-1 projects/operations · D-2 branches · D-3 computes · D-4 databases/roles/connections · D-5 SQL · D-6 schema/health · D-7 snapshots · D-8 project security · D-9 data checks/reindex | JIT |
| V Developer tools | V-1 dev branches, runs, cleanup · V-2 seeds · V-3 reset, checkpoints, migration preview · V-4 masked copies, tuning, integration check | JIT |
| O Owner and administration | O-1 organizations, members, access · O-2 keys, transfers · O-3 usage, estimates, spending alert · O-4 admin overview, guided settings, map, security review, activity | JIT |
| P Project profiles | P-1 known_apps + Appliance Desk + app guard · P-2 readiness · P-3 project setup + draft profile | JIT |
| W Workflows | W-1 … W-7 (`designs/BATCH-W.md` §4 table) | JIT |
| U Universal | U-1 | JIT |
| R Hub-ready doors (RTC 1) | R-1 passes · R-2 HTTPS API, manifest, OpenAPI, rate limits · R-3 conformance in CI | JIT |
| E Neon backend services | E-1 Auth + Data API · E-2 storage, Functions, triggers, logs | JIT |
| X Close-out | X-1 undo · X-2 read-only smoke · X-3 scratch-project write check | JIT |
