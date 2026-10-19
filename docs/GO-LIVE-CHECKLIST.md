# Go-live checklist — everything that must be switched on before agents can change production databases

Written for Chris (not a developer). Rule: everything is built and tested against a fake Neon server and throwaway
databases; real-account use starts read-only, writes start in a scratch project, and **anything that changes a
production database or raises your bill is off until you complete the step here.** Tick a box only after the "how you
know it worked" check is done. Every PR that adds a switch adds a line here.

Legend: **Owner** = the currently authorized account administrator (for this privately controlled deployment, the repository owner) · **Agent** = a coding agent with the applicable real delegated grant and approval. This is a deployment/acceptance checklist, **not** a permanent universal end-user rights policy. It never authorizes implementing agents to spend, change production or onboard the public.

**Verified documentation checkpoint, 2026-10-19:** Owner inputs record the server's Vercel project and dedicated Neon database (IN-02), encrypted administrator secrets (IN-03), seven selected project-scoped keys and isolated scratch enrollment (IN-04/05/06). Vercel independently reports READY production from `live` SHA `5589f27de2ebdd7baa55d0139ff0811be22c2dca`, behind merged main PRs #189/#190. Historical “not created/not set/none” entries below have been reconciled; saved configuration is not a new runtime secret audit. Production mutation and public listing remain OFF/unapproved. [The six OPEN cross-cutting completion gates](COMPLETION-GATES.md) apply in addition to original X-2/X-3 and the queue in STATUS.

## 1. The server itself

| Done | Item | Where / how | Today | How you know it worked |
|---|---|---|---|---|
| [x] | Vercel project and this server's own Neon database created (IN-02) | Reuse existing infrastructure; never recreate it | Completed per IN-02; Vercel deployment READY | Confirm existing Vercel project and dedicated Neon service database; do not expose its URL |
| [x] | `ADMIN_PASSPHRASE` and `TOKEN_ENCRYPTION_KEY` (32 random bytes, base64url) set (IN-03) | Vercel → Environment Variables (Owner) | Recorded configured 2026-10-13; values deliberately not examined | Independently verify existing owner's sign-in without revealing or rotating values |
| [x] | Project-scoped key(s) added (IN-04, IN-05) | Existing setup and encrypted storage, never chat | Seven scoped keys recorded enrolled; last-four only | Recheck scoped owner identity and real provider read on checked released service (CG-1/CG-5) |
| [ ] | Protected resources confirmed (IN-07) | Server setup page (Owner) | Owner editor implemented but no resources configured; self protection always required | `neon_get_settings` lists them; a test change to one is refused |
| [ ] | Reverify `PUBLIC_BASE_URL` equals active HTTPS origin of the checked release | Vercel → Environment Variables, inspect without revealing secrets | Current exact saved value not independently re-read in this documentation review | OAuth issuer and protected-resource discovery must match the URL used by the actual direct client |
| [ ] | Independent native desktop and supported mobile coding-agent MCP clients accepted | Current supported client's remote MCP/OAuth configuration | A cloud adapter produced a real read, but native desktop/mobile acceptance remains OPEN | CG-1: real custom `/api/mcp` initialize, tools and actual provider read from each claimed supported client |
| [ ] | Verify saved spend caps and production-read choice (IN-09, IN-10) on current released connection | Ask authorized custom MCP: "show my Neon MCP settings" | Owner approved defaults: $25/change, $50/day, production reads on; current deployed readback pending | Exact authorized owner values, source and expiration independently confirmed; end-user policy migration CG-3 still OPEN |

## 2. Real-account checks (Batch X)

| Done | Item | Where / how | Today | How you know it worked |
|---|---|---|---|---|
| [ ] | Read-only smoke test on your real account (X-2) | Agent, with a read-only connection | Not run | `docs/audits/smoke-<date>.md` committed, all reads pass or have a card |
| [x] | Approved isolated scratch project provisioned with its own selected-project key (IN-06) | Existing owner's Neon and setup | Enrolled and provider-read 2026-10-13/14; independent write approval/guard status unchanged | Original fixture rights stand; do not request creation/key enrollment again or interpret setup as X-3 passing |
| [ ] | Write check in the scratch project (X-3) | Agent | Not run | `docs/audits/scratch-<date>.md` committed; cleanup leaves nothing behind |

## 3. Owner tools (optional)

| Done | Item | Where / how | Today | How you know it worked |
|---|---|---|---|---|
| [ ] | Organization key added, named `robinson-neon-mcp-owner` (IN-04) | Neon console → API keys, then setup page (Owner) | None | "Review my Neon account" returns the admin overview |
| [ ] | Spending alert set to a number you are comfortable with | Ask Claude (Owner confirms) | Unknown | `neon_billing_get_spending_alert` shows it |

## 4. Production access, per organization

| Done | Item | Where / how | Today | How you know it worked |
|---|---|---|---|---|
| [ ] | Sections 1 and 2 done | — | — | — |
| [ ] | Production access enabled for the organization (IN-08): ask Claude, then re-enter your passphrase on the setup page | Owner | Off | A new connection offers "production" for that organization |
| [ ] | First production change done with you watching (for example protecting a branch or a small, previewed SQL change on a non-critical table) | Owner + Agent | Not done | It shows in `neon_recent_changes` with its undo |

## 5. Projects (one section per profiled project)

### Appliance Desk

Run `neon_workflow_app_readiness` for Appliance Desk and work through what it lists. The full list with explanations is
`docs/APP-NEEDS-APPLIANCE-DESK.md`; the app's own checklist (`appliance-desk/docs/GO-LIVE-CHECKLIST.md` §6) stays the
authority for the app.

| Done | Item | Today |
|---|---|---|
| [ ] | Profile facts confirmed and IDs entered on the setup page (IN-13) | Not entered |
| [ ] | Production branch protected | Done in the app's project on 2026-09-29 (readiness re-checks it) |
| [ ] | History (restore window) long enough for your comfort, on your current plan | Not checked by this server yet |
| [ ] | Snapshot before risky migrations (the app's own runbook asks for one) | Available as `neon_snapshot_create` once D-7 is built |
| [ ] | Optional: one fresh database branch per preview deployment (the app's ROADMAP; your call on timing) | Not turned on |

## B-2 production permission release (still OFF)

- [ ] X-2 owner-approved read-only smoke test and X-3 scratch project verification have passed and been documented.
- [ ] Owner confirms all other Robinson servers to protect (IN-07); the secure setup page saves the list, including a `robinson` entry. This server's own project is automatically protected.
- [ ] Only after those checks, owner sets `NEON_MCP_LIVE_GATES_APPROVED=approved-after-X2-X3` and `NEON_MCP_PROTECTED_LIST_CONFIRMED=owner-confirmed` in the Production Vercel environment.
- [ ] On a full-profile connector in a production deployment, request with `neon_enable_production` and `confirm: true`. Request is NOT activation.
- [ ] Within 10 minutes, owner visits `/api/neon/setup`, types `ENABLE_PRODUCTION` and the owner passphrase, and checks the result. Never do this as an agent. Disconnect/reconnect to production mode separately.
- [ ] The owner can immediately disable access on the same setup page or with `neon_disable_production` and `confirm: true`. No changes to actual production projects are authorized in this session.

## Cross-cutting standalone/commercial completion (no public activation)

- [ ] **CG-1/CG-2:** Independently tested direct desktop/mobile clients and secure OAuth/tenant token lifecycle, including wrong-principal/resource and revoked token refusals.
- [ ] **CG-3/CG-4:** User-owned production/spend/approval delegation with separate developer $0 protection; independent provider-owned RTC 1 conformance, with no Hub enrollment as a prerequisite.
- [ ] **CG-5:** Every original card and authorized live/isolated acceptance queue scenario closed with source/deployment/provider evidence, cleanup and no false mock attribution.
- [ ] **CG-6:** Independent branding/attribution, multi-tenant security/privacy/retention/support/load and provider/platform public eligibility reviewed; **separate owner approval** before any public sign-up, discoverability or listing. This gate does not authorize publication.

## Daily deployment cost controls (2026-10-12)

- [ ] Before linking or activating this server, verify that GitHub has both main and live; initialize live from main only if absent and verify both SHA references.
- [ ] In each linked Vercel project's Production environment, set Branch Tracking to live and read it back. Disable automatic Preview deployments and verify that setting. No Vercel project setting is implied by vercel.json.
- [ ] Confirm exact-head existing application CI and release-policy pass; development PRs never require a paid Vercel preview. Apply live-only Git rules to any nested Vercel root configuration.
- [ ] Verify the first scheduled daily promotion and its live-promotion date tag; validate the resulting production deployment from live. Keep all existing access, spending and activation gates.
