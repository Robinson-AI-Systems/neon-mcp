# RACK-1 — Own-store transport: the server's own database runs on plain Postgres

**Status:** Built 2026-11-05 (rack migration staging, move #1) on branch `ai/vivienne/rack-1-store-transport`. Delivered: `src/db-transport.js` — the one place that selects how the server's own store is reached. The Neon HTTP driver remains the transport whenever `DATABASE_URL` names a Neon endpoint (the Vercel deployment; behavior unchanged), and a pooled node-postgres transport serves a plain-Postgres store (the Development Rack). `src/db.js`'s store seam and the health probe in `src/service-health.js` both route through it; `pg` moves from devDependencies to dependencies. Proof: `tests/db/store-transport.test.js` (schema creation for all 16 own-store tables, registration round trips, parameter binding, health probe through the transport, on disposable Postgres) and `tests/unit/store-transport.test.js` (selection rules). Rides the next automatic promotion; no owner release fired. The rack build pins `main` directly, so staging does not wait for the promotion.
**Batch:** Rack migration program (owner-commissioned 2026-11-03 hosting decision; PenPal moved first, this server is move #1 of the remaining queue). Not a roadmap subsection; counted under the migration program, not the batch averages.
**Design:** The migration dossier and readiness record for this server (program records, 2026-11-05): the own store is 16 additive-only tables created by the db layer itself, reached through exactly one injection seam (`createDb(sql)`), and the whole db test-suite already runs that layer against local Postgres through the test adapter — the promotion lifts that proven pattern into `src/` rather than inventing a new one.
**Prerequisites:** None at source. The rack-side build recipe and entrypoint are the successor cards (RACK-2 entrypoint, RACK-3 recipe).
**Baseline inspected:** `main` `2d1756aef0870be650b7a62bc712f508abe9f25d` (2026-11-05).
**Risk area:** The own store holds OAuth registrations, live tokens and the enrolled Neon keys (encrypted at rest). A transport that mishandles parameters or row shapes could corrupt or expose them; the change is therefore behavior-preserving by construction — one seam, both drivers behind the identical handle contract (tagged-template + `.query`, rows as plain objects, driver error codes preserved), and the existing db suite is the parity harness.
**Budget:** 300.
**Effort:** One new module, two call-site reroutes, a dependency move, and transport tests.

## Read only these

- This card; `docs/AI-PR-READ-FIRST.md`.
- `src/db.js` (`productionSql`, `createDb`, `SCHEMA_TABLES`), `src/service-health.js`, `test/helpers/pg-neon-adapter.js` (the pattern being promoted).

## Drift check RACK-1

| Card assumption | Actual | Kind | Correction |
|---|---|---|---|
| The own store is reached only through `createDb`'s injected handle | Confirmed: every production caller uses the default `productionSql()`; the only other own-store construction was the health probe's private `neon(env.DATABASE_URL)` | matches | The probe is rerouted through the same transport module as part of this card |
| The db layer uses advanced driver features (transactions, `.query` variants) that a pg port would have to emulate | Refuted by census: the handle is used purely as a tagged template inside `createDb` and `src/db-checkpoints.js`; no `.transaction()`, no `.query()` on the store handle anywhere | matches | The pg transport implements exactly the tagged-template contract plus the probe's `.query(text, values)` |
| `pg` is test-only today | Confirmed: `pg` 8.23.1 sits in devDependencies (used by `test/helpers/`) | matches | Moved to dependencies with the lockfile regenerated; no version change |

## Build

| File | What |
|---|---|
| `src/db-transport.js` | New: transport selection (`STORE_TRANSPORT` override, else DATABASE_URL hostname — `*.neon.tech` selects the Neon driver, anything else pooled pg), a module-level pooled pg handle implementing the shared contract, and `storeSql(env)` preserving the legacy missing-`DATABASE_URL` error verbatim |
| `src/db.js` | `productionSql()` delegates to `storeSql()`; the direct `@neondatabase/serverless` import leaves this file |
| `src/service-health.js` | The opt-in database probe runs through `storeSql(env).query(...)` instead of constructing its own Neon handle |
| `package.json` / `package-lock.json` | `pg` moves to dependencies (the rack runtime installs production dependencies only) |
| `tests/unit/store-transport.test.js` | Selection rules: hostname classification, override wins, unknown override refused, legacy error text, handle shape without connecting |
| `tests/db/store-transport.test.js` | Real disposable Postgres: all 16 `SCHEMA_TABLES` created through the pg transport, registration round trip, hostile-value parameter binding, `storeSql` auto-selection, health probe `ok` with the pinned five-field shape |

## Acceptance

- `npm run check` green; unit suite green; db suite green on the exact head (the db suite is the parity proof: it exercises the full db layer, and this card adds the transport-level suite beside it).
- No tool added, removed or re-described; registry stays 139 tools; no profile, guard or production-classification behavior changes.
- Deployed behavior on Vercel is unchanged: the store URL there is a Neon endpoint, so the Neon driver is selected exactly as before. Live verification of that statement rides the next promotion's health read-back (COMPLETION rows 5/9 evidence rule), not this card.
