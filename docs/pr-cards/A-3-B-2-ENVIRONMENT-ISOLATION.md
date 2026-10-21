# A-3/B-2 deployment-bound OAuth security correction

Owner directive: universal permissions, capabilities and multi-user authentication, 2026-10-21.
Existing A-3/B-2 correction; zero newly completed subsections or bundles.

Frozen outcome: production OAuth access credentials must never authenticate on a preview,
development or unspecified deployment. Preserve production-enabled organization validation,
preview grants, exact client/org/project/profile/listing, secrecy and existing write guards.

Confirmed defect: requireMcpToken converted production credentials into preview connections
after loading the shared OAuth store. Reject those credentials before dispatch instead.
HTTP authentication scheme casing is insensitive; credential bytes and shape remain strict.

Proof: oauth-handlers.test.js tests the negative deployment matrix and original OAuth lifecycle.
Full check/unit and exact-head CI remain required before merge. No schema or live operation.

The universal directive is OPEN. Owner-passphrase setup is not independent customer login.
CAP-1..CAP-5 retain inventory, developer/admin/customer contexts, secure multi-user enrollment,
owned credential lifecycle and real desktop/mobile/provider acceptance. Existing user-selected
budgets/grants, developer no-spend rules and production/release policy stay enforced.
