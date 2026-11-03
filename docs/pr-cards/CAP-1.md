# CAP-1 — Operation and credential coverage inventory

Status: IN_PROGRESS (planning freeze only; no engineering completed, no original unit credited).
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

Pending source edits, real fake-provider/regression tests, checked exact-head CI and independent release proof. All seven frozen acceptance lines remain open until individually evidenced.
