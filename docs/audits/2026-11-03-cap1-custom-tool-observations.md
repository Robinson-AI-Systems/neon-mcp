# CAP-1 custom-tool observations — 2026-11-03

- **Confirmed working:** After the owner's permissions-restored notice,
  github_whoami reports Full and the exact running custom connector revision
  648ba99c4b72. Native Git opened an isolated branch from actual main and
  successfully committed the frozen CAP-1 plan at
  50342cc66d5b698334b6952c7f1e0f431eb7c7af.
  Playground attached and ran Node 24, lint, source unit and disposable PG.
- **Confirmed defect (medium):** Playground session:prepare -- --publish
  still exits 1 on an authenticated Git fetch. Reproduction: from attached
  workspace job_a33f80a18ad81212 run
  npm run session:prepare -- --publish. Result:
  "Git fetch failed; reconcile privately. No fresh publication check."
  This was reproduced after restored custom GitHub permissions; do not treat
  an overall Full OAuth profile as working per-runtime Git delegation.
  Native typed Git fetch is the distinct authenticated fallback.
- **Suggested improvement:** Give Playground read-only Git fetch an explicitly
  delegated, short-lived repo credential from the native Git workspace, with
  a safe issuer/expiry diagnostic. Or let session:prepare consume an immutable
  native Git workspace fetched-head attestation without embedding any token
  in the command shell. Keep operation separation and integrity checks.
- **Previous confirmed deployment limitation:** Vercel READY readouts exposed
  no independently corroborated serving commit (commit null), documented in
  the R-2 audit on draft PR #202. Not re-proven by a current CAP-1 deployment;
  do not declare any release SHA from branch comparison alone.
- **No user spending or other MCP repository change.** Tool observations
  are not production fixes and are not authorization to alter GitHub MCP.


## 2026-11-03 continued-work follow-up (current tool release)

- **Version and native operations:** custom GitHub whoami now advertises
  0.1.0+b37a239001e8 with Full profile. Native Git continued real
  ancestry, stage and commits on PR #203's existing branch after
  a documentation-first merged-main reconciliation.
- **Additional Playground credential defect:** the documented
  github_playground_workspace git_access operation returned
  write_outcome_uncertain, saying the attached runtime did not accept
  the short-lived read-only repo Git key and that the key was canceled.
  Do not retry that uncertain issuance blindly or claim publication Git
  credentials are working. Native Git workspace reads/writes still work;
  runtime Node, npm, real source and disposable PostgreSQL tests work.
  Suggested fix: verify the runtime's signed credential/issuer handshake
  and token acceptance/clock/version compatibility. Report an exact
  diagnostic, never expose the key or downgrade repository checks.
- **Vercel improvement confirmed by read-only evidence:** newer
  Vercel deploy_list and deploy_get responses now expose exact commit
  69c46b71b6ab35e483f42338618146d1a377d074 for READY production.
  Three alias_list records all map to that exact deployment. The earlier
  commit-null observation was real but is no longer a current obstacle
  for this release's deployment metadata. These records do not
  independently prove any direct MCP or Neon provider acceptance.
- **Current SDK operation drift:** Neon's upstream SDK published
  193 methods at revision 167229f949438fb942809b72dd410888c70943a9,
  31 not present in Neon's currently pinned runtime OpenAPI; this is
  a Neon MCP capability engineering gap, not a GitHub/Vercel tool bug.

- **Reproduced publication preflight after the credential handoff attempt:**
  npm run session:prepare -- --publish exited 1 in the current isolated
  Playground with the exact message
  "Git fetch failed; reconcile privately. No fresh publication check."
  Do not claim this check passed; native Git fetch/push plus exact-head
  required Actions checks are the separate authenticated verification route.

### 2026-11-03 continuation: CAP-1 false-positive candidate ownership

The original module-wide regex grouped every `neon_*` tool name with any
operationId literal co-located in a source file, even if the tool never called
that API. It also indexed CAP-1's own reference tests as if they were operation
behavioral tests. Replaced the cross-product with parsed provider-call path,
line and named-handler provenance and rederived/cross-validated artifacts.
Current source snapshot: 44 operations with parsed call sites, 19 with direct
handler attribution, 25 from unattributed shared helpers. All 209 remain
unverified for guarded live execution. New static parser dependency is pinned
as a dev dependency; no runtime Neon client/provider keys changed. Playground
command execution and package installation were available. The earlier
Playground Git-fetch publication preflight failure is still an independent
unresolved tool integration issue, not permission to skip CI/publish checks.

### 2026-11-03 installed SDK dispatch mismatch discovered

The public official API snapshot includes 193 methods, but the actual
pinned and installed `@neon/sdk/raw` version 7.0.1 has no callable
export for 35 of the combined 194 distinct runtime + newer operation IDs.
Of those 35, four have exact guarded `src/neon/client.js` fallback
predicates. The other 31 have no generic `call()` route. A source-only
validator now binds the full 194-operation method inventory to imported
raw function exports, pinned runtime version and parsed fallback guard
proof. Do not call these 31 live-provider denials: a separately guarded
named-tool implementation could still exist and must be tested on its
own merits. Missing/unknown statuses remain, and neither CAP-1 nor live
customer permission/client acceptance is finished.


### 2026-11-03 exact official request/response contract reconciliation

Reconfirmed official SDK OpenAPI raw source (193 methods, SHA256
`fcc7b2c39f15df03adedf90aa7cde7f1f5e7729ae50b10fd9c7a959f3fb1f82d`)
from pinned upstream commit; source-only declaration projection now
covers every runtime-vendored method and official SDK method. The
method-level source comparison identified 17 common signatures with
different declared request/response, parameter or auth metadata.
The 31 SDK-only method and generic-dispatch gaps, one vendor-only method
and 15 separately documented advanced-host workflow records still
remain distinct. No real customer credential, provider execution,
permission enhancement or deployment was used. Synthetic tamper
tests and exact full-upstream offline verifier are required before
source completeness can be counted.

### 2026-11-03 executable fake Neon SDK routing proof

The **attached real Playground runtime** executed all 159 SDK
function exports through the repository's current `call()` wrapper
without a network connection or provider key. Captured method,
path template and one in-memory budget admission matched all 159.
The new checked automated proof additionally invokes four
guarded fallback stubs and verifies all 31 missing routes fail
closed before SDK calls/budget. The installed SDK and client
source were not modified. These checks are local integration of
runtime-generated wrappers with *fake transport only*, and must
not be recast as provider permission, policy-guard, readback,
SDK endpoint responsiveness, or live client success.

### 2026-11-03 evening — Playground uncommitted-session expiry and negative fixture recovery

The prior CAP-1 Playground job was no longer active on reconnection:
the native Git workspace status returned `No active workspace belongs
to this connection.` Remote PR #203 retained its previously verified
`9da94bc6fb7e55ce39a51d9c8887efd16453b38a` source/check head.
Consequently the prior uncommitted 403/503 scratch was not represented
as saved work. A fresh native feature workspace was attached, the
simulation was regenerated and run against the installed real SDK.
This is a tool/session durability limitation, not evidence of failed
GitHub remote push or dropped prior commits. Keep checkpoints
recoverable and verify remote head before any terminal result.

The new synthetic verifier now checks 159 sanitized 403 denials and
94 ambiguous 503 write failures without replay, using fake provider
responses only. No native-client or real-provider acceptance is claimed.

### 2026-11-03 evening — real source bug caught by synthetic CAP-1 execution

An injected 503 on `updateProject` followed by the old generic
branch recovery lookup returned an unrelated branch annotated
with the same `rtc_request` and incorrectly marked the project
update `confirmed:true`. This was independently reproduced in
the actual repository `call()` with the installed SDK wrappers
and no network. The repair scopes annotation-based success
to `createProjectBranch` and preserves unknown outcome for
all other mutation types. Follow-on regression ensures a
legitimate branch-create annotation still confirms through a
bounded read-only lookup. All evidence is source/fake-provider,
not actual Neon customer deployment or live provider readback.
