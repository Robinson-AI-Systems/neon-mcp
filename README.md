# Robinson Neon MCP

A hosted MCP server that lets Chris Robinson's AI agents run his Neon Postgres accounts safely — for building, for
owning the account, and for day-to-day work on any project, with Appliance Desk as the first real check. Previews before
changes, production databases off-limits until Chris turns them on, risky SQL tried on a throwaway copy first, dollar
previews before anything raises the bill, passwords and keys that never pass through an AI, and small results that don't
burn an agent's context. It follows the Robinson Tool Contract, so Robinson's Toolkit (the hub) can offer it alongside
Chris's other servers — but it works fully on its own.

**Status:** foundation A-1 through A-7 implemented in code/documentation; deployment and real Neon account activation await owner approval. See [`docs/STATUS.md`](docs/STATUS.md) and the [owner deployment guide](docs/DEPLOY.md). AI agents: read [`AGENTS.md`](AGENTS.md) first.

Run the checks: `npm ci && npm run check && npm test` (database tests: `npm run test:db`).
