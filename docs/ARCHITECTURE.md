# ARCHITECTURE — runtime facts, as built

This file describes what **exists**, and is updated in the same PR that ships it (DRIFT-PROTOCOL checklist B). What the
system is designed to become is in `docs/designs/`; do not copy design text here before it is built.

As of 2026-10-10: **nothing is built.** The repository holds the plan only.

## Infrastructure

| Piece | State |
|---|---|
| GitHub repo `Robinson-AI-Systems/neon-mcp` | Plan committed locally 2026-10-10 |
| Vercel project | Not created (IN-02) |
| This server's own Neon database | Not created (IN-02) |
| Neon API keys | None added (IN-04) |

## Environment variables

None yet. Batch A defines `DATABASE_URL`, `ADMIN_PASSPHRASE`, `PUBLIC_BASE_URL`, `TOKEN_ENCRYPTION_KEY`; record each
here with its environments when A-5 ships. Never record values.

## Database tables

None yet. Each batch's design lists its tables; record them here as they ship.

## Endpoints

None yet.

## Neon API description and client

Not vendored or pinned yet (A-4). Record the vendored file's source URL, download date, SHA-256, operation count and the
exact `@neon/sdk` version here when A-4 ships.

## Runtime

Node 24.x on Vercel (Node 20 deployments were disabled by Vercel on 2026-10-01); recorded here when A-1 ships.
