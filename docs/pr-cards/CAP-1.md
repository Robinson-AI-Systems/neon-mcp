# CAP-1 — Operation and credential coverage inventory

Status: IN_PROGRESS (source inventory engineering in draft PR #203; original unit incomplete and uncredited).
Design: docs/designs/MAXIMUM-AUTHORITY.md; dependent CAP-2/CAP-3 require complete evidence first.
Owner acceptance: no live permission, compute, provider, credential or production actions authorized.

## Frozen bundle plan — before implementation

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "69c46b71b6ab35e483f42338618146d1a377d074",
  "outcome": "Produce and verify the first complete operation-level authority and implementation-coverage inventory for Neon MCP, with honest current-interface gaps, credential uncertainty and separate source versus released-product proof.",
  "integrationBoundary": "Source-only operation metadata and reporting built from the pinned vendored Neon control-plane OpenAPI, the registered tool/handler source, and separately sourced newer Neon product surfaces; no production credential, issuer, provider data, database or server permission change.",
  "newEngineering": "Implement a deterministic checked catalog generator, independent validation of source/schema keys, precise credential and functional dispositions, operation-aware source-handler mapping, multi-host source distinction, reproducible family-gap reports and negative/failure tests wired into CI check.",
  "relatedWorkDecision": "CAP-1 is a substantial whole prerequisite on its own. CAP-2 and CAP-3 require this validated inventory and separately frozen live authorization and guided enrollment semantics, so their integration is deferred rather than invented or counted as part of CAP-1.",
  "estimatedProductionLines": 540,
  "subsections": [
    {
      "id": "CAP-1",
      "acceptance": [
        "One deterministic machine-readable row per pinned control-plane method/path/version and every separately evidenced advanced Neon product workflow, with checked source revision, canonical host and unique operation key.",
        "Every row explicitly distinguishes personal, organization, project API key, SQL login, delegated OAuth and product-specific credential support from unsupported or unknown, with exact resource and permission uncertainty retained.",
        "For each operation record method, family, source and target host, version, side effect classification, entitlement and scope evidence, existing handler or missing engineering, source tests, original owning roadmap item and separate released/live proof state.",
        "Guarded universal dispatch counts as implemented for an operation only if actual credential routing, request shape, policy guard, response and retry/readback semantics are verified; duplicate named tools and aliases must not inflate unique-operation coverage.",
        "Deterministic validator rejects duplicates, missing or orphan operations, broken schema source pin or drift, invented supported credentials, mismatched handler references, and unsupported disposition values without producing deceptively green coverage.",
        "Generated family gap report has reproducible denominators and explicit exclusions, separate implementation and released-live evidence, unknown/newer-provider interfaces called out individually, and no invented numerical capability percentages.",
        "Tests exercise the real vendored schema and source registry, fake documented newer product surface records, negative duplicate/orphan/unsupported/incorrect-scope cases, bounded execution and a clean CI consistency check; no real customer data or provider effects."
      ],
      "remainingEngineering": [
        "Build source adapter and deterministic machine-readable operations with pinned source provenance and explicit other-host statuses.",
        "Build source-handler, credential, source-test and authority evidence mapping with no speculative provider capabilities or fake coverage.",
        "Build strict duplicate, orphan, hash drift, schema and negative-case verification and family gap reporting with honest separate proof denominators.",
        "Wire reproducible script into normal checks and add focused fake-provider/unit tests, documentation and exact-head CI evidence."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Delivery and provenance

Source-stage changes are present on the unmerged CAP-1 draft branch. Earlier exact-head CI was green before the current SDK-reference extension; recheck after a new push. Current-method, permission, registered-handler and real released/provider proof are not complete. All seven original criteria remain open. All seven frozen acceptance lines remain open until individually evidenced.

## 2026-11-03 implementation and truthful acceptance accounting

- Plan frozen before source editing at commit
  50342cc66d5b698334b6952c7f1e0f431eb7c7af on a separate native
  Git branch, from main 69c46b71b6ab35e483f42338618146d1a377d074.
- Criteria 1 and 2, source stage: 163 unique method/path/operationId rows
  generated from exactly pinned July 2026 OpenAPI; 15 separately sourced
  current Neon Auth, Data API, Functions, Object Storage, AI Gateway and SQL
  workflow records, never silently counted in the same API denominator.
  All six credential kinds carry explicit supported/unsupported/unknown
  evidence, scope and provider-reference status. Newer API endpoints remain
  unpinned and are not claimed exhaustive.
- Criteria 3 and 4: provider operations have source-file and registered-tool
  *candidates* derived from exact literal operationId references and exact
  registry handlers, plus any matching test files. They are NOT counted as
  fully functional without independently tested credential routing, policy,
  provider request/response, retry and readback. U-1 is a conservative
  universal fallback owner; exact direct-card ownership needs reconciliation.
- Criteria 5 and 6: deterministic independent validator checks duplicate,
  missing, orphan, invalid credential state, spoofed live proof, mismatched
  handler and source/provenance, as well as generated artifacts against
  checked source. Generated family counts show exact denominators and
  separate candidate/verified-source/live states, not an invented
  percentage. The document and JSON map are under docs/capabilities.
- Criterion 7: focused unit tests use the actual pinned OpenAPI and registry
  plus a synthetic newer-product interface. Run from the final source head
  and capture exact test/CI result in the PR; tests are not provider
  acceptance. No database test is called for by this read-only inventory:
  it does not mutate permissions or persistent user state.

**Unfinished whole-item acceptance:** refreshed/exhaustive official current
interfaces, each operation's exact request/response test mapping, per-key
provider-permission and documented scope classification, original direct card
ownership, and source-versus-real-provider operation acceptance evidence.
The original CAP-1 unit remains IN_PROGRESS, not COMPLETE. CAP-2 and CAP-3
remain dependent and are not silently started. No production credentials,
Neon resources, DNS, account grants or release state were changed.

## Drift check A — original authority inventory versus present implementation

- Original CAP-1 asks for current provider operation coverage, separate
  credential kinds and exact handler/request/response/real-provider evidence.
  The repository has a July 2026 pinned OpenAPI and 131 registered tools;
  neither is proof of the latest Neon provider method set or permission reach.
- Existing code is reused rather than duplicated: src/neon/openapi-index.js
  and src/core/registry.js define the trusted operation/registered-handler
  entrypoints. The CAP-1 generator adds validation/reporting, not a new
  universal API dispatcher, sign-in flow or provider mutation.
- Newer provider surfaces confirmed through official Neon docs in this
  session include Managed Better Auth, Data API, Functions, branch Object
  Storage, AI Gateway and data-plane Postgres SQL. They have distinct hosts
  or credential mechanisms; unpinned methods remain explicitly unknown.
- An occurrence of an operation ID in a tool module is reported only as a
  candidate source match; no plan or code reference is treated as verified
  authorization or an accepted released feature. CAP-1 stays IN_PROGRESS.

### Custom GitHub/Playground regression after owner restored connector permissions

The connected custom GitHub MCP advertises Full and native Git operations
continue working in the existing branch/workspace. However, the attached
Playground runner reproduced a separate publication defect even after the
permission restoration: npm run session:prepare -- --publish exited 1 with
"Git fetch failed; reconcile privately. No fresh publication check."
That is a concrete developer-tool inconsistency, NOT proof that repository
read/write grants are missing; use the native Git fetch/push path and actual
GitHub exact-head Actions to verify publication. Record the failure without
weakening the repo publication check or claiming it passed.


## 2026-11-03 — official SDK control-plane gap reconciliation (unmerged)

The publicly accessible official neondatabase/neon-pkgs OpenAPI JSON is
pinned to commit 167229f949438fb942809b72dd410888c70943a9
(2026-11-03T00:12:00Z), checked byte-for-byte at SHA-256
fcc7b2c39f15df03adedf90aa7cde7f1f5e7729ae50b10fd9c7a959f3fb1f82d.
Its 193 current SDK operation signatures were directly compared with the
163-method runtime vendored OpenAPI: 162 common method/path signatures,
31 newly present SDK-only and one vendored-only signature. No known
operationId renaming on a common signature. The SDK version is evidence
of official published documentation, NOT an independently attested live
API schema or an entitlement for any user credential.

Implementation: docs/capabilities/current-control-plane.json records all
193 official method/path/id/family signatures, immutable upstream origin,
source SHA and a checked projection digest. The generator includes each
of the 31 SDK-only methods in operation-coverage.json, preserving distinct
old runtime, official SDK-only and separately documented product-workflow
denominators; CAP-1-REPORT.md identifies every new/pinned-only operation
and cross-host uncertain workflow. The offline command
node scripts/verify-cap-1-upstream.mjs PATH_TO_PINNED_JSON verifies the
entire downloaded official source's byte hash, host, version and full
method projection. The source validator also rejects signature drift,
duplicate IDs, unverifiable credential changes, resource-selector changes,
incorrect direct owner routing and forged live status claims.

The current SDK evidence does not upgrade src/neon/openapi-index.js,
enable missing handlers, authenticate any new credential, authorize
provider execution, migrate production, or close the original CAP-1.
Existing D/O/E/CAP cards still require exact operation-level request/response
and guard evidence, and the currently untrusted deployed/provider/client
acceptance remains separate. The full reference is a bounded, offline,
reviewable SDK-source artifact, not a substitute for actual Neon validation.

## 2026-11-03 operation-to-handler provenance hardening (continuation)

The inventory initially associated **every named tool in a module** with an
operation whenever the module quoted that operation ID. This was an invalid
operation-to-handler implication. The subsequent CAP-1 source change replaces
this with Espree-parsed *provider invocation* sites, retaining the actual
source path and line. A specific MCP tool is associated only when the call is
inside that registered named handler. Shared helpers remain candidate source
with **no attributed handler** unless and until their call chains are
independently traced and behaviorally tested. Documentation comments and
unrelated string literals are no longer operation evidence.

The validator independently reparses the checked source and rejects forged,
missing or relocated call sites and tool assignments. The inventory's own
unit test is excluded from operation-specific behavioral-test references:
mentioning an operation inside an inventory assertion cannot count as proof
that its provider request, guard, response and readback were tested. The
209-row inventory now has 44 parsed-source candidates, **only 19** with a
directly attributed handler, and 25 sourced from unassigned helpers; none
are asserted to have executed. The remaining 165 operations have no parsed
source-call candidate in the current tool modules. These counts are not an
implementation percentage. New focused attribution, anti-forgery and
self-reference tests must pass with the existing schema/registry tests.

The newest merged source baseline is still PR #201 at
69c46b71b6ab35e483f42338618146d1a377d074; PR #202 and this CAP-1
PR #203 remain drafts until acceptance, reviews and exact-head required CI.
**No original CAP-1 criterion, CAP-2/3 prerequisite or CG gate has been
closed.** Per-operation credential, original-card routing, real behavior,
provider permission and native-client release proof still need independent
work. The original frozen plan is unchanged.

**Local verification (continuation):** `npm run check` passed; 13 focused
CAP-1 tests passed, the complete unit suite passed 1,102 tests across 154
files, and the isolated disposable-Postgres suite passed 125 tests across
48 files. These are source/CI prerequisites, not real Neon-provider or
native-client acceptance. Exact-head GitHub CI must be reverified after push.
