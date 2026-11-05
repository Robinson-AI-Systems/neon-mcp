# Completion schedule — Neon Unleashed by Robinson AI Systems

**Reconciled:** 2026-11-04 (fleet audit, per-repo worker)
**Code and release baseline:** `69c46b71b6ab35e483f42338618146d1a377d074` (`main` = `live`, read back 2026-11-04)
**Product verdict:** **not finished yet.** Neon Unleashed by Robinson AI Systems is a
deployed, working standalone MCP service with a large guarded tool registry and a
live OAuth sign-in surface. It is not yet the finished fleet product: the branded
identity is not cut over, the public front door still carries the pre-rename name,
there is no health endpoint and no public connection page, and the repo's own six
cross-cutting completion gates (CG-1…CG-6 in [COMPLETION-GATES](COMPLETION-GATES.md))
and CAP-1…CAP-5 program remain open.

This file is the server's RAS MCP Standard conformance record (17 rows, re-baselined
to the Standard at Library f134c849, including the capability-completeness,
conformance-correction and owner-obedience amendments of 2026-11-03). Rows close
only on live evidence at a checked release — never on source inspection alone.
When a short summary elsewhere in this repository conflicts with this schedule
about *what remains*, this file wins until a newer dated reconciliation replaces it.

## How completion is counted

1. **Source** — designed, implemented, tested in the repository, and merged.
2. **Deployed** — included in the checked `live` release and serving.
3. **Verified live** — actually exercised against that deployed release.
4. **Provider accepted** — a real Neon workflow produced the required result or
   denial and an independent read-back.
5. **Production ready** — the RAS MCP Standard readiness gate has passed with
   evidence and any degraded check declared degraded.
6. **Owner authorized** — Chris has separately authorized the relevant public
   launch, identity cutover, or per-account production activation.

## Verified baseline at the reconciliation

Checked directly against the repository (via GitHub Unleashed by Robinson AI
Systems) and the live service on 2026-11-04:

| Fact | Checked state |
|---|---|
| Repository | `Robinson-AI-Systems/neon-mcp`; `main` and `live` both at `69c46b71b6ab35e483f42338618146d1a377d074`. Production branch is `live` (only `live` is deployment-enabled in `vercel.json`). |
| Package/runtime | `@robinson-ai-systems/neon-mcp` version `0.1.0`; ECMAScript modules; Node engine `24.x`; MCP SDK `1.32.1`, Neon SDK `7.0.1`. |
| Tool registry | **131 tools registered** in the live readout and in code: `api/index.js` returns `registry.tools.length`, where the registry is built by `mergeNamespaces` over `src/tools/index.js` (duplicates/missing handlers throw). Production profile visibility from the same surface: read_only 50 / everyday 58 / full 122 — see the census note below. |
| Serving alias | `https://neon-mcp.vercel.app` serves the application. `GET /api` → 200 with name, tool count and profile counts. `GET /api/mcp` keyless → 401. |
| Deployed build identity | **Not reported by any live surface.** No version or SHA appears on `/api`, and `neon_whoami` returns no `server_release` (VER-1 not yet adopted in code; draft PR #202 carries source work). `live` at `69c46b71` is the best available provenance and is declared as such, not proven from the surface. |
| Configured issuer origin | Live OAuth discovery names `https://neon-mcp.vercel.app` as issuer and resource — a platform domain, not the branded origin. |
| Branded origin | `https://neon.robinsonaisystems.com` does not serve this deployment yet; checked paths return Vercel `DEPLOYMENT_NOT_FOUND`. |
| Root and connection routes | `/` and `/connection` on the serving alias return 404. The implemented public status surface is the JSON at `/api`. There is **no health endpoint**: no `api/health*` file exists and live `/api/health` and `/health` return 404. |
| Front-door database truth | `api/index.js` imports only the registry, product-identity and profile modules — **the public front-door path makes no database call** (verified in code at the baseline; the fleet cost ruling holds for this surface). |
| RTC advertisement | `GET /api/contract` → 503 `rtc_integration_in_progress`: RTC 1 identity is withheld and RTC 2 wire adoption is pending, matching the repo's own docs. |
| Open in-flight work | Draft PR #202 (R-2 release provenance + customer connection entry, source) and draft PR #203 (CAP-1 capability census) were open at the baseline. They are recorded here, not duplicated. |

**Census note (registered vs visible).** The 131 count is the registry total.
The full-profile production count is 122 because `src/core/profiles.js` counts a
write tool only when it is on the production allowlists
(`externalProjectWrites`/`internalControls`), with `neon_check_key_access`
separately gated: 9 registered tools are visible in no production profile count.
Whether each of those 9 is deliberately internal or a visibility defect is a
CAP-5 acceptance question, recorded here — not asserted either way.
`docs/TOOL-CATALOG.md` describes the planned product scope (its own checkpoint
banner says so) and is not a registry count.

**Audit method note.** This reconciliation is a survey-and-reconciliation pass
(one worker; repo + live-surface read-backs), not a full Tier 2 Critic pass. It
closes no product requirement by itself. Whether the server's own Neon store
sleeps when idle was not checked and no store was woken to check it.

## Scoreboard

| Ledger | Reconciled state |
|---|---|
| Tool registry | **131 registered** live; 50 / 58 / 122 visible by profile on a production deployment. |
| Roadmap / gates in repo | 62 tracked original/CAP work cards with unfinished implementation; CG-1…CG-6 all **OPEN** (see [COMPLETION-GATES](COMPLETION-GATES.md)); the CAP-1 census is superseded as census of record by the 2026-11-04 two-source re-census (row 15), which also filed CAP-6…CAP-9; CAP-2…CAP-5 not complete. |
| RAS MCP conformance | **17 rows** below. No row is closed on live evidence by this reconciliation; rows 12–14 conform at plan level as scoped. |
| Release identity and health | **Open.** No `server_release`, no health endpoint. Draft PR #202 carries the VER-1 source work. |
| Branded identity/domain | **Not cut over.** Issuer is the platform domain; branded domain not serving; live front-door name is the pre-rename form (correction PR prepared separately, left open for review). |
| Production readiness | **No filed pass.** |
| Neon production activation | Per-organization owner enablement remains the owner's separate act; nothing in this schedule changes it. |

## RAS MCP Standard conformance schedule

| Row | Reconciled status | Remaining work or exact scope |
|---|---|---|
| 1. Client compatibility | **OPEN — under CG-1 / CAP-5.** | Full client matrix (ChatGPT and Claude phone/browser/desktop, Muse, Hermes Agent, Claude Code, Cursor, Windsurf, VS Code, Codex, Gemini CLI), both auth shapes, per-shape handshakes and recorded per-client results remain. Native public-client OAuth (PKCE, scoped revocation) is source-merged and deployed; that is not a matrix pass. |
| 2. Client ID cards (CIMD) | **OPEN — not verified live.** | Discovery advertises a registration endpoint and `none` token auth, but no live knock test with a real card client (Claude/ChatGPT) has been run against a checked release, and fetch-and-validate behaviour is not evidenced in this record. Closes only on that knock test. |
| 3. One public sign-in | **PARTIAL.** | The OAuth journey answers live at the platform origin (discovery read back 2026-11-04). Still open: the public `/connection` page (live 404) and the authenticated My Connection settings surface; read-only/production remain post-login settings by design and must be proven so in the CG-2/CG-6 tests the repo already tracks. |
| 4. Developer access boundary | **OPEN.** | `api/developer/connect.js` is, per the repo's own design record, a public mobile OAuth handoff wearing a developer name — the staged migration (trace clients → relocate the legitimate handoff → reserve/guard the developer namespace) is designed in `docs/designs/RAS-MCP-D001-ADOPTION.md` and not yet executed. The entitled-developer vs ordinary-user live pair, including crossover refusals, remains to be proven. |
| 5. Release provenance / VER-1 | **OPEN — source in flight.** | No live surface reports version/SHA today (`/api` has neither; `neon_whoami` has no `server_release`). Draft PR #202 (R-2) carries the source step; the row closes when initialize, whoami, manifest, health and front door agree at one checked deployed release. |
| 6. Identity anchoring / branded origin | **OPEN.** | Live issuer and resource are `https://neon-mcp.vercel.app`; `https://neon.robinsonaisystems.com` returns DEPLOYMENT_NOT_FOUND. The cutover is one ruled, sequenced identity change (single configured origin value, DNS attach, reconnect path) — not attempted by this audit. |
| 7. Unleashed branding and naming | **PARTIAL.** | In the repo: `docs/UNLEASHED-BRAND-SPEC.md` and the approved Coral render `docs/unleashed-neon.png` (307,711 bytes, the approved render's size) are present, and the D-005 Coral `#FF5F5F` claim is recorded in the repo's design history. Live/code gaps: `PRODUCT_DISPLAY_NAME` in `src/core/product-identity.js` is still "Neon by Robinson AI Systems" (a separate correction PR updates it to the full Unleashed name and the §6.3 attribution wording; left open for review); the Coral accent appears in no code surface; there are no HTML pages, favicon or icon assets to carry the Break-Out mark; `package.json`'s description carries no product name (the package name itself is a stable identifier and is not churned). Closes only on live read-back of mark + accent + full name. |
| 8. Branded front door — five fleet things | **PARTIAL.** | (a) Branded subdomain: not serving (row 6). (b) Status surface substance is live at `/api` as JSON; the literal `/` route 404s and there is no HTML front door in the fleet design — resolve deliberately with the branded cutover. (c) `/connection` returns 404 — unbuilt. (d) Instructions cannot name only the branded address until cutover. (e) The single `robinsonaisystems.com/tools` listing is not verified from this repository; it may show a connect button only when the branded connection page answers. The `/api` status surface itself is verified database-free, which is the cost-ruling half of this row and it passes. |
| 9. Fleet health contract | **OPEN.** | No `/api/health` route exists in code or live (both 404). Build step: add the pinned-shape health readout (status, version, deployed SHA, tool count, timestamp; 200/503) whose dependency check can genuinely fail, keeping the public front-door path database-free per the cost ruling; advertise the path from the contract surface. This row is distinct from the front door's database-free pass in row 8. |
| 10. Production readiness and protection gate | **OPEN — no filed pass.** | Pass every gate section with evidence (public-surface/backdoor inventory, sign-in hygiene, legal placement, abuse/cost defences, privacy/retention clocks, observability, the 3am watcher runbook, recovery/fixtures, docs truth), declaring any degraded check degraded. The repo's CG-1…CG-6 overlays stay OPEN until then. Charging or launching beyond beta additionally requires the one-time attorney review of Terms/Privacy. |
| 11. Discovery and contract governance (RTC) | **PARTIAL — plan level.** | The RTC 2 owner decision is documented in the repo and `/api/contract` honestly withholds RTC 1 identity (503, integration in progress). RTC 2 wire adoption (advertisement, opaque-cursor pagination, content-page recovery, passes) is not implemented; no `rtc:2` claim is made anywhere, which is the conforming posture until it is. |
| 12. No global credential fallback | **CONFORMS at plan level.** | The design binds every connection to its own organization's keys; no service-owned global Neon credential route is present in the serving code paths read for this record. CAP-5 proof must keep demonstrating it; this row supplies no independent live pass. |
| 13. Version evolution | **CONFORMS at plan level.** | Additive/fail-closed evolution (frozen tool names/shapes, restrictive defaults) is the repo's standing rule and its release policy's shape; a continuing rule, not a completed acceptance event. |
| 14. Pattern appraisal guardrails | **RECORDED; remote coding runtime NOT APPLICABLE.** | No further baseline work. |
| 15. Capability completeness | **CORRECTABLE — PARTIAL under the capability-completeness grading amendment.** | **Reopened and re-issued 2026-11-04** under the RAS MCP Standard's capability-completeness grading amendment (Library D-001, as amended 2026-11-04 by Library PR #5). The census is now a two-source reconciliation — platform side from Neon's official documentation only, server side from code only, built independently and sealed — recorded in the "Capability re-census record" section below: **152 mapped units / 73 COVERED / 4 COMPOSED / 0 OWNER-EXCLUDED / 75 MISSING** on the platform surface, plus **7 MISSING lifecycle legs on the server's own registration/connection records**, the class the original census missed. Under the amendment the grade is capped at PARTIAL while any plausibly-needed capability stands MISSING; missing items with a filed plan still count as missing for the cap. Every missing unit carries a plan in the record section: cards **CAP-6…CAP-9 are filed with this PR** (registration lifecycle + consumption reads); the rest stand as missing-with-plan rows naming their card TO-BE-FILED. This reconciliation supersedes draft PR #203's single-source CAP-1 draft as the census of record. Still owed under this row: the consumer test (with CAP-5) and the front-door depth line citing this census instead of the bare tool count, which rides the branded cutover. |
| 16. Conformance-correction process | **CORRECTABLE — process running.** | Step 0–2 are done (frozen baseline above, inventory in this record and the repo's D-001 adoption crosswalk, 17 honest rows). The row closes when every row conforms or carries a ruled exception with live proof filed. Note: `docs/STATUS.md`'s top checkpoint still reads 2026-11-01 at `1c810cb0…`; that heading is pinned verbatim by `scripts/check-doc-code-truth.mjs`, so refreshing it belongs with that check's owner — recorded here rather than breaking CI from an audit PR. |
| 17. Owner-obedience | **CORRECTABLE — classification not yet filed.** | The code already runs guarded confirm patterns for destructive/costly tools (B-1 preview/confirm, spend previews, production enablement as an owner setting), but no inventory classifying every refusal point as aim check / convertible veto / non-convertible boundary / platform rule exists yet. Build step: file that classification in this record's successor pass, convert any owner-facing vetoes to the confirmed-action pattern (evaluate → disclose → fingerprint → confirm → re-check → journal → read back) most destructive first, each closing only on live proof. |

## Capability re-census record — 2026-11-04 (row 15)

**Method.** Two sources were built independently and sealed before either was
read by the reconciler. Cartographer A mapped the platform from Neon official
documentation only (20 doc groups, 193 operations — 177 current + 16
legacy-deprecated — ~46 resource rows, 14 owner workflows):
`research_notes/mcp-fleet-audit-2026-11-04/recensus/neon-service-map.md`,
sha256 `083e422749e9631cb1e4e3236f6f522319c481711a4abc7601062b8f9318f8c9`.
Cartographer B inventoried this server from code only, frozen at `main`
`3fe41498633cbe4f16044d10a9cb6b350814148d` (131 registered tools, counted by
executing the registry; production profile visibility 50 / 58 / 122 reproduced
exactly by evaluating the served code):
`research_notes/mcp-fleet-audit-2026-11-04/recensus/neon-server-inventory.md`,
sha256 `e8eb949fea1271dbff28b7b2543cb7fe281ce40b7f96eec85807012cea350964`.
Both seals verified by SHA-256 before reading. The full reconciliation (every
resource, every leg, the symmetry ledger, the combination economy, all
declared limits) is the standalone record at
`research_notes/mcp-fleet-audit-2026-11-04/recensus/neon-reconciliation.md`;
this section is its record-shaped summary.

**Counting convention.** One unit = one lifecycle leg (create / read / update /
delete / list) or one named non-CRUD operation in the service map, current
surface only. Legs the platform does not offer are platform-absent, not
counted. OWNER-EXCLUDED requires a recorded owner ruling; `MEMORY.md` and this
record were searched and **no ruling excludes any mapped Neon capability**, so
the disposition is used zero times. Anything without a tool and without a
ruling is MISSING.

**Map counts (platform surface).**

| Disposition | Units |
|---|---|
| Mapped | **152** |
| COVERED | **73** |
| COMPOSED | **4** |
| OWNER-EXCLUDED | **0** |
| MISSING | **75** |
| UNVERIFIED | 9 named items + 2 platform-tier surfaces (below) |
| Legacy Auth (deprecated, tallied separately) | 16 operations, none covered |

By area: Identity/orgs/keys 23 mapped (16 covered, 7 missing) · Projects &
access 22 (20 covered, 1 composed, 1 missing) · Branches/databases/roles 29
(22 covered, 3 composed, 4 missing) · Endpoints 8 (8 covered) · Snapshots 7
(7 covered) · Consumption 1 (1 missing) · Neon Auth 22 (22 missing) · Data
API/credentials/advisors 10 (10 missing) · Buckets 8 (8 missing) · Functions
13 (13 missing) · Logs/Realtime/AI Gateway 9 (9 missing). The original core —
projects, branches, databases, roles, computes, snapshots, keys, members — is
covered nearly completely; the platform's newer surface is absent nearly
completely, because the original census started from this server's own tool
list and could not see it.

**Server-self records (the class the original census missed).** The server's
own store was censused leg by leg. Authorization codes, one-time secrets,
secret requests, stored results and settings are complete (consumption or read
deletes the row). Four records are asymmetric:

| Record | Missing legs |
|---|---|
| OAuth client registrations (`oauth_clients`) | Owner-facing read/list, update, **delete** — registrations are create-only; a registered client can never be removed, only its tokens revoked |
| Enrolled organizations (`neon_orgs`) | **Delete (unenroll)** — no delete operation exists anywhere |
| Stored Neon API keys (`neon_keys`) | **Hard delete** — revocation is soft-only; revoked rows and their ciphertext persist indefinitely |
| Connection token rows (`oauth_tokens`, incl. RTC passes) | **Hard delete** (revocation is soft-only); plus **RTC pass list** — `db.listRtcPasses` exists with zero call sites, so outstanding passes cannot be listed |

Server-self missing total: **7 legs** — filed as cards CAP-6 (registrations),
CAP-7 (unenroll), CAP-8 (hard delete + pass list).

**Build outcome, 2026-11-04 overnight (source; rides the 2026-11-05 00:01
automatic promotion):** CAP-6 and CAP-8 are built, closing 5 of the 7 legs at
source — registration list/read, metadata update and delete-with-token-cascade
(`neon_list_oauth_clients`, `neon_get_oauth_client`, `neon_update_oauth_client`,
`neon_delete_oauth_client`), revoked-row hard delete for `neon_keys` and
`oauth_tokens` (`neon_purge_revoked_records`), and the RTC pass list
(`neon_list_rtc_passes`, wiring the previously caller-less `db.listRtcPasses`).
Registry now 137 tools; production profile visibility read_only 51 / everyday
59 / full 128. The census counts above stand as the 2026-11-04 freeze of
record; the remaining 2 server-self legs are CAP-7 (org unenroll). Proof:
`tests/db/oauth-client-lifecycle.test.js` on disposable Postgres plus unit
suites; see the CAP-6/CAP-8 card status lines.

**Build outcome, 2026-11-04 overnight (consumption):** CAP-9 is built —
`neon_consumption_get` reads the platform consumption-history endpoints
(per-project v2, per-branch v2, legacy plans) for a stated period and returns
exact metric totals with a clearly labeled dollar estimate priced from the
server's stored price table in integer cents (the platform returns metrics,
never currency). Registry now 138 tools; production profile visibility
read_only 52 / everyday 60 / full 129. Proof: `tests/unit/consumption.test.js`
through the fake Neon server (request/response shapes validated against the
vendored API description; totals equal fixture line items).

**Missing-with-plan register (platform, 75 units).** Cards CAP-6…CAP-9 are
filed with this PR (CAP-9 covers consumption). Every other missing item stands
here as a missing-with-plan row naming its card TO-BE-FILED; nothing is
dropped.

| Missing item | Units | Plan |
|---|---|---|
| Consumption history reads (per-project / per-branch usage) | 1 | **Card CAP-9 filed — BUILT 2026-11-04** (`neon_consumption_get`; see the build-outcome note in this section) |
| Neon Auth management surface (integration, users, OAuth providers, OAuth clients, trusted domains, configuration set) | 22 | Card TO-BE-FILED — largest single build; sequenced after CAP-2…CAP-5 |
| Functions + triggers + function custom domains | 13 | Card TO-BE-FILED (preview surface; platform plan-gating unverified) |
| Data API management | 4 | Card TO-BE-FILED (its JWKS dependency is COVERED) |
| Buckets + bucket objects | 8 | Card TO-BE-FILED (preview surface) |
| Scoped branch credentials (issue/revoke/list/reveal/rotate) | 5 | Card TO-BE-FILED |
| Realtime (enable/read/secret/disable/rotate) | 5 | Card TO-BE-FILED |
| Org VPC endpoints (assign/read/delete/list) | 4 | Card TO-BE-FILED |
| Org spending limit (set/read/remove) | 3 | Card TO-BE-FILED (interim: this server's own tighten-only spend caps are COVERED) |
| Branch logs (fields/values/query) | 3 | Card TO-BE-FILED |
| Masking rules read/update | 2 | Card TO-BE-FILED (rides the anonymized-branch surface; the create/status tools' production-visibility question stays with CAP-5) |
| Transfer-request accept | 1 | Card TO-BE-FILED (rides the transfers family) |
| Role password reveal | 1 | Owner-ruling-gated: no ruling exists, so the leg is MISSING, not OWNER-EXCLUDED; build only if the owner rules credential reveal acceptable. Covered interim path: password reset |
| Project advisors read | 1 | Card TO-BE-FILED (small read) |
| Branch storage state read | 1 | Card TO-BE-FILED (small read) |
| AI Gateway read | 1 | Card TO-BE-FILED (read-only surface) |

**Symmetry ledger (condensed).** Platform-has-no-leg (not server gaps):
invitation revoke; transfer-request reject/cancel; organization
create/delete via API; role update. Server-missing pairs: spending-limit set
*and* remove; transfer create without accept; role create without reveal;
Neon Auth enable without disable; Data API create without delete; scoped
credential issue without revoke; Realtime enable without disable; bucket
create without delete; and the four server-self records above. Confirmed
symmetric and covered on both sides: API keys (personal and org), projects
(create/delete/recover), branches, databases, roles (create/delete),
endpoints (incl. start↔suspend), snapshots, permission grant/revoke, project
member role set/remove, JWKS add/delete, project VPC restriction set/delete.

**Combination economy (COMPOSITION-OWED).** Server step counts count tool
invocations; every guarded write costs 2 (preview + confirm) under the
confirmed-action pattern (evaluate → disclose → fingerprint → confirm →
re-check → journal → read back) that the Standard's owner-obedience amendment
rules and row 17 records. Jobs over 3 calls: (1) *Create project + extra
branch + one-time URI delivery* — 5 server steps vs 3 platform —
**COMPOSITION-OWED**: proposed composed tool, a project-quickstart creating
project + named branch + connection delivery in one guarded flow.
(2) *Branch for a preview + teardown* — 4 vs 2 — the excess is solely the
confirmed-action doubling; **owner-accepted sequence cited** (the
owner-obedience amendment); the run-owned variant is already composed
(`neon_dev_branch_create` + `neon_dev_cleanup`). (3) *Provider API key
rotation* — 4 — same owner-accepted doubling, and the create half already
composes rotation delivery. All other top workflows land at 3 calls or fewer
(project + connection string 3; password reset + reconnect 3; point-in-time
recovery 2, beating the platform's two-call restore + finalize because
finalize is composed inside `neon_branch_restore`).

**UNVERIFIED items carried forward (declared, not upgraded).** From the
service map: the platform-tier Partner API and OAuth app-registration
surfaces (absent from the public index); the Functions create leg; the
branch reset-to-parent platform mechanism (the server ships
`neon_branch_reset_from_parent`; the workflow is covered, the platform
operation it maps to is unverified); the backup-schedule delete leg; Neon
Auth user read/list legs; AI Gateway configuration; per-operation
plan/preview gating; and field-level settings detail under the covered
update operations. From the server inventory: the live front-door HTTP
response was not fetched (counts reconciled by evaluating the served code);
tool semantics rest on registered descriptions plus sampled handlers, not a
line-audit of every handler; the 9 registered tools visible in no production
profile stay an open CAP-5 acceptance question — this census asserts neither
deliberate-internal nor visibility-defect, and no owner ruling makes them
OWNER-EXCLUDED; the RTC pass consumption path was not exhaustively traced.

**Re-issued grade.** Row 15 is **CORRECTABLE — PARTIAL under the
capability-completeness grading amendment**: 152 mapped / 73 COVERED /
4 COMPOSED / 0 OWNER-EXCLUDED / 75 MISSING, plus 7 missing server-self legs.
Missing items with filed plans (CAP-6…CAP-9 and the TO-BE-FILED rows) still
count as missing for the cap until built.

## CI speed (standing fleet rule)

Recent `ci` runs read back 2026-11-04: the last 8 completed runs were all green
with wall times of 54–69 seconds (created→updated). The fleet target for MCP
servers is 30 seconds with a 1-minute cap: the target is not met and the cap was
exceeded in 3 of those 8 runs. Slow-but-green still passes; this is recorded as
an optimization item, not a rejection. The workflow already runs four jobs in
parallel (check / unit / db / rtc) with 180-second phase budgets.

## Shortest truthful answer

Neon Unleashed by Robinson AI Systems still needs: the VER-1 release identity
(draft PR #202) proven live; a health endpoint in the pinned shape; the CIMD
knock test and the full client matrix (CG-1/CAP-5); the developer-boundary
migration and live denial pair; the branded-domain/identity cutover — which
also delivers the HTML front door, the `/connection` page, the Break-Out mark
with the Coral accent on public surfaces, and the corrected public name (a
code correction for the name is prepared and waiting review); the CAP-1 census
(draft PR #203) and CAP-2…CAP-5; the owner-obedience refusal classification;
the 9-tool production-visibility disposition; and the production-readiness
gate. Only after those — and separately, only with Chris's authorization for
launch or per-account production use — can it be called a finished product.

*Disclaimer: Neon Unleashed is a Robinson AI Systems product. It is not
affiliated with, endorsed by, or sponsored by Neon.*
