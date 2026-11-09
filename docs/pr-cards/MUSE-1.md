# MUSE-1 — Muse sign-in and client ID cards (RAS MCP Standard D-006)

**Commissioned:** 2026-11-09 by the owner: "whatever you did for this to work
with Muse needs to be done to all my custom MCP servers and this needs to
become part of my RAS MCP Specification." The fleet design is filed as
D-006 in the Library (`designs/ras-mcp-muse-connection.md`); this card is
Vercel Unleashed's share of it.

## Live finding (2026-11-09)

`/.well-known/muse-client.json` and the path-scoped protected-resource
document answered 404. A Muse authorize with the document address as
`client_id` was refused "Unknown client or redirect address". The server had
no client ID card support at all, and `resource` was mandatory.

## Scope (D-006 MC-1 to MC-5)

- **MC-1:** serve both documents (rack routes and `vercel.json` in parity).
- **MC-2:** this server's own Muse document is answered locally, before any
  stored lookup or fetch.
- **MC-3:** other https client_ids are fetched and validated as cards
  (`src/core/cimd.js`, copied from stripe-mcp), and discovery advertises
  support.
- **MC-4:** `resource` is optional.
- **MC-5:** authorize, token (code and refresh) and revoke use the same
  funnel and the card-aware redirect match. The MCP door does not look
  clients up.

## Acceptance

- `tests/unit/muse-own-document.test.js` fails without the fix and passes
  with it. The full suite and `npm run check` pass at the exact head.
- Live (after release): the D-006 §7 knock probe, then a real Muse connect.
