# CAP-8 — Stored-record hard delete for revoked rows, and the RTC pass list surface

**Status:** COMPLETE at source — built 2026-11-04 (overnight queue) on branch `ai/vivienne/cap-6-8-registration-lifecycle`. Delivered: `countPurgeableStoredRecords` / `purgeRevokedStoredRecords` in `src/db.js` (hard-deletes `neon_keys` rows and `oauth_tokens` rows where `revoked_at IS NOT NULL`, token rows also once expired; a live row is never purgeable), the guarded owner tool `neon_purge_revoked_records` in `src/tools/owner-administration.js` (preview shows per-table counts; confirm deletes and journals the counts through the change log), and the RTC pass list surface `neon_list_rtc_passes` in `src/tools/owner-reads.js` wiring the previously caller-less `db.listRtcPasses` (now also returning `created_at`; summaries carry pass id, project, created/expires and revoked state — never a token value). Proof: `tests/db/oauth-client-lifecycle.test.js` (purge deletes exactly the dead rows, live key and token rows survive, counts match rows removed; pass list over inserted pass rows) and purge cases in `tests/unit/owner-administration.test.js`. Rides the 2026-11-05 00:01 automatic promotion; no owner release fired.
**Batch:** CAP — Maximum-authority capabilities (retroactive census program).
**Design:** `docs/designs/MAXIMUM-AUTHORITY.md`.
**Prerequisites:** CAP-1 (the 2026-11-04 two-source re-census supplies the census of record).
**Baseline inspected:** `main` `3fe41498633cbe4f16044d10a9cb6b350814148d` (server inventory freeze, 2026-11-04).
**Risk area:** Credential hygiene — revoked vault-key rows keep their ciphertext forever today, and revoked/expired token rows accumulate without bound; the purge must be provably incapable of touching a live row.
**Budget:** 400.
**Effort:** one guarded purge tool over two tables + wiring the existing pass-list query into the connections read surface.

## Read only these

- This card; `docs/COMPLETION.md` row 15 and the re-census record section (server-self table).
- `src/db.js` (`listRtcPasses` at line 156 and the `neon_keys` / `oauth_tokens` accessors), `src/tools/admin/connections.js`.

## Drift check CAP-8

| Card assumption | Actual | Kind | Correction |
|---|---|---|---|
| Revoked rows are never hard-deleted today | Confirmed by the code census: no `DELETE FROM neon_keys` and no `DELETE FROM oauth_tokens` exists anywhere; hard deletes in the codebase are confined to authorization codes, one-time secrets, secret requests, the result store, rate limits and the production-intent settings row | matches | — |
| Outstanding RTC passes cannot be listed | `db.listRtcPasses` exists at `src/db.js:156` with zero call sites — no tool, page or route calls it; passes can only be revoked one at a time by ID from the setup page | matches | The list leg is a wiring job, not a new query |
| A purge keyed on revocation state cannot touch live rows | Both tables carry `revoked_at`; token rows also carry `expires_at` | matches | Purge predicate is `revoked_at IS NOT NULL` (plus expired token rows), proven by test against live-row fixtures |

## Build

| File | What |
|---|---|
| `src/db.js` | Add a purge operation deleting `neon_keys` rows and `oauth_tokens` rows where `revoked_at IS NOT NULL` (token rows also when expired), returning per-table counts; keep `listRtcPasses` as the pass-list query |
| `src/tools/admin/connections.js` | Surface outstanding RTC passes in the connections read (safe summaries only — id prefix, label, created/expires, revoked state; never a token value); add the owner-guarded purge tool built with `defineWrite` — preview shows per-table counts, confirm deletes and journals the counts |
| `tests/` | Purge never deletes a live (unrevoked, unexpired) row in either table; pass list shows outstanding passes with no secret material; purge counts match the rows actually removed; the change log records each purge |
