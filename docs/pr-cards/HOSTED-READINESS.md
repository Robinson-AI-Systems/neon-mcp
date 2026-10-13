# Hosted readiness — actual routes and authenticated acceptance

Approved A-3/A-7 connector deployment and existing RTC adoption; primary owner outcome
2026-10-13. Baseline #110 d96232f63f462eba49b5fd01673579760c401e51.
Prerequisites implemented A/B/C; D-4 deletion and D-5 remain blocked, unchanged.
One packaging risk area, no migration, no live/provider write or manual release.

Read only: api/{contract,mcp,rtc}.js, src/tools/index.js, src/neon/sql-guard.js,
installed pinned libpg-query package, vercel.json, hosting policy, AI-PR-READ-FIRST.

Drift A: hosted READY and six selected-project keys verified; public API functions
actually crash before guards. OAuth discovery works. Full registry transitively
imports libpg-query, whose eager loader reads a binary not explicitly included.
Do not substitute READY, fake-provider tests or connectors for runtime acceptance.

#111: explicit includeFiles for the pinned WASM; isolated dependency-package test
parses genuine SQL and reproduces missing-binary failure. Retain original AST guard.
Reconcile setup records and workflow directives in this substantive repair.
Done: check/unit/db and exact-head CI/release-policy, full diff self-review and late
reviews handled. Deployment validation waits for scheduled exact-revision release.

External acceptance: securely authorize scoped read_only OAuth; harmless read,
foreign-resource/write denial, expiry and revoked credential reuse. RTC remains
OFF until its owner/resource-isolation contracts hold. Hub optional; direct OAuth
must remain independently usable. No preview-to-TEST relabel or broad-key fallback.

Reference: https://vercel.com/docs/project-configuration#functions
#112: read-only transport result error containment: await the asynchronous scrub/projection/storage result inside dispatch try/catch, preserve the generic denial and service-error shape on single and batch routes. Adversarial tests reject storage after a microtask, deny results over storage cap and invalid projection; assert no provider exception, credential marker or partial batch escapes. No permission/production/RTC mode change. Source/CI do not prove hosted behavior.\n\nNext: verify exact checked #111+ release, public startup routes and separately authorized harmless OAuth read, denial, expiry, revocation. While external acceptance remains gated, advance approved independent D-7/D-8 work.
