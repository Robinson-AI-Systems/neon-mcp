## 2026-11-03 — Checked SDK casing aliases do not increase provider authority

Recognize installed raw SDK spelling aliases for canonical
OpenAPI operations only when a unique case-insensitive ID
matches **and** an actual installed wrapper, invoked against
fake HTTP, generates the pinned canonical method/path. Keep
194 unique API operations distinct from 214 supported spellings
(20 aliases: 12 writes, 8 reads). Reject new unknown exports
and keep all alias writes behind the same write:true/request-key
budget and non-replay boundary. Case aliases are never new
entitlements, live acceptance or original-card completion.

## 2026-11-03 — HTTP method is authoritative for universal SDK write safety

A caller's optional `write` flag alone cannot classify a Neon
provider operation. Generate a checked, minimal operationId→HTTP
method guard from the pinned vendor OpenAPI and the independently
SHA-verified official SDK snapshot; block unknown method records
without a provider call, and require explicit `write:true` plus
the established request key for every known non-GET method.
Do not silently infer a mutation as a read or relax existing
preview, spending, owner/protected-resource, provider
credential, permission or release controls. This is an offline
source-level defense, not proof that a provider grants a capability
or that the current provider surface is exhaustive.

## 2026-11-03 evening — durable budget admission is explicitly boolean and fail closed

A budget function's existence is not admission. The shared Neon
SDK client may send a provider API request only after a literal
`true` or `{allowed:true}`; the persistent shared
`makeNeonBudget` must receive a literal boolean `allowed`
from its atomic DB counter. Missing, malformed, string/numeric,
null, or thrown ledger responses must refuse before HTTP, with
nonsecret 503 for unknown/unavailable budget. Explicit
`allowed:false` stays a 429 with finite 1–60-second remaining
window. Never classify unknown ledger state as rate exhausted
or silently permit customer-facing/provider side effects.
This developer-source safety fix changes no owner
permissions, live account policy, production data or billing.

## 2026-11-03 evening — ambiguous-write readback must be operation-specific

A generic request key is not proof that *every* Neon mutation was
applied. Branch annotation `rtc_request` is relevant to exact
`createProjectBranch` recovery only; it cannot confirm an unrelated
project update, delete, role/security, billing, ownership or other
provider write. An ambiguous provider response for any other
operation remains `unknown_outcome` with `confirmed:null`
unless that operation has a separately independently verified
readback under the existing B-1 lifecycle. Never blindly retry
these writes or leak provider errors. This source correction
does not grant extra user/provider authority or approve a
live resource operation.

## 2026-11-03 evening — installed SDK synthetic denials must be separate from real rights

The CAP-1 raw SDK synthetic method/path proof also asserts one
sanitized and non-retried 403 per available installed SDK wrapper,
and for write operations an ambiguous 503 produces `confirmed:null`
without replaying the mutation. A bounded independent read-only
recovery lookup is allowed. These are **fake transport** checks,
not Neon provider permission, customer auth, write guard policy,
real response/readback, idempotency, or production acceptance.
Keep runtime 403/503 counters in a separate checked source artifact;
never promote them to verified real-provider reach. When Playground
expires between turns, recover from the independently verified remote
feature head and repeat local checks; do not describe uncommitted
experiments as pushed work.

## 2026-11-03 — distinguish installed SDK fake HTTP execution from real provider proof

A source operation reference, available SDK function, captured
in-memory method/path, and exercised real provider operation are
four distinct evidence levels. To verify the generic source seam,
execute every installed `@neon/sdk/raw` wrapper with a fake
in-process HTTP transport, assert exactly one expected
method/path and budget call, explicitly invoke fallback-only
declared stubs, and refuse unknown operation IDs before budget
or HTTP. Keep this reproducible `--check` artifact under CAP-1,
with failure/tamper tests and **no credentials**. Never report a
fake client return as verified provider authorization, a protected
write guard, request/response semantics, retry/readback, account
entitlement, real customer capability or production acceptance.

## 2026-11-03 — CAP-1 published method names must include actual wire declarations

For CAP-1 capability accounting, a canonical method/path/operationId
record alone is insufficient to classify input shape or permission.
Record actual parameters, request bodies, response status/schema and
security declarations from exact pinned OpenAPI, with structural
digests, without exposing upstream example values. Keep the runtime's
vendor and official SDK source evidence separate and explicitly list
shared method/path contract changes. SDK schema security alternatives
are NOT user authorization, credential scope, executable support or
live provider acceptance. An offline verifier checks both the full
official upstream bytes and derived wire contracts. This is approved
source inventory work only, not an authorized runtime API re-vendor,
new credential, production action, release, or roadmap completion.

## 2026-11-03 — Distinguish a published SDK method from an installed callable route

CAP-1 reports installed `@neon/sdk/raw` operation function availability
separately from published OpenAPI and the source-to-tool handler map.
Only exact exported functions in the pinned dependency and guarded fallback
predicates parsed from the real Neon client can be marked as *declared*
generic dispatch routes. These declarations are never certified execution,
credential scope, provider entitlement, protected-write guards or real
released acceptance. Count a fallback-only declaration only when its SDK
raw function is absent. Keep the 31 presently unrouteable generic operations
in explicit pending engineering, not as a fake unsupported-provider status.
No SDK upgrade, API change, grants or production actions are approved by
this inventory decision.

## 2026-11-03 — CAP-1 call-site provenance cannot claim whole-module tool coverage

Decision: attribute an operation candidate only to parsed literal provider
call sites, with source line and a named registered handler if the reference
is lexically inside it; do not infer that a shared helper serves every named
tool in the same module. Leave indirect call-chain links unresolved until
independent execution-path tests. Exclude CAP-1's own schema/inventory test
from operation-specific behavioral-test mapping. Cross-check candidates from
source in the validator so a hand-edited report cannot invent handler reach.
This source-only evidence refinement grants no client/provider authority,
original-subsection completion, deployment or new product surface.

### 2026-11-03 — merged-tree documentation preflight is mandatory

**Owner clarification:** At the beginning of every Neon engineering/continuation
session, verify the exact latest merged main and live SHA and most recent merged
PR; reconcile the status, roadmap, active card/index, technical/owner guides and
deployment/database records with the merged source BEFORE new feature edits.
Record open PR implementation and its CI as unmerged evidence separately.
Keep documentation synchronized during the work, validate it against the final
diff before pushing, and reconcile verified post-merge main without committing
directly to main. The routine is now explicit in SESSION-START §0; nothing about
an unmerged or green PR constitutes provider/production acceptance. At this
decision checkpoint merged Neon PR #201 / main and live
69c46b71b6ab35e483f42338618146d1a377d074 are the last merged
baseline; drafts #202 and #203 are excluded.

### 2026-11-03 — official SDK OpenAPI is a distinct reference, not runtime authority

CAP-1 may pin and independently byte-check the public official Neon SDK
OpenAPI at a fixed upstream commit, list differences from the existing runtime
vendored specification and route missing operations to original cards. This
documentation and inventory verification is source-only; the runtime API
schema, user credential resolver, service permission, deployment and live
provider authority remain unchanged. SDK-only operations cannot count as
implemented or accepted until handler, policy and real provider evidence
is separately established. Initial official SDK reference has 193 methods,
31 absent from runtime vendor and one vendor-only method.


### 2026-11-02 — use custom GitHub's real Git/runtime and Vercel's deployment evidence to accelerate Neon

**Decision:** Engineering sessions default to the owner's custom GitHub connector's **native Git workspace + isolated Robinson Playground runtime**. This permits local code/test/DB checks, real ancestry and bounded workspace lifecycle even from ChatGPT mobile. One-off immutable-SHA Playground and full-check Actions are verification layers; atomic expected-head/count-checked REST commits are fallback, not the only delivery method. Vercel Unleashed supplies read-only actual project/deployment/alias metadata, source corroboration and diagnostics. A failing high-level Vercel workflow is not a failed deployment or a green one; use low-level verified reads. No new product scope, live deployment, permission, money, secret, data or release approval is implied. See [fast path](runbooks/CUSTOM-GITHUB-VERCEL-FAST-PATH.md) and [frozen maintenance acceptance](audits/2026-11-02-native-git-vercel-workflow-plan.md).

### 2026-11-02 — user clarified backend developer login and grant isolation

**Decision:** developer sign-in and the developer **test-grant** management system exist only at an independently protected backend developer control-plane access point for testing/development. They must not be part of, selectable within, advertised by or confused with public-facing customer login. Public OAuth consented grants are a separate user-owned feature; read-only/production rights are choices under the ordinary user session, not extra login modes. Staff acting as users do not inherit developer authority. Scope through original A-3, CAP-2/3/5, R-2 and CG-1/2/6; preserve all existing release/permission gates.

**Code caveat:** `/api/developer/connect` currently implements a genuine mobile OAuth client handoff. Its name misrepresents its function; future code must migrate public mobile onboarding to a customer path *without loss of supported clients*, then strictly protect or retire the developer namespace. A documentation change cannot safely switch off that route or certify backend isolation.



## 2026-11-02 — existing RAS Standard applied to Neon design (no runtime change)

Owner requested finding and adopting the RAS MCP Specification for Neon. Located the authoritative **Library D-001 RAS MCP Standard** (reviewed file blob `cf619ca715b03c56f32f9a450886a07e085a5a9c`), already-adopted Hub RTC 2 (blob `83fab62166c33bd27f4cd5494b47bdae97f415bd`), website blueprint and Library D-005 already-claimed Neon Unleashed identifiers. Ruling is *design alignment*, not a new owner approval to change production, grants, DNS, release, another repository or the RTC 1 wire dialect.

Design consequence: [Neon D-001 adoption](designs/RAS-MCP-D001-ADOPTION.md) governs future existing-card work, canonical `neon.robinsonaisystems.com` identity is a proposed verified-at-release target, and RTC 2 is advertised only after full implementation and conformance. Where D-001's real-client resource-omission lesson intersects RTC 2's explicit Hub `resource` requirement, retain exact RTC 2 Hub compliance and design a narrowly resource-bound *native client* compatibility path, proven or honestly reported incompatible; no unrestricted grants. Fleet site listing and watcher remain external owners, so no changes to them in this repo.


## 2026-10-21 — approved maximum-authority expansion

Owner requested adapting the completed GitHub planning job to all active custom MCPs.
Approve [MAXIMUM-AUTHORITY](designs/MAXIMUM-AUTHORITY.md), indexed CAP-1..CAP-5,
with provider-specific interfaces, credential types, guardrails and open acceptance.
No artificial God-Mode-only tools or percentage coverage from catalog counts.
Existing user-selected policy/provider isolation and developer spending/release gates
remain binding. This document is not implementation or live verification.

# Decisions (dated)

One entry per design decision, newest last. Reasons live here; current rules live in AGENTS and the designs.

**2026-10-10 — Build a separate, hosted Neon MCP, standalone first.** Chris is building one solid server per service
(Google Workspace and Stripe first; Vercel, Neon and GitHub next), each fully usable on its own and later combined by
Robinson's Toolkit (the hub) through the Robinson Tool Contract (RTC 1). Reasons for Neon specifically
(`docs/audits/2026-10-10-research.md`): the old toolkit's `neon` namespace (204 tools) cannot run SQL at all (it sends the
Neon API key where a database password belongs), advertises 17 tools that can never run, calls endpoints that do not
exist, and has no preview, confirmation or change log on 70+ destructive tools; the official Neon connector has the
breadth but no dry runs, no change log, no undo, no spend previews, no owner tools, and Neon itself says it is for
development only, never production databases.

**2026-10-10 — "Production" means Neon's default and protected branches, plus project-wide settings.** Decided in one
function from Neon's own data, never from names. Production writes are refused until Chris turns on production access
for an organization (two steps, like the Stripe MCP's live mode), and then need `confirm`. Reason: on 2026-09-28 an
earlier AI session restored and finalized a snapshot on Appliance Desk's production database by itself, without asking
(Appliance Desk's archived decisions). Restores on production always keep the old state; finalizing a restore is its own
production-guarded tool.

**2026-10-10 — SQL is guarded by the real PostgreSQL parser.** Every statement is classified (`libpg-query`); reads run
in read-only transactions; risky SQL on production is first run on a throwaway branch to get the exact affected rows and
schema diff, then applied in one transaction that rolls back if the count differs, after recording a restore point (LSN)
that undo can use. Reason: the old toolkit concatenated arguments into SQL and its "explain" tool ran `EXPLAIN ANALYZE`,
which executes the statement.

**2026-10-10 — Narrowest key per tool; project-scoped keys recommended (IN-04).** Neon's project-scoped keys cannot delete
their project or change access; an organization key is admin over everything. Tools declare the key kind they need; owner
tools need the organization key and the `full` profile. Keys are entered only on the setup page and never returned.

**2026-10-10 — Secrets never in chat, both directions.** Role passwords, connection strings, new API keys, credentials,
claim links and passes leave only through the one-time-secret page; secrets a tool needs (OAuth client secrets, SMTP
passwords) are typed by Chris on the setup page and consumed once. Writing a connection string straight into a Vercel
environment variable is a hub workflow (ROADMAP), not built here.

**2026-10-10 — Spend guard with Neon's published prices as a stored, dated setting.** Neon bills by usage (compute hours,
storage, history, extra branches, snapshots). Every change that can raise the bill shows a worst-case monthly dollar
figure from the stored price table (source URL and date shown), needs `confirm`, and is refused above a per-change and
daily cap (IN-10). Plan changes and purchases have no tool at all.

**2026-10-10 — Self-protection.** The server never changes or runs SQL against its own database or the other Robinson
servers' databases; the list is edited only on the setup page (IN-07).

**2026-10-10 — `@neon/sdk` (raw layer, exact version) instead of `@neondatabase/api-client`.** Neon's newer official
client is fetch-based with no dependencies and is described by Neon as the successor; its ergonomic layer changed
signatures across seven major versions in three months, so only its 1:1 generated `raw` functions are used, behind one
client file with our own retry policy (only 423 and 429; never a blind resend of a write, because Neon's API has no
idempotency keys). The API description is vendored and pinned by date and hash because Neon publishes no dated API
versions.

**2026-10-10 — Testing without an official mock.** Neon has no mock of its management API (Neon Local needs a real
account). Tests use a fake Neon server whose every request is validated against the vendored description, and real
throwaway Postgres for everything SQL. Real-account checks are read-only (X-2) or confined to a scratch project (X-3).

**2026-10-10 — Runtime Node 24.x, not Node 20.** The shared server decisions said Node 20, but Vercel disabled Node 20
for new deployments on 2026-10-01 (vercel.com/changelog/node-js-20-is-being-deprecated). Code stays within Node 20.19+
features, so nothing else changes. The same applies to the Stripe and other Robinson server plans (reported to the
planning coordinator).

**2026-10-10 — General development tool and owner tool, with optional project profiles.** Same decisions as the Stripe MCP
(Chris, 2026-10-10): three audiences (builder / owner / operator) tagged on every tool; Batch V developer tools that
refuse production; Batch O owner tools with guided settings for every console-only setting; project profiles only for
apps that manage part of their own Neon project (Appliance Desk is the first example, never the scope).

**2026-10-10 — Neon's new backend services (Auth, Data API, storage, Functions, triggers, logs) come late (Batch E).**
They became generally available on 2026-09-18 and none of Chris's projects uses them yet; the universal tools reach every
one of their operations with the same guards meanwhile.

**2026-10-10 — Structured DDL tools not rebuilt.** The old toolkit's 34 one-statement schema and row tools are replaced by
the guarded `neon_sql_execute` and `neon_workflow_safe_migration`: one well-tested path is safer and costs agents far less context.

**2026-10-10 — Repository process mirrors the Stripe MCP (IN-01 pending confirmation).** Public repository, no automated
review; the implementer self-reviews every diff against AI-PR-READ-FIRST; if an organization-wide reviewer posts anyway,
its threads are answered and resolved, never waited for.

**2026-10-10 — Gap check against prior toolkits.** Chris asked for every Neon tool he ever built or planned, across all
his Robinson toolkit repositories, to be checked against this plan. 333 distinct prior names were found (old local
toolkit 204, the TypeScript toolkit and its standalone Neon server 165, the HTTPS toolkit API 167, plans and docs 46,
an auto-generated index 41 — heavily overlapping); every one is mapped in `docs/audits/2026-10-10-prior-tools.md`.
300 are covered by catalog tools (many as the guarded `neon_sql_execute`, per the DDL decision above), 30 are dropped with
reasons (no Neon API behind them — metrics, Postgres logs, alerts, webhooks, encryption/SSL/password switches, project
clone, branch merge, backup export — or generated/speculative names), and 3 were real gaps, now added in a new card D-9:
`neon_branch_compare_data`, `neon_schema_list_migrations`, `neon_health_reindex`. Two catalog rows gained an option
(`neon_schema_enable_extension` `update: true`; `neon_schema_list_objects` publications) and the SQL guard got a dated amendment
(BATCH-B) because the mapping showed `REINDEX` pointed at a tool that could not run it and several statement types had
no class; unclassified statements now fail closed as `destructive`. Totals: 173 hand-built + 4 universal = 177 tools;
54 cards.

**2026-10-10 — Every tool name starts with `neon_` (cross-server consistency).** GitHub, Vercel and Neon all have
"projects", "branches", "members" and "workflows"; several Robinson servers are often loaded in one chat, and some
clients do not namespace tool names by server. Every tool here is therefore `neon_<area>_<verb>_<object>` (contract §3
as clarified on 2026-10-10). Renamed mechanically across the plan; no behavior changed.

**2026-10-10 — A-1 foundation choices.** (1) Neon's API description is vendored in A-1, not A-4, because the fake Neon
server validates every request against it and the live file was unreachable (BATCH-A amendment). (2) The fake validates
request bodies **strictly** — an unknown field fails the test — because misspelled or invented fields were the old
toolkit's commonest Neon bug; response fixtures are checked loosely (Neon adds fields). (3) The fake answers 401 when no
bearer key is sent, because the old toolkit's SQL path never authenticated. (4) The secret scan also refuses real-looking
Neon branch, endpoint and organization IDs and Vercel IDs (AGENTS hard limits), and skips the vendored description only
while its SHA-256 matches `SOURCE.md`. (5) CI runs on Node 24 with `npm ci --ignore-scripts` from the committed lockfile;
the database job uses the ECR mirror of Postgres 17 (Docker Hub's anonymous limit broke Appliance Desk CI).

**2026-10-10 — Plan approved; no automated review (Chris).** "I approve the plans, and I don't want the automated review
at this time." IN-00 and IN-01 answered; designs marked APPROVED. An organization-wide Codex reviewer may still post
until Chris turns it off for this repository; agents answer and resolve its threads but never wait for one.

**2026-10-10 — No compatibility with the old toolkits (Chris).** "The reference to the older toolkits was to help make sure
you designed this custom MCP with as much functionality as possible … I don't need legacy compatibility." Removed the
old-name map from D-1 and the toolkit decision note (X-4); IN-14 answered "not needed". The prior-tools audit stays as
the completeness checklist it was meant to be.

**2026-10-10 — Stronger anti-stall rules (from the implementing agent's own diagnosis).** Sol stopped after opening a PR
with red CI although nothing blocked it. Its reasons: too much code before running tests; preventable CI errors (a wrong
API parameter, lint, outdated test expectations); no rule forcing a red PR to be finished first; and chat sessions that
end between actions. Added: SESSION-START §0 (finish open PRs first), §6 (problems vs real blockers, thin slices, a
no-shell path with draft PRs, an exact recovery point at every push) and AGENTS rules 11–13.

**2026-10-10 — CI cadence (from the implementing agent's review of its own CI use).** Every push runs the full CI on
purpose (the merge gate must be green at the exact head). The waste was pushing fixes while a run was still going, which
started overlapping full runs. Rule added to SESSION-START §6: never push while your PR's run is in progress; collect all
failures, fix them together, push once; run checks locally first; "re-run failed jobs" only for infrastructure hiccups.
CI cancels an obsolete PR run when a newer push arrives.

**2026-10-11 — Owner-approved policy defaults, no activation.** Chris replied "I approve your defaults" to IN-09 (read-only production SQL, at most 200 result rows) and IN-10 (spending cap $25/change and $50/day). These are implementation policy decisions only. They do not enable production write mode, procure paid resources, or authorize a real-account operation. Defaults become *applied* only after durable runtime settings and guards are tested and verified.

**2026-10-11 — GitHub REST fallback for environments without local testing (owner instruction).** When an agent's
workspace lacks a functioning checkout, terminal or local PostgreSQL, it must use GitHub REST via a connected GitHub
plugin (or `gh api`) to inspect and change repository branches and PRs, then obtain real unit, database and repository
checks from GitHub Actions. REST does not itself run local tests; never claim local validation, bypass CI, commit to
`main`, skip self-review or weaken production/spending/approval restrictions. Current procedure lives in
`AGENTS.md`, `docs/SESSION-START.md` §6 and `docs/PLAYBOOK.md` Step 4.

**2026-10-11 — D-2 beta branch recovery SDK compatibility:** The vendored Neon API includes POST branch recover, but pinned @neon/sdk 7.0.1 omits the generated raw recoverProjectBranch export. Keep the approved recovery behavior behind src/neon/client.js only: use the official SDK client's own POST method with one literal path template copied from the vendored API, its existing authenticated client, shared budget, error rules and write-uncertainty handling. No handwritten HTTP client, concatenated endpoint, automatic unsafe replay or authorization bypass. Fake-Neon validates the full request/response. If the SDK later exports the raw operation, use it without changing the public tool contract.

## 2026-10-12 — owner-requested independent server / universal gateway planning repair

RTC external interoperability is independent of shared internal implementation. Hub owns compact broker,
routing and grant mapping; this service owns provider credentials, canonical tools, state and guarded dispatch.
Core adoption is optional and separately gated; do not require K-3 for RTC/Hub acceptance or reduce standalone
capability for common code. Existing source/fake/deployed/real evidence and every owner/CI/release gate remain.
This explicit docs/planning request permits this focused documentation PR; routine cadence remains unchanged.

## 2026-10-13 — Owner-approved D-5 independence (IN-15)

The owner approved implementing D-5 without completing D-4 public role deletion. D-3 is the completed index prerequisite; D-4 provider-verified connection selection remains mandatory in every SQL tool. D-4 deletion remains unregistered pending independently reliable pooled-client safety evidence. Approval does not enable production changes, real fixture mutations or spending. See the D-5 implementation card.

## October 14, 2026 — owner-delegated concrete implementation designs

The owner requested completing/revising remaining designs, then extending the
same Sol 5.6 implementation detail to all six active custom MCP repositories.
[REMAINING-WORK-ROUTES.md](implementation-contracts/REMAINING-WORK-ROUTES.md) adds typed state/argument/result
contracts, domain-specific failure and recovery cases, current code seams and
finite proof requirements for the remaining indexed scope. This is an explicit
design-maintenance exception to routine no-docs-only implementation work, not a
feature PR or completed subsection. Existing owner-specific missing inputs,
spending/production/credential/cleanup authority remain gated; this entry does
not mark them answered. The original Toolkit stays reference-only.

## 2026-10-19 — Owner clarification: independent RTC conformance, not Hub LIVE connection, gates Neon completion

Neon MCP is an independently usable RTC 1 provider. Its completion requires implementing and proving its own server-side contract, direct transport, provider identity/permissions and applicable real-provider acceptance. The Hub discovers, enrolls, authorizes and routes to compliant servers; actual Hub LIVE registration, relay, discovery and end-to-end routing are Hub-owned acceptance, not blockers for this Neon repository. This does not waive R-1/R-2/R-3 conformance, direct LIVE provider proof, security, CI, review, release or owner gates, and it does not mark any queue row PASSED. The same separation was already documented for Google Workspace MCP. See `HUB-COMPATIBILITY.md` and the R batch in `PLAN.md`.

## 2026-10-19 — Universal standalone native MCP, provider attribution and end-user authority directive

Owner-approved engineering policy: every standalone Robinson AI Systems provider service must offer standards-based direct remote MCP independent of platform adapters, desktop IDEs and Hub, wherever actual desktop/mobile client software supports remote MCP. Hub only owns optional cross-server discovery/routing. Owner-controlled user-facing label is **Neon by Robinson AI Systems**, explicitly unofficial and not endorsed by Neon; preserve stable technical identifiers and existing client tokens/grants. Do not publish/invite outside users or claim official eligibility before separate platform and owner authorization. Developer $0 spend, fixture, production and release restrictions constrain **implementation agents**; end users have actual provider-scoped, security-protected delegated capabilities governed by their selected policy. Audit and repair accidental product denials without removing provider identity, tenant, protected resource, audited confirmation, user-configured spending or fraud safeguards. An actual authorized desktop/mobile MCP client and provider call are separate acceptance from code and docs. Current corrective inventory: `docs/audits/2026-10-19-universal-mcp-directive.md`. The developer's earlier suspicion that `neon_role_delete` was missing from the B-6 allowlist was not correct and no role deletion policy was changed; the five preexisting guarded D-7 snapshot writes WERE omitted and are the scoped correction. Production deployment and source merge remain separately verified, and existing owner credentials remain untouched.

### 2026-10-19 D-8 authority inspection follow-up

The standing universal developer-versus-end-user distinction also applies to four preexisting audited D-8 project security write handlers which the old conservative client visibility list accidentally hid. Their full-owner discovery must not bypass the provider's actual role/organization/project entitlement, B-1 audit/approval, B-2 protected/production classification, per-operation verified prior state, denial on drift and separate production/paid release gates. An implemented, independently confirmed reversible/configured action is different from an unimplemented irreversible logical replication or unpriced audit-log increase; the latter require reviewed cost and authorization work rather than generic allowlist widening. The source repair is not proof of a real live provider/client test, and does not alter the standing rule that live Hub connectivity is Hub-owned.


**2026-10-19 — Universal MCP completion gate reconciliation and honest release provenance (owner-approved).** The owner reaffirmed that gaps from the direct MCP/mobile/branding/end-user authority directive must be implemented where feasible and otherwise be formally represented in the roadmap, not left in an audit. Add six noncountable, original-card-linked completion gates CG-1..CG-6 to `docs/COMPLETION-GATES.md` and `docs/pr-cards/work-index.json`, enforce their visibility in `npm run session:status` and validation, and require explicit positive/negative, independent checked-source/provider evidence before PASS. No new artificial countable batch subsections; the existing D/V/O/P/W/U/R/E/X engineering is still unfinished. Development $0, production-write, release and secret controls remain binding on builders, but are not permanent customer policy. Original independently hosted native MCP and provider-owned RTC must both be proved; Hub enrollment is NOT a completion gate for Neon. Public catalog/listing and multi-tenant rollout remain private/unapproved until separate CG-6 security, platform/provider eligibility and owner decision. PR #189 and #190 merged and had exact-head CI, but the latest verified `live` deployment remains older; neither PR is live/native-client/provider-accepted. This planning and status reconciliation changes no provider permissions, credentials, spend, data or deployments.

**2026-11-01 — Source-versus-release documentation reconciliation, no security-policy change.** Main/live and checked Vercel Production were independently observed at `1c810cb0ca69fffc9be088d4c8e9834d2dd7d720` after #197, rather than the outdated October 19 deployment SHA repeated in the owner guides. The prior approved RTC 2 decision on 2026-10-31 is normative, but the server still exposes RTC 1-shaped code/contract pending separate reviewed implementation and conformance. OAuth environment-bound bearer rejection (#193), public-client S256 PKCE and client-owned token revocation (#194), five CAP backlog units (#192), and the completion gate set (#191) are now source-merged on that checked release. Update current documentation and keep dated prior notes as historical snapshots. No provider write, public marketplace submission, credential rotation or production activation authorized by this correction.
