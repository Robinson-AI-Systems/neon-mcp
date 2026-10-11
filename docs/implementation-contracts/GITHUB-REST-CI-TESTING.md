# GitHub REST fallback for testing in shell-limited workspaces

**Applies when** an AI session can read/edit GitHub but has no usable local shell, no project checkout, or cannot install/run Node or disposable PostgreSQL. The GitHub **REST API is the transport** for branch/PR/CI inspection; it does **not** execute tests locally. GitHub Actions runs the repository's existing tests remotely. Never describe REST-fetched CI evidence as a local test run.

## Choose the available path

1. **Shell and checkout available:** follow `docs/PLAYBOOK.md` Steps 4–5: `npm ci`, focused `npx vitest run ...`, `npm run check`, and `npm run test:db -- ...` for SQL/storage. Only disposable **local** PostgreSQL is permitted; never run these against a real Neon account.
2. **Shell unavailable but GitHub REST access available:** edit on a fresh `ai/*` branch, create a **draft** PR, and use the existing PR CI run as the test runner. GitHub's `check`, `unit`, `db` and aggregate `ci` jobs are required; GitHub REST is how their results and logs are retrieved. Record explicitly in the PR: "Local tests unavailable (no shell); validation by GitHub Actions CI." This is not a reason to omit tests or waive review.
3. **Neither shell nor authenticated REST access works:** do not claim validation or merge. Record the blocker and exact head/next action; no real Neon fallback, secrets, unapproved paid runner, or production change.

## REST workflow (shell's `gh api` wrapper, or equivalent authenticated GitHub connector)

Set `R=Robinson-AI-Systems/neon-mcp`. For tools accepting an owner/repo argument, use exactly this repository. REST API paths shown here use GitHub's documented `repos/{owner}/{repo}/...` endpoints; the connector may expose the same operations under different names. An authenticated connector can call them directly even when `gh` or a checkout is unavailable.

1. Verify `GET /repos/$R/branches/main`, `GET /repos/$R/pulls?state=open` and any existing PR/CI before starting. Create an `ai/*` branch from the **verified** main SHA. Use the GitHub contents/commits REST APIs or connector's file operations to commit changed source and tests together; never write directly to `main`.
2. Create a draft PR (`POST /repos/$R/pulls` with `draft: true`). CI is triggered by its PR event. Do not invent local results. Avoid pushing a second edit while the first run is active; collect all failing jobs before a single fix batch.
3. Read `GET /repos/$R/pulls/{number}` for the **exact current head SHA**, then `GET /repos/$R/commits/{head_sha}/check-runs?per_page=100`. The aggregate check named **`ci`** must be `completed/success` *at that head*, with required `check`, `unit` and `db` successful. A pending check is not success. Check-run names in this repo include descriptive suffixes; match their logical jobs.
4. For a failure, get the associated Actions job ID from the check run, then `GET /repos/$R/actions/jobs/{job_id}/logs` (or look up the run's jobs with `GET /repos/$R/actions/runs/{run_id}/jobs`). Review the failing test/lint output and check-run annotations; update source **and** tests/docs as needed, then wait for a fresh CI cycle on the new head. The logs endpoint redirects to a temporary downloadable URL; use a GitHub client that follows redirects. Never paste sensitive log content into PR text.
5. When all gates pass, review `GET /repos/$R/pulls/{number}/reviews` and `GET /repos/$R/pulls/{number}/comments` (plus review threads via the connector if available), self-review the whole diff, mark ready, and merge using `PUT /repos/$R/pulls/{number}/merge` with the **expected exact head SHA** and `merge_method: merge`. Recheck `main` and its push-to-main check. No GraphQL dependency or `gh pr` command is required.

If a shell exists but `gh pr` fails because GraphQL access is blocked, `gh api` calls to these REST endpoints are the preferred workaround. For example:

```bash
R=Robinson-AI-Systems/neon-mcp
SHA=$(gh api "repos/$R/pulls/31" --jq '.head.sha') # replace 31 with the actual PR number
gh api "repos/$R/commits/$SHA/check-runs?per_page=100" \
  --jq '.check_runs[] | [.name, .status, (.conclusion // "-"), .html_url] | @tsv'
gh api "repos/$R/actions/runs/<actual-run-id>/jobs?per_page=100" \
  --jq '.jobs[] | [.id, .name, .status, (.conclusion // "-")] | @tsv'
# Investigate a failing job only; job IDs come from the query above.
gh api "repos/$R/actions/jobs/<actual-job-id>/logs" > /tmp/neon-ci-job.log
```

Do not put example PR/job identifiers into scripts as defaults; resolve them from the actual repository state. Avoid rapid polling; follow `docs/PLAYBOOK.md` Step 10's bounded waiting policy.

## Evidence and safety checklist

- **PR description:** focused tests required, whether they ran locally or only in CI, head SHA, run URL, each gate's conclusion, number of red/cancelled cycles, self-review, and any unresolved limitations.
- **Security:** GitHub tokens remain inside authenticated tooling, never in code, logs, examples or committed files. CI must use fake Neon and disposable Postgres; never inject personal/production Neon credentials. REST access does not grant permission to deploy, buy resources, modify owner settings or override protected resources.
- **No shortcut:** a successful GitHub API request or passing lint-only check is *not* test evidence. A red/cancelled aggregate `ci` cannot be merged. CI success does not substitute for an unperformed live scratch-account check owned by Batch X.

Related: `docs/SESSION-START.md` (no-shell work cadence), `docs/PLAYBOOK.md` (merge and review process), `docs/implementation-contracts/IMPLEMENTATION-RECIPES.md` (focused test commands), and `AGENTS.md` (hard limits).
