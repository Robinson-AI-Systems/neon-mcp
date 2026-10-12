# Toolkit Hub RTC 1 adoption — owner-requested 2026-10-12

Owner request: integrate this Neon MCP with Robinson's Toolkit Hub, preserving standalone
`/api/mcp`, independent owner approvals, no production activation and no autonomous spending.
Hub authoritative sources: `Robinson-AI-Systems/robinsons-toolkit-hub`
`docs/CONTRACT.md` (RTC 1, frozen 2026-10-11), `docs/AGENT-SETUP.md`,
`docs/pr-cards/D-4.md`.

## Scoped exception and dependencies

This is an **early compatibility track**, not a declaration that Neon D-4 or normal
R-1/R-2/R-3 roadmap dependencies are complete. The owner's request authorizes
implementation of narrow **read-only, non-production, expiring, revocable** RTC
connections and genuine short-lived owner-approved read-only acceptance tests only.
It does not approve broad full/write passes, production, costed operations, paid
infrastructure, role deletion or any dangerous provider mutation. Standard R-series
acceptance, IN-11 and phase dependencies remain open for broader permissions.

## RTC compatibility slices

- #77: registry-derived prefixed manifest and OpenAPI description, normalized
  discovery metadata, fail-closed catalog and error helpers; public `/api/contract`
  returns unavailable by default until authenticated routes are proven.
- Later approved slices: distinct pass-only HTTPS authentication (not MCP OAuth
  bearer), atomic database-backed rate limits and revocation; secure owner-only
  issuance through encrypted one-time page; HTTPS discovery/descriptions/calls,
  read-only batch and scoped handles; source-pinned Hub RTC conformance integration.
- Never infer pass identity from headers other than a verified, hashed RTC pass.
  Never expose service credentials, raw pass values, query tokens or complete URIs.
  Keep deployment `RTC1_ENABLED` off until server route CI and owner-controlled
  authorization checks are complete. `/api/mcp` stays OAuth-only and unchanged.
- No real hub direct/relay/sandbox acceptance without observed authorized runs:
  record reviewed SHA, UTC, route, nonproduction scope, harmless metadata read,
  conformance result, and confirmed server-side pass revocation. Separate hub
  private relay repository, webhook configuration and agent runners are owned by
  the hub team, not guessed here.

## Honest evidence ledger

At #77 baseline, only standalone MCP/meta routes were implemented. Internal RTC
metadata and tests are offline groundwork. Public conformance, authorization,
real Hub direct/relay/Sandbox connectivity, live provider reads and pass
revocation are **NOT VERIFIED**. Do not represent a 503 manifest response,
GitHub Actions unit success or a relay READY deployment as live RTC acceptance.

## #78 — owner-issued pass and revocation safety slice

Built an additive `oauth_tokens` kind=pass extension with scoped `rtc_areas`,
`allow_writes=false`, hashed 32-byte random `rtc_pass_` credentials and no
refresh grants. Only the owner passphrase/Origin-checked secure setup route can
issue one under an independently verified project-scoped key. The resulting
secret is encrypted, displayed once and expires in at most 24 hours.
Owner-scoped pass-ID revocation invalidates the server credential immediately;
the original value is never logged or returned by MCP. HTTPS pass admission is
a **separate** mechanism from OAuth and will use the atomic database budget
(60 calls/minute) and reject every write, production mode, broad area or
unsafe backend read. The supported initial harmless reads are
`neon_whoami`, `neon_get_settings`, `neon_where_is_setting`; no branch/role
query is accepted without verified non-production evidence.

DB and unit tests cover hash-only storage, no OAuth crossover, expiry,
replay/revocation, owner cross-origin/passphrase denials and 61 overlapping
budget requests across independent instances. This slice alone does **not**
make the HTTPS tool routes or live Hub acceptance available. RTC remains off
by default until the next route/conformance gate.
