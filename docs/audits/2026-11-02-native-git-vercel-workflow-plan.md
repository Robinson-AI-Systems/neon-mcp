# Tool-enabled implementation workflow — frozen maintenance acceptance (2026-11-02)

**Work kind:** Owner-requested repository workflow/instructions maintenance; **zero original batch subsections or completion gates are claimed**. Source baseline: `72bc36b0236f0f6849ccf37178a069ade0fd3ab5`. Branch: `ai/gpt6/native-git-vercel-workflow-20261102`.

## Concrete acceptance, frozen before the instruction edits

- [ ] Inventory the *actually exposed* custom GitHub and Vercel MCP tools and call/read enough to distinguish verified behavior from merely advertised capability. Include independent inspection of Neon Vercel project/deploy, and document observed limitations.
- [ ] Make the custom GitHub connector's **native Git workspace + attached Robinson Playground runtime the preferred code/build/test path**, with explicit operations, safety, expected-head/generation, retries, cleanup, and fallback paths; do not demote it to REST-only file editing.
- [ ] Provide fast single-runner work sequence for selected existing Neon roadmap cards: read rules/status/acceptance, freeze plan, code full data/logic/doors/tests, focused checks, **one** complete publication check and independent disposable-Postgres test, safe PR/review/CI/merge, release-dependent real acceptance.
- [ ] Document custom GitHub batch reads, SHA-pinned exact file reads, >12-file-safe atomic multi-file commit, verified remote manifest, 1-shot/attached Playground, safe result handles, CI/reviews/merge tools; never claim a command succeeded from acknowledgement without exit evidence.
- [ ] Document Vercel project's read-only project/deploy/alias/env-*metadata* and diagnostics/release tools, with project-ID fallback where a high-level workflow refuses and explicit checked-source verification. Never auto-deploy, promote, change domains, secrets or production settings.
- [ ] Update existing entry instructions/playbook/REST recovery/status/decision references so agents pick the efficient route without conflicting with AGENTS, SESSION-START, scheduled live release, owner approval, money/data/secret/tenant gates, strict source-vs-READY-vs-provider acceptance or completion accounting.
- [ ] Validate all changed docs in the **actual custom GitHub Playground** if available (`npm run check`), then exact-head required GitHub CI, whole-diff self-review, expected-head merge if permitted and post-merge verification. Record any unavailable verification honestly.

## Observations before work

- GitHub connector full PRODUCTION profile declares `github_git_workspace_open/read/run`, `github_playground_execute/run/read`, `github_content_commit_git_data` (up to 50 files plus expected head/count), `github_batch` (up to ten reads), `github_workflow_pr_status/open_pr/merge_when_green`. This is not a guarantee of workspace capacity; prove and degrade safely.
- Vercel Unleashed full PRODUCTION profile sees the Neon project by exact ID and reads project, deployment and aliases. On this session, `vercel_workflow_project_health` and `vercel_workflow_release_status` returned tool-side `invalid_request` for a validated project ID; their failure must never cause invented release verification. The latest READY deployment read omitted a commit SHA; corroborate via Git and independent runtime checks.
- Repository main and live are different refs and the latest Vercel production deployment is newer than the older dated STATUS checkpoint. No live release or deployment is authorized by this maintenance PR.

## Scope boundaries

Documentation/process only. No application code, schema, server credentials, connected client, provider key, production data, DNS, Vercel settings, promotion, package purchase, fixture or paid service mutation. Existing approved implementation and exact-head release/acceptance gates continue unchanged.
