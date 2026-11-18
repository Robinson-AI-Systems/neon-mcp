# Data and external connections — neon-mcp

```mermaid
flowchart TD
  DBjs["src/db.js — schema + store methods<br/>initSchema() additive migrations, seeded settings"]
  Transport["src/db-transport.js — one seam"]
  NeonHTTP["Neon HTTP driver<br/>when DATABASE_URL host is *.neon.tech"]
  PgPool["node-postgres pool (pg)<br/>rack Postgres in production"]
  Tables[("neon_orgs · neon_keys (encrypted)<br/>oauth_clients / codes / tokens<br/>login_attempts · rate_limits · change_log<br/>one_time_secrets · secret_requests<br/>settings · result_store")]
  Client["src/neon/client.js — only @neon/sdk importer<br/>retries off, budget injected, 423/429 bounded"]
  OpenAPI["vendor/neon-openapi/v2.yaml<br/>163 ops, pinned SHA; offline inventory only<br/>src/neon/openapi-index.js, scripts/cap-coverage"]
  Target["Customer Neon branches<br/>@neondatabase/serverless Pool, 15s stmt / 5s lock<br/>own DATABASE_URL host refused as a target"]

  DBjs --> Transport --> NeonHTTP & PgPool --> Tables
  Client -->|"Neon Cloud API v2"| OpenAPI
  Client -.->|"connection URI per request"| Target
```

- **Secrets:** `TOKEN_ENCRYPTION_KEY` (AES-256-GCM, scope-bound) and
  `ADMIN_PASSPHRASE` come from the environment; values never appear
  in docs, logs or tool results (`src/core/scrub.js`).
- **CI:** `.github/workflows/ci.yml` — `check` (secret scan, docs,
  lint, write-safety, budgets), `unit` (fake Neon,
  `test/helpers/fake-neon.js`), `db` (throwaway Postgres 17);
  aggregate `ci` job is the single merge gate. CI never calls Neon.
- **Release:** `daily-live.yml` promotes `main` → `live` on the
  nightly train (owner releases are uncapped per the 2026-11-04
  rule); `git-housekeeping.yml` and `prune-merged-branches.yml`
  keep branches tidy. Production runtime is the rack (see README).
- **Checks on docs:** `npm run check` includes
  `scripts/check-docs-updated.mjs` and
  `scripts/check-doc-code-truth.mjs` — this map is refreshed in the
  same change as any feature, per `docs/RULES.md`.
