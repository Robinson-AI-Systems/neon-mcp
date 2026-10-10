# Design — Batch O: Owner and administration (organization, people, keys, usage and billing, guided settings)

Status: **DRAFT — awaiting Chris's approval (IN-00)**. Written 2026-10-10. Scope and acceptance: `docs/PLAN.md` →
Batch O. Cards O-1 … O-4. Depends on Batches B and C (and D-1 for project reads). Tool list: `docs/TOOL-CATALOG.md`
section Owner and administration. Follows the Robinson Tool Contract §11 — the same role as the Stripe MCP's G-6.

The server is for the account owner as much as for developers (Chris, 2026-10-10: "great for both developers and end
users of each service, account management tools … everything"). Everything an owner sets up in Neon's console is either
a real tool (when Neon has an API) or a **guided setting** with structured steps and a read-back.

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| O1 | Organization endpoints exist as in the research audit (§9): members, invitations, member role update/remove, org API keys, spending limit, transfer between orgs, project transfer requests, project member roles | `node scripts/openapi-find.mjs "organization member"`, `"invitations"`, `"spending limit"`, `"transfer"`, `"project member role"`; the project member role operations are among the 17 newer ones — if the vendored file lacks them, re-vendor (A-4 drift script) before O-1 |
| O2 | Consumption v2 endpoints accept `metrics` (`compute_unit_seconds`, `root_branch_bytes_month`, `child_branch_bytes_month`, `instant_restore_bytes_month`, `public_network_transfer_bytes`, `private_network_transfer_bytes`, `extra_branches_month`, `snapshot_storage_bytes_month`) and work on Launch and up | `openapi-find "consumption"`; read the parameter list |
| O3 | `GET /organizations/{id}` returns `plan` | read the `Organization` schema |
| O4 | `@neon/sdk`'s own guard flags (`confirmSelfDemotion`, `confirmSelfLockout`) show which member changes Neon itself treats as dangerous | `grep -n "confirmSelf" node_modules/@neon/sdk/README.md` |

## 1. Decisions

**O1. Owner tools need the organization key and the `full` profile.** They declare `key: 'org'`. With only project-scoped
keys stored, they answer in words: "add an organization API key on the setup page (IN-04)". Account-wide changes always
need `confirm` and appear in the change log, through any door (contract §11). They are not gated by production mode
(they change people and settings, not databases), except transfers, which move production databases (`Pr`).

**O2. People.** `neon_member_invite` (messages a person: the preview shows each email and the role; at most 10 per call);
`neon_member_set_role` (raising access is `A`; the preview says what the new role can do, from Neon's permission table);
`neon_member_remove`. The server **refuses** removing or demoting the last admin, and changing the role of the person whose
key the server is using (self-lockout); Chris does those in the console (guided). Project access: explicit project roles
(`neon_access_set_project_role`, Neon's newer per-project roles; clearing the role returns the member to the organization
default) and legacy email sharing (`neon_access_share_project`, `neon_access_revoke_share`).

**O3. API keys.** `neon_apikey_list` shows names, kind (personal / organization / project-scoped and which project), created
date — never a key. `neon_apikey_create` either puts the new key on the one-time page or, with `storeAsServerKey: true`,
stores it directly as one of this server's keys without anyone seeing it (the way to rotate this server's own keys). New
keys this server creates are named `robinson-neon-mcp-<purpose>-<date>`. `neon_apikey_revoke` refuses keys this server uses
(known by ID when created here; by the `robinson-neon-mcp-` name prefix that `docs/DEPLOY.md` tells Chris to use for keys
he creates himself) until a replacement is stored.

**O4. Transfers move production.** `neon_transfer_request_create` (to another Neon account; the claim link grants the project
to whoever opens it, so it goes to the one-time page) and `neon_transfer_projects_between_orgs` are production-guarded; the
preview lists the projects, their default branches, and integrations Neon says need reconfiguring after a move (Vercel,
GitHub). Accepting a transfer is done by the receiving side (universal tool or console).

**O5. Usage and dollars.** `neon_billing_usage(period, by: 'project' | 'branch', projects?)` reads consumption v2 (legacy
endpoint for legacy plans), converts each metric to dollars with the stored price table (B-4) and adds a month-end
projection (month-to-date ÷ days elapsed × days in month). Every dollar figure is labelled "estimate from Neon's
published prices as of <date>; your Neon invoice is the authority". Consumption reads do not wake computes (Neon says
so). `neon_billing_estimate_change` runs the same spend estimators as B-4 for a described change without doing it.

**O6. The spending alert is only an alert.** Neon emails admins at 80% and 100% and does **not** suspend computes; both
tools say so. Setting or removing it needs `confirm`. Hard limits on spend are the project quotas (`neon_project_set_quotas`)
and this server's own spend caps (B-4).

**O7. Admin overview** (`neon_admin_overview`): one call, every item `ok` / `needs_attention` (why, and the tool or guided
setting that fixes it) / `not_readable` (no API, or the stored key cannot see it). Items: organizations and plan; members,
admins and pending invitations; API keys and their ages (warn over `admin.key_age_warn_days`, default 180); per project:
default branch protected, history retention vs plan maximum, snapshot schedule on the default branch, IP allow / public
access (where the plan has it), logical replication on, Data API and Neon Auth exposure; usage this month and projection;
spending alert set; this server's own state (production access per organization, connections and passes, protected
resources); and every guided setting's state (unknown until checked).

**O8. Guided settings and the full dashboard map.** `src/data/dashboard-map.js` holds one entry per console setting,
each `{ setting, url, steps: [{ n, action, target, value? }], expected, verifyWith?: { tool, args, field, equals } }`
(contract §11). O-4 walks Neon's console once (read-only, with Chris or a browser-capable agent while Chris watches),
records the date and fills every row below; `neon_admin_list_guided_settings` lists them by page and `neon_admin_check_setting`
reads back the ones Neon exposes. A guided setting is never reported done unless verified or Chris says so. Steps that
involve keys never reveal a key; steps that buy something (plan upgrade, AI Gateway credits) end with "this costs money —
only Chris clicks the final button" and the server never claims it.

| Console page (2026-09-18 layout) | Setting | API? |
|---|---|---|
| Organization → Billing | Plan (Free/Launch/Scale/Business), payment method, billing address and tax ID, invoices, AI Gateway credits | No → guided; plan read back with `neon_org_list` |
| Organization → Billing | Spending alert | Yes (`neon_billing_*_spending_alert`) |
| Organization → Members | Members, invitations, roles | Yes (`neon_member_*`) |
| Organization → API keys | Personal, organization, project-scoped keys | Yes (`neon_apikey_*`) |
| Organization → Integrations | Vercel (Neon-managed or Vercel-managed), GitHub, monitoring/log export (Scale) | No → guided |
| Organization → Settings | Name, email-domain auto-provisioning, SSO/SAML (Enterprise), delete organization | No → guided |
| Profile menu → Account settings | Name, email, login methods and two-step login (through the login provider), delete account | No → guided |
| Project → Settings → General | Name, default branch, transfer, delete | Yes (`neon_project_*`, `neon_branch_set_default`, `neon_transfer_*`) |
| Project → Settings → Postgres | History retention, default compute settings, logical replication, preload libraries, maintenance window, audit level | Yes (`neon_project_*`, `neon_security_*`) |
| Project → Settings → Networking | IP allow, private networking/VPC endpoints, block public connections | Yes (`neon_security_*`; VPC through `neon_api_*`) |
| Project → Settings → Credentials | Scoped service credentials (private beta) | Yes, through `neon_api_*` (secrets on the one-time page) |
| Project → Settings → Auth / Functions | Neon Auth, Functions settings | Yes (Batch E tools / `neon_api_*`) |
| Project → Settings → HIPAA compliance | HIPAA and the BAA | Partly → guided only (legal agreement, irreversible) |
| Project → Settings → Sharing | Email shares, project roles | Yes (`neon_access_*`) |
| Branch pages | Protection, expiry, restore, schema diff, computes, roles, databases, Data API, Auth, storage | Yes (Batch D/E tools) |
| Monitoring, SQL editor, Tables editor | Charts and editors | Reading only; `neon_health_*`, `neon_sql_*` cover the data |

**O9. Security review** (`neon_admin_review_security`): organization-wide version of `neon_security_review` plus people and keys:
admin count, members with Admin who have not logged in recently (when Neon reports it), keys older than the warning age,
default branches not protected in projects with data, projects open to the public internet without IP allow on plans that
have it, organizations with production access enabled on this server, connections and passes to this server and their
expiry; guided checks for SSO and two-step login.

**O10. Activity** (`neon_admin_activity(period)`): Neon operations across projects (paged, capped at 500 with a handle) merged
with this server's change log, by day, in Denver time — "what happened, through anything".

## 2. Schema

None. Settings seeded (insert when missing): `admin` = `{ key_age_warn_days: 180 }`.

## 4. Work units

### O-1 — Organizations, members, project access (M, medium effort)
Tools: `neon_org_list`, `neon_member_list`, `neon_member_invite`, `neon_member_set_role`, `neon_member_remove`, `neon_access_list`,
`neon_access_set_project_role`, `neon_access_share_project`, `neon_access_revoke_share`. Tests: invite preview shows emails and role;
last-admin and self-lockout refused; access widening needs confirm through every door; org-key requirement answered in
words when missing.

### O-2 — API keys and transfers (M, medium effort)
Tools: `neon_apikey_list`, `neon_apikey_create`, `neon_apikey_revoke`, `neon_transfer_request_create`, `neon_transfer_projects_between_orgs`.
Tests: new key never in a result (one-time page) or stored directly; revoking a server key refused; claim link on the
one-time page; transfer preview lists integrations to reconfigure; production guard on transfers.

### O-3 — Usage, estimates, spending alert (M)
Tools: `neon_billing_usage`, `neon_billing_estimate_change`, `neon_billing_get_spending_alert`, `neon_billing_set_spending_alert`. Tests:
hand-computed dollars from a consumption fixture; projection; legacy-plan path; "alert only" wording; caps unaffected.

### O-4 — Admin overview, guided settings, dashboard map, security review, activity (M, medium effort)
Tools: `neon_admin_overview`, `neon_admin_list_guided_settings`, `neon_admin_check_setting`, `neon_admin_review_security`,
`neon_admin_activity`; `neon_where_is_setting` upgraded to read the full map. Tests: every overview item has a state on
fixtures; every map entry has steps and an expected result; every `verifyWith` names a real read tool and field; purchase
steps never end in a claim; activity merges operations and change log in order.

## 5. Stop-and-ask points

1. An owner action Neon offers only to the console (e.g. a new security setting found while walking the console): add a
   guided entry; never automate the console.
2. Any owner action that would cost money: guided only; IN for Chris.

## 6. Acceptance mapping

| PLAN Batch O line | Evidence |
|---|---|
| Owner tools work with the organization key and refuse without it in words | `tests/unit/owner-*.test.js` |
| People changes and key creation confirmed, previewed, logged; self-lockout refused | write-contract for each O-1/O-2 write |
| Usage in dollars with the price-table date | `tests/unit/billing-usage.test.js` |
| Every console setting is a tool or a guided setting with structured steps | `tests/unit/dashboard-map.test.js` + the O-4 walk date in the PR |

## Amendments
