# Runtime and routes — neon-mcp

```mermaid
flowchart TD
  Req["Incoming HTTPS request"]
  Rack["rack-server.mjs<br/>reproduces Vercel binding + rewrites"]
  Ver["Vercel function binding (live branch)"]
  Idx["api/index.js — front door<br/>/ and /api: service home, tool count"]
  Mcp["api/mcp.js — POST /api/mcp<br/>stateless Streamable HTTP MCP"]
  Rtc["api/rtc.js — RTC doors<br/>tools · whoami · results"]
  Health["api/health.js — /api/health"]
  Conn["api/connection.js — /connection page"]
  Hand["api/connect/handoff.js"]
  DevC["api/developer/connect.js + src/developer/*<br/>handoff store / routes"]
  Setup["api/neon/setup.js — owner-only<br/>key + secret setup, protection editor"]
  OAuth["api/oauth/* — register · authorize · token · revoke"]
  WK["api/well-known/* — OAuth discovery<br/>+ muse-client.json"]
  Contract["api/contract.js · api/openapi.json.js"]

  Req --> Rack --> Idx & Mcp & Rtc & Health & Conn & Hand & DevC & Setup & OAuth & WK & Contract
  Req -.-> Ver -.-> Idx
  OAuth -->|"src/oauth/*, src/core/oauth*.js"| Mcp
  Mcp -->|"bearer check: src/core/mcp-auth.js"| OAuth
```

Node-and-wire list:

- `rack-server.mjs` — depends-on: every `api/**` handler; reads
  `PORT`/`HOST`; reproduces `vercel.json` rewrites verbatim
  (`/connection`, both `/.well-known/oauth-*`, RTC doors).
  `rack-init-store.mjs` prepares the rack own-store.
- `api/mcp.js` — calls: `src/core/mcp-server.js` dispatch;
  authenticates via `src/core/mcp-auth.js` against OAuth tokens in
  the own store.
- `api/oauth/*` — calls: `src/oauth/routes.js`,
  `src/oauth/register-route.js`, `src/core/oauth.js` (SHA-256
  hashing, S256 PKCE, lockout), `src/core/oauth-revocation.js`
  (revoke touches only the calling client's own token row).
- `api/neon/setup.js` — owner-only (passphrase + origin + lockout);
  reads/writes `settings.protected_resources`, key enrollment via
  `src/neon/keys.js`; never enables production by itself.
- `src/developer/handoff*.js` — developer handoff surface behind
  `api/developer/connect.js` and `api/connect/handoff.js`.
- Public surfaces: front door, `/connection`, health, OAuth
  discovery documents, `/.well-known/muse-client.json`.
