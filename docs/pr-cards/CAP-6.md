# CAP-6 — Client registration lifecycle completion: owner-facing list/read, update and delete

**Status:** COMPLETE at source — built 2026-11-04 (overnight queue) on branch `ai/vivienne/cap-6-8-registration-lifecycle`. Delivered: `listOAuthClients` / `getOAuthClientSummary` / `updateOAuthClient` / `deleteOAuthClient` in `src/db.js` (summaries never expose `client_secret_hash`; delete revokes the registration's live connector tokens and clears its pending codes), owner tools `neon_list_oauth_clients`, `neon_get_oauth_client`, `neon_update_oauth_client`, `neon_delete_oauth_client` in `src/tools/owner-registrations.js` (full profile; writes via `defineWrite`, production allowlisted as internal controls). Layout drift recorded: the repo has no `src/tools/admin/` — tools are flat modules; the connections-family idiom followed is `src/tools/owner-administration.js`. Proof: `tests/db/oauth-client-lifecycle.test.js` (register → list → update with credential preserved → delete with token cascade, on disposable Postgres) and `tests/unit/owner-registrations.test.js` (preview names client + live token count, no-confirm refuses, confirm deletes exactly once). Rides the 2026-11-05 00:01 automatic promotion; no owner release fired.
**Batch:** CAP — Maximum-authority capabilities (retroactive census program).
**Design:** `docs/designs/MAXIMUM-AUTHORITY.md`.
**Prerequisites:** CAP-1 (the 2026-11-04 two-source re-census supplies the census of record).
**Baseline inspected:** `main` `3fe41498633cbe4f16044d10a9cb6b350814148d` (server inventory freeze, 2026-11-04).
**Risk area:** Registration lifecycle — deleting the wrong client registration, or one whose tokens are live, cuts off a real integration; every removal ships guarded (preview → confirm) with the token cascade shown before the confirm.
**Budget:** 450.
**Effort:** owner read surfaces for registrations + a guarded delete (and metadata update) with token cascade.

## Read only these

- This card; `docs/COMPLETION.md` row 15 and the re-census record section (server-self table).
- `src/db.js` (`createOAuthClient`, `getOAuthClient`), `src/routes/oauth.js` and `api/oauth-register.js` (the DCR create door), `src/tools/admin/connections.js` (the existing safe-summary shape for connection rows).

## Drift check CAP-6

| Card assumption | Actual | Kind | Correction |
|---|---|---|---|
| Registrations are written by the DCR endpoint and read only internally | Confirmed by the code census: `createOAuthClient` at `src/db.js:128`; `getOAuthClient` feeds only the authorize/token flows; no list, update or delete operation exists anywhere in `src/` or `api/` | matches | — |
| Registration rows expire on their own, so removal is a nicety | `oauth_clients` carries no expiry; token rows expire, registrations do not — an abandoned registration persists forever | matches | The delete leg is a genuine lifecycle leg, not cleanup |
| Deleting a registration must not strand live grants silently | Token rows reference the client; the preview can count live tokens per registration from `oauth_tokens` | matches | Preview shows the count; confirm revokes those token rows as part of the removal and journals both |

## Build

| File | What |
|---|---|
| `src/db.js` | Add `listOAuthClients` (safe columns only — never `client_secret_hash`) and `deleteOAuthClient` (deletes the row, reports the live token rows it revoked); add `updateOAuthClient` for metadata (name, redirect URIs) if the DCR record shape allows it without touching issued credentials |
| `src/tools/admin/` (connections family) | Owner tools: a read-only list/read of client registrations, and a guarded delete built with `defineWrite` — preview names the client, its age, and its live token count; confirm removes the registration and revokes its token rows; an update tool for registration metadata on the same guarded pattern |
| `tests/` | End-to-end: register via DCR → list shows the registration → delete preview counts its tokens → confirm removes it and its tokens stop working; list/read never return secret material; delete refuses without a matching confirm |
