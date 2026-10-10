# ROADMAP — ideas not being built now

Not approved scope. An item moves into a design only with Chris's approval (a dated DECISIONS entry).

- **Hub workflow: wire a database into Vercel without anyone seeing the password.** Robinson's Toolkit (hub) workflow
  that asks this server for a connection string and writes it straight into a Vercel environment variable through the
  Vercel MCP (e.g. a dev branch's URL into a preview's `DATABASE_URL`, or a rotated password into production after
  `neon_workflow_rotate_credentials`). Needs a server-to-server secret handoff in the contract (a new RTC version), so it is
  designed in the hub, not here.
- **Hub workflow: one database branch per Vercel preview** (`hub_dev_environment_up`): a Neon dev branch + a Vercel
  preview with its env wired + cleanup by run. Appliance Desk's own ROADMAP lists per-preview branching as optional.
- **Hand-built tools for storage writes, Function custom domains, trigger writes, Auth users and email provider, scoped
  credentials, VPC endpoints and AI Gateway** when one of them is actually used (signal: repeated `neon_api_write` calls in
  the change log).
- **Neon docs search** (the official connector's `search`/`fetch`/`list_docs_resources`/`get_doc_resource`): belongs to a
  research server (`research-mcp` in the hub's server roadmap).
- **Browser-assisted console steps:** for settings Neon has no API for, an agent with a browser follows
  `neon_where_is_setting`'s structured steps while Chris watches; the server then reads back where possible.
- **A scheduled "Neon health" digest** (usage vs projection, stale branches, unprotected defaults, slow queries) once
  scheduled tasks are in regular use.
- **Port fixes back** to the Stripe MCP or Workspace MCP when a copied file is improved here (e.g. secret requests in
  both directions, the operations waiter pattern).
- **YardSync and other project profiles** when their database code exists (`neon_profile_draft` drafts them).
- ~~Point-in-time row diff as its own tool~~ — promoted to `neon_branch_compare_data` (D-9) by the gap check, 2026-10-10.
- **Migration SQL generated from a branch schema diff** (prior plan name `neon_merge_branch_to_parent`): Neon has no
  branch merge; today the agent writes the SQL and `neon_workflow_safe_migration` applies it. Build a generator only if the
  change log shows agents repeatedly hand-writing diffs.
