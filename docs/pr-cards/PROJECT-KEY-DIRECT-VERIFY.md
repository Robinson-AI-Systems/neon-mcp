# Direct selected-project key verification

Owner supplied safe diagnostic: authentication succeeds, organization project
inventory probe returns Neon HTTP 404. The selected-project enrollment path
must not require organization-wide inventory when accepting a restricted key.

Verify `getAuthDetails`, then SDK `getProject` with exactly the owner-supplied
Project ID. Require exact returned ID and organization ID; missing/foreign
identity or provider denial refuses storage. Do not fall back to another key,
broader inventory or owner assumption. Org-kind validation is unchanged.
Preserve encryption-before-provider-call, owner passphrase/origin/lockout,
durable API budget, project-bound AAD/selection and production/write gates.

Proof is access to one selected project, not all visible projects and not proof
that the provider key has no broader access. Record selected_project and mark
projectInventoryComplete false. Do not infer organization administration from
the api_key_org auth method of a project-scoped stored entry.

Acceptance: fake provider allows exact project GET while inventory is 404;
wrong/missing organization, wrong project and direct GET denial refuse storage;
encrypted rechecks and no wider-key fallback. Full checks/unit and exact PR/main
CI before reviewed merge; deploy as continuation of owner-approved setup
recovery. Actual restricted-key enrollment remains pending owner retry.

Reference: https://api-docs.neon.tech/reference/getproject
Resume: validate, publish, verify/merge, release exact correction and have owner
retry the existing Appliance Desk key; never request the secret in chat.
