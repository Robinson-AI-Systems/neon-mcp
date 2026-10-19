# Connect directly to Neon by Robinson AI Systems

This is an **independent integration by Robinson AI Systems, not an official Neon connector**. The standalone service connects **directly** to a compatible MCP client. The optional Robinson's Toolkit Hub is **not** required.

## Current support status

- **Implemented in source:** remote, stateless Streamable HTTP MCP at `/api/mcp`, OAuth metadata at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`, PKCE S256, scoped org/project authorization, expiring/refreshable/revocable tokens, compact/catalog tool lists and protected tool invocation.
- **Not yet externally accepted:** the latest released revision's genuine provider operations, direct desktop client behavior, direct mobile client behavior and owner-controlled fresh reconnect/refresh/revocation. Do not treat successful OAuth login, a returned manifest, an installed plugin or a connection URL as a verified provider interaction.
- **Scope:** remote desktop or mobile coding agents **only where that actual client offers custom remote MCP/OAuth support**. A mobile ChatGPT plugin connection is not equivalent to independent mobile coding-agent MCP support. Clients without remote MCP support cannot connect directly until their platform supports it; do not require a local IDE as a substitute.
- **RTC Hub-compatible HTTP** `/api/contract`, `/api/tools` and passes are separate optional interfaces and are not substitutes for remote MCP at `/api/mcp`. RTC1's independently authorized owner pass remains limited and not full provider-side conformance at this stage.

## Verify your own origin first

The Vercel project `neon-mcp` exists and has the production domain `neon-mcp.vercel.app`, but the deployed revision and whether the current public origin is reachable to your client must be checked. The **authoritative** OAuth origin is the production deployment's privately configured `PUBLIC_BASE_URL`; do not guess it from a historical deploy URL or create a duplicate Vercel project. After verifying that `PUBLIC_BASE_URL` matches the active HTTPS hostname, construct the native MCP URL as:

```text
https://<your-verified-PUBLIC_BASE_URL-host>/api/mcp
```

If the configured origin is `https://neon-mcp.vercel.app`, the candidate connection is `https://neon-mcp.vercel.app/api/mcp`. This is a **candidate**, not evidence it has been accepted by a particular client. Do not paste OAuth credentials or Neon API keys into an agent chat.

## Owner connection and normal sign-in

1. Confirm an authorized, working Vercel production revision, database, origin and previously enrolled Neon credentials through the existing owner controls. Keep original tokens and connections; this instruction does **not** request new grants or key rotation.
2. In a **client that natively supports custom remote MCP over Streamable HTTP with OAuth**, add the verified `/api/mcp` URL. Follow its browser-based provider consent. No Robinson's Toolkit Hub, local proxy, custom ChatGPT-only wrapper or desktop IDE is necessary **for clients that support this transport**.
3. On the branded server consent page, choose the intended Neon organization and an eligible project scope, the intended access profile (`read_only`, `everyday` or `full`), and preview/production mode where explicitly enabled. This is a separate authorized connection; an old owner's credential must not implicitly grant a new account access.
4. After connecting, request `neon_whoami` and `neon_list_accounts`. Confirm the **provider-verified** org and enrolled key scopes. Then use an approved real Neon **read tool** for a real enrolled project. A whoami response alone does not demonstrate authenticated provider reads.
5. For authorized write capabilities, review the full target identity, cost exposure, protection and B-1 preview; confirm only via the intended user/administrator delegation. In development or preview mode, writes remain prohibited. Never use this guide as authorization for a real production or paid write.

## Recover and reconnect

- **Invalid issuer / OAuth errors:** compare the client URL with `PUBLIC_BASE_URL`, including HTTPS hostname, and the two published well-known OAuth documents. Avoid using Vercel deployment-specific URLs for a distinct configured issuer.
- **Authentication fails:** check selected organization, real enrolled key scope, client redirect URI, bearer validity and consent. An expired access token should refresh through the OAuth flow; on revoked refresh/connection tokens the user must sign in and authorize again. Do not extract bearer or refresh secrets to diagnose.
- **Tool missing:** the connection profile, deployment type, actual SDK/client listing mode, provider key type and project scope restrict visible tools. `full` does not circumvent provider grants or owner's production approvals. Search or switch catalog mode when your client exposes that feature; do not edit the tool allowlist in a running deployment.
- **Token revoked / permission narrowed:** reconnect with fresh user consent and selected provider grants. Revoking an OAuth connection and rotating an underlying Neon API key are different operations; only the credential owner should decide to rotate provider keys.
- **Mobile client cannot register a server:** check that particular client/version's remote MCP support and OAuth compatibility. A desktop-specific UI instruction does not prove mobile support. Preserve evidence for each tested device/client before marking either accepted.
- **Server unavailable / provider error:** check protected deployment access, approved account settings, the deployed exact SHA, underlying Neon service and server logs without disclosing keys. Preserve existing access; do not remove account records or bypass lockouts.

## Acceptance record template

For each desktop/mobile client record: exact client name/version/platform, `PUBLIC_BASE_URL` host (not secrets), current Git main SHA, deployed live SHA, auth method, selected authorized org and scope **with identifiers redacted from public documentation**, remote MCP initialize and tools/list result, actual real provider read result class, required write-and-readback outcome on approved isolated fixture, refresh/revoke/reconnect behavior, mismatched principal/resource refusal, date and whether every test passed/failed/deferred. Keep implementation, release and external acceptance as independent states.

Public listing is **not authorized** by this guide. Brand and third-party platform eligibility must be reviewed before any distribution change.
