# Native/direct connector identity and end-user authority — scoped implementation card

Owner directive: 2026-10-19. This is **a scoped contribution to existing D-4 and R-2**, not a new original roadmap subsection or a declaration of project completion. Existing acceptance queues, live deployment/release and provider-owner gates stay intact. The current code already has OAuth-protected remote Streamable HTTP MCP at `/api/mcp` and optional RTC 1 HTTP doors. `src/core/profiles.js` currently has a verified guarded D-4 `neon_role_delete` operation omitted from its write allowlist: authorize it only for declared `full` profile in a Production deployment, while B-1 and tool-specific one-time preview/consent, resource protections and live production rules still independently apply.

## Finite acceptance for this branch

1. The public landing JSON, OAuth consent screen, owner setup screen, public RTC manifest/OpenAPI and native MCP advertised display name use **Neon by Robinson AI Systems**, without changing the stable `robinson-neon-mcp` protocol identifier, existing tool prefixes, URLs, OAuth issuer, registered client IDs or stored tokens.
2. A full-profile authenticated native MCP connection on a production deployment lists and can reach `neon_role_delete` only through the existing independently verified D-4 handler and all existing app, dependency, spend, production, one-use and provider readback guards. Preview deployments, everyday/read_only profiles and RTC temporary passes cannot reach it; direct-name bypasses fail.
3. Unit tests assert allowed and refused listing/dispatch paths, consistent product metadata and no unsafe change to dynamic OAuth connection scope. Tests requiring a real disposable database and all mandatory publication checks must run via approved CI; no local/real-provider acceptance is claimed from static checks.
4. Record the remaining developer-only-versus-product-policy classifications and source paths as auditable follow-up; do not activate RTC1 or production, change credentials, publish publicly, spend or call a real provider merely to prove this change.

<!-- bundle-plan:start -->
```json
{
  "baseRevision": "7a82af7411d3531caee582f3296fe0c2ceb288b5",
  "workKind": "ENGINEERING",
  "outcome": "A native, independently authorized Neon MCP client sees correct Robinson AI Systems service attribution and can discover and invoke the already-implemented verified full-owner role-retirement tool without crossing production, preview or profile boundaries.",
  "integrationBoundary": "Existing direct OAuth/MCP and optional RTC surfaces, shared policy selection, signed-in owner setup and scoped D-4 role-retirement execution; stable technical names, resources and security guards unchanged.",
  "newEngineering": [
    "Shared display-name constant across public product identity, OAuth consent, owner setup and RTC/OpenAPI without changing stable protocol IDs",
    "Unhide existing independently guarded neon_role_delete for eligible full-owner production deployment; retain actual B-1/B-2/B-3 per-request protection",
    "Unit regressions for correct discovery/authorization/guard denial and consistent metadata; explicit unfinished direct-client and external acceptance inventory"
  ],
  "estimatedProductionLines": 120,
  "relatedWorkDecision": "Owner-directed cross-cutting implementation contribution under existing D-4 and R-2 criteria, NOT a declaration that either whole subsection or a counted full bundle is complete. Broader universal authority audit, RTC pass expansion and real client acceptance remain open.",
  "subsections": [
    {
      "id": "D-4",
      "acceptance": [
        "Every database, role and connection tool is registered with exact scoped identity, audited write guards and secret-safe results; no live provider writes without owner-approved acceptance.",
        "An authorized owner can complete independently reviewed role retirement with exact one-use consent and full provider/readback evidence, while read_only, everyday, preview and protected targets are refused."
      ],
      "remainingEngineering": [
        "Independent LIVE connected/provider/idle-pooled client acceptance and full remaining D-4 original criteria; this PR corrects the direct-MCP full-owner visibility regression only."
      ]
    },
    {
      "id": "R-2",
      "acceptance": [
        "HTTPS tool API, manifest and OpenAPI per RTC 1; direct MCP remains independently accessible and connection identity is recognizable without breaking the transport.",
        "Write-contract checks through MCP, delegated meta-calls and HTTPS; real-client authentication/session/refresh/revocation; shared database rate-limit concurrency."
      ],
      "remainingEngineering": [
        "RTC 1 full authorized pass and Hub-spec conformance and real clients remain tracked separately; no current PR claim of completion."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Prior evidence / external completion separation

Current main baseline above, no open PR at branch start. Direct MCP code-level availability is not a real desktop/mobile client result; RTC 1 HTTP exists but its pass route remains intentionally limited. Existing provider and actual deployment evidence must be revalidated against source/live revisions, not inferred from this plan. All implementation and full acceptance not listed above remain open.
