# Neon Unleashed by Robinson AI Systems

**Hub compatibility:** This server remains independently usable. Its coding agents should follow the [shared Hub compatibility checklist](docs/HUB-COMPATIBILITY.md) and the linked canonical Hub RTC contract; Hub initiates discovery and keeps provider schemas out of the agent's default tool menu.

An independent, **unofficial** remote Neon MCP service by Robinson AI Systems, designed for authorized coding agents and owners — for building, for
owning the account, and for day-to-day work on any project, with Appliance Desk as the first real check. Previews before
changes, protected production databases off-limits to the builder until the account's authorized owner enables delegated access, risky SQL tried on a throwaway copy first, dollar
previews before anything raises the bill, passwords and keys that never pass through an AI, and small results that don't
burn an agent's context. It follows the Robinson Tool Contract, so Robinson's Toolkit (the hub) can offer it alongside
Chris's other servers — but it works fully on its own.

**Current verified state (2026-11-08):** Production serves from the Robinson AI Systems development rack at the branded address `https://neon.robinsonaisystems.com` — git `main` at `91438db9d2c18d0c64e801603fe3b3952ae5d09d` (the exact build the rack runs), **139 registered tools**, with its own store in a rack Postgres database reconciled exactly from the hosted copy. The hosted Vercel project and the hosted Neon store were retired the same day under the owner's dead-copy ruling (2026-11-08); the nightly promotion train's deploy target no longer exists, so no promotion can produce a hosted build. The conformance position otherwise stands as last verified on 2026-11-04: the 62 tracked original/CAP work cards include unfinished implementation; six separate product completion gates remain OPEN; native desktop/mobile, provider-write, independent multi-tenant and RTC 2 conformance acceptance are not established. See the [completion schedule and conformance record](docs/COMPLETION.md) for the honest row-by-row state, [STATUS](docs/STATUS.md), [completion gates](docs/COMPLETION-GATES.md), [work index](docs/pr-cards/work-index.json) and the [owner deployment guide](docs/DEPLOY.md). AI agents: read [`AGENTS.md`](AGENTS.md) first.

**Source-only R-2 implementation under review (PR #202, 2026-11-04):** A shared agent-visible build release identity, public health and connection pages, and normal mobile client handoff are being implemented. The existing legacy handoff remains registered-client compatible, and RTC 1 stays frozen. RTC 2, actual client acceptance, provider proof, canonical domain migration and developer-only control plane are **not** complete or authorized for production activation. The health endpoint returns degraded until an explicitly enabled independent database probe succeeds; configuration presence alone is not a pass.

**Direct remote MCP:** verified production HTTPS origin + `/api/mcp`, where the remote client actually supports Streamable HTTP + OAuth; **no Hub is required**. See [connection steps, scoped authorization, mobile/desktop limitations and pending real-client acceptance](docs/DIRECT-MCP-CONNECTION.md). Technical identifier `robinson-neon-mcp` remains stable. Neon Unleashed is a Robinson AI Systems product. It is not affiliated with, endorsed by, or sponsored by Neon. Private integrations are not authorized for public directory publication.

Run the checks: `npm ci && npm run check && npm test` (database tests: `npm run test:db`).
