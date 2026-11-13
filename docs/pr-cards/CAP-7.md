# CAP-7 — Organization unenrollment: remove an enrolled organization

**Status:** Filed by the 2026-11-04 capability re-census (see `docs/COMPLETION.md` row 15 and its re-census record); build not started.
**Batch:** CAP — Maximum-authority capabilities (retroactive census program).
**Design:** `docs/designs/MAXIMUM-AUTHORITY.md`.
**Prerequisites:** CAP-1 (the 2026-11-04 two-source re-census supplies the census of record).
**Baseline inspected:** `main` `3fe41498633cbe4f16044d10a9cb6b350814148d` (server inventory freeze, 2026-11-04).
**Risk area:** Account lifecycle — unenrolling the wrong organization, or one with live stored keys and connection tokens, strands real access; removal ships guarded (preview → confirm) with the full cascade enumerated first.
**Budget:** 350.
**Effort:** one guarded unenroll tool with a revoke cascade over the org's stored keys and token rows.

## Read only these

- This card; `docs/COMPLETION.md` row 15 and the re-census record section (server-self table).
- `src/db.js` (`upsertNeonOrg`, the `neon_keys` and `oauth_tokens` accessors), `src/tools/admin/connections.js` and `src/routes/setup.js` (the enrollment door the removal mirrors).

## Drift check CAP-7

| Card assumption | Actual | Kind | Correction |
|---|---|---|---|
| Enrolled organizations are upsert-only today | Confirmed by the code census: `upsertNeonOrg` at `src/db.js:136`; no `deleteNeonOrg` and no `DELETE FROM neon_orgs` exists anywhere — once enrolled, an organization cannot be unenrolled through the server | matches | — |
| An org row is referenced by other records the removal must account for | Stored keys (`neon_keys`) and connection token rows carry the organization; both are enumerable per org for the preview | matches | Preview lists stored-key count and live token count; confirm revokes both before deleting the org row |
| Re-enrollment after removal is the ordinary setup flow | The setup door upserts; a deleted row re-enrolls cleanly | matches | No tombstone needed; the change log entry is the durable record of the removal |

## Build

| File | What |
|---|---|
| `src/db.js` | Add `deleteNeonOrg` (deletes the org row after the cascade) plus per-org counts of stored keys and live token rows for the preview |
| `src/tools/admin/` (connections family) | A guarded unenroll tool built with `defineWrite`: preview names the organization and enumerates what removal revokes (stored keys, live tokens); confirm performs revoke cascade → row delete → journal; the owner setup page gains the matching removal action |
| `tests/` | Unenroll refuses without a matching confirm; after unenroll the organization no longer appears in `neon_list_accounts` / `neon_whoami`; the cascade revokes exactly the org's rows and no others; re-enrollment after removal succeeds |
