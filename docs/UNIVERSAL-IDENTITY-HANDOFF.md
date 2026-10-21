# Sol 5.6 implementation handoff — universal permissions and identity

Owner-requested implementation detail, 2026-10-21. **State: approved remaining work,
not implemented by this document.** This supplements [maximum authority](designs/MAXIMUM-AUTHORITY.md),
[session workflow](SESSION-START.md) and [end-user authority](END-USER-AUTHORITY.md).
Original roadmap/card/index acceptance and dependency order govern; this is not a
second backlog, new countable subsection, new authorization gate or auth rewrite.
The owner requested this documentation-only preparation explicitly.

## Start here and preserve completed work

Last reconciled main: `b368e2ff85d3c85e316579c419eec12c915aa3ed`. Fetch current main/live, open PRs, exact-head
checks/reviews, READY deployment and original acceptance ledger again before editing.
This SHA is a handoff baseline, never a promise about the future deployed version.
#193 rejects production tokens on nonproduction hosts; #194 adds public PKCE clients, client/redirect-bound code consumption and client-owned revocation; #191 preserves completion gates. Reuse these corrections rather than rebuilding OAuth.

Run `npm run session:prepare` and `npm run session:status`; use the existing release
and acceptance procedures for eligible tests. Resolve interrupted work first. Do not
rerun already-proven acceptance without relevant change. Do not interpret a source
merge, OAuth client registration, owner login or one whoami as customer acceptance.

## Existing units and execution order

| Existing owner | Concrete deliverable | Dependency / finish condition |
| --- | --- | --- |
| Original active identity/acceptance cards | Reconcile actual code and missing original criteria; repair confirmed security defects promptly | Preserve existing work and current queue; do not jump an unfinished prerequisite |
| CAP-1 | Operation/credential inventory and reproducible gap validator | Complete inventory before dependent authority/capability expansion; unrelated original security repair need not wait |
| CAP-2 / CAP-3 and original identity cards | Explicit operation context, independent enrollment, scoped administrator roles, owned grants, migration and lifecycle | Freeze exact current-to-new mapping in existing selected JIT cards; preserve originals rather than duplicate IDs |
| CAP-4 and original feature cards | Implement each confirmed supported capability gap through correct grant resolver and guards | Inventory plus identity/policy prerequisites; existing unfinished features keep their original owner |
| CAP-5 and original acceptance gates | Actual released direct-client/provider proof and honest source/live coverage | Implement and storage-test first; record exact READY source and authorized fixture for each live result |

Internal steps below are work within those existing units. Select coherent complete
outcomes under the repo's bundle rules; do not turn each helper into a PR or claim
this handoff completes a bundle. Use medium reasoning for unfamiliar auth/migration
work; routine established patterns can use light. Model choice changes no gate.

## Code and test entry points

Start with these actual source seams; trace their callers and storage together:
- `src/db.js`
- `src/oauth/routes.js`
- `src/oauth/register-route.js`
- `src/core/mcp-auth.js`
- `src/core/oauth-handlers.js`
- `src/core/oauth-revocation.js`
- `src/neon/client.js`
- `src/neon/sql-run.js`
- `src/tools/`

Extend these existing regressions rather than creating another fake auth stack:
- `tests/db/public-client-oauth.test.js`
- `tests/db/oauth-handlers.test.js`
- `tests/db/oauth-revocation.test.js`

Current owner-centered setup is not independent customer enrollment. Bind verified service principal/tenant and selected Neon organization/project to each enrolled grant before resolving a key. Distinguish personal/org/project control-plane keys from SQL login roles and product-specific credentials. Never use a customer's SQL credential on the MCP service database. Preserve restore/finalization, SQL parsing/transactions, protected resources and explicit user limits. Freeze an additive owner migration before changing key ownership or caps; never mass-assign legacy keys to new users.

## Freeze the identity and migration contract before source edits

1. Map existing identities, sessions, memberships, client registrations, grants,
   encrypted credentials, policies and result/cursor ownership. Reuse maintained
   standards/libraries and established stores. If identity infrastructure is missing,
   record an architecture-appropriate library choice in the existing decision/card;
   do not hand-build a new password/OIDC protocol.
2. Map this operation context onto existing records (add only missing fields):
   environment, authenticated stable principal, verified tenant/workspace membership,
   explicitly assigned active role, owned connection/grant ID and operation/resource.
   Browser/tool input may request a selection; server-side verification supplies
   authority. Never trust caller-provided tenant, admin, provider account or mode.
3. Distinguish developer/operator actions, explicitly scoped product administration,
   and ordinary production customers, including Robinson's own production tenant.
   Company email/domain/membership grants neither universal admin nor a developer-only
   profile. Context switch rechecks membership/role and prevents privilege carryover.
   Privileged changes require their own authorization and audit.
4. Specify additive migration: map legitimate existing owner records to an explicitly
   verified owner tenant; preserve IDs, selected restrictions, existing grants and
   encryption/decryption compatibility. Never assign legacy global credentials to each
   new user. Unknown ownership stays quarantined/reconnect-required, never guessed.
   Test empty install, populated upgrade, interrupted/resumed migration and restore.
5. Define transaction/order boundaries for enrollment, refresh, replacement, role
   removal and revocation. Use existing atomic consume/CAS/locks, uniqueness and
   revision checks. Missing/foreign/revoked credentials fail before provider I/O.
   Never retry a write under a broader credential. Reconcile unknown provider effects
   before replay. A storage failure cannot become authentication success.
6. Bind encrypted provider secrets to the appropriate stored ownership context and
   key version; update AAD only through a tested migration. Keep secrets server-side.
   Explicitly document access/refresh/family/provider revoke semantics: current-grant
   revocation is not proof that replaced tokens revoke descendants.
7. Define session logout versus disconnect versus account removal separately.
   Secure cookies/CSRF, S256/state/nonce where applicable, one-use callbacks, safe
   redirect allowlists and refresh expiration remain intact. Prefer supported native
   provider consent with automatic return; never collect provider passwords or make
   users copy OAuth codes where the supported flow already returns automatically.

## Inventory, restriction audit and capability closure

Extend the existing provider coverage/catalog/operation tables. One row per official
versioned operation/workflow: stable operation ID, family/host/version, official
source revision/date, credential kind and grants, required role/entitlement/resource,
handler/registration/dispatch path, effect, tests, original owner/dependencies and
separate live evidence. Record supported/unsupported/unknown with evidence.
Validate duplicate/orphan/missing rows, regenerate family gaps and detect schema
drift. Tool count, API finder and universal dispatch alone prove no functional parity.

Trace setup defaults → stored policy → registration/feature flag → every dispatch
door → resolver → provider call → result. Classify each denial as developer-only,
provider/security requirement, explicit user policy or missing implementation.
Correct developer-only product denials with positive authorized paths and negative
guard coverage. Preserve existing selected restrictions; require deliberate secure
user consent for widening. Explain provider grant, plan, role, environment and user
policy separately. Preserve genuine sensitive-operation protections and unknown-cost
disclosure. Implement supported missing operations using established preview/effect,
replay/audit, pagination, error and readback patterns; no placeholders or fake success.

## Required fixtures and observable outcomes

Use disposable storage and synthetic provider identities first; real provider proof
is separate. Create A and B as independent principals/tenants, R as Robinson's ordinary
production tenant, D as developer and an explicitly assigned scoped administrator.
Do not use company-email heuristics or real secrets in fixtures.

| Scenario | Required observable result |
| --- | --- |
| A selects its authorized grant/account and supported operation | Correct principal/account/resource reaches provider adapter; expected result |
| A guesses B's tenant, connection, client, cursor or result handle | Refused before provider call; B state and secrets unchanged |
| Robinson R uses its ordinary authorized production connection | Normal product capability; no inherited coding-agent limit, no cross-tenant access |
| Ordinary user requests admin; scoped admin requests unrelated tenant | Denied server-side without mutation; permitted admin path succeeds in assigned scope |
| Same identity switches developer/admin/customer context | Explicit verified context; no stale elevated session or global environment mutation |
| Two owned provider accounts; select/switch/remove one | Exact account used; sibling remains valid; foreign account cannot be selected |
| Expired/revoked grant, wrong issuer/audience/host/mode or disabled membership | Denied before provider call; no owner/developer fallback |
| Parallel refresh/replace/revoke, callback replay or interrupted enrollment | Deterministic atomic result, no credential resurrection, no secret leak or blind replay |
| Logout versus disconnect/reconnect | Documented distinct effects; reconnect preserves unrelated grants and identities |
| Existing owner upgrade/migration and original clients | Existing legitimate connection works or explicit recoverable reconnect; no silent broadening |

Exercise every actual door this repo supports, not only a resolver unit: native MCP,
RTC/meta-tool, HTTP and applicable CLI/relay. Update producer/consumer/fake/schema
contracts together. Actual PostgreSQL/storage integration is required for isolation,
atomic transitions and migration; mocks alone do not close those criteria.

## Verification and merge

Focused affected tests while assembling; then `npm run check`, `npm test`,
`npm run test:db` and relevant integration families. Use the existing workflow's RTC family; do not invent a missing npm test:rtc script.
Use the existing approved disposable runner/CI if local infrastructure is unavailable;
never point tests at production or weaken required checks.

Required exact-head gates: **ci and release-policy; check/unit/disposable DB/RTC families as declared by current workflows**. Re-read actual workflows if changed.
Self-review the whole auth/secret/permission/migration diff against existing review
rules, disposition and resolve actual threads, merge with expected head when green.
A stalled check needs logs/diagnosis and targeted recovery, never a bypass.

## External prerequisites, remaining work and resume prompt

Real provider accounts/direct clients and any protected production migration are separately gated. No live SQL, compute resize, key rotation or restore is authorized by this handoff.

Normal releases remain independent; no manual deploy, live migration, spend or
destructive test is authorized by this handoff. Standalone native/direct MCP and
provider contract proof are mandatory; Hub is optional for standalone servers.
Company distribution/legal/channel work belongs in the company repo and cannot block
eligible private engineering. Complete private implementation while genuine live
prerequisites are pending; missing code is never an external blocker.

Append evidence to original cards/ledgers, distinguishing planned, implemented,
tested, merged, deployed and live-verified. For interruption record exact branch/PR,
head, current original unit, last test result, first failing integration, remaining
engineering and exact next command/edit. Never imply background work after a turn.

> Complete the remaining universal permissions/identity work in this repository.
> Read AGENTS.md, docs/SESSION-START.md and this handoff; reconcile current main,
> open work and deployed acceptance. Continue the existing original cards and
> CAP-1..CAP-5 in dependency order. Reuse merged fixes, implement and
> verify coherent outcomes, resolve reviews and merge under repository policy.
> Continue independent engineering when one live prerequisite is blocked.
