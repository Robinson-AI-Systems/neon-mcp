# Deploy Neon MCP — owner checklist

This guide is for the owner. **Writing this guide does not authorize deployment.** On 2026-10-19, the existing Vercel `neon-mcp` project was verified with a READY production deployment sourced from `live` SHA `5589f27de2ebdd7baa55d0139ff0811be22c2dca`. This proves a Vercel deployment, **not** that its own database, owner secrets, source-current MCP calls or provider credentials were independently accepted. Do **not** create another project or overwrite existing credentials. Reconcile actual saved owner inputs **IN-02, IN-03 and IN-04** against deployed configuration before changing anything; the historical setup steps below apply only to genuinely missing infrastructure. Never paste a password, API key, database URL, or encryption key into AI chat, a GitHub issue, a pull request, CI output, or a repository file.

**Current direct-client guide:** [DIRECT-MCP-CONNECTION.md](DIRECT-MCP-CONNECTION.md). The displayed product name is **Neon by Robinson AI Systems** (an unofficial independent service); `/api/mcp`, the OAuth issuer and stored client technical identifiers are unchanged. The optional Hub is neither required for direct access nor a prerequisite for provider-side completion.

## 1. Get permission and stay on free resources

1. Review the existing Vercel project and [go-live checklist](GO-LIVE-CHECKLIST.md); only if genuinely missing, decide whether to authorize **IN-02**: create a separate Neon project/database **for this server only** and a Vercel project called `neon-mcp`. These must be distinct from your applications' databases. Do **not** repurpose Appliance Desk's database.
2. Use only existing/free-tier allowances after verifying actual limits in the Neon and Vercel dashboards. If a paid plan, extra branch, compute, domain, or capacity is required, **stop and ask the owner**; never enable it automatically.
3. Keep the deployed server inaccessible to agents until setup and the approved checks below are complete. A deployment is not permission to operate real Neon projects.

## 2. Prepare the separate database and Vercel project (only after IN-02)

1. In the Neon dashboard, create a **new, separate project** for Neon MCP, using an approved free allowance. Copy its connection string into your password manager. Treat it as a secret.
2. **Only if a separate approved Vercel project is genuinely missing:** import this GitHub repository into a new `neon-mcp` project. The existing production Vercel project must be reused rather than recreated. Set **Node.js 24.x** (matching `package.json`), and use the checked-in build configuration. Do not set a production domain or launch a production deployment without separate approval.
3. Check that Vercel Preview and Production environments are **separately selected** for each variable. Preview runs are forced to **preview mode** by code. Previews may share this server's own storage database, so they are **not** a safe place for live-account experiments.
4. Protect the Vercel project and its deployment access. Do not store variables in `.env` files committed to GitHub, deployment descriptions, or logs.

## 3. Configure the four required Vercel environment variables (IN-03)

Enter these **in Vercel → Project → Settings → Environment Variables**, not into this chat. Use the environment selectors deliberately; do not accidentally expose a secret with a `NEXT_PUBLIC_` prefix.

| Variable | What to enter | Handling |
|---|---|---|
| `DATABASE_URL` | Connection URL for the new, separate Neon MCP database only | Secret; never use an application database |
| `PUBLIC_BASE_URL` | Exact public HTTPS origin for the deployment being tested, for example `https://your-own-deployment.example` | No trailing slash or path; must match the URL used for OAuth and owner setup |
| `ADMIN_PASSPHRASE` | Unique strong passphrase generated/stored in your password manager | Secret; used for setup and connection authorization |
| `TOKEN_ENCRYPTION_KEY` | A freshly generated, random **32-byte base64url** string | Secret; losing or changing it makes existing encrypted keys unreadable |

To generate the encryption key, **on your own computer in a private terminal**, with Node.js installed, run:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copy the resulting value **directly into Vercel's secret variable field and your password manager**. Do not share the output, record it in shell history, screenshot it, or run the command in a CI runner. Generate a different passphrase, also stored privately, for `ADMIN_PASSPHRASE`.

The HTTPS origin in `PUBLIC_BASE_URL` must be correct for **each** environment receiving OAuth connections. Do not point Preview's origin to Production or vice versa. After changing variables, use a fresh authorized deployment; previously built deployments may still use older values.

## 4. Add only approved, narrowly scoped Neon API keys (IN-04, IN-05)

1. Decide with the owner which Neon organization and **scratch or otherwise approved** project can be visible. Start with **project-scoped keys**, not a personal all-access key. Do not add a production project's key just to smoke-test the server.
2. In Neon's dashboard, issue a key scoped only to the approved project. Give it a recognizable purpose-specific name such as `robinson-neon-mcp-scratch` and store it in a password manager.
3. Open `https://<your-approved-deployment-origin>/api/neon/setup` yourself in your browser. The current page accepts project-scoped keys only; **organization-wide key administration is not yet implemented**, so do not try to force an organization key into the project-key form.
4. Fill in the organization ID, organization label, scoped project ID, key, label and owner passphrase. Submit from the **same HTTPS origin** as `PUBLIC_BASE_URL`. The page verifies key reach before encrypted storage.
5. Use **List keys** to confirm a safe label/last-four display, or **Revoke a key** to disable a stored key. Never copy the raw key into a conversation or tool argument. The **View secret once** and **Supply requested secret** forms also require the owner passphrase; treat their output as sensitive.

A project key's reach depends on Neon's actual permissions. Until X-2/X-3 are approved and completed, use only mock tests and owner-authorized read-only checks. **Adding a key never grants permission to modify production.**

## 5. Connector discovery and first checks (preview/read-only only)

1. Check that `/api` responds and `/api/mcp` is the MCP resource. OAuth discovery and authorization are implemented, but a successful response alone does **not** prove the connection is ready for production.
2. In Claude's connector settings, add the HTTPS connector address for the server (`/api/mcp`), using OAuth discovery and its browser authorization flow. Choose the approved organization, scoped project and **preview** mode. A live Neon key must be added through the secure setup page before authorizing a connector.
3. Ask the connector only its currently implemented **read** questions: `neon_whoami` and `neon_list_accounts`. Verify the account and narrow scope. Do not treat planned tools or a documentation example as implemented functionality.
4. Do not attempt SQL writes, project creation, branch changes, production operations or paid provisioning merely to test onboarding. Production permission and the guarded write layer now exist in source but owner activation and real provider acceptance remain separately gated.  Follow [go-live gates](GO-LIVE-CHECKLIST.md) before considering any real-account write.

## 6. If something goes wrong

- **Setup says server not configured / temporarily unavailable:** check Vercel's environment selection and existence of the four variables without displaying their values; check that the dedicated Neon database is reachable.
- **Invalid origin / OAuth login fails:** compare the browser origin, HTTPS address, and `PUBLIC_BASE_URL` character for character. Check browser authorization redirect and the selected deployment environment.
- **Incorrect passphrase / lockout:** use the password manager, then follow the temporary lockout delay. Do not bypass or disable the lockout.
- **Key rejected:** verify in the Neon dashboard that it is a valid **project-scoped** key for the specified organization/project. Never diagnose by printing the key.
- **Encrypted keys inaccessible:** verify the original `TOKEN_ENCRYPTION_KEY` from your password manager. Do not rotate it casually; rotation requires an explicit re-key plan.
- **Unwanted deployment / regression:** disable connector access, roll back Vercel to the last approved deployment, and revoke affected Neon API keys in Neon's dashboard if needed. **Do not drop, reset or restore any database as a rollback shortcut.** If an operation might have reached production, stop and ask the owner before doing anything further.

The deployed project has a READY production revision; whether all required configuration and real-provider acceptance are complete remains **unverified** until independently checked by the owner and acceptance procedure. Completion of this guide closes **documentation card A-7**, not IN-02/IN-03/IN-04 or the go-live checklist.

## Owner-only future write-safety configuration (B-2b)

**Do not do this unless you have separately approved the relevant real setup.** Before the future guarded write tools may operate, the owner must identify **this server's own Neon project**, using only Vercel environment variables (never chat or GitHub): `NEON_MCP_SELF_ORG_ID`, `NEON_MCP_SELF_PROJECT_ID`, and `NEON_MCP_SELF_ENDPOINT_HOST`. Read the project and organization IDs from Neon's dashboard; the endpoint host must exactly equal the hostname in the dedicated `DATABASE_URL` (never copy the password here). If any value is missing or the host differs, the guard refuses writes. The extra values are not required for today's read-only startup.

The owner can use **Protected resources** at `/api/neon/setup` after entering their passphrase. Enter an array of objects such as `[{"kind":"other","org":"org-fake","project_id":"prj-fake","label":"Other private database"}]` using IDs from your private dashboard, never source code. This list is an owner decision (IN-07). The server's own project is added automatically and cannot be removed via the editor. If you are unsure which project belongs to Neon MCP, **do not enable writes**.

## B-2 production approval remains disabled

The implemented `neon_enable_production` control only requests owner approval; it cannot activate access by itself. The passphrase-protected setup page requires the owner to type `ENABLE_PRODUCTION` within 10 minutes of that request. This is **not** permission for agents to activate production: IN-08 keeps activation blocked until the X-2 and X-3 tests and IN-07 protection review pass. Only after your independent approval and those tests may you set the two Vercel Production flags `NEON_MCP_LIVE_GATES_APPROVED=approved-after-X2-X3` and `NEON_MCP_PROTECTED_LIST_CONFIRMED=owner-confirmed`. Leave them unset now. A Preview deployment can never complete the approval. `neon_disable_production` cancels pending approval and turns access off.
