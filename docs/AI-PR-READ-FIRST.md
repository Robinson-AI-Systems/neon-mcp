# Read before any PR that touches production, SQL, secrets, keys, guards, spend, login or passes

Blocking review input, in the spirit of Appliance Desk's audit note and the Stripe MCP's version. Write one line per
applicable item in the PR description saying how it is honored. **Authority distinction:** these are the current builder/owner-deployment security implementation gates, not blanket permanent denials of a separately authorized customer's provider-supported rights. [END-USER-AUTHORITY](END-USER-AUTHORITY.md) and [COMPLETION-GATES CG-3](COMPLETION-GATES.md) require reviewed, tenant-isolated, user-owned policy before public capability expansion. This note does not authorize bypassing any current guard or developer no-spend rule.

## Production data
1. "Production" is decided only by `classifyTarget` (B-2) from Neon's own data (`default`, `protected`, profile branches,
   project-wide tools) — never from a branch name, an argument or the deprecated `primary` field.
2. Every write with `productionEffect: 'write'` on a production target is refused in `preview` mode and needs `confirm`
   in `production` mode — through every door (MCP, `neon_call`, HTTPS, `neon_api_write`). Production access turns on only in
   two steps (tool + setup-page passphrase) and never on a preview deployment of this server.
3. Restores and resets on production always keep the old state (`preserve_under_name`); `neon_snapshot_restore` never
   finalizes; `neon_snapshot_finalize_restore` stands alone, production-guarded (the 2026-09-28 Appliance Desk incident).
4. Deletions never pass `hard_delete`; the inverse (`recover`) is stored.
5. Protected resources (this server's own database, the other Robinson servers') are refused even with confirm and
   production access; the list is edited only on the setup page.

## SQL
6. All SQL goes through the SQL guard: parsed by `libpg-query`, classified, refused when unparseable or in the refused
   class. No string-concatenated SQL anywhere (`quoteIdent` + bind parameters).
7. Reads run inside `BEGIN READ ONLY` with the row cap and statement timeout. `EXPLAIN ANALYZE` only on statements
   classified `read`, or on a throwaway branch.
8. Production writes apply only with a `previewToken` for the same SQL and target, inside one transaction, rolled back
   when affected rows differ from the preview; the restore LSN is recorded first.

## Secrets
9. No Neon API key, role password, connection string with a password, credential token, presigned URL, pass,
   passphrase, encryption key or GitHub token in code, tests, fixtures, logs, change-log rows, result handles, tool
   results or PR text. The key-scan test must stay green; the scrubber runs before anything is stored or returned.
10. Keys and secrets a tool needs enter only through the setup page; secrets leave only through the one-time page.
11. No real Neon organization/project/branch/endpoint IDs or host names in the repo (fixtures use made-up IDs such as
    `br-fake-branch-000001`, `ep-fake-endpoint-000001`).

## Spend and access
12. Existing `# Read before any PR that touches production, SQL, secrets, keys, guards, spend, login or passes

Blocking review input, in the spirit of Appliance Desk's audit note and the Stripe MCP's version. Write one line per
applicable item in the PR description saying how it is honored. **Authority distinction:** these are the current builder/owner-deployment security implementation gates, not blanket permanent denials of a separately authorized customer's provider-supported rights. [END-USER-AUTHORITY](END-USER-AUTHORITY.md) and [COMPLETION-GATES CG-3](COMPLETION-GATES.md) require reviewed, tenant-isolated, user-owned policy before public capability expansion. This note does not authorize bypassing any current guard or developer no-spend rule.

## Production data
1. "Production" is decided only by `classifyTarget` (B-2) from Neon's own data (`default`, `protected`, profile branches,
   project-wide tools) — never from a branch name, an argument or the deprecated `primary` field.
2. Every write with `productionEffect: 'write'` on a production target is refused in `preview` mode and needs `confirm`
   in `production` mode — through every door (MCP, `neon_call`, HTTPS, `neon_api_write`). Production access turns on only in
   two steps (tool + setup-page passphrase) and never on a preview deployment of this server.
3. Restores and resets on production always keep the old state (`preserve_under_name`); `neon_snapshot_restore` never
   finalizes; `neon_snapshot_finalize_restore` stands alone, production-guarded (the 2026-09-28 Appliance Desk incident).
4. Deletions never pass `hard_delete`; the inverse (`recover`) is stored.
5. Protected resources (this server's own database, the other Robinson servers') are refused even with confirm and
   production access; the list is edited only on the setup page.

## SQL
6. All SQL goes through the SQL guard: parsed by `libpg-query`, classified, refused when unparseable or in the refused
   class. No string-concatenated SQL anywhere (`quoteIdent` + bind parameters).
7. Reads run inside `BEGIN READ ONLY` with the row cap and statement timeout. `EXPLAIN ANALYZE` only on statements
   classified `read`, or on a throwaway branch.
8. Production writes apply only with a `previewToken` for the same SQL and target, inside one transaction, rolled back
   when affected rows differ from the preview; the restore LSN is recorded first.

## Secrets
9. No Neon API key, role password, connection string with a password, credential token, presigned URL, pass,
   passphrase, encryption key or GitHub token in code, tests, fixtures, logs, change-log rows, result handles, tool
   results or PR text. The key-scan test must stay green; the scrubber runs before anything is stored or returned.
10. Keys and secrets a tool needs enter only through the setup page; secrets leave only through the one-time page.
11. No real Neon organization/project/branch/endpoint IDs or host names in the repo (fixtures use made-up IDs such as
    `br-fake-branch-000001`, `ep-fake-endpoint-000001`).

## Spend and access
 tools compute an estimate from the target's verified state and dated stored price table; enforce the currently authorized limits, confirmation and independent readback. Development agents may not buy anything or change plans. **The finished product must not interpret this builder restriction as a permanent global end-user ban:** CG-3 tracks user-owned configurable authorization and appropriate execution/guidance for actual provider-supported financial operations, with real price uncertainty disclosed. Do not implement such rights by removing a guard or guessing costs.
13. Every `A` tool (invites, roles, shares, keys, Data API, JWKS, trusted domains, presigned links, passes) needs
    `confirm` and its preview names who gains what.

## Guards and doors
14. No write bypasses `defineWrite`, the production guard, the app guard, the spend guard or the profile filter —
    through any door. The write-contract helper runs through every door that exists.
15. Records and branches a profiled app owns are refused without `outsideApp: true` (Batch P).
16. `read_only` profiles and read-only passes cannot write, even by name; project-scoped connections and passes cannot
    reach other projects.
17. Neon is reached only through `src/neon/client.js` (`@neon/sdk` raw, exact version): retries only on 423/429; never a
    blind resend of a write after a 5xx or network error.

## Login and passes
18. Lockout after 5 wrong passphrases in 15 minutes (database-backed); tokens stored hashed; revoked tokens and expired
    passes refused.
19. Pass defaults stay narrow (preview mode, read-only, 24 h, 60 calls/minute). Widening a default is an owner decision.
20. A token refresh copies every connection setting (organization, project scope, mode, profile, listing) from the
    issuing row — never defaults. Rate limits live in the database (shared by every serverless instance), never in
    memory.
21. Keep the frozen RTC 1 source dialect behavior and conformance intact until the owner-adopted RTC 2 successor is deliberately implemented in its approved R cards. Do not label a docs-only RTC 2 adoption as runtime conformance; test both compatibility and current required RTC 2-specific semantics on actual signed-off source before claiming acceptance.

## Context
22. New tools keep listing descriptions ≤160 characters and default results ≤8 KB or a handle (budget check green).
