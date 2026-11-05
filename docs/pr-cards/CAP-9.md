# CAP-9 — Consumption and usage reads

**Status:** COMPLETE at source — built 2026-11-04 (overnight queue) on branch `ai/vivienne/cap-9-consumption-reads`. Delivered: `neon_consumption_get` in `src/tools/consumption.js` (flat module — the card's `src/tools/platform/` path does not exist in this repo; read families are flat and register through `src/tools/index.js`), over `getConsumptionHistoryPerProjectV2`, `getConsumptionHistoryPerBranchV2` and the legacy `getConsumptionHistoryPerProject`, all reached through `src/neon/client.js` and paged with the shared cursor helper. Exact integer metric totals per project/branch for a stated period (hourly ≤168h, daily ≤60d, monthly ≤1y, nothing before 2024-03-01, nonsense ranges rejected before any Neon call); dollar figures are estimates priced from the server's stored, source-dated price table in integer cents (the platform returns metrics, never currency) and are labeled as estimates in the result. Project-scoped connections are confined to their project. Proof: `tests/unit/consumption.test.js` through the fake Neon server, which validates request and response shapes against the vendored API description; totals equal the fixtures' line items to the cent. Rides the 2026-11-05 00:01 automatic promotion; no owner release fired.
**Batch:** CAP — Maximum-authority capabilities (retroactive census program).
**Design:** `docs/designs/MAXIMUM-AUTHORITY.md`.
**Prerequisites:** CAP-1 (the 2026-11-04 two-source re-census supplies the census of record).
**Baseline inspected:** `main` `3fe41498633cbe4f16044d10a9cb6b350814148d` (server inventory freeze, 2026-11-04).
**Risk area:** Read-only; the only care is correctness of the money figures (integer cents in, dollars shown) and period handling.
**Budget:** 400.
**Effort:** one read module over the platform consumption-history endpoints, registered and profiled like the other read families.

## Read only these

- This card; `docs/COMPLETION.md` row 15 and the re-census record section.
- `src/neon/client.js` (all Neon traffic goes through it), one existing read family under `src/tools/platform/` for the read-descriptor pattern, `src/tools/index.js` and the profile definitions in `api/mcp.js`.

## Drift check CAP-9

| Card assumption | Actual | Kind | Correction |
|---|---|---|---|
| No tool returns a consumption or usage report today | Confirmed by both census sources: quotas are readable via `neon_project_get_settings` and hypothetical costs via `neon_compute_estimate_cost`, but no tool calls the platform consumption-history endpoints (per-project v2, per-branch v2, legacy plans) | matches | — |
| The owner's monthly usage question ("audit usage for the month", service-map workflow W10) currently has no tool path | The workflow exists in the platform map with no server answer | matches | This card is the platform's W10 answer |
| Reads follow the shared descriptor/profile pattern | Read families register through `src/tools/index.js` and join profiles by the standard membership rules | matches | New tool joins read-only + everyday + full like its sibling reads |

## Build

| File | What |
|---|---|
| `src/tools/platform/consumption.js` (new) | `neon_consumption_get`: a read-only tool over the platform consumption-history endpoints — per-project and per-branch usage for a stated period, returned as a compact summary with money in dollars (integer cents underneath, per the repo money rule) |
| `src/tools/index.js` | Register the new module in the read namespace merge |
| `tests/` | Request shapes validate against the vendored API description through the fake Neon server; period validation rejects nonsense ranges; totals in the result equal the fixture's line items |
