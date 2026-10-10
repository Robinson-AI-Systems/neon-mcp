# Design — Batch C: Cheap on context (small results, compact listing, budgets)

Status: **DRAFT — awaiting Chris's approval (IN-00)**. Written 2026-10-10. Scope and acceptance: `docs/PLAN.md` →
Batch C. Cards C-1, C-2. Depends on Batch B. Every later tool is built to these rules, so this batch comes before any
area tools. Same design as the Stripe MCP's Batch C (copied from its `src/core/` when available, A2).

Why: a 177-tool server listed the ordinary way costs tens of thousands of tokens before an agent does anything, and
Neon's full objects (projects with settings, branches with every counter, SQL result sets) cost thousands more per
result. Current practice (October 2026): tool search in the client, progressive disclosure (search → describe → call),
small results with handles, MCP tool annotations, workflows. Sources: Anthropic, "Code execution with MCP"
(anthropic.com/engineering/code-execution-with-mcp); the Stripe MCP's Batch C.

## 0. Verify before starting

| # | Assumption | How to check |
|---|---|---|
| C1 | The MCP SDK version in `package.json` supports tool `annotations`, `outputSchema` and `structuredContent` | `grep -rn "outputSchema\|annotations" node_modules/@modelcontextprotocol/sdk/dist/esm/types.d.ts \| head` |
| C2 | Each tool module exports registry metadata (`area`, `profiles`, `writes`, `audience`, `productionEffect`) from Batch B | `grep -n "writes:" src/tools/*.js \| head` |

## 1. Decisions

**C1. Two listing modes per connection.** `catalog` (default for claude.ai, whose client does tool search): every tool
in the profile, listing description ≤160 characters starting with the action (`PRODUCTION:` first for tools whose usual
target is production, e.g. `snapshot_finalize_restore`); longer guidance lives in property descriptions and
`neon_describe_tool`. `compact` (default for every other client): the meta-tools, `neon_whoami`, `api_search` (once
Batch U exists) and the read-only `workflow_*` tools — about 20 tools, under 5,000 tokens, reaching everything.

**C2. Meta-tools.** `neon_search_tools(query, area?, audience?, limit=10)` → names, one-line descriptions, flags;
`neon_describe_tool(name)` → full schema and guidance; `neon_call(name, args)` → dispatches into the **wrapped** handler,
so every guard applies; `neon_batch(calls[≤10])` → reads only, combined result; `neon_get_result(handle, page?,
fields?)`.

**C3. Small results by default.** Every read tool gets `detail: 'summary' | 'full'` (default summary) and `fields`
(comma list of dotted paths) from a registry layer, not by hand. One summary mapper per Neon object type in
`src/tools/summaries.js` (6–12 fields a person reads; e.g. branch: id, name, default, protected, production, parent name,
size_display, compute state, expires_local, last_reset_local, created_local). SQL results: column names once, rows as
arrays, row cap from settings (default 200), long text cells cut at 500 characters with a note. Lists return one page
(default 20, max 100) with `next` explained in words.

**C4. Size cap and handles.** A result over 8 KB returns the first part, a count, a one-line summary ("1,240 rows from
invoices, 3 columns") and a handle `res_…`; the full result is kept 24 hours in `result_store`, readable only by the same
connection or pass. SQL handles hold at most `sql.row_cap_with_handle` rows (default 5,000).

**C5. Annotations and structured output.** Every tool sets `readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint` from its metadata. Workflow tools declare `outputSchema` and return `structuredContent` plus a short
plain-English text line.

**C6. Budgets are tests.** `scripts/check-budgets.mjs` (in `npm run check`) fails when: compact listing ≥5,000 tokens;
`everyday` catalog listing ≥20,000; any listing description >160 characters; any schema ≥1,500 tokens; any read tool's
default response on 100-item fixtures >8 KB without a handle; the registry's per-profile counts differ from
TOOL-CATALOG's "Totals". Token counts use a standard tokenizer package (pinned) and are printed in CI.

## 2. Schema

```sql
CREATE TABLE IF NOT EXISTS result_store (handle TEXT PRIMARY KEY, connection TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), expires_at TIMESTAMPTZ NOT NULL, summary TEXT, body JSONB NOT NULL);
CREATE INDEX IF NOT EXISTS result_store_expires ON result_store (expires_at);
```

Expired rows are deleted by the same request path (cheap `DELETE … WHERE expires_at < now()` limited to 100 rows), no
cron. The scrubber (B-6) runs **before** a result is stored, so a handle never holds a secret.

## 4. Work units

### C-1 — Summaries, fields, detail, handles, annotations (M)
Files: `src/tools/summaries.js`, `src/core/result-rules.js` (registry layer), `src/db.js`, `src/tools/server.js`
(`neon_get_result`). Tests: field projection and unknown-path note; handle isolation between connections; annotation
consistency; size cap on fixtures; SQL row cap and cell cut; a stored handle contains no secret (key-scan test).

### C-2 — Listing modes, meta-tools, budgets (M) — may group with C-1
Files: `src/core/meta.js`, `api/mcp.js` (listing per connection, `?listing=` override), `scripts/check-budgets.mjs`.
Tests: `neon_call` passes the write-contract helper (door #2); refuses tools outside the profile or the project scope;
`neon_batch` refuses writes; budget script fails on a planted 161-character description (prove once); search filters by
`audience`.

## 5. Stop-and-ask points

1. The SDK lacks annotations or structured output (C1 false): build the rest; record the gap; amend.

## 6. Acceptance mapping

| PLAN Batch C line | Evidence |
|---|---|
| Compact <5k, everyday catalog <20k tokens | CI budget output |
| Every door enforces the same guards | write-contract through `neon_call` |
| Handles isolated and secret-free | `tests/db/result-store.test.js` |

## Amendments
