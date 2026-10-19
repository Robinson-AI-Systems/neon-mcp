# Neon by Robinson AI Systems

**Hub compatibility:** This server remains independently usable. Its coding agents should follow the [shared Hub compatibility checklist](docs/HUB-COMPATIBILITY.md) and the linked canonical Hub RTC contract; Hub initiates discovery and keeps provider schemas out of the agent's default tool menu.

An independent, **unofficial** remote Neon MCP service by Robinson AI Systems, designed for authorized coding agents and owners — for building, for
owning the account, and for day-to-day work on any project, with Appliance Desk as the first real check. Previews before
changes, production databases off-limits until Chris turns them on, risky SQL tried on a throwaway copy first, dollar
previews before anything raises the bill, passwords and keys that never pass through an AI, and small results that don't
burn an agent's context. It follows the Robinson Tool Contract, so Robinson's Toolkit (the hub) can offer it alongside
Chris's other servers — but it works fully on its own.

**Status (2026-10-19):** a Vercel production deployment exists, but deployed-source and genuine provider/client acceptance are distinct from code completion. Verified source includes multiple batches beyond A-1 through A-7, with remaining R/owner/backend/acceptance work tracked separately. See [`docs/STATUS.md`](docs/STATUS.md) and the [owner deployment guide](docs/DEPLOY.md). AI agents: read [`AGENTS.md`](AGENTS.md) first.

**Direct remote MCP:** verified production HTTPS origin + `/api/mcp`, where the remote client actually supports Streamable HTTP + OAuth; **no Hub is required**. See [connection steps, scoped authorization, mobile/desktop limitations and pending real-client acceptance](docs/DIRECT-MCP-CONNECTION.md). Technical identifier `robinson-neon-mcp` remains stable. We are not affiliated with or endorsed by Neon. Private integrations are not authorized for public directory publication.

Run the checks: `npm ci && npm run check && npm test` (database tests: `npm run test:db`).
