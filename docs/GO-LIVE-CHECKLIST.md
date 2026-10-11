# Go-live checklist — everything that must be switched on before agents can change production databases

Written for Chris (not a developer). Rule: everything is built and tested against a fake Neon server and throwaway
databases; real-account use starts read-only, writes start in a scratch project, and **anything that changes a
production database or raises your bill is off until you complete the step here.** Tick a box only after the "how you
know it worked" check is done. Every PR that adds a switch adds a line here.

Legend: **Owner** = only Chris · **Agent** = Claude can do it once you say go.

## 1. The server itself

| Done | Item | Where / how | Today | How you know it worked |
|---|---|---|---|---|
| [ ] | Vercel project and this server's own Neon database created (IN-02) | Vercel and Neon connectors (Agent, after you say go) | Not created | The server's home page shows its tool counts |
| [ ] | `ADMIN_PASSPHRASE` and `TOKEN_ENCRYPTION_KEY` (32 random bytes, base64url) set (IN-03) | Vercel → Environment Variables (Owner) | Not set | The setup page asks for the passphrase and accepts a key |
| [ ] | Project-scoped key(s) added (IN-04, IN-05) | Neon console → Organization → API keys, then the server's setup page (Owner) | None | `neon_whoami` shows the organization, the key kind and its last 4 |
| [ ] | Protected resources confirmed (IN-07) | Server setup page (Owner) | Owner editor implemented but no resources configured; self protection always required | `neon_get_settings` lists them; a test change to one is refused |
| [ ] | `PUBLIC_BASE_URL` is set to the server's HTTPS origin (Owner, before OAuth login) | Vercel → Environment Variables | Not set | OAuth discovery advertises exactly that origin |
| [ ] | Connector added in Claude, preview mode (Owner) | claude.ai → Settings → Connectors | Not added | Claude answers "who am I connected as in Neon?" correctly |
| [ ] | Spend caps and production-read choice confirmed (IN-09, IN-10) | Ask Claude: "show my Neon MCP settings" | $25 per change, $50 per day; production reads on | `neon_get_settings` shows them |

## 2. Real-account checks (Batch X)

| Done | Item | Where / how | Today | How you know it worked |
|---|---|---|---|---|
| [ ] | Read-only smoke test on your real account (X-2) | Agent, with a read-only connection | Not run | `docs/audits/smoke-<date>.md` committed, all reads pass or have a card |
| [ ] | Scratch project created with its own key (IN-06) | Neon console (Owner) or connector (Agent, after you say go) | None | `neon_list_accounts` shows it |
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
