# CAP-1 — Neon operation and credential coverage (generated)

Source inventory checked 2026-11-03. This is source accounting, not proof of a live released server.

- Pinned control-plane API: 163 unique operations, version v2.
- OpenAPI SHA-256: dacf72ea2d63110b3694c705313e0b2104e9652ae1be3fc01ceebe7b17059c44.
- Separately documented advanced product workflows: 15; different protocols, hosts and unpinned wire interfaces are not control-plane parity.
- Registered named MCP tools: 131; named-tool counts are not operation coverage.
- Candidate source means a quoted operation ID appears in a tool module. It is not proof of guarded execution.
- Live operation evidence remains unverified until tied to the exact checked deployed source and client.

| Family | Operations | Verified source | Candidate source | Missing/unverified source | Live verified |
| --- | ---: | ---: | ---: | ---: | ---: |
| advanced/ai_gateway | 1 | 0 | 0 | 1 | 0 |
| advanced/data_api | 3 | 0 | 0 | 3 | 0 |
| advanced/functions | 3 | 0 | 0 | 3 | 0 |
| advanced/managed_auth | 1 | 0 | 0 | 1 | 0 |
| advanced/object_storage | 6 | 0 | 0 | 6 | 0 |
| advanced/sql | 1 | 0 | 0 | 1 | 0 |
| api/AI Gateway | 1 | 0 | 0 | 1 | 0 |
| api/API Key | 3 | 0 | 3 | 0 | 0 |
| api/Auth | 28 | 0 | 1 | 27 | 0 |
| api/Auth (legacy) | 16 | 0 | 0 | 16 | 0 |
| api/Branch | 29 | 0 | 23 | 6 | 0 |
| api/Buckets | 8 | 0 | 0 | 8 | 0 |
| api/Consumption | 3 | 0 | 0 | 3 | 0 |
| api/Credentials | 3 | 0 | 0 | 3 | 0 |
| api/DataAPI | 4 | 0 | 1 | 3 | 0 |
| api/Endpoint | 8 | 0 | 8 | 0 | 0 |
| api/Functions | 5 | 0 | 0 | 5 | 0 |
| api/Operation | 2 | 0 | 2 | 0 | 0 |
| api/Organizations | 19 | 0 | 10 | 9 | 0 |
| api/Project | 21 | 0 | 13 | 8 | 0 |
| api/Region | 1 | 0 | 1 | 0 | 0 |
| api/Snapshot | 7 | 0 | 7 | 0 | 0 |
| api/Storage | 1 | 0 | 0 | 1 | 0 |
| api/Users | 4 | 0 | 1 | 3 | 0 |

## Explicit exclusions and required follow-up

- OpenAPI is the pinned July 2026 contract; newer live methods may be missing. Re-vendoring is a separate governed A-4 decision.
- Advanced Functions, Object Storage, Data API, Auth, SQL and AI Gateway methods come from official product docs, not pinned wire specs. Unsupported or unverified method/host/permission fields remain labeled unknown.
- API keys, SQL role credentials and product-scoped tokens are different credential types; never substitute one for another.
- HTTP method effect labels are conservative, not measured prices, authorization or permission to execute.
- Operation owner U-1 is a universal fallback pending reconciliation of direct tool cards; advanced work is assigned to CAP-4 subject to existing card ownership.
- No fabricated percentage or live parity is computed while authorization routing, guards, readback and client/provider acceptance are unproven.
