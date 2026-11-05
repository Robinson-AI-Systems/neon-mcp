# RACK-2 — Rack entrypoint: the Vercel function contract, reproduced standalone

**Status:** Built 2026-11-05 (rack migration staging, move #1) on branch `ai/vivienne/rack-2-entrypoint`, stacked on RACK-1. Delivered: `rack-server.mjs` at the repository root — a thin standalone HTTP server that dispatches every request to the same `api/` handler modules Vercel invokes, reproducing the filesystem binding, the `vercel.json` rewrites, and the `(req, res)` surface the handlers are written against — plus `rack-init-store.mjs`, the controller's migration command (runs the additive `initSchema()` against the migration role's `DATABASE_URL` and exits). No application logic moves; no handler changes. Proof: `tests/unit/rack-server.test.js` (full route table, rewrite injection, body-limit derivation, and live dispatch on an ephemeral port pinning the fail-closed shapes) and `tests/unit/rack-init-store.test.js` (fails closed, legibly, with no store configured). Rides the next automatic promotion; no owner release fired. Vercel ignores the file (it is not under `api/` and no framework is configured), so the deployed service is untouched by this card.
**Batch:** Rack migration program (owner-commissioned 2026-11-03 hosting decision). Not a roadmap subsection; counted under the migration program, not the batch averages.
**Design:** The migration dossier for this server (program records, 2026-11-05): the service has no standalone server today — Vercel's function contract IS the runtime contract — so the rack runtime is a contract reproduction, not a port. The successor card (RACK-3, in the rack's own repository) carries the build recipe that runs this entrypoint.
**Prerequisites:** RACK-1 (the own-store transport; the entrypoint's store-backed legs run on it when the store is a plain Postgres database).
**Baseline inspected:** `main` `2d1756aef0870be650b7a62bc712f508abe9f25d` plus RACK-1 (`e4dc1665`), 2026-11-05.
**Risk area:** A route or body-parsing divergence would make the rack copy behave differently from the proven Vercel service — worst at the OAuth and MCP doors. The route table is therefore pinned by test against `vercel.json` and the `api/` tree, bodies are parsed per each function's exported `bodyParser` config, and responses are decorated onto a real Node `ServerResponse` (never a fake), so the MCP streaming transport keeps its native surface.
**Budget:** 300.
**Effort:** One entrypoint module plus its route-table suite.

## Read only these

- This card; `docs/AI-PR-READ-FIRST.md`.
- `vercel.json`, the `api/` tree (16 function files), `src/core/http.js` (`send`, `paramsOf` — the exact `req`/`res` surface), `api/rtc.js` and `api/mcp.js` (the two exported `bodyParser` configs).

## Drift check RACK-2

| Card assumption | Actual | Kind | Correction |
|---|---|---|---|
| Every `api/**/*.js` file default-exports its handler | Confirmed for all 16 files (`api/oauth/register.js` re-exports from `src/oauth/register-route.js`) | matches | — |
| Handlers use the chainable Vercel response helpers | Confirmed: `res.status(...).send(...)` / `.json(...)`, `res.setHeader`, `res.headersSent`; requests read `req.method`, `req.headers`, `req.query`, `req.body`, `req.socket.remoteAddress` | matches | The entrypoint decorates a real `ServerResponse` with exactly `status`/`json`/`send` and assigns `query`/`body` onto the real request |
| Only two functions configure body parsing | Confirmed: `api/mcp.js` (`bodyParser: true`) and `api/rtc.js` (`sizeLimit: '16kb'`); the rest ride platform defaults | matches | Limits derive from the imported configs; the default is Vercel's 4.5 MB |
| The front door's public path is known from source | **Open (Q-1):** in source `api/index.js` is the HTML front door and Vercel binds it at `/api`; the currently deployed build predates it, so which of `/` and `/api` the moved service must treat as canonical cannot be settled from source | differs | The entrypoint serves the front door at BOTH `/` and `/api`; the route-table test pins both bindings so the live read-back (R-2 in the migration record) settles it with a one-line change. Disclosed here rather than silently chosen |

## Build

| File | What |
|---|---|
| `rack-server.mjs` | New: route resolution (filesystem binding for all 16 function files + the 7 `vercel.json` rewrites with injected query parameters winning on conflict), per-function body limits with the platform 400/413 answered before the handler, Vercel-shaped body parsing (JSON/form → object, other → string, none → undefined), `res.status`/`json`/`send` decoration on the native response, a service-shaped 404, and `PORT`/`HOST` binding for the rack controller |
| `rack-init-store.mjs` | New: the rack controller's migration command — runs `initSchema()` against the migration role's `DATABASE_URL` and exits non-zero, legibly, on failure (on Vercel the same init runs lazily inside the handlers) |
| `tests/unit/rack-init-store.test.js` | The init command exits 1 with the configuration error when `DATABASE_URL` is absent; its success path is the db suite's `initSchema` proof plus the rack rehearsal |
| `tests/unit/rack-server.test.js` | Route table (17 bindings incl. `/api` + `/api/index`), rewrite + injection assertions, body-limit derivation, and live dispatch: health pinned shape degraded-without-store, front door + connection page HTML, OAuth discovery failed closed at 503 while the store is unconfigured (handleOAuth opens the store before every route, metadata included — the same shape Vercel gives in that state; discovery 200 with the issuer from the configured origin is proven against the rehearsal store), contract door at its RTC-gated 503 (RTC stays off by design), OpenAPI document (the rack readiness target), MCP door 503 while unconfigured, RTC doors 503 by design, RTC 413 at 17 KB, malformed-JSON 400, handler method enforcement, unknown-path 404 |

## Acceptance

- `npm run check` green; unit suite green on the exact head; the db suite is untouched by this card and stays green via RACK-1's head.
- No handler, tool, guard or profile changes; registry stays 139 tools. The Vercel deployment does not see this file.
- Store-backed legs (sign-in smoke, MCP session against a real store, setup surface) are proven on the rack rehearsal instance, not claimed from this suite.
