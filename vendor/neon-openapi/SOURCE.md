# Vendored Neon API description — source and pin

| Field | Value |
|---|---|
| File | `vendor/neon-openapi/v2.yaml` (OpenAPI 3.0.3, unmodified) |
| Preferred source | `https://neon.com/api_spec/release/v2.json` — **not reachable** from the build workspace on 2026-10-10 (proxy answered HTTP 403) |
| Source used (BATCH-A §0 row A3 fallback) | `npm pack @neondatabase/api-client@2.7.3` → `package/public-v2-for-users.gen.yaml` (published 2026-07-01) |
| Downloaded | 2026-10-10 |
| SHA-256 | `dacf72ea2d63110b3694c705313e0b2104e9652ae1be3fc01ceebe7b17059c44` |
| Operations | 163 (111 paths, 249 component schemas) |
| Not yet vendored | the 17 operations newer than July 2026 (research audit §1: triggers, logs, Functions custom domains, …). A-4 retries the live download and re-vendors in its own commit |

Rules:
- Never edit this file by hand. Moving it to a newer description is its own card (BATCH-A decision A7).
- `scripts/check-secrets.mjs` skips this one file **only while its SHA-256 equals the value above**, because Neon's
  documentation examples contain example branch IDs and endpoint host names (branch IDs such as `br-<adjective>-<noun>-<six digits>`). Any
  edit changes the hash, and the scan then covers the file again.
- Tests load it through `test/helpers/neon-spec.js`; the fake Neon server validates every request against it.
