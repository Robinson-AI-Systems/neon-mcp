# 2026-11-03 — RTC 2 partial engineering and custom MCP tool assessment

Part of draft R-2 PR #202; this is NOT RTC 2 acceptance, a completion-bundle claim, a production deployment, or permission to deploy. The final commit/CI must be taken from GitHub, not this prepublication report.

## Engineering and safety boundary

- Independently testable RTC 2 wire primitives: bounded cursor discovery (limit 1–100, exact total count, stable continuation, no schemas in search) and HMAC-checked opaque cursor tied to pass, caller's principal, profile, mode, areas and exact filters. Every returned page is limited to 8,192 serialized bytes.
- Independently testable UTF-8 canonical content recovery via 1-based pages with exact bytes/pages/count/terminal next. Stored the already-scrubbed JSON text in a new additive nullable result_store.canonical_text column; old JSONB results and RTC 1/MCP 0-based pages stay unchanged. Old results with no canonical text do not misrepresent themselves as byte exact under RTC 2.
- New RTC 2 result handles bind to the issuing pass (even if another pass references the same client and tenant) using a distinct server-derived hash. The old RTC 1/MCP hash algorithm remains unchanged.
- RTC 2 wireVersion:2 is injectable into the HTTPS handler for conformance tests, not yet enabled in the production API handler. Actual manifest remains RTC 1, and the existing RTC1_ENABLED setting is unchanged. NEVER advertise RTC 2 before R-1 passes, all R-2 permissions/writes/doors, client conformance and exact live source proof are ready.
- Source unit tests: tests/unit/rtc2-wire.test.js, tests/unit/rtc2-http.test.js. Genuine disposable PostgreSQL: tests/db/result-store.test.js. Distinct pass and same-client identity negative tests cover the new grant binding. No real Neon provider or live client touched.

### Remaining full R-2 work

ALL original R-2 criteria 1–8 remain open: RTC 2 manifest/source proof, owner-specified full HTTP pass privileges and write lifecycle, every HTTPS door's response budget, meta/OpenAPI equivalence, independently authenticated backend developer access, full negative/replay/atomic-rate-limit testing, actual client/Neon acceptance, checked deployment. This is a PARTIAL original R-2 implementation, zero completed original subsections and no passed CG gate.

## Custom-tool observations, prioritized

| Priority | Finding | Evidence | Proposed remedy |
| --- | --- | --- | --- |
| High | READY production deployment's commit provenance unavailable. | In this session Vercel deploy list for the actual Neon project reported READY/latest branch live with commit null. | Expose immutable provider-observed source SHA, proof source and unknown state separately from READY. Do not attribute the serving commit by guess. |
| High | Playground multi-step attachment readiness gap. | Native Git workspace opened; provision was allocated but unattached; initial attach returned no_operation_started because the HTTPS runtime was not reachable. Later availability reported execution true after attach/resume. | Expose one resumable open/provision/attach/enforcement-ready flow with phase, error and recommended next action. |
| Medium | Logs add avoidable model-context/paging work. | Logs returned base64; large text included clipped kept_result requiring bounded logs/status reads. | Provide sanitized plain-text tail and explicit next offset, hash, completeness and repeatable pagination. |
| Medium | Playground publication Git fetch remains broken. | Reproduced in this session: npm run session:prepare -- --publish returned exit 1: Git fetch failed; reconcile privately. No fresh publication check. Typed native Git workspace access still works. | Reuse workspace's scoped Git auth or distinguish local checks from remote fetch cleanly. |
| Low | Full-SHA content read intermittency: NOT confirmed as a root-cause defect. | A GitHub content_get full-commit-ref request errored while branch and tree reads succeeded. Unknown if selected file existed. | Distinguish ref-not-found vs path-not-found and report resolved head. |
| Low | Default Playground image has no ripgrep. | rg was missing; Node and PostgreSQL available. | Install ripgrep or provide equivalent bounded grep examples. |
| Positive | GitHub connector exposes real release identity and updates. | github_whoami surfaced release version, immutable commit, release source and change lookup, and typed native Git gave actual worktree/head/status. | Standardize this pattern across RAS fleet. |

Confirmed evidence is separated from previously observed/unconfirmed items. The frozen R-2 bundle plan was committed previously at 53657f02e6774c448a264cc8e09fefddaeda2003. Rerunning the PRE-CODE bundle-plan command after implementation properly refused the outdated plan baseline; do not rewrite frozen scope merely to pass. Full original R-2 delivery accounting remains CONTINUE. No other repository or MCP deployment was modified.

### 2026-11-03 R-2 scoped-rate follow-up

The early RTC pass route previously hardcoded 60 admitted calls/minute
despite original R-2 requiring configurable per-pass limits. New
code propagates owner-selected caps from the protected form through
one-time issuance, additive storage, exact per-request readback and
PostgreSQL atomic admission. A real disposable Postgres fixture
checks a cap of three across two DB adapters, eight concurrent
calls, denial and immediate revocation. Distinct from accepting
any higher authority: current preview/read_only/24h/project-key
scope is unchanged. Neither a live provider account nor a
production RTC pass was exercised.

### 2026-11-03 full synthetic RTC 2 tenant isolation proof

A third-party client was not connected. Instead, disposable
PostgreSQL persistence and independent HTTP handler adapters are
used to check 3 hashed passes/2 synthetic tenants, genuine SQL result
ownership, exact 1-based UTF-8 recovery, denial of a cursor to a
different pass even in the same tenant, denial of same-handle reads
across tenants and same-tenant passes, denial after revocation, and
no acceptance of MCP OAuth bearer tokens at the RTC door.
The source test intentionally tries storing forged raw canonical
text containing a `secret` property and verifies DB refusal
before persistence. All CG provider/client and deployment probes
are still separate and unfinished.
