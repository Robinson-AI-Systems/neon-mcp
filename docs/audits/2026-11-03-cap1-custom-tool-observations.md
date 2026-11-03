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
