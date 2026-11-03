# Neon Unleashed by Robinson AI Systems

**Hub compatibility:** This server remains independently usable. Its coding agents should follow the [shared Hub compatibility checklist](docs/HUB-COMPATIBILITY.md) and the linked canonical Hub RTC contract; Hub initiates discovery and keeps provider schemas out of the agent's default tool menu.

An independent, **unofficial** remote Neon MCP service by Robinson AI Systems, designed for authorized coding agents and owners — for building, for
owning the account, and for day-to-day work on any project, with Appliance Desk as the first real check. Previews before
changes, protected production databases off-limits to the builder until the account's authorized owner enables delegated access, risky SQL tried on a throwaway copy first, dollar
previews before anything raises the bill, passwords and keys that never pass through an AI, and small results that don't
burn an agent's context. It follows the Robinson Tool Contract, so Robinson's Toolkit (the hub) can offer it alongside
Chris's other servers — but it works fully on its own.

**Source-only R-2 implementation under review (2026-11-02):** A shared agent-visible build release identity, public health and connection pages, and normal mobile client handoff are being implemented. The existing legacy handoff remains registered-client compatible, and RTC 1 stays frozen. RTC 2, actual client acceptance, provider proof, canonical domain migration and developer-only control plane are **not** complete or authorized for production activation. The health endpoint returns degraded until an explicitly enabled independent database probe succeeds; configuration presence alone is not a pass.

**Current verified state (2026-11-01):** Git `main` and `live` both point to `1c810cb0ca69fffc9be088d4c8e9834d2dd7d720`, and Vercel reports that exact Production revision READY. The 58 tracked original/CAP work cards include unfinished implementation; six separate product completion gates remain OPEN. Native public-client OAuth (PKCE and scoped client-owned revocation) is source-merged and on the checked release, but native desktop/mobile, provider-write, independent multi-tenant and RTC 2 conformance acceptance are not established. The [RTC 2 owner decision](docs/HUB-COMPATIBILITY.md) is documented but its server wire adoption remains pending. See [STATUS](docs/STATUS.md), [completion gates](docs/COMPLETION-GATES.md) and [work index](docs/pr-cards/work-index.json). See [`docs/STATUS.md`](docs/STATUS.md) and the [owner deployment guide](docs/DEPLOY.md). AI agents: read [`AGENTS.md`](AGENTS.md) first.

**Direct remote MCP:** verified production HTTPS origin + `/api/mcp`, where the remote client actually supports Streamable HTTP + OAuth; **no Hub is required**. See [connection steps, scoped authorization, mobile/desktop limitations and pending real-client acceptance](docs/DIRECT-MCP-CONNECTION.md). Technical identifier `robinson-neon-mcp` remains stable. We are not affiliated with or endorsed by Neon. Private integrations are not authorized for public directory publication.

Run the checks: `npm ci && npm run check && npm test` (database tests: `npm run test:db`).
