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
