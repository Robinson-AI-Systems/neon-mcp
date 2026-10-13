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

#78 initial CI review correction: a refused bearer must return a null authorization result after sending a generic RTC error response; never return the HTTP response object as an identity. Red-check regression tests exercise actual null refusal, expired/revoked status, and default-deny. Fixture-only encryption keys must not weaken the repository scanner. CI and review must pass at the corrected head before merging.

## #80 — bounded HTTPS read-only interoperability and remaining Hub D-4 acceptance

The server has a new fixed Vercel rewrite door for `GET /api/tools`,
`GET/POST /api/tools/{name}`, `POST /api/tools/_batch`,
`GET /api/whoami` and `GET /api/results/{handle}`. All route through
`api/rtc.js` and the existing registry/guarded read handlers, with a
*distinct* hashed RTC pass—not MCP OAuth—and a 60/min atomic database limit.
The hard allowlist includes only `neon_whoami`, `neon_get_settings` and
`neon_where_is_setting`; no Neon provider, role, database, compute, project,
generic MCP meta-dispatch or writable operation is available through RTC.
Batches validate every item before any call; handles are bound to the exact
connection/pass scope. Scope admission now also requires an unrevoked verified
project key on each request, not just at issuance. Ordinary /api/mcp OAuth
authorization and all production restrictions remain separate.

New unit HTTP-contract tests exercise missing/forged/revoked passes, restricted
catalog, whoami, direct reads, all-door write refusal, invalid/oversized batch,
rate denial, handle ownership and error envelope. Disposable Postgres proves
Neon project-key revocation invalidates an issued pass. These are **our offline
RTC read-only subset**, NOT complete official Hub `packages/conformance`
acceptance: the frozen Hub runner deliberately requires full/guarded write
fixtures and two-process shared DB and OAuth refresh evidence. Expanding
permission-widening/full passes is still blocked by R-1/IN-11 and D-4/D-5
sequencing, so do not fake its green completion.

The owner-authorized real three-route acceptance remains:
1. verified service deployment at reviewed source SHA (only scheduled checked
   `main → live` may deploy, not an agent/manual preview or release);
2. owner-created short-lived scoped project pass from secure setup and protected
   variables for `rtool agent-check` with harmless no-provider metadata read;
3. real local direct, GitHub-only encrypted relay and Vercel Sandbox direct
   paths (relay host, webhook and issue binding must be configured by hub agent);
4. server-side revoke + failed reuse, UTC/reviewed SHA/actual route/exit
   evidence. Do not insert bearer values in argv or repository/logs.
Until these are observed and full RTC conformance is addressed, keep
`RTC1_ENABLED` unset. `GET /api/contract` deliberately returns 503 by default,
so no hub certification is claimed.

The verified infrastructure cost/protection checkpoint is in
`docs/HOSTING-COST-POLICY.md`, incorporated in #80's substantive implementation
PR. No new Neon/Vercel project, paid build, keepalive, owner production approval
or live service was created as part of this change.

PR #80 exact-head test correction: the first local wire fixture incorrectly sent the pass value without the RFC Bearer prefix, so the server correctly refused it with HTTP 401. The fixture now sends `Authorization: Bearer <pass>` and explicitly asserts that a raw, non-Bearer pass stays denied. Re-run full exact-head `ci` and `release-policy` after this fixture fix; the original red run is not acceptance.

PR #80 cost/security self-review addition: an unset RTC1_ENABLED flag now causes the HTTP gateway to return 503 *before* initializing or migrating its Neon backing database. The Vercel build policy and disabled preview requirements are unchanged. The offline regression invokes the real API entrypoint without a configured database and proves an inert response; no traffic or live provider acceptance is claimed.

## #81 — RTC scoped discovery limit correctness

The HTTPS tool-list path now filters the real registry down to the three explicitly
allowed read-only metadata tools **before** applying RTC catalog search and limit.
Previously a small limit could select unrelated registry entries first and remove
them after limiting, returning an incorrectly empty list. Tests prove a limit-one
matching search stays discoverable while unsafe names never become visible. This
is not broader RTC full conformance or real deployed route acceptance.

## #84 — read-only schema parity with actual HTTPS execution

The RTC tool metadata now describes the existing guarded result-shaping `fields`
(comma-separated dotted selector, max 512) and `detail` (`summary`/`full`)
arguments for reads, just as the standalone MCP metadata does. Every write
metadata schema is unchanged; the HTTPS allowlist remains restricted to three
non-provider metadata reads. Registry and real-handler tests confirm listing
and describe metadata. This is offline subset correctness, not full RTC
conformance or real Hub direct/relay/Sandbox acceptance.

## 2026-10-12 — actual Hub agent-check mode blocker (not conformance)

Read-only RTC passes are stored with `mode='preview'` and `GET /api/whoami` reports `preview`. The Hub's reviewed `packages/cli/src/agent-check.js` explicitly requires `whoami.result.mode === 'test'` before tool description or invocation. Thus even an authorized, reachable Neon RTC HTTPS deployment would currently fail the genuine Hub agent check with `test_mode_required`. This is **contract mismatch evidence**, not a green routed test. Do NOT alias preview to test, edit Hub authorization, enable RTC1_ENABLED, or assert that project-scoping alone proves isolation. A substantive, independently approved TEST resource-isolation and pass-binding contract is required before exposing `test`, and the Hub verifier must be tested unmodified against both allowed and denied accounts. Until then direct/relay/Sandbox and full conformance remain unverified.

## Service-specific gateway recovery acceptance — 2026-10-12

Current preview-versus-test mismatch is a service isolation design task, not a K-3 package dependency. Retain the Hub strict TEST verifier. Resolve through an independently approved resource-bound TEST pass contract and genuine denial evidence; never alias preview or enable broad production. Existing D-4/D-5 role-delete and D-8 spending/destruction gates remain separate.
