# Maximum legitimate Neon authority — approved plan, 2026-10-21

Owner requested adapting GitHub MCP PR #269's capability/authorization planning
to this project. This is approved future engineering, not completed implementation,
new provider authority, runtime permission widening or deployed acceptance.
The existing roadmap, acceptance, security/review and release procedures still apply.


## Binding product rules

- Standard includes the fullest authorization available through the user's ordinary
  supported connection. Read-only/Everyday/Full (or this service's actual equivalents)
  are explicit user delegation choices, not artificial credential tiers. Inspect
  actual setup/defaults before editing; offer Full clearly without forcing God Mode.
  Preserve existing selected restrictions and grants; no silent upgrade.
- Optional God Mode means guided enrollment of **genuinely necessary** additional
  credentials/privileges. If ordinary authorization supports an operation, Standard
  gets it. Do not create exclusive tools merely to make the label appear powerful.
  Where extra credentials cannot increase legitimate authority, report that honestly.
- Provider roles, entitlement, tenant/resource scope, revocation, secrets protection
  and explicit user policy remain binding. Missing permissions and missing code are
  different conditions. Unknown price is disclosure, never fictitious $0 or a
  permanent guide-only substitute for an implementable authorized API.
- Developer $0/scratch/no-live/release rules govern the implementing agent, not the
  customer's product ceiling. Robinson AI Systems may separately be developer,
  operator or customer: determine authority by environment, tenant, role, session
  and action. Company login alone never confers global admin or sandbox-only status.
- A named-tool count, credential percentage, API finder, universal dispatcher or
  provider login is not functional coverage. Retire any such percentage unless its
  operation denominator and execution evidence are reproducible. Do not import
  GitHub's 411-tool count or 98.3% figure into this product.

## CAP-1 — operation-level inventory and authority evidence

Inventory scope: Versioned Neon control-plane API/SDK, organization/project/branch/compute/restore/snapshot/security/access operations, data-plane SQL and supported documented Auth, Data API, storage, functions and AI Gateway interfaces. Record separate hosts/products and provider availability; control-plane coverage is not SQL or newer-product parity.

Credential dimensions: Personal, organization and project-scoped API keys must be distinguished from database login roles/passwords, delegated/OAuth credentials where documented and product-specific credentials. A control-plane key is not automatically a database superuser. Project-scoped keys cannot be assumed to grant organization administration or project deletion.

Create one machine-readable row per method/path/version or equivalent documented
workflow, linked to current official schema/reference revision and checked date.
Record operation key/family/host/version, supported/unsupported/unknown per credential
kind, permissions/roles/entitlements, user/resource scope, source handler or missing
engineering, exact request/response tests, side effects, owner unit/dependencies and
live proof. Include list/search/export/upload/download/async/bulk variants. Record
retired/UI-only/documentation-conflict dispositions with evidence; lack of a developer
plan or test account is not a product exclusion. Source parity and live parity are
separate metrics with explicit denominators/exclusions and schema drift detection.
Universal coverage counts only if its actual guard, request translation, credential
route, response and retry/readback behavior support that operation. Deduplicate
operations reached by several tools. Do not count plans as implementations.

Acceptance: reproducible current-interface enumeration; duplicate/orphan/missing-row
validation; every operation disposition and credential uncertainty visible; generated
family gap report; source and live evidence separately pinned; no invented percentage.

## CAP-2 — maximize ordinary authorization and explain restrictions

Inspect current seams: `src/neon/client.js`, `src/neon/sql-run.js`, `src/db.js`, `src/core/`, `src/tools/`, credential setup and original A-7/B-3/D/U cards.
Classify each denial as developer-only, provider/security required, explicit user
policy or missing/defective product capability. Compare default versus fullest
ordinary authorization for the **same** user/target. Explain credential, role, plan,
connection profile/mode and user policy separately; supply an explicit secure upgrade
path while retaining unrelated grants. Do not implement runtime migration until the
exact existing policies and backward-compatible transitions are frozen in a JIT card.

Acceptance: ordinary fullest connection can execute supported operations without
extra credentials; positive and negative tests for readonly/policy limits, scope,
revocation and upgrade recovery through every real door; no silent permission widening.

## CAP-3 — guided additional authority lifecycle

Drive setup from the inventory's verified operation requirements. Reuse valid grants;
request only genuinely missing permissions. One client-initiated workflow launches
secure service/provider consent and returns automatically. Prefer supported provider
delegation; protected secret entry is a fallback only where genuinely needed. Never
request secret values in chat/tool arguments or promise automatic credential issuance
or admin approvals that the provider does not expose.

Typed grant records bind issuer/host, stable verified principal, tenant, resource
selection, credential kind, permissions, expiry and verification state. A deterministic
operation-aware resolver must not guess credentials, retry a write with a broader
credential, borrow another tenant's grant or treat a sign-in session as authorization.
Keep encrypted context binding, CSRF/PKCE/one-use state where applicable, scoped passes,
refresh/revoke/rotate/delete and interrupted-flow recovery. A credential that cannot
be provider-downscoped must still respect service scope or refuse unsupported passes.
Store only redacted diagnostics; never return passwords, tokens or private keys.

Acceptance: synthetic-provider and disposable-storage tests for two independent
principals/tenants, wrong host/resource/audience, revoked/stale grants, concurrent
refresh/replacement, interrupted enrollment and secret redaction. Prove an actual
before/after authority difference for each additional credential kind; unsupported
upgrades remain explicit. Real grants/paid operations keep independent test approvals.

## CAP-4 — close provider-specific advanced workflow gaps

Priority and scope: Organization/account administration and project-key limitations first; then missing backup/restore/security/branch workflows and SQL-role parity. Record supported newer Neon products individually with real API contracts rather than silently excluding them or inventing tools.

Derive concrete operation sets from CAP-1 and reconcile with original unfinished
cards before coding. Existing work stays on its original ID; use this unit only for
new uncovered scope. Do not double-count old implementations, add speculative APIs,
subdivide cards to inflate progress or close a whole family after one read. Freeze
request/credential/secret/guard/failure/recovery contracts in the selected JIT card.
Implement supported operations through the existing guarded lifecycle: useful target
preview, user-authorized effect, stable replay key, before state, audit, provider
readback, bounded results, pagination/async completion and honest uncertain outcomes.
Provider UI-only or retired interfaces require explicit sourced dispositions, never
fake tools. A broader credential cannot repair absent code or a provider plan denial.

Service-specific preserved boundary: Preserve production restore preservation/finalization, SQL parsing and transactions, protected-resource refusal, developer compute/spending limits and scratch-only test grants. Database credentials must never enable access to the MCP service database. No live SQL, compute expansion, key rotation or project mutation is authorized by this plan.

Acceptance: every new active gap has complete implementation/test evidence or a
provider-evidenced unavoidable disposition; existing incomplete cards remain open;
request-shape, tenant, guarded-write, replay/error/readback tests per affected family.
Missing real test prerequisites are separate from eligible inactive engineering.

## CAP-5 — independent acceptance and truthful reporting

Before implementation freeze precise positive/negative scenarios. On the exact READY
released revision verify ordinary Full and genuinely additional-authority workflows,
readonly/user-policy denials, wrong principal/tenant/resource, refresh/revocation,
interrupted setup and ambiguous-effect replay. Use supported direct MCP clients;
Hub-only integration does not replace provider-owned direct proof. Record permitted
fixtures, exact source/origin, credential **kind** only, provider readback and cleanup.
No paid plan, production activation, money movement, account scope or release change
is authorized merely to obtain proof. Never rerun old fixtures without ownership.

Acceptance: new genuine workflow evidence, independent scope/revoke/recovery denials,
all real supported doors/clients, generated source/live coverage metrics and explicit
external prerequisites for every unverified operation. Preserve all original live
acceptance rows verbatim; append new exact-source criteria only when real implemented
procedures exist. Publication/distribution remains separate; no launch is authorized.

## Execution and source reconciliation

Run the existing session workflow. Existing eligible acceptance and interrupted
implementation retain priority. CAP-1 precedes CAP-2/CAP-3; CAP-4
needs all three; CAP-5 needs the completed authorization and workflow units.
Reconcile existing cards before creating new ones. Write bounded implementation
contracts before code; these five planning units are all unfinished and complete
zero implementation bundles or live acceptance. Provider references are starting
evidence, not a claim that this plan audited every endpoint; recheck per operation.

References checked 2026-10-21:
- https://neon.com/docs/manage/api-keys
- https://api-docs.neon.tech/reference/getting-started-with-neon-api
- https://neon.com/docs/connect/connect-intro
