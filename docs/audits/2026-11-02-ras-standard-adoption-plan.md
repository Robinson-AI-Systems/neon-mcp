# RAS MCP Standard adoption — design-maintenance plan (2026-11-02)

## Fleet merit review continuation — 2026-11-02

- [x] Confirm GitHub VER-1 source `src/brand/brand.js` and `github_whoami` expose agent-facing deployed version/commit and current-live-branch update instructions.
- [x] Compare Vercel protected operator route (passphrase-gate limitation), Dokploy provider-native per-user credential authority and direct key sign-in, Workspace P9/P10 tenant/TEST principal architecture and GitHub capability diagnostics on their own merits; source evidence and remaining gaps are in Library `designs/ras-mcp-fleet-review-2026-11-02.md` (PR #1, still subject to review).
- [x] Add agent-visible release identity to Neon's existing A-3/A-7/R-2/O-4 design and CG acceptance, preserving backend dev/public customer sign-in isolation.
- [ ] Implement, CI-test and independently verify these new requirements on any live Neon or sibling MCP; no runtime changes in this design PR.



Status: **DESIGN WORK ONLY**. This is not a new countable roadmap subsection, a release, a provider operation, a promotion of an acceptance gate, or authorization to change another repository.

## Pinned sources and inspected baseline

- Neon source baseline: `f4e2f5b6de11ccfca1d8a8b08fcd801ed7ea333c` on `main`, no open PR at the review.
- Authoritative living Standard: [Library D-001](https://github.com/Robinson-AI-Systems/library/blob/main/designs/ras-mcp-standard.md), library main `06b52d58d13554f74304ec9b006b595e914493dc`, file blob `cf619ca715b03c56f32f9a450886a07e085a5a9c`.
- Versioned wire standard: [Hub RTC 2](https://github.com/Robinson-AI-Systems/robinsons-toolkit-hub/blob/main/docs/RTC-2-SPEC.md), Hub tree `cc16272b60e1306eb6878a2b2748929545a1caa6`, blob `83fab62166c33bd27f4cd5494b47bdae97f415bd`. RTC 1 is frozen and supported until a complete RTC 2 cutover.
- Fleet appearance: [website blueprint](https://github.com/Robinson-AI-Systems/robinson-ai-systems/blob/main/docs/WEBSITE-BLUEPRINT.md), inspected blob `fadd2a5bb0f1ddb44bc9d3c8db61905b476e51e2`.
- Brand claim: [Library D-005](https://github.com/Robinson-AI-Systems/library/blob/main/designs/unleashed-claims-registry.md), blob `9076c183a91938862b2ce6cfdd682741120fdf8c`. **Neon Unleashed**, Coral `#FF5F5F`, slug `neon-unleashed` are already claimed. Do not create a second claim or edit the Library.

## Acceptance for this design-only change

- [x] Document explicit D-001 → Neon gap/evidence/roadmap ownership matrix, including additive upgrades, both client auth methods, RAS branded UX, identity, fleet health, watcher, protection, data retention, journaling, secret handling, fixture hygiene and production proof.
- [x] Amend existing Batch R design for the **whole** RTC 2 wire surface (manifest, pass/OAuth, cursor, content-page result recovery, tools, budgets, whoami, errors and no-Hub guarantee), retaining frozen RTC 1 support until verified migration.
- [x] Reconcile the phone-client `resource` compatibility lesson with RTC 2's required resource-bound Hub flow without ever accepting a token for another resource, silent identity changes, or a security downgrade; demand real matrix evidence.
- [x] Map implementation to **existing** A/B/C/R/O/X cards and CG-1–CG-6, not invented completion units; preserve source vs checked deployment vs live client/provider acceptance.
- [x] Plan brand identity as the single configured canonical `https://neon.robinsonaisystems.com` (target, **not a claim DNS is live**), no Host-based issuer, while preserving historical connections during a separately approved migration; define truthful public pages and one website listing with its publication gate.
- [x] Update Hub reference, PLAN, master roadmap, completion gate, status, decision and go-live design references without rewriting `docs/ARCHITECTURE.md` as if proposed features already exist.
- [ ] Run available local or exact-head docs/CI checks; self-review for secrets, unintended production/paid effects, backward compatibility and plan drift. Open a PR against `main`, never commit to `main`. No fixture, provider, database, domain, website or production changes.

## Scope and sequencing

This is owner-requested specification adoption **in design**. No runtime changes in this PR. Implementation follows the existing approved cards and each repo's own safety/CI/deploy rules; external website and monitoring actions remain in their owning projects. A future implementation card must freeze exact full criteria, use fake + disposable Postgres where appropriate, run client/production proof only with existing owner approvals, and keep every CG gate OPEN until proven. Design review completion is not product completion.

## Baseline risks to address

At review, `api/contract.js` returns 503 unless `RTC1_ENABLED=1`; `rtcManifest` advertises RTC 1-shaped fields; `/api/mcp` provides native Streamable HTTP; root `api/index.js` is JSON, not the fleet front door; independent direct-client tests and complete RTC 2 conformance remain unverified. These observations are **source** findings, not proof of the live production configuration. Existing `docs/DIRECT-MCP-CONNECTION.md` still describes the historical verification-dependent origin and older display name. Keep these facts distinct from the target.

**Design acceptance readback:** the six design criteria above are drafted; PR exact-head check, self-review and merge remain separately pending. No live/runtime acceptance is claimed.

## Owner follow-up — developer-only test control plane (2026-11-02)

- [x] Specify a backend-only, separately authenticated developer sign-in and test-grant access point; deny any customer path, role spoofing, or public UI navigation to developer-only operations.
- [x] Distinguish customer-owned OAuth consented grants and post-login read-only/production settings from developer test grants.
- [x] Document that `/api/developer/connect` currently serves a genuine mobile OAuth handoff and require backward-compatible public path migration before developer namespace lockdown.
- [ ] Implement and prove developer isolation, safe mobile migration and real-client tests in existing roadmap cards; not performed in this design-maintenance PR.
