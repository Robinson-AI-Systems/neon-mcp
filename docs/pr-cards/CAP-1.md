# CAP-1 — Operation and credential coverage inventory

Status: IN_PROGRESS (source inventory engineering in draft PR #203; original unit incomplete and uncredited).
Design: docs/designs/MAXIMUM-AUTHORITY.md; dependent CAP-2/CAP-3 require complete evidence first.
Owner acceptance: no live permission, compute, provider, credential or production actions authorized.

## Frozen bundle plan — before implementation

<!-- bundle-plan:start -->
```json
{
  "workKind": "ENGINEERING",
  "baseRevision": "69c46b71b6ab35e483f42338618146d1a377d074",
  "outcome": "Produce and verify the first complete operation-level authority and implementation-coverage inventory for Neon MCP, with honest current-interface gaps, credential uncertainty and separate source versus released-product proof.",
  "integrationBoundary": "Source-only operation metadata and reporting built from the pinned vendored Neon control-plane OpenAPI, the registered tool/handler source, and separately sourced newer Neon product surfaces; no production credential, issuer, provider data, database or server permission change.",
  "newEngineering": "Implement a deterministic checked catalog generator, independent validation of source/schema keys, precise credential and functional dispositions, operation-aware source-handler mapping, multi-host source distinction, reproducible family-gap reports and negative/failure tests wired into CI check.",
  "relatedWorkDecision": "CAP-1 is a substantial whole prerequisite on its own. CAP-2 and CAP-3 require this validated inventory and separately frozen live authorization and guided enrollment semantics, so their integration is deferred rather than invented or counted as part of CAP-1.",
  "estimatedProductionLines": 540,
  "subsections": [
    {
      "id": "CAP-1",
      "acceptance": [
        "One deterministic machine-readable row per pinned control-plane method/path/version and every separately evidenced advanced Neon product workflow, with checked source revision, canonical host and unique operation key.",
        "Every row explicitly distinguishes personal, organization, project API key, SQL login, delegated OAuth and product-specific credential support from unsupported or unknown, with exact resource and permission uncertainty retained.",
        "For each operation record method, family, source and target host, version, side effect classification, entitlement and scope evidence, existing handler or missing engineering, source tests, original owning roadmap item and separate released/live proof state.",
        "Guarded universal dispatch counts as implemented for an operation only if actual credential routing, request shape, policy guard, response and retry/readback semantics are verified; duplicate named tools and aliases must not inflate unique-operation coverage.",
        "Deterministic validator rejects duplicates, missing or orphan operations, broken schema source pin or drift, invented supported credentials, mismatched handler references, and unsupported disposition values without producing deceptively green coverage.",
        "Generated family gap report has reproducible denominators and explicit exclusions, separate implementation and released-live evidence, unknown/newer-provider interfaces called out individually, and no invented numerical capability percentages.",
        "Tests exercise the real vendored schema and source registry, fake documented newer product surface records, negative duplicate/orphan/unsupported/incorrect-scope cases, bounded execution and a clean CI consistency check; no real customer data or provider effects."
      ],
      "remainingEngineering": [
        "Build source adapter and deterministic machine-readable operations with pinned source provenance and explicit other-host statuses.",
        "Build source-handler, credential, source-test and authority evidence mapping with no speculative provider capabilities or fake coverage.",
        "Build strict duplicate, orphan, hash drift, schema and negative-case verification and family gap reporting with honest separate proof denominators.",
        "Wire reproducible script into normal checks and add focused fake-provider/unit tests, documentation and exact-head CI evidence."
      ]
    }
  ]
}
```
<!-- bundle-plan:end -->

## Delivery and provenance

Source-stage changes are present on the unmerged CAP-1 draft branch. Earlier exact-head CI was green before the current SDK-reference extension; recheck after a new push. Current-method, permission, registered-handler and real released/provider proof are not complete. All seven original criteria remain open. All seven frozen acceptance lines remain open until individually evidenced.

## 2026-11-03 implementation and truthful acceptance accounting

- Plan frozen before source editing at commit
  50342cc66d5b698334b6952c7f1e0f431eb7c7af on a separate native
  Git branch, from main 69c46b71b6ab35e483f42338618146d1a377d074.
- Criteria 1 and 2, source stage: 163 unique method/path/operationId rows
  generated from exactly pinned July 2026 OpenAPI; 15 separately sourced
  current Neon Auth, Data API, Functions, Object Storage, AI Gateway and SQL
  workflow records, never silently counted in the same API denominator.
  All six credential kinds carry explicit supported/unsupported/unknown
  evidence, scope and provider-reference status. Newer API endpoints remain
  unpinned and are not claimed exhaustive.
- Criteria 3 and 4: provider operations have source-file and registered-tool
  *candidates* derived from exact literal operationId references and exact
  registry handlers, plus any matching test files. They are NOT counted as
  fully functional without independently tested credential routing, policy,
  provider request/response, retry and readback. U-1 is a conservative
  universal fallback owner; exact direct-card ownership needs reconciliation.
- Criteria 5 and 6: deterministic independent validator checks duplicate,
  missing, orphan, invalid credential state, spoofed live proof, mismatched
  handler and source/provenance, as well as generated artifacts against
  checked source. Generated family counts show exact denominators and
  separate candidate/verified-source/live states, not an invented
  percentage. The document and JSON map are under docs/capabilities.
- Criterion 7: focused unit tests use the actual pinned OpenAPI and registry
  plus a synthetic newer-product interface. Run from the final source head
  and capture exact test/CI result in the PR; tests are not provider
  acceptance. No database test is called for by this read-only inventory:
  it does not mutate permissions or persistent user state.

**Unfinished whole-item acceptance:** refreshed/exhaustive official current
interfaces, each operation's exact request/response test mapping, per-key
provider-permission and documented scope classification, original direct card
ownership, and source-versus-real-provider operation acceptance evidence.
The original CAP-1 unit remains IN_PROGRESS, not COMPLETE. CAP-2 and CAP-3
remain dependent and are not silently started. No production credentials,
Neon resources, DNS, account grants or release state were changed.

## Drift check A — original authority inventory versus present implementation

- Original CAP-1 asks for current provider operation coverage, separate
  credential kinds and exact handler/request/response/real-provider evidence.
  The repository has a July 2026 pinned OpenAPI and 131 registered tools;
  neither is proof of the latest Neon provider method set or permission reach.
- Existing code is reused rather than duplicated: src/neon/openapi-index.js
  and src/core/registry.js define the trusted operation/registered-handler
  entrypoints. The CAP-1 generator adds validation/reporting, not a new
  universal API dispatcher, sign-in flow or provider mutation.
- Newer provider surfaces confirmed through official Neon docs in this
  session include Managed Better Auth, Data API, Functions, branch Object
  Storage, AI Gateway and data-plane Postgres SQL. They have distinct hosts
  or credential mechanisms; unpinned methods remain explicitly unknown.
- An occurrence of an operation ID in a tool module is reported only as a
  candidate source match; no plan or code reference is treated as verified
  authorization or an accepted released feature. CAP-1 stays IN_PROGRESS.

### Custom GitHub/Playground regression after owner restored connector permissions

The connected custom GitHub MCP advertises Full and native Git operations
continue working in the existing branch/workspace. However, the attached
Playground runner reproduced a separate publication defect even after the
permission restoration: npm run session:prepare -- --publish exited 1 with
"Git fetch failed; reconcile privately. No fresh publication check."
That is a concrete developer-tool inconsistency, NOT proof that repository
read/write grants are missing; use the native Git fetch/push path and actual
GitHub exact-head Actions to verify publication. Record the failure without
weakening the repo publication check or claiming it passed.


## 2026-11-03 — official SDK control-plane gap reconciliation (unmerged)

The publicly accessible official neondatabase/neon-pkgs OpenAPI JSON is
pinned to commit 167229f949438fb942809b72dd410888c70943a9
(2026-11-03T00:12:00Z), checked byte-for-byte at SHA-256
fcc7b2c39f15df03adedf90aa7cde7f1f5e7729ae50b10fd9c7a959f3fb1f82d.
Its 193 current SDK operation signatures were directly compared with the
163-method runtime vendored OpenAPI: 162 common method/path signatures,
31 newly present SDK-only and one vendored-only signature. No known
operationId renaming on a common signature. The SDK version is evidence
of official published documentation, NOT an independently attested live
API schema or an entitlement for any user credential.

Implementation: docs/capabilities/current-control-plane.json records all
193 official method/path/id/family signatures, immutable upstream origin,
source SHA and a checked projection digest. The generator includes each
of the 31 SDK-only methods in operation-coverage.json, preserving distinct
old runtime, official SDK-only and separately documented product-workflow
denominators; CAP-1-REPORT.md identifies every new/pinned-only operation
and cross-host uncertain workflow. The offline command
node scripts/verify-cap-1-upstream.mjs PATH_TO_PINNED_JSON verifies the
entire downloaded official source's byte hash, host, version and full
method projection. The source validator also rejects signature drift,
duplicate IDs, unverifiable credential changes, resource-selector changes,
incorrect direct owner routing and forged live status claims.

The current SDK evidence does not upgrade src/neon/openapi-index.js,
enable missing handlers, authenticate any new credential, authorize
provider execution, migrate production, or close the original CAP-1.
Existing D/O/E/CAP cards still require exact operation-level request/response
and guard evidence, and the currently untrusted deployed/provider/client
acceptance remains separate. The full reference is a bounded, offline,
reviewable SDK-source artifact, not a substitute for actual Neon validation.

## 2026-11-03 operation-to-handler provenance hardening (continuation)

The inventory initially associated **every named tool in a module** with an
operation whenever the module quoted that operation ID. This was an invalid
operation-to-handler implication. The subsequent CAP-1 source change replaces
this with Espree-parsed *provider invocation* sites, retaining the actual
source path and line. A specific MCP tool is associated only when the call is
inside that registered named handler. Shared helpers remain candidate source
with **no attributed handler** unless and until their call chains are
independently traced and behaviorally tested. Documentation comments and
unrelated string literals are no longer operation evidence.

The validator independently reparses the checked source and rejects forged,
missing or relocated call sites and tool assignments. The inventory's own
unit test is excluded from operation-specific behavioral-test references:
mentioning an operation inside an inventory assertion cannot count as proof
that its provider request, guard, response and readback were tested. The
209-row inventory now has 44 parsed-source candidates, **only 19** with a
directly attributed handler, and 25 sourced from unassigned helpers; none
are asserted to have executed. The remaining 165 operations have no parsed
source-call candidate in the current tool modules. These counts are not an
implementation percentage. New focused attribution, anti-forgery and
self-reference tests must pass with the existing schema/registry tests.

The newest merged source baseline is still PR #201 at
69c46b71b6ab35e483f42338618146d1a377d074; PR #202 and this CAP-1
PR #203 remain drafts until acceptance, reviews and exact-head required CI.
**No original CAP-1 criterion, CAP-2/3 prerequisite or CG gate has been
closed.** Per-operation credential, original-card routing, real behavior,
provider permission and native-client release proof still need independent
work. The original frozen plan is unchanged.

**Local verification (continuation):** `npm run check` passed; 13 focused
CAP-1 tests passed, the complete unit suite passed 1,102 tests across 154
files, and the isolated disposable-Postgres suite passed 125 tests across
48 files. These are source/CI prerequisites, not real Neon-provider or
native-client acceptance. Exact-head GitHub CI must be reverified after push.

## 2026-11-03 installed Neon SDK dispatch verification — source only

The operation inventory now additionally checks the pinned **installed**
`@neon/sdk` **7.0.1** `@neon/sdk/raw` exports against each of the **194**
distinct versioned control-plane operation IDs (163 vendored + 31 SDK-only).
**159** expose a callable raw export. The other **35** include **four**
explicit, statically recognized `src/neon/client.js` guarded fallback
routes (`recoverProjectBranch`, `getProjectJWKS`, `addProjectJWKS`,
`deleteProjectJWKS`); **31** have neither the raw export nor a declared
generic `call()` fallback and are listed individually in the generated
CAP-1 report. Seven fallback guards exist in source; three have raw SDK
exports and therefore do not count as fallback-only. The verifier
independently parses the runtime's real fallback declarations and checks
imported SDK function names, pinned package version and per-row summary;
negative tests reject fabricated export or fallback proof.

This audit is a **source-level dispatch feasibility map**. It does not prove
that any of these 194 APIs work with any specific customer credential, pass
the policy guard, return the expected shape, survive retries, exist live,
or provide safe readback. The absence of a *generic* route does not exclude
some independent named-tool implementation. Missing SDK exports do not
authorize a runtime SDK re-vendor, provider credential, release or live
operation. Complete request/response, original-card owner, provider auth
and client acceptance remain unverified; CAP-1 is still IN_PROGRESS with
**zero** completed original roadmap units and all CG gates OPEN.

**Further local test verification:** after the installed SDK-dispatch extension,
`npm run check` and all **1,103 unit tests** (154 files) plus **125 isolated
Postgres tests** (48 files) pass. These are not direct live Neon-provider
or released client acceptance. Post-push exact-head GitHub `ci` and
`release-policy` still require independent verification.


## 2026-11-03 operation-level request/response wire projection (draft PR #203)

The source inventory now records deterministic, **non-secret** API wire
declarations for every control-plane operation, without pretending they
were exercised: **163** exact pinned runtime method/path records and
**193** official SDK method/path records derived from the original
fully SHA-checked 2026-11-03 OpenAPI JSON. It records required path,
query, header and cookie parameter declarations; request body required
state, media types and structural SHA/ref/field names; response status,
media types and schema structure; explicit security-scheme alternatives;
and the digest of the whole upstream operation. It omits example request
or response values (which may contain identifiers or credentials).
It flags source documents that do not declare required path parameters,
rather than inventing provider inputs. Auth schemes are **not** mapped
to implied principal permissions or API-key scope.

The **separate official wire snapshot** is at
`docs/capabilities/current-control-plane-contracts.json` and is bound
to the existing official method inventory's exact revision, SHA, method
digest and its own structural digest. An offline full-byte verifier
(`scripts/verify-cap-1-upstream.mjs`) now independently checks **both**
the 193-method signature and request/response wire projections against
the original downloaded JSON. `scripts/snapshot-cap1-wire.mjs` only
regenerates the snapshot from the exact SHA-checked local upstream file;
it makes no network or Neon provider call and does not re-vendor the
production runtime's API. The ordinary CI check validates the snapshot,
the vendored 163-operation contract and their rows without network access.

**New discrepancy:** 17 of the 162 common method/path signatures have
*different declared wire metadata* between the runtime vendor and official
SDK snapshot. The generated CAP-1 report identifies each operation and
both digests, and keeps its official variant separately when needed.
These are declaration drift findings, not verified live breaking changes.
SDK-only operations still lack runtime-vendor contracts, and unpinned
Data API, Functions, Object Storage, Auth, AI Gateway and SQL host
interfaces remain independently unknown. The 31 generic dispatch gaps
identified earlier are unchanged. Per-operation request/response
**execution tests**, real credential authority and released
provider/client acceptance remain OPEN. Source artifact completeness
and even a passing synthetic schema test do not close CAP-1 or any CG
gate; all seven original frozen criteria retain their acceptance bar.

**Verification of this extension (local, not released):** source consistency
checks passed; the full **1,105/1,105 unit** suite (154 files) and
**125/125 disposable PostgreSQL** suite (48 files) passed; the original
full upstream JSON SHA-256 plus all **193** operation and **193** wire
projections were independently reverified offline. Exact-head CI is
required after the new commit, and direct provider/customer acceptance
is still unverified.

## 2026-11-03 — installed SDK synthetic runtime dispatch proof (draft #203)

The earlier 159 raw-SDK exported operation references have now been
**actually invoked through the checked-in production `call()` wrapper**,
but exclusively against an in-process fake HTTP client. The
deterministic `scripts/cap-runtime-dispatch.mjs` proof emits
`docs/capabilities/sdk-runtime-dispatch.json` with all **194**
control-plane operation IDs from the independently sourced inventory:

- **159** installed `@neon/sdk/raw` exported operations: one synthetic
  budget admitted and one exact HTTP method/path template captured;
  source-level wrapper return was confirmed by the fake SDK response.
- **4** guarded fallback-only operations: the specific declared
  source-client fallback was invoked once through an explicitly injected
  fake method stub, with exactly one synthetic budget call. These do
  **not** prove the fallback's internal URI, headers or request/response.
- **31** newer SDK-reference operation IDs: the installed generic
  `call()` refused before **any** simulated HTTP request, fallback
  invocation or API budget consumption. They remain engineering gaps,
  **not** verified provider denials.
- **15** documented non-control-plane advanced workflows remain
  independently unpinned and are excluded from these 194 test calls.

The executable verifier checks count reconciliation against the source
inventory, exact runtime method/path/param translation for raw exports,
one-call budget use, missing-route negative cases and source/fallback
tampering. `npm run check` now replays and compares the committed
machine-readable dispatch proof; the new unit suite explicitly keeps
its generic fake-SDK results out of the operation-specific policy,
guard, request/response and live-test index. No credentials, actual
Neon resource or network connection were used; **none** of these
results are independent provider/client acceptance, exact role
authorization, protection guard verification, retries/readback,
end-user feature completeness or live performance.

This delivers source-level executable dispatch *feasibility*, not
full original CAP-1 criterion 4 (actual per-operation authorization,
request/response, policy guard and retry/readback). All seven frozen
original CAP-1 criteria are still IN_PROGRESS, zero completed-card
credit, all six CG gates OPEN. Draft PR #203 has not been merged;
latest checked merged main/live still PR #201 at
`69c46b71b6ab35e483f42338618146d1a377d074`.

**Final local checks for this source extension:** `npm run check` passed,
**1,109/1,109 unit tests** across 155 files and **125/125 isolated
disposable-PostgreSQL tests** across 48 files passed. The checked
runtime artifact has 194 synthetic-control-plane rows, and no
provider network call or credential was used. GitHub exact-head
required CI still must be verified after publication; CAP-1 is
not accepted or merged.

## 2026-11-03 evening — fail-closed installed-SDK synthetic HTTP denials (draft #203)

Following the prior 194-operation source-only wrapper snapshot, the
automated **real installed SDK + in-memory fake HTTP** verifier now
asserts a simulated HTTP **403** through each of all **159** raw-export
operations. Each must return the sanitized `not_authorized` result,
consume exactly one synthetic rate budget, make exactly one matching
method/path request, **not retry**, and never echo an injected fake
secret. This is not a real permission or credential test.

The same verifier simulates an ambiguous **503** on all **94**
raw-export non-GET operations. Their production `call()` wrapper must
return `unknown_outcome` with `confirmed:null` rather than claim
success, reveal a fake secret or replay the mutation. At most one
bounded read-only project-branch recovery lookup is permitted; this
is not proof of a provider's actual idempotency or true readback.

The checked `sdk-runtime-dispatch.json` now includes per-operation
`synthetic403Denied` and `synthetic503Unreplayed` and count totals,
never `verifiedGuards`, `verifiedCredentials`, `verifiedReadback`,
`verifiedRequestResponse` or `verifiedLiveProvider`. Its 4 declared
fallback-only stubs and 31 unsupported generic paths retain their
separate evidence limits. Normal `npm run check` enforces drift, and
the existing CAP-1 focused tests assert these extra outcomes.

**Process recovery:** the earlier Playground session ended with an
uncommitted local 403/503 experiment, and its old workspace was
subsequently unavailable. This extension was reimplemented in a fresh
native Git feature workspace from independently verified remote
branch head `9da94bc6fb7e55ce39a51d9c8887efd16453b38a`;
unpublished scratch results were **not** treated as commit or CI proof.
The correct operational remedy is checkpointing tested changes with
native Git and verifying the remote head before any session ends.
All seven original CAP-1 acceptance criteria remain incomplete;
source-denial fixtures are not independently authorized real-provider
operations, user guard proof, paid/production rights, or deployed
client acceptance. No new account or production resource was touched.

**Final local verification of this negative-route extension
(2026-11-03):** `npm run check` PASS, **1,109 / 1,109**
unit tests (155 files) PASS, **125 / 125** disposable-PostgreSQL
tests (48 files) PASS. All 159 synthetic 403 and 94 synthetic 503
cases were re-exercised by the normal check and focused unit suite.
The original frozen CAP-1 acceptance is still **CONTINUE**, zero
complete original subsections, with real provider permissions,
guarded handler-specific operation proof and independently released
client acceptance still open. Exact-head GitHub CI must be verified
only after the new commit is pushed.

## 2026-11-03 evening — fix unscoped ambiguous-write recovery (source safety regression)

While exercising the runtime synthetic 503 paths, an additional direct
`src/neon/client.js` reproduction found a **real source logic
defect**: `call()` attempted `findExisting()` branch-annotation
recovery after *every* uncertain write. A failed `updateProject`
with an explicitly reused request key could mistakenly return
`confirmed:true, recovered:true` for an unrelated branch carrying
the same `rtc_request` annotation. The synthetic reproduction
returned a fake branch record after a failed project PATCH; no Neon
account/resource was contacted.

The source now allows annotation-based recovery **only for
`createProjectBranch`**, the one operation whose request key is
represented by a branch's annotation. All other uncertain write
operations retain `confirmed:null`, `unknown_outcome`, non-replay,
and their existing durable B-1 policy/audit semantics. They no longer
read an unrelated project branch inventory in an attempt to confirm
their outcome. A new `tests/unit/neon-client.test.js` fixture
proves an unrelated matching annotation cannot confirm a failed
project update, makes no additional branch GET, consumes one budget,
and does not leak a fake provider secret. Another regression
verifies legitimate exact-tagged branch creation still performs
the one read-only recovery check and never resends creation.

This is a **shared A-4/Neon API client correctness correction within
existing CAP-1 criterion 4**, not a completed standalone new
subsection or proof that all provider writes have independently
validated readbacks. The existing original CAP-1 frozen plan, all
relevant authorization/production gates and independent live
verification remain unchanged.

**Final local verification of the operation-scoped recovery fix
(2026-11-03):** `npm run check` PASS; **1,111/1,111**
unit tests in 155 files PASS; **125/125** real isolated
disposable PostgreSQL tests in 48 files PASS. The generated
209-row CAP-1 source index was regenerated because the new
`updateProject` behavioral regression adds one legitimate
source test attribution; it remains *source* evidence rather
than provider authorization. Original frozen CAP-1 plan still
returns CONTINUE (zero original subsections complete); exact
GitHub PR head CI must be verified after publication.

## 2026-11-03 evening — atomic Neon API-budget admission must fail closed

CAP-1's live wrapper/permission-route test pass revealed another
**actual source security boundary defect**, reproduced entirely against
in-memory fake database/provider adapters: an injected
`budget.consume()` result `undefined` allowed a real Neon SDK wrapper
to call its (fake) provider, and `makeNeonBudget()` treated a database
`{allowed:'false'}` string as truthy `allowed:true`. A missing,
malformed or corrupted durable rate-limit admission must never allow
a billable/protected provider API attempt.

Both layers now require an explicitly **boolean** admission: the
persistent adapter accepts `result.allowed === true/false` and throws
on malformed database responses; the common `call()` adapter admits
only a literal `true` or `{allowed:true}`. It refuses a malformed
response or thrown budget exception with a nonsecret
`budget_unavailable` (503) **before** sending any SDK request.
Explicit `false` retains ordinary 429 rate-limited behavior with
bounded 1–60-second Retry-After, including malformed/infinite
duration safeguards. Existing genuine PostgreSQL atomic minute
counters and provider-rate ceilings remain unchanged.

`tests/unit/neon-budget.test.js` refuses nine corrupted persistent
admission forms; `tests/unit/neon-client.test.js` refuses those
forms, masks a thrown fake private database exception, proves zero
provider requests, accepts explicit literal `true` as the previous
compatibility path, and bounds malformed 429 delays. These are
synthetic security-boundary tests plus the existing isolated
real-PostgreSQL budget tests, not independently executed paid,
production, end-user permission or live-provider actions.
This preserves CAP-1's original guarded-dispatch criterion;
**zero original CAP-1 subsections and CG gates have completed**.

**Final source-only budget-boundary verification (2026-11-03):**
`npm run check` PASS; all **1,114/1,114 unit tests** (155 files)
PASS; all **125/125 isolated real PostgreSQL tests** (48 files)
PASS. The regenerated source inventory includes the new
per-operation test attribution. The original full CAP-1 is still
`CONTINUE` with zero original subsection completion credit;
the new PR head must independently pass GitHub CI/release checks.

## 2026-11-03 late — CAP-1 pinned operation method write guard (draft PR #203)

The common Neon SDK `call()` wrapper previously accepted an omitted
`write` option for mutating raw SDK operations; synthetic calls to
`createProject` and `updateProject` ran successfully without
an idempotency/request key. The source now uses
`src/neon/operation-methods.js` to check the exact HTTP method for
**194** uniquely pinned control-plane operations (163 vendored plus
31 newer official SDK method/path gaps, deduplicated). The checked
offline generator `scripts/verify-neon-method-guards.mjs` rebuilds
that table from the independently source-verified CAP-1 inventory and
is part of `npm run check`; mismatched, unknown and duplicated
method metadata fail before a provider request.

The production `call()` entrypoint independently requires the
literal `write:true` for every non-GET operation, then the existing
nonempty request key and non-replay behavior. It does not trust an
omitted or false caller classification and does not authorize a
previously unsupported SDK operation. Tests cover **all 94**
mutating raw-export methods: omitted/false write flags and missing
request keys are rejected before **any** rate-budget consumption or
fake provider HTTP. Additional negative cases exercise inherited and
unknown operation identifiers. The 159 raw exports, four explicitly
guarded fallback routes and 31 generic unsupported operations retain
their separate source/proof states.

These are source and injected-client safety checks, not a new real
provider credential, product permission, customer release, deployed
runtime acceptance or full CAP-1 completion. No Neon provider or
production database was contacted. Original frozen CAP-1 criteria,
source-versus-live evidence and CG-1–CG-6 remain OPEN.

### 2026-11-03 late — 20 verified SDK spellings, no new API operations

The first full test run exposed six regressions because the initial
194-name guard excluded installed raw SDK exports with acronym-casing
differences (for example `getConnectionUri` versus published
`getConnectionURI`). A direct audit of the installed `@neon/sdk/raw`
7.0.1 exposed 23 function names outside the canonical published
operation IDs: 3 SDK client helpers and **20 actual case-only API aliases**.
The corrected method guard now protects **214 runtime spellings**
representing the **same 194 unique source operations**. The 20 aliases
are exactly 12 writes and 8 reads. The checked generator discovers
each unlisted alias, verifies one unambiguous canonical operation, and
actually executes the installed SDK wrapper against a fake transport
to assert the *exact canonical HTTP method and path* before allowing
that spelling. Unknown exports fail the check instead of being silently
authorized.

All 94 canonical raw-SDK mutations and 12 installed alias mutations
reject omitted/false write intent or missing request keys before rate
budget or HTTP. Existing connection-info read tests are restored.
The 31 canonical-name missing generic routes remain separately
reported: an available differently cased spelling is **not**
independent evidence of a generic canonical handler or live provider
permission. The result is source interoperability and fail-closed
engineering only; CAP-1 original completion, real Neon provider rights
and all CG acceptance remain OPEN.

**Latest source verification (2026-11-03):** the final checked
194-unique-operation/20-installed-alias method guard, preserved
connection-info behavior and new mutation preflight checks passed
`npm run check`, **1,119/1,119 unit tests** across 155 files
and **125/125 isolated disposable PostgreSQL tests** across
48 files. All SDK invocations used synthetic in-memory transport;
there was no live provider permission, account, production key,
deployment, spend or protected mutation. The original full
CAP-1 acceptance still requires actual per-operation credential
and policy/readback verification, independent real-provider
rights, current other-host coverage and released direct-client
proof. The original frozen whole CAP-1 is still IN_PROGRESS,
zero completed subsections, all CG overlays OPEN.
