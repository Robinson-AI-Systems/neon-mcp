# Design — Batch U: Universal tools (every other Neon operation)

Status: **DRAFT — awaiting Chris's approval (IN-00)**. Written 2026-10-10. Scope and acceptance: `docs/PLAN.md` →
Batch U. Card U-1. Depends on Batches B and C (and A-4's vendored description).

Goal: hand-built tools cover the common jobs comfortably; four universal tools reach **every** operation in Neon's API —
VPC endpoints, Auth users and webhooks, the Auth email provider, storage writes, Function custom domains, trigger writes,
scoped credentials, AI Gateway, anything Neon adds — with the same safety rules. In compact mode they cost nothing until
used. Research audit Appendix A marks which operations are "U".

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| U1 | The vendored description matches what `@neon/sdk` was generated from (or the drift script lists the differences) | `cat vendor/neon-openapi/SOURCE.md`; `node scripts/neon-api-drift.mjs --offline` |
| U2 | `src/neon/client.js` can call any operation by operationId through the SDK's `raw` layer (or a raw request that keeps the key, budget and retry policy) | read `node_modules/@neon/sdk/dist/raw.d.ts` (≤150 lines around the exported request helper) |

## 1. Decisions

**U1. Tools:** `api_search(query)` (method, path, operationId, summary, and the marks: reads / changes / deletes / spend /
production / access / secret / deprecated), `api_describe(operationId)` (parameters and body trimmed from the
description), `api_read(operationId, params)` (GET; Batch C result rules apply), `api_write(operationId, params, body)`
(POST/PATCH/PUT/DELETE; `full` profile only; passes need `allow_writes`).

**U2. Only what Neon describes.** Every request is checked against the vendored description: unknown operation, unknown
parameter, missing required field, wrong type → refused in words. Deprecated operations (all "Auth (legacy)") are
refused with the current operation's name.

**U3. `api_write` always needs `confirm`** (and supports `dryRun`); the preview shows the operation in plain words, the
exact parameters, and the target as it is now (read first when the path has a project/branch/endpoint ID).

**U4. The guards apply by reading the path.** A path with `{project_id}` and `{branch_id}` (or `{endpoint_id}`) →
`classifyTarget` (B-2): production targets need production access and confirm; protected resources are refused; the app
guard (P3) runs for profiled projects. Project-level writes (`/projects/{project_id}` PATCH, VPC restrictions, JWKS) are
`projectWide`. Organization paths are owner actions (org key).

**U5. Spend, access and secrets come from tables** (`src/neon/operation-marks.js`), generated once from Appendix A and
reviewed by hand: spend operations get the dollar preview and caps (B-4); access operations are always `A`; operations
whose responses contain secrets (`x-sensitive` fields of the secret kind, credentials, presigned URLs, keys) put them on
the one-time page and return the rest. **Unknown operations** (added by Neon after the last review) whose path creates or
updates computes, projects, branches, snapshots or storage are treated as spend, and any unknown response field matching
the secret patterns is removed — the safe default until the table is updated.

**U6. Hand-built tools win.** If a hand-built tool covers the operation (`src/neon/hand-built-map.js`, from Appendix A),
`api_write` refuses and names it, so curated checks (preserve-on-restore, exact SQL previews, last-admin protection) are
never bypassed. `api_read` allows any GET (reads are harmless) but prefers suggesting the hand-built tool in its note.

**U7. Read-back and undo.** After a write, read the target back when the response or the path has an ID (otherwise
`confirmed: null`); undo for operations whose inverse is clear in the table (set/unset pairs, delete with Neon recovery).

## 4. Work units

### U-1 — Universal tools (L, medium effort)
Files: `src/tools/universal.js`, `src/neon/openapi-index.js` (search and validation), `src/neon/operation-marks.js`,
`src/neon/hand-built-map.js`.
Tests: unknown operation and unknown parameter refused; deprecated refused naming the replacement; no-confirm changes
nothing; `api_write` on `deleteProjectBranch` refused naming `branch_delete`; a production branch path in preview mode
refused; protected resource refused; an unlisted create on computes treated as spend; a credential-create response has no
secret (key-scan) and a one-time link; `api_search "custom domain"` and `"vpc endpoint"` find the right operations; 30
random GET operations' request shapes validate against the description.

## 5. Stop-and-ask points

1. U2 false (no raw path that keeps the client's policy): stop; amend to call the SDK's per-operation functions only.

## 6. Acceptance mapping

| PLAN Batch U line | Evidence |
|---|---|
| Every request validated against Neon's description | `tests/unit/universal.test.js` |
| Safe defaults for unknown spend and secrets | same |
| Same guards as hand-built tools | write-contract through `api_write` |

## Amendments
