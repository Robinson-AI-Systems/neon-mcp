# MAP-COUNTS-1: the relational map's numbers are checked against the code

## Owner request 2026-11-18

Chris: "Yes" to dealing with the Second Shift 48-hour run's relational-map findings (here: findings 11, 12 and 21 on PR #226).

## Outcome and acceptance

- `scripts/check-map-counts.mjs` (the same dependency-free file across the fleet repos) reads `docs/relational-map/counts.json`, computes each stated count from the code at this commit, and fails if a value differs, a listed map file does not state it, or the map states a "<n> tools/modules/ops/operations…" count (or a "~" approximation) the file does not list. It runs in `npm run check`.
- Checked counts: 139 registered tools, 77 tool modules, 163 vendored API operations (regex count of `operationId:` in the vendored spec). All correct today.
- The "hosted copy retired 2026-11-08" line cites its `docs/STATUS.md` record and a 2026-11-18 live re-check (rack route table; no neon-mcp project in the Vercel team).

## Drift check

Docs and a check only; no tool or behaviour change.
