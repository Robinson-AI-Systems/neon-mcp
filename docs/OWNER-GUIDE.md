# Neon by Robinson AI Systems — owner guide

This is an independent integration, not an official Neon product or endorsed connector. Use the [direct remote MCP setup guide](DIRECT-MCP-CONNECTION.md) from any compatible desktop/mobile coding agent; Hub is optional. Real client/provider acceptance is tracked separately.

Plain-English things to say to a compatible authorized coding agent once each part is built. Each line names the batch that delivers it; until then
it may not work yet or may require a checked released revision, approved user delegation and separate provider acceptance. This file is updated as features ship; see [completion gates](COMPLETION-GATES.md) for the six cross-cutting prerequisites.

| Say something like… | What happens | Batch |
|---|---|---|
| "Who am I connected to in Neon?" | Organization, key kind (last 4 only), preview or production mode, your spend caps | A/B |
| "Show me my Appliance Desk database." | Project, branches (which ones are production), computes and sizes, databases, storage, recent activity | D |
| "How many customers signed up this week?" | A read-only query, at most 200 rows, never changes anything (if you allow production reads, IN-09) | D |
| "Delete the test rows from the demo table on the dev branch." | Shows exactly how many rows, asks when it is risky, does it, confirms | D |
| "Run this change on production." | Refused until you turn production access on. Then: tries it on a throwaway copy first, tells you exactly what will change, asks you, applies it all-or-nothing, keeps an undo | B/D |
| "Make my compute bigger." | Shows what it could add to your monthly bill in dollars, asks you, changes it, confirms | B/D |
| "Get back the data from Tuesday." | Restores Tuesday's state to a separate branch, shows what's different, and only with your OK copies rows back or swaps it in | W |
| "Take a backup before this migration." | A named snapshot you can restore from | D/W |
| "Give me a throwaway database for this feature." | A branch that deletes itself after a day, with realistic test data if you want it | V |
| "Try this migration first." | Runs it on a copy and shows the schema changes, errors and anything that would lock a big table — production untouched | V/W |
| "Clean up everything from that test run." | Removes exactly what that run created, nothing else | V |
| "Why is this query slow?" | Tests indexes on a copy and shows before/after timings and the exact fix | V |
| "What is Neon costing me this month?" | Month so far, projected total, by project and branch, and what to change to save money | O/W |
| "Review my Neon account." | Members, keys and their ages, protected branches, usage and bill estimate, security, settings — ok or needs attention | O |
| "Add Sam to my Neon organization." | Shows the email and role, asks you, sends Neon's invitation | O |
| "Change my Neon plan." / "Turn on SSO." | Use provider-supported authorized action if one actually exists; otherwise show exact verified manual console steps. **Current developer agent cannot purchase/upgrade.** End-user financial/admin execution and cost-disclosure parity remain CG-3/U-1/O-4 completion work, not a global product prohibition | O/U |
| "Clean up old branches." | Lists stale branches (never production or the app's), asks you, deletes them (recoverable for 7 days) | W |
| "Rotate the database password for Appliance Desk." | New password shown once on your setup page, the list of places to update, then checks it works | W |
| "Is Neon ready for Appliance Desk?" | Every item the app needs: done, fixed with your OK, or exactly what you need to click | P |
| "Set up Neon for my new project." | Project, databases, roles, protection, dev-branch defaults — previewed first; connection details only on your setup page | P |
| "What changed in Neon through Claude this week?" | The change log | B |
| "Undo that." | Reverses the last change when it has a clean opposite (including a SQL change, by rolling the branch back to just before it while keeping today's state on the side); says plainly when it can't | X |
| "Make a 24-hour read-only pass for Codex." | A pass shown once on your setup page; the agent uses it through Robinson's Toolkit (`rtool`) or the HTTPS API | R |
| Anything else in Neon | The universal tools find the right Neon operation and run it with the same safety | U |

## Independent client and end-user readiness

The private source-supported remote MCP is **not** evidence of verified third-party desktop or mobile behavior. CG-1 requires an actual compatible independent desktop client and a supported mobile client to initialize, authorize and perform a true Neon read; CG-2 checks revocation and account separation. CG-3 requires safely configurable end-user delegation policies instead of copying the implementing agent's $0 budget/production rules to customers. Full provider-owned RTC conformance is CG-4; real checked release, provider/scratch cleanup is CG-5. Public onboarding/marketplace distribution remains private until security/privacy/scale and separate provider/platform/owner approval CG-6. The optional Hub is never required for independent Neon completion. See [COMPLETION-GATES](COMPLETION-GATES.md) and [DIRECT-MCP-CONNECTION](DIRECT-MCP-CONNECTION.md).

## Organization membership and project access (O-1 source checkpoint)

Once O-1 is merged **and released**, use a `full` owner connection with
an organization-scoped or verified personal administrator key to ask your
connected coding agent to list your members, see invitations and compare
explicit project member roles with legacy email shares. Project-only keys
cannot perform organization administration. To allow access changes, enroll
the elevated key yourself using the passphrase-protected owner setup page;
the key is encrypted, and the agent never sees it.

To invite or remove organization members, Neon requires a **personal
administrator API key** verified against that specific organization. Invites
can cause Neon to send email and existing users may join without a separate
email. The agent must preview the exact recipients, roles, affected projects,
and requested change, then receive explicit confirmation. Changing a role,
sharing a project, and revoking access use the same audited confirmation.
Last-administrator and verified personal-key-owner self-removal are refused.
Changes to an app-owned project must also pass existing project/app protection,
with `outsideApp` never overruling protected infrastructure.

**Not yet live or provider-accepted:** source and synthetic checks do not prove
the currently released service supports these operations. Do not paste API
keys into a chat or use this as a claim that real invitation, self-lockout or
project ACL acceptance has run.

## D-8 verified owner security controls (source integration checkpoint, not live acceptance)

An appropriately authorized `full` direct MCP connection on a production server deployment may discover `neon_security_set_public_access`, `neon_security_set_ip_allow`, `neon_security_set_jwks` and `neon_security_set_audit_log_level`. They remain independently guarded; an agent must show the exact scoped provider project, affected network/auth/audit behavior, existing Scale entitlement for IP allowance, irreversible lockout risk, and receive required owner confirmation. A preview deployment, lower-profile connection, protected target or restricted temporary RTC pass does **not** gain these writes. Only a lower audit level is implemented; adding paid logging or enabling irreversible logical replication is **not** unlocked. No live provider effectiveness was proven by the source change. Read [D-8](pr-cards/D-8.md) and [the restriction audit](audits/2026-10-19-universal-mcp-directive.md).

## Reading large results

When a read result is too large for the default 8KB response, retain the returned `res_...` handle. Call `neon_get_result` with that handle and `page: 0`, following `nextPage`. Each handle expires after 24 hours and only the same scoped connection can read it. Oversized items may use base64 JSON fragments: decode and concatenate fragments in page order, then parse the JSON. No Neon production access is enabled by this feature.

## Coding-agent development access (2026-10-13)

The implementing agent uses a renewable native OAuth connection, not a new copied RTC
pass for every retest. `rtool developer-connect ALIAS --profile full` prepares one mobile
link using the custom service. Choose the intended account/resources and authorize once;
return to chat without copying secrets. The agent reruns the command to finish privately,
then uses developer-check, developer-tools and developer-call. Existing original service
write previews, owner approvals and resource guards still apply. This developer workflow
does not reduce the finished product's tool capabilities.

On a managed POSIX cloud runner, configure RTOOL_DEVELOPER_VAULT_DIR to an absolute private
folder outside every Git checkout. The CLI creates a separate 0600 encryption key and
AES-GCM encrypted connection files in a 0700 folder; keep that private runner state for
resumes. OS credential managers remain the desktop default. Neither option places secrets
in chats, prompts, Git or shared artifacts. Initial provider consent or an expired/revoked
underlying authorization can still require a new owner sign-in. Source/tests are not
proof that the new deployed workflow has been exercised against the real provider.

## API-key management and project ownership transfers (O-2)

With a verified full-owner connection, your coding agent may list provider API-key
metadata, request a new personal, organization or project-limited organization key,
or revoke a specific provider key after preview and independent confirmation.
Creating personal or organization keys requires a verified personal administrator.
The new key token is never included in the agent's tool result: it is delivered
through the passphrase-controlled single-use setup page, or verified against Neon
and atomically encrypted into this server's active key vault. The prior provider
key remains usable until you separately and explicitly revoke it. If a server key's
provider identity cannot be verified, the agent refuses a potentially locking revoke.

Project ownership transfer is a production-class operation. The agent checks every
project's verified owner and default branch, existing protections and application
ownership, and any known Vercel or GitHub integrations. It requires production
permission and exact confirmation. Transfer requests return an expiring request ID;
Neon's API does NOT return a verified Console claim URL, so the owner one-time page
provides the ID and the official recipient-side method, not a fabricated URL.
The recipient must accept separately. An interorganization transfer requires a
personal administrator who can also administer the destination organization.
Provider responses and post-transfer ownership are independently verified or
explicitly marked unverified; ambiguous writes are never automatically replayed.

**Source implementation does not mean live acceptance.** No real account key or
project was mutated during developer tests. Release and owner/provider testing remain
separate repository obligations.
