# CAP-1 — Neon operation and credential coverage (generated)

Source inventory checked 2026-11-03. This is source accounting, not proof of a live released server.

- Pinned control-plane API: 163 unique operations, version v2.
- Runtime-vendored OpenAPI SHA-256: dacf72ea2d63110b3694c705313e0b2104e9652ae1be3fc01ceebe7b17059c44.
- Commit-pinned official Neon SDK API: 193 unique operations at revision 167229f949438fb942809b72dd410888c70943a9 (full upstream SHA-256 fcc7b2c39f15df03adedf90aa7cde7f1f5e7729ae50b10fd9c7a959f3fb1f82d).
- Compared with runtime-vendored API: 31 SDK-only methods, 1 pinned-only methods, 162 shared signatures; method names were checked for drift.
- SDK source is a dated published contract, not evidence that each method is live or authorized.
- Separately documented advanced product workflows: 15; different protocols, hosts and unpinned wire interfaces are not control-plane parity.
- SDK `@neon/sdk/raw` static coverage: 159 of 194 control-plane operation IDs have a callable export, 4 lack that export but have an explicitly declared fallback, and 31 have no generic client dispatch route in the checked source.
- Export/fallback declarations are source evidence only, NOT verified API requests, credentials, guards, retries or live behavior.
- Exact declared request/response/parameter/auth wire contracts: 163 runtime-vendored and 193 SHA-checked official SDK references; 17 shared method/path contracts differ.
- Declared BearerAuth/CookieAuth/etc are OpenAPI schemes, not permission, key-scope or successful provider execution proof.
- Registered named MCP tools: 131; named-tool counts are not operation coverage.
- Candidate source means a parsed provider-call operation ID appears in a tool module, with file and source line. Only the enclosing named handler is attributed; shared helpers remain unassigned. It is not proof of guarded execution.
- Live operation evidence remains unverified until tied to the exact checked deployed source and client.

| Family | Operations | Verified source | Candidate source | Missing/unverified source | Live verified |
| --- | ---: | ---: | ---: | ---: | ---: |
| advanced/ai_gateway | 1 | 0 | 0 | 1 | 0 |
| advanced/data_api | 3 | 0 | 0 | 3 | 0 |
| advanced/functions | 3 | 0 | 0 | 3 | 0 |
| advanced/managed_auth | 1 | 0 | 0 | 1 | 0 |
| advanced/object_storage | 6 | 0 | 0 | 6 | 0 |
| advanced/sql | 1 | 0 | 0 | 1 | 0 |
| api/AI Gateway | 1 | 0 | 0 | 1 | 0 |
| api/API Key | 3 | 0 | 0 | 3 | 0 |
| api/Auth | 28 | 0 | 0 | 28 | 0 |
| api/Auth (legacy) | 16 | 0 | 0 | 16 | 0 |
| api/Branch | 29 | 0 | 18 | 11 | 0 |
| api/Buckets | 8 | 0 | 0 | 8 | 0 |
| api/Consumption | 3 | 0 | 0 | 3 | 0 |
| api/Credentials | 3 | 0 | 0 | 3 | 0 |
| api/DataAPI | 4 | 0 | 0 | 4 | 0 |
| api/Endpoint | 8 | 0 | 4 | 4 | 0 |
| api/Functions | 5 | 0 | 0 | 5 | 0 |
| api/Operation | 2 | 0 | 2 | 0 | 0 |
| api/Organizations | 19 | 0 | 4 | 15 | 0 |
| api/Project | 21 | 0 | 7 | 14 | 0 |
| api/Region | 1 | 0 | 1 | 0 | 0 |
| api/Snapshot | 7 | 0 | 7 | 0 | 0 |
| api/Storage | 1 | 0 | 0 | 1 | 0 |
| api/Users | 4 | 0 | 1 | 3 | 0 |
| sdk-new/Auth | 9 | 0 | 0 | 9 | 0 |
| sdk-new/Credentials | 2 | 0 | 0 | 2 | 0 |
| sdk-new/Functions | 8 | 0 | 0 | 8 | 0 |
| sdk-new/Logs | 3 | 0 | 0 | 3 | 0 |
| sdk-new/Project | 4 | 0 | 0 | 4 | 0 |
| sdk-new/Realtime | 5 | 0 | 0 | 5 | 0 |

## Shared control-plane wire contract drift (requires engineering review)

The old runtime-vendored API and current official SDK declare different parameters, request/response schema or authentication details for these same method/path operations. This is source drift, NOT a demonstrated live breaking change.

| Method | Path | Operation ID | Runtime wire digest | SDK wire digest |
| --- | --- | --- | --- | --- |
| DELETE | /projects/{project_id}/branches/{branch_id} | deleteProjectBranch | 2832f2b344ba | 263c9d653f08 |
| GET | /projects/{project_id}/auth/email_server | getNeonAuthEmailServer | 2653b2e14bdd | 784732ae977d |
| GET | /projects/{project_id}/branches/{branch_id}/auth/email_provider | getNeonAuthEmailProvider | 59115d130ba8 | efb897b28bb5 |
| GET | /projects/{project_id}/branches/{branch_id}/auth/plugins | getNeonAuthPluginConfigs | 86530e8fa5a9 | 86530e8fa5a9 |
| GET | /projects/{project_id}/branches/{branch_id}/data-api/{database_name} | getProjectBranchDataAPI | 305a7b50eb24 | 305a7b50eb24 |
| PATCH | /projects/{project_id}/auth/email_server | updateNeonAuthEmailServer | 9f410959484a | 5944f7b550cd |
| PATCH | /projects/{project_id}/auth/oauth_providers/{oauth_provider_id} | updateNeonAuthOauthProvider | 06b4de97c3bf | f206883a5793 |
| PATCH | /projects/{project_id}/branches/{branch_id}/auth/email_provider | updateNeonAuthEmailProvider | 62aae195745e | b6167fb9a7fa |
| PATCH | /projects/{project_id}/branches/{branch_id}/auth/oauth_providers/{oauth_provider_id} | updateBranchNeonAuthOauthProvider | 7de9795e8fa1 | b99a09bab04c |
| POST | /projects/{project_id}/auth/oauth_providers | addNeonAuthOauthProvider | 9337fb666b38 | ee53cf83b527 |
| POST | /projects/{project_id}/branches/{branch_id}/auth/oauth_providers | addBranchNeonAuthOauthProvider | 00ba1dcb0c38 | 00ba1dcb0c38 |
| POST | /projects/{project_id}/branches/{branch_id}/auth/send_test_email | sendNeonAuthTestEmail | f9ac3513236e | 73877ff2e516 |
| POST | /projects/{project_id}/branches/{branch_id}/finalize_restore | finalizeRestoreBranch | eccddea99547 | 2fcd67b30d3e |
| POST | /projects/{project_id}/branches/{branch_id}/snapshot | createSnapshot | b4a5ed09d87b | 281ee360038d |
| POST | /projects/{project_id}/snapshots/{snapshot_id}/restore | restoreSnapshot | 78d05a61b793 | a242ca489a4a |
| POST | /projects/{project_id}/transfer_requests | createProjectTransferRequest | e49d09320b44 | 8547809f3e74 |
| PUT | /projects/{project_id}/transfer_requests/{request_id} | acceptProjectTransferRequest | 263ce17494d4 | a4447031b279 |

## Generic Neon SDK client dispatch gaps (independent of MCP handler coverage)

These cataloged operations have neither a callable installed `@neon/sdk/raw` export nor a source-declared fallback. The generic `call()` path rejects such IDs; other independently implemented paths, if any, require separate proof.

| Method | Path | Operation ID | Origin | Handler source state |
| --- | --- | --- | --- | --- |
| DELETE | /organizations/{org_id}/vpc/region/{region_id}/vpc_endpoints/{vpc_endpoint_id} | deleteOrganizationVPCEndpoint | vendored-openapi | missing |
| DELETE | /projects/{project_id}/auth/domains | deleteNeonAuthDomainFromRedirectURIWhitelist | vendored-openapi | missing |
| DELETE | /projects/{project_id}/branches/{branch_id}/data-api/{database_name} | deleteProjectBranchDataAPI | vendored-openapi | missing |
| DELETE | /projects/{project_id}/vpc_endpoints/{vpc_endpoint_id} | deleteProjectVPCEndpoint | vendored-openapi | missing |
| GET | /organizations/{org_id}/vpc/region/{region_id}/vpc_endpoints | listOrganizationVPCEndpoints | vendored-openapi | missing |
| GET | /organizations/{org_id}/vpc/region/{region_id}/vpc_endpoints/{vpc_endpoint_id} | getOrganizationVPCEndpointDetails | vendored-openapi | missing |
| GET | /organizations/{org_id}/vpc/vpc_endpoints | listOrganizationVPCEndpointsAllRegions | vendored-openapi | missing |
| GET | /projects/{project_id}/auth/domains | listNeonAuthRedirectURIWhitelistDomains | vendored-openapi | missing |
| GET | /projects/{project_id}/branches/{branch_id}/data-api/{database_name} | getProjectBranchDataAPI | vendored-openapi | missing |
| GET | /projects/{project_id}/connection_uri | getConnectionURI | vendored-openapi | missing |
| GET | /projects/{project_id}/vpc_endpoints | listProjectVPCEndpoints | vendored-openapi | missing |
| PATCH | /projects/{project_id}/branches/{branch_id}/data-api/{database_name} | updateProjectBranchDataAPI | vendored-openapi | missing |
| POST | /organizations/{org_id}/vpc/region/{region_id}/vpc_endpoints/{vpc_endpoint_id} | assignOrganizationVPCEndpoint | vendored-openapi | missing |
| POST | /projects/{project_id}/auth/domains | addNeonAuthDomainToRedirectURIWhitelist | vendored-openapi | missing |
| POST | /projects/{project_id}/branches/{branch_id}/data-api/{database_name} | createProjectBranchDataAPI | vendored-openapi | missing |
| POST | /projects/{project_id}/vpc_endpoints/{vpc_endpoint_id} | assignProjectVPCEndpoint | vendored-openapi | missing |
| POST | /projects/auth/keys | createNeonAuthProviderSDKKeys | vendored-openapi | missing |
| DELETE | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients/{client_id} | deleteNeonAuthOAuthClient | official-sdk-reference | missing |
| DELETE | /projects/{project_id}/branches/{branch_id}/realtime | disableProjectBranchRealtime | official-sdk-reference | missing |
| GET | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients | listNeonAuthOAuthClients | official-sdk-reference | missing |
| GET | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients/{client_id} | getNeonAuthOAuthClient | official-sdk-reference | missing |
| GET | /projects/{project_id}/branches/{branch_id}/auth/plugins/oauth-provider | getNeonAuthOAuthProviderPlugin | official-sdk-reference | missing |
| GET | /projects/{project_id}/branches/{branch_id}/realtime | getProjectBranchRealtime | official-sdk-reference | missing |
| GET | /projects/{project_id}/branches/{branch_id}/realtime/secret | getProjectBranchRealtimeSecret | official-sdk-reference | missing |
| GET | /projects/count | countProjects | official-sdk-reference | missing |
| PATCH | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients/{client_id} | updateNeonAuthOAuthClient | official-sdk-reference | missing |
| PATCH | /projects/{project_id}/branches/{branch_id}/auth/plugins/oauth-provider | updateNeonAuthOAuthProviderPlugin | official-sdk-reference | missing |
| POST | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients | createNeonAuthOAuthClient | official-sdk-reference | missing |
| POST | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients/{client_id}/rotate_secret | rotateNeonAuthOAuthClientSecret | official-sdk-reference | missing |
| POST | /projects/{project_id}/branches/{branch_id}/realtime | enableProjectBranchRealtime | official-sdk-reference | missing |
| POST | /projects/{project_id}/branches/{branch_id}/realtime/rotate_secret | rotateProjectBranchRealtimeSecret | official-sdk-reference | missing |

## Official SDK-only control-plane operations (explicit gaps)

These methods appear in the dated official SDK OpenAPI but not in the runtime-vendored schema.
No SDK-only method is reported as executable, provider-authorized or released without separate evidence.

| Method | Path | Operation ID | Existing-card route | Source state |
| --- | --- | --- | --- | --- |
| DELETE | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients/{client_id} | deleteNeonAuthOAuthClient | E-1 | missing |
| DELETE | /projects/{project_id}/branches/{branch_id}/custom-domains/{domain} | deleteProjectBranchCustomDomain | E-2 | missing |
| DELETE | /projects/{project_id}/branches/{branch_id}/realtime | disableProjectBranchRealtime | CAP-4 | missing |
| DELETE | /projects/{project_id}/branches/{branch_id}/triggers/{trigger_id} | deleteProjectBranchTrigger | E-2 | missing |
| DELETE | /projects/{project_id}/members/{member_id}/role | removeProjectMemberRole | O-1 | missing |
| GET | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients | listNeonAuthOAuthClients | E-1 | missing |
| GET | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients/{client_id} | getNeonAuthOAuthClient | E-1 | missing |
| GET | /projects/{project_id}/branches/{branch_id}/auth/plugins/oauth-provider | getNeonAuthOAuthProviderPlugin | E-1 | missing |
| GET | /projects/{project_id}/branches/{branch_id}/custom-domains | listProjectBranchCustomDomains | E-2 | missing |
| GET | /projects/{project_id}/branches/{branch_id}/logs/fields | listProjectBranchLogFields | O-4 | missing |
| GET | /projects/{project_id}/branches/{branch_id}/logs/fields/{field_name}/values | listProjectBranchLogFieldValues | O-4 | missing |
| GET | /projects/{project_id}/branches/{branch_id}/realtime | getProjectBranchRealtime | CAP-4 | missing |
| GET | /projects/{project_id}/branches/{branch_id}/realtime/secret | getProjectBranchRealtimeSecret | CAP-4 | missing |
| GET | /projects/{project_id}/branches/{branch_id}/triggers | listProjectBranchTriggers | E-2 | missing |
| GET | /projects/{project_id}/branches/{branch_id}/triggers/{trigger_id} | getProjectBranchTrigger | E-2 | missing |
| GET | /projects/{project_id}/members | listProjectMembers | O-1 | missing |
| GET | /projects/count | countProjects | D-1 | missing |
| PATCH | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients/{client_id} | updateNeonAuthOAuthClient | E-1 | missing |
| PATCH | /projects/{project_id}/branches/{branch_id}/auth/plugins/oauth-provider | updateNeonAuthOAuthProviderPlugin | E-1 | missing |
| PATCH | /projects/{project_id}/branches/{branch_id}/triggers/{trigger_id} | updateProjectBranchTrigger | E-2 | missing |
| POST | /projects/{project_id}/branches/{branch_id}/auth/email_provider/test | sendNeonAuthEmailProviderTest | E-1 | missing |
| POST | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients | createNeonAuthOAuthClient | E-1 | missing |
| POST | /projects/{project_id}/branches/{branch_id}/auth/oauth-provider/clients/{client_id}/rotate_secret | rotateNeonAuthOAuthClientSecret | E-1 | missing |
| POST | /projects/{project_id}/branches/{branch_id}/credentials/{token_id}/reveal | revealCredential | CAP-3 | missing |
| POST | /projects/{project_id}/branches/{branch_id}/credentials/{token_id}/rotate | rotateCredential | CAP-3 | missing |
| POST | /projects/{project_id}/branches/{branch_id}/custom-domains | registerProjectBranchCustomDomain | E-2 | missing |
| POST | /projects/{project_id}/branches/{branch_id}/logs/query | queryProjectBranchLogs | O-4 | missing |
| POST | /projects/{project_id}/branches/{branch_id}/realtime | enableProjectBranchRealtime | CAP-4 | missing |
| POST | /projects/{project_id}/branches/{branch_id}/realtime/rotate_secret | rotateProjectBranchRealtimeSecret | CAP-4 | missing |
| POST | /projects/{project_id}/branches/{branch_id}/triggers | createProjectBranchTrigger | E-2 | missing |
| PUT | /projects/{project_id}/members/{member_id}/role | setProjectMemberRole | O-1 | missing |

## Pinned-only methods requiring provider reconciliation

Absence from the official SDK snapshot does NOT by itself establish a retired live API.

| Method | Path | Operation ID | Source state |
| --- | --- | --- | --- |
| POST | /projects/{project_id}/branches/{branch_id}/recover | recoverProjectBranch | missing |

## Other-host product workflow uncertainties

| Product workflow | Protocol / method | Host or target | Authority state |
| --- | --- | --- | --- |
| ai-gateway:invoke | https / POST | branch-ai-gateway-host | ai_gateway:invoke (unverified runtime) |
| auth:manage-users | cli / CLI | branch-auth-service | unknown (unverified runtime) |
| data-api:configure | https / POST | https://console.neon.tech/api/v2 | unknown (unverified runtime) |
| data-api:read-config | https / GET | https://console.neon.tech/api/v2 | unknown (unverified runtime) |
| data-api:rls-query | https / REST | branch-data-api-host | unknown (unverified runtime) |
| functions:deploy | cli / CLI | neon-functions-control-plane | unknown (unverified runtime) |
| functions:invoke | https / HTTP | branch-function-host | unknown (unverified runtime) |
| functions:trigger | workflow / WORKFLOW | neon-functions-control-plane | unknown (unverified runtime) |
| object-storage:delete | s3 / DeleteObject | branch-storage-host | storage:write (unverified runtime) |
| object-storage:get | s3 / GetObject | branch-storage-host | storage:read (unverified runtime) |
| object-storage:list | s3 / ListObjectsV2 | branch-storage-host | storage:read (unverified runtime) |
| object-storage:multipart | s3 / MultipartUpload | branch-storage-host | storage:write (unverified runtime) |
| object-storage:presign | s3 / PresignedURL | branch-storage-host | unknown (unverified runtime) |
| object-storage:put | s3 / PutObject | branch-storage-host | storage:write (unverified runtime) |
| sql:query | postgres / SQL | branch-postgres-host | role-and-grants (unverified runtime) |

## Explicit exclusions and required follow-up

- Runtime OpenAPI remains the pinned July 2026 contract; the official SDK snapshot is read-only comparison, not re-vendored runtime source or a live API probe.
- The SDK-reference-only family rows lack verified handlers/credentials/provider reads; do not treat SDK exposure as MCP feature availability.
- Advanced Functions, Object Storage, Data API, Auth, SQL and AI Gateway methods come from official product docs, not pinned wire specs. Unsupported or unverified method/host/permission fields remain labeled unknown.
- API keys, SQL role credentials and product-scoped tokens are different credential types; never substitute one for another.
- HTTP method effect labels are conservative, not measured prices, authorization or permission to execute.
- Source call sites are parsed, not executed. Unattributed shared helper references and missing behavioral test cases cannot be counted as handler implementation.
- Original owner routing is derived from documented path/family and remains provisional; each existing card and tested handler requires direct reconciliation.
- No fabricated percentage or live parity is computed while authorization routing, guards, readback and client/provider acceptance are unproven.
