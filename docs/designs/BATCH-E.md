# Design — Batch E: Neon backend services (Auth, Data API, storage, Functions, triggers, logs)

Status: **APPROVED** (Chris, 2026-10-10). Written 2026-10-10. Scope and acceptance: `docs/PLAN.md` →
Batch E. Cards E-1, E-2. Depends on Batches B, C, D, P. Tool list: `docs/TOOL-CATALOG.md` section Neon backend services.

Why late: Neon made these generally available on 2026-09-18 (changelog). None of Chris's current projects uses them
(Appliance Desk uses Better Auth and Vercel Blob), and Batch U already reaches every one of their operations with the
same guards. They matter for future projects built on Neon's whole backend. Hand-build the common reads and setup; leave
rare writes to `neon_api_write` until the change log shows repeated use (ROADMAP signal).

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| E1 | Neon Auth branch operations (`/projects/{id}/branches/{id}/auth…`) exist and the legacy `/projects/auth/*` ones are deprecated | `node scripts/openapi-find.mjs "neon auth"` |
| E2 | Trigger, log and Functions custom-domain operations are in the vendored description (they were newer than the July 2026 file) | `openapi-find "trigger"`, `"logs query"`; if missing, re-vendor first (A-4 drift script) |
| E3 | Function deployment accepts code by URL or archive upload, and what size limit applies | `openapi-find "deploy function"`; read the request body |
| E4 | Neon Auth users live in the `neon_auth` schema and can be listed by SQL | Neon Auth docs; a real-Postgres fixture of the schema |

## 1. Decisions

**E1. Auth respects profiles.** `neon_auth_enable` is refused on a profiled project whose `auth` is `'other'` (Appliance Desk
uses Better Auth; enabling Neon Auth would add a `neon_auth` schema next to the app's own tables) unless `outsideApp`.

**E2. Secrets in: the setup page.** `neon_auth_set_oauth_provider` takes the client ID in the call; the **client secret** is
typed by Chris on the setup page through a secret request (A12): the first call returns the link and
`needsSecret: <requestId>`; the second call (with `secretRequestId`) consumes it once. Same pattern for an SMTP password
through `neon_api_write` on the email provider operation.

**E3. Exposure is access.** `neon_dataapi_enable`/`neon_dataapi_update` and `neon_auth_set_trusted_domains` (adding) are `A`: the
preview lists the schemas and tables that become reachable over HTTP and tables without row-level security
(from the catalog), and the redirect domains added.

**E4. Storage bytes never go into chat.** `neon_storage_list_objects` returns keys, sizes and dates; downloading object bytes
and presigning URLs are `neon_api_*` only (presigned URLs are treated as secrets: one-time page).

**E5. Function deploys on production branches are production writes** (`neon_function_deploy`: production guard, confirm,
read-back of the deployment status through operations or the function's state).

## 4. Work units

### E-1 — Neon Auth and Data API (M, medium effort)
Tools: `neon_auth_get`, `neon_auth_enable`, `neon_auth_disable`, `neon_auth_update_config`, `neon_auth_set_trusted_domains`,
`neon_auth_set_oauth_provider`, `neon_auth_list_users`, `neon_dataapi_get`, `neon_dataapi_enable`, `neon_dataapi_update`, `neon_dataapi_disable`.
Tests: profile refusal; secret request flow (secret never in a result or log); exposure preview lists RLS gaps on real
Postgres; disable is production-guarded.

### E-2 — Storage, Functions, triggers, logs (M)
Tools: `neon_storage_list_buckets`, `neon_storage_list_objects`, `neon_function_list`, `neon_function_deploy`, `neon_trigger_list`, `neon_log_query`.
Tests: no object bytes in results; deploy on production needs production access and confirm; log query paging and size
cap.

## 5. Stop-and-ask points

1. Any E0 row false: amend before that card.
2. A Neon backend feature that bills separately (e.g. AI Gateway credits): guided only, never bought.

## 6. Acceptance mapping

| PLAN Batch E line | Evidence |
|---|---|
| Every listed tool built; profiled apps' auth choice respected | `tests/unit/auth.test.js` |
| No secrets or object bytes in results | key-scan test + `tests/unit/storage.test.js` |

## Amendments
