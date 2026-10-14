# D-4: confirmed role retirement — approved owner decision

Status: APPROVED 2026-10-13 (owner: "I approve the change."). Implementation
and real acceptance remain pending. This document does not register a deletion tool,
change existing safety guards, authorize provider writes, or complete D-4.
Owner requested independent resolution of the stalled role-deletion decision.
Baseline: main after #130. #129 already implements read-only retirement review;
do not repeatedly implement preparation instead of completing the capability.

## Plain-English decision

Implement a confirmed, narrowly scoped destructive retirement operation. It may
break an undiscovered application that still uses the retiring login. The owner
must approve that possibility for the exact project, branch and role. The service
must never pretend that a zero database-session count proves no pooled clients.
Production activation, protected-resource and application-ownership gates remain.
Approval of this design is not permission to delete any real application role.

## Why the current acceptance is blocked

Neon supports role deletion through its API, Console and CLI. Its pooling docs
state that the pooled endpoint remains available regardless of the Console toggle.
The documentation exposes pool metrics but does not establish a customer-accessible
role-scoped atomic admission-block-and-drain contract. An idle PgBouncer client is
not equivalent to a visible PostgreSQL backend. A count is a sample, not a promise
against clients reconnecting after the read. Credential rotation affects new
connections; it is not evidence that every already-authenticated client is gone.

Provider-assisted drain remains optional if Neon supplies a documented supported
contract that blocks new admissions, drains existing clients on all computes and
returns independently verifiable completion. Do not make this the only possible
way to implement a supported explicitly destructive administration operation.

## Approved narrow amendment

The current implementation/card absolute absence-of-pooled-clients condition stays required for any
operation advertised as nondisruptive. Add a separate confirmed-retirement path
that truthfully reports pooled-client visibility UNKNOWN and requires explicit
acceptance of potential connection interruption. Never set poolerClientsVerified
or generic safeToDelete to true merely because the owner accepted this risk.

1. Resolve exact organization/project/branch/role, owner authority and all existing
   protections. Exclude internal/reserved roles, the service's own resources and
   the monitoring login. Refuse contradictory or incomplete resource inventories.
2. Collect the existing retirement review plus authorized SQL dependencies across
   all relevant databases and visible sessions across relevant computes. Direct
   monitoring connections are mandatory; a direct connection does not disable the
   provider pooler. Do not require obsolete pooler_enabled=false as a visibility
   proxy. Do not start idle computes or interrupt sessions implicitly.
3. Review SQL ownership, grants/default privileges and memberships. Dependencies
   that require changes must be resolved through separate reviewed operations.
   Do not automatically delete databases or objects, use DROP OWNED/CASCADE,
   reassign ownership, revoke unrelated permissions, or terminate sessions.
   PostgreSQL automatically removes memberships involving a dropped role. Preview
   those exact membership losses; do not impose zero memberships as an additional
   impossible requirement for API-created roles. Other object references still block.
4. For application-used roles, record the replacement login, actual dependency
   migration and service verification. Recycle application-owned connection pools
   under separately authorized application changes. Unidentified consumers remain
   explicitly unknown; do not claim a complete consumer census.
5. Existing visible target-role sessions block the initial implementation. Session
   termination is a separate destructive action requiring additional exact consent.
   NOLOGIN, password reset, or compute restart must never be described as a proven
   managed-pooler drain. No branch-wide restart to work around role visibility.
6. Use the existing durable B-1 preview/confirmation/audit pipeline. Preview names
   the exact role, irreversibility, known dependencies and unknown pooled clients.
   Bind confirmation to the same owner/connection, target and reviewed revision.
   Require role-specific interruption acknowledgement as well as confirm=true;
   no broad force flag, consent carried across roles, or default permission change.
7. Reverify identity, dependencies and permissions immediately before the exact
   Neon role DELETE. Await returned operations; independently GET/list the same
   role to verify absence. Record pending/uncertain outcomes; reconcile reads before
   retrying. Post-delete absence proves role removal, not application health or
   pooler socket termination. Never claim those extra outcomes from HTTP success.
8. Production retirement still requires owner-enabled production plus specific
   maintenance consent. A maintenance window may be immediate for a disposable
   fixture; it is not an automatic scheduling or blanket production authorization.

## Concrete implementation and acceptance

Reuse #129's provider inventory and src/tools/role-delete-inventory.js; add the
confirmed retirement tool under the original canonical role-deletion capability.
Separate evidence completeness, SQL blockers, pooled visibility and explicit impact
consent in typed output. Preserve read-only profiles and all existing guards.

Test the write contract through every service door and PostgreSQL dependency checks
on disposable local Postgres. Negative cases: no acknowledgement, foreign/protected
resource, stale preview, ownership/reference blockers, monitoring role, changed
identity, visible sessions, unknown/incomplete SQL evidence, provider failure and
uncertain readback. Include a fixture with a genuinely established idle pooled
client so the warning/consent path is tested rather than faking its absence.

Real acceptance requires a verified isolated scratch project, exact custom-service
connection and specifically authorized temporary role/branch. Test create/readback,
confirmed deletion, provider absence, new-authentication denial and the observed
existing pooled-client behavior separately. Delete only exact run-owned fixtures.
Do not activate production or purchase/provision resources under design approval.

D-4 remains IN_PROGRESS until source, CI, checked deployment and real authorized
acceptance meet the amended contract. D-5 approval IN-15 remains independent.

## Primary references

- https://neon.com/docs/manage/roles
- https://api-docs.neon.tech/reference/deleteprojectbranchrole
- https://neon.com/docs/connect/connection-pooling
- https://www.postgresql.org/docs/current/sql-droprole.html
