# Robinson Toolkit Hub compatibility reference

**Owner decision, 2026-10-19:** This independent MCP server is a Hub-compatible provider, not a Hub client. The **Hub initiates** discovery, authorization and selected tool calls. The coding agent sees **one Hub MCP connection and a fixed, small set of gateway tools**, even as thousands of provider tools become searchable. The human and coding agent do their own planning. **Never create a server-to-Hub callback, brand-specific Hub adapter, unconditional eager `tools/list` expansion or provider-side automated planning.**

**Current contract distinction (2026-11-01):** RTC 2 is the owner-adopted normative successor since 2026-10-31, while the service's source and currently checked READY deployment still implement/claim RTC 1-shaped compatibility. The RTC 2 section at the bottom records the decision, **not completed migration**. The earlier RTC 1 requirements below are frozen legacy implementation/acceptance references, not a contradictory active decision. Implement and verify RTC 2 on the existing R cards and CG-4 before advertising RTC 2 on the wire.

## Governing shared specification

- [Frozen RTC 1 contract](https://github.com/Robinson-AI-Systems/robinsons-toolkit-hub/blob/main/docs/CONTRACT.md) is the cross-repository baseline.
- [Hub connection compatibility specification and per-server checklist](https://github.com/Robinson-AI-Systems/robinsons-toolkit-hub/blob/main/docs/HUB-CONNECTION-SPEC.md) explains optional standards-based OAuth, independently delegated identity, bounded RTC meta-tool search/describe/call, pagination and result/refusal rules.
- Work from the **latest reviewed Hub main specification**; record the exact Hub commit and the selected provider's exact source and deployed commits whenever demonstrating compatibility. Treat a future breaking contract change as a separate versioned design decision, **never** a silent per-server wire-protocol tweak.

## Required integration boundaries

1. **Stay standalone.** Existing direct MCP clients and original provider credentials must continue working without Hub, and an authorized user may exercise the provider's full legitimate capabilities. Development-team spending, TEST and no-production safeguards are not permanent end-user product policy.
2. **Advertise, don't push.** Serve truthful public RTC 1 `/api/contract` metadata, stable tool prefix, areas, modes, profiles and authorization availability. Do not connect outward to Hub.
3. **Lazy, bounded tool access.** Serve the standard RTC meta-tool search/describe/call family under the *provider's own* authorization and risk checks. A Hub query returns a **small bounded search page** and fetches an individual schema only on demand. Preserve actual page/offset/cursor fields and exact denial codes. No eager full catalog into the agent context.
4. **Provider-owned consent.** Support the provider's independent RTC credential verification and, where implemented, standard OAuth protected-resource/issuer discovery, S256 PKCE, resource-bound consent, token refresh and revocation. The Hub never creates or widens provider scopes. A protected whoami identity that does not attest complete mode/profile/area grants is only enough for the Hub's **read-only** fallback; source must not claim full/write authorization from a successful OAuth callback.
5. **Accurate results.** Keep outputs bounded, protect large pages and handles from cross-account/caller reuse, and reject expired, revoked or narrowed permissions. Unexpected provider POST results must not be retried without a safety guarantee.
6. **Prove the standalone provider, not the Hub integration.** Before accepting the server's RTC 1 provider compatibility, verify the actual deployed contract/manifest and direct MCP/RTC doors, bounded authenticated search/describe/call, denied access, expired/revoked provider grants, credential renewal if offered, safe LIVE Neon reads and direct standalone use. Retain exact source/deployment and real-provider provenance. Mock or forced TEST paths do not replace required LIVE provider proof. A Hub-owned LIVE enrollment, connection, registry, relay or routed read is **not** a prerequisite for this server's completion; Hub verifies those end-to-end outcomes in its own repository.

## Completion responsibility — owner clarification, 2026-10-19

**Neon MCP completion:** implement and independently verify the frozen RTC 1 provider-side interface and applicable directly served/provider acceptance under the shared [Hub compatibility specification](https://github.com/Robinson-AI-Systems/robinsons-toolkit-hub/blob/main/docs/HUB-CONNECTION-SPEC.md). Server-side acceptance includes correct discovery metadata, identity/grant enforcement, bounded lazy search/describe/call and continuation, risk-aware operations, revocation/expiration, independently usable direct clients and genuine provider evidence where required by the original roadmap. Keep the original R-1/R-2/R-3 acceptance and every security/CI/deployment/source requirement; no checklist is automatically marked passed by this policy clarification.

**Hub completion:** Hub itself discovers and enrolls the provider, obtains authorized caller-specific connections, routes tool searches/calls and verifies Hub caller isolation, renewal, relay and LIVE integration. Missing, failed or unavailable Hub registration or Hub-initiated LIVE read does not keep a correctly implemented Neon server incomplete. The Hub does not take over Neon's credentials, scopes or risk decisions. This assignment changes acceptance ownership only; it does not claim this service has passed conformance or authorize a production write/release.

Reviewed Hub main specification revision for this clarification: `3cc7f4ad4332155d639125b23e8a5c4c13804a3d`. Future conformance must still check the latest reviewed version and pin both provider source and deployed revisions.

## Current adoption status

This is a **documentation/implementation reference**, not a deployment, a new token, a registry enrollment or a successful live connection. Existing source and hosted service remain unchanged. Inspect the actual source and real issuer before claiming any checklist row passed.

When implementing a future tool or modifying authorization, include this contract compatibility check in the existing repository roadmap/card and tests, rather than duplicating the Hub's provider-independent router here.

## RTC 2 adoption — owner decision, 2026-10-31

**Owner decision, 2026-10-31:** RTC 2 is adopted as RTC 1's §9 successor, by Chris's dated decision ruling all five open decisions as recommended. The primary record is the Hub repo's `docs/DECISIONS.md` (2026-10-31 entry); the adopted normative text is the Hub's `docs/RTC-2-SPEC.md`. The five rulings:

- **D1 — Result recovery = content pages.** Oversized results are recovered as content pages under the RTC 2 §7 shape, superseding the RTC 1 record-page result dialect at contract level.
- **D2 — OAuth is optional-but-specified.** Where a server offers OAuth, RTC 2 specifies it; scoped passes remain the required baseline connection credential.
- **D3 — Handle lifetime = 24 hours**, carried from RTC 1.
- **D4 — The health path is included in the advertisement** as a SHOULD-level manifest field.
- **D5 — The RTC 1 freeze holds.** No shipped dialect is amended to chase the Hub suite's unversioned post-freeze drift; RTC 2 is the versioned successor adopted by this decision instead.

At contract level, RTC 2 supersedes RTC 1 on this server's discovery/connection surface: the advertisement (manifest fields, dialect declarations, the SHOULD-level health field), result recovery (content pages) and result-handle lifetime (24 hours); the connection floor is unchanged and passes remain the baseline. **This section records the adoption only: it changes no current behavior of this server, and this server's conformance claims remain RTC 1 claims until its adoption work lands.**

This server's own RTC 2 adoption and conformance proceed through its own card as a follow-on. One honesty note, on its face: this server's RTC depth was classified from repository shape in the owner's 2026-10-31 GitHub census, not from live probing — the adoption card verifies conformance when it runs.
