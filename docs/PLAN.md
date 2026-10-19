# PLAN — remaining scope and acceptance

Written 2026-10-10 for an empty repository. Order is in [MASTER-ROADMAP](MASTER-ROADMAP.md); current head and blockers in
[STATUS](STATUS.md). AGENTS owns workflow rules. This file owns acceptance; designs own semantic decisions; cards own the
next bounded implementation.

## Cross-cutting completion and direct client acceptance (owner directive, 2026-10-19)

The six OPEN gates in [COMPLETION-GATES.md](COMPLETION-GATES.md) are mandatory acceptance overlays on the original A/B/D/V/O/P/W/U/R/E/X cards, **not** six invented roadmap subsections or claims of implementation. Each assigned owner card must add both positive and refusal tests and link actual evidence; source implementation, exact-head CI, `live` promotion, service-owned direct-client/provider acceptance and distribution approval remain distinct. Do not close a card's remaining real-world acceptance or project completion by showing just a manifest, a green mock, OAuth consent, optional adapter response or a Hub-provided read.

Minimum evidence: direct independent desktop and supported mobile coding-agent initialize/tool discovery/provider read (CG-1); user/tenant identity separation, consent, expiry/refresh/revoke/downgrade, replay and result-handle isolation (CG-2); actual end-user-controlled approvals, budgets, protected resources and authorized positive/negative execution without developer-policy leakage (CG-3); independently verified provider-side RTC 1, no Hub enrollment dependency (CG-4); checked released revision with eligible real read and owner-approved isolated scratch write/readback/cleanup and complete release-acceptance ledger (CG-5); honest brand attribution, public self-service security/privacy/scale and separate provider/platform/owner distribution eligibility (CG-6). Keep public distribution private and production mutations off pending their independent gates.

## Rules that apply to every batch

- Every write tool passes the nine write-contract checks (`docs/designs/BATCH-B.md` §3) through every door that exists.
- Every Neon request shape validates against the vendored API description (fake Neon); every SQL path passes on real
  throwaway Postgres; schema changes to this server's tables are additive and idempotent.
- `npm run check` green: secret scan, docs check, index validation, lint, write-safety, core imports, token budgets.
- No secret in code, docs, tests, logs, PR text, result handles or tool results (key-scan test); no real Neon/Vercel IDs
  or host names in the repo.
- No real Neon account in tests or CI; no write to any production branch or real project; no purchases and no spend
  increases (AGENTS hard limits). Real-account checks only in Batch X, read-only or in the scratch project.
- Owner inputs are inputs, not things to invent: build the mechanism, keep the dependent behavior off, list the `IN-xx`.
- Money shown in dollars and cents, stored in cents (unit rates in micro-dollars); times shown America/Denver, stored UTC.
- The PR description carries the card's acceptance checklist with evidence.

## Batch A — Foundation (`designs/BATCH-A.md`)
- [ ] CI runs check, unit and database jobs on every PR; a failing test turns it red.
- [ ] Connector login with organization, optional project scope, mode (preview only until enabled; always preview on a preview deployment of this server), profile and listing; lockout after 5 tries in 15 minutes; tokens stored hashed; settings survive refresh.
- [ ] Keys stored only encrypted, by kind (project / org / personal); added only on the setup page; the narrowest key used per tool; key-scan test passes.
- [ ] One Neon client (`@neon/sdk` raw, exact version), vendored API description pinned by date and hash, retries only on 423/429, bounded operation waits, database-counted API budget.
- [ ] One-time-secret page (shown once, then gone) and secret requests (typed once, consumed once).
- [ ] SQL connection layer never leaks a connection string and refuses this server's own database.
- [ ] `docs/DEPLOY.md` followable by Chris.

## Batch B — Trust layer (`designs/BATCH-B.md`)
- [ ] `defineWrite` with operation-aware read-back, request-key dedupe, change log, inverse.
- [x] Production guard from Neon's own data; production access in two steps; self-protection absolute (#18/#19/#20; live activation gated OFF).
- [x] SQL guard: parser classification, read-only transactions, exact previews on a throwaway branch, guarded apply with expected rows and restore LSN. Private foundation #22/#23/#24/#26–#29; D-5 owns public tools and trusted admission; X-3 proves live scratch restore.
- [ ] Spend guard: dollar previews from the stored price table, per-change and daily caps; no tool buys or changes the plan.
- [x] Plain-English errors (B-5 #30; Neon HTTP/plan + SQLSTATE classification, safe descriptions and bounded read-only reconnect). (Neon and Postgres), result shaping, secret removal, profiles.
- [ ] `check-writes` fails on every undeclared or incomplete write declaration; server tools (settings, connections, production enable/disable, where-is-setting).

## Batch C — Cheap on context (`designs/BATCH-C.md`)
- [x] Summaries, `fields`, `detail`, handles (secret-free), annotations, structured output; SQL row caps (#38–#40).
- [x] Catalog and compact listing; meta-tools route through the wrapped handlers (#41–#44).
- [x] Budgets enforced in CI: compact <5,000 tokens, everyday catalog <20,000, descriptions ≤160 characters, results ≤8 KB or a handle, registry counts match TOOL-CATALOG (#45).

## Batch D — Neon core (`designs/BATCH-D.md`)
- [ ] Every Projects, Operations, Branches, Computes, Databases/roles, Connections, SQL, Schema, Health, Snapshots and Project security tool in TOOL-CATALOG built and marked, including the D-9 data checks and index maintenance added by the gap check (2026-10-10).
- [ ] No password or connection string in any result; production restores always preserve; snapshot restore never finalizes; deletions recoverable.
- [ ] Regression tests for old-toolkit bugs N2, N3, N6, N7, N8, N10.

## Batch V — Developer tools (`designs/BATCH-V.md`)
- [ ] Every dev tool refuses production; every created object recorded and annotated; dev branches always expire.
- [ ] Deterministic seed scenarios with exact previews; checkpoints and fast restores; migration preview never writes the target.
- [ ] Masked copies refuse unmasked personal columns; query tuning on a copy; integration check; cleanup touches only recorded objects.

## Batch O — Owner and administration (`designs/BATCH-O.md`)
- [ ] Every listed tool built; owner tools need the organization key and say so in words without it.
- [ ] People changes, key creation and transfers confirmed, previewed, logged; last-admin and self-lockout refused; new keys never in a result.
- [ ] Usage in dollars with the price-table date and a month-end projection; spending alert described as alert-only.
- [ ] Owner side complete: admin overview; every console settings page in the dashboard map as structured guided steps with read-back where Neon exposes the value (contract §11).

## Batch P — Project profiles (`designs/BATCH-P.md`)
- [ ] `known_apps` with the Appliance Desk profile, each item traceable to the app's code and docs; no real IDs committed.
- [ ] App guard refuses schema-owner DDL, migrations-table writes, production/shared-preview branch and pinned-endpoint changes, app-role password resets and Neon Auth for apps using other auth — unless `outsideApp`.
- [ ] `neon_workflow_app_readiness` covers every row of the example profile and works with an inline spec; `neon_workflow_project_setup` idempotent; `neon_profile_draft` from codebase findings.

## Batch W — Workflows (`designs/BATCH-W.md`)
- [ ] All 9 workflows; safe migration applies only after preview and confirm and verifies (bug N4 cannot recur); recovery never swaps production without confirm; all writes confirmed and logged.

## Batch U — Universal tools (`designs/BATCH-U.md`)
- [ ] Four `neon_api_*` tools; requests validated against Neon's description; deprecated operations refused; safe defaults for unknown spend and secrets; hand-built tools win; same guards.

## Batch R — Hub-ready doors, RTC 1 (`designs/BATCH-R.md`)
- [ ] Passes per RTC §2 (preview mode, read-only, 24 h, 60 calls/minute by default).
- [ ] HTTPS tool API, manifest (`modes: ['preview','production']`, `devTools: true`) and OpenAPI per RTC §1/§7; rate limits shared across instances (overlapping-request test).
- [ ] Same nine write-contract checks through MCP, `neon_call` and HTTPS; independently repeatable provider-side RTC 1 conformance green in CI against the frozen contract, including source/deployed direct behavior as applicable. Hub LIVE enrollment, discovery, relay or routed call is verified by the Hub project, **not** a Neon completion prerequisite.

## Batch E — Neon backend services (`designs/BATCH-E.md`)
- [ ] Every listed tool built; profiled apps' auth choice respected; OAuth client secrets typed on the setup page only; no object bytes or presigned URLs in results.

## Batch X — Undo, real-account checks (`designs/BATCH-X.md`)
- [ ] Undo for every clean opposite, including SQL changes by restore LSN with the current state preserved.
- [ ] Read-only smoke report on the real account; write check in the scratch project only.
