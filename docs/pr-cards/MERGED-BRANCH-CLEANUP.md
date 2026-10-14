# Repository-scoped automatic merged branch cleanup

Owner reported agents deferring work-branch cleanup because their custom GitHub
Cloud account is scratch-only. #132 independently cleaned the existing backlog.
This permanent workflow uses Neon MCP repository Actions authority; it does not
widen custom-service credentials or infer service acceptance from infrastructure.

Adapt the already deployed GitHub MCP cleanup helper with exact Neon repository
pinning, short-lived Actions token, SHA-pinned actions, complete open-PR reads,
trusted-main checkout, exact merged-head namespace, ancestry proof and a deletion
lease. Never delete main/live/archive, open-PR refs or unpublished commits.
No dependency install or secret access on the privileged cleanup runner.

Validation: namespace/SHA/exact-head tests and wrong-repository/API denial tests;
required check/unit/db/ci and release-policy; verify actual merged cleanup run.
Owner approval IN-16 is recorded concurrently without claiming D-4 implemented.

Push-to-main recovery: scan all ai/* refs on trusted main pushes as well as the
exact merged head on closed PRs. This catches the first installation and missed
merge events without requiring a manual dispatch or wider connector grant. Both
paths retain complete open-head/base protection, exact ancestry and deletion lease.
