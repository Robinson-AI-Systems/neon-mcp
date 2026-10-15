# Execution cards — just in time

Same system as the Stripe MCP and Appliance Desk. The implementing agent writes short cards for the related approved units selected for the current bundle and,
when useful, its immediate successor. Sol 5.6 at light/medium effort is the intended routine use. Avoid writing distant
cards whose prerequisites are hypothetical; `work-index.json` preserves all later scope. A missing card is work, not a
reason to stop. Designs govern behavior; cards cannot silently override them. A card is not an automatic PR or bundle boundary. Keep existing IDs and full acceptance; do not subdivide scope to inflate completion.

## Minimum card (usually 40–100 lines)

Keep one finite consumer/fixture checklist for the selected outcome: actual symbol
and caller, required input/result shape, persistence/provider boundary, role/scope,
full synthetic fixture and refusal/recovery proof. Reuse existing recipes/decisions;
check the real adapter/form control early. This is detail inside the current card,
not another planning document, invented subsection or separate approval ceremony.

- ID, title, design section, prerequisites, "Baseline inspected" SHA.
- Risk/permission boundaries, migration ownership/order (if any), honest workload estimate and bundle subsection IDs. No per-card line ceiling; group related whole cards using the governing bundle/card/PR rule while preserving every independent guard and proving test.
- **Read only these:** a bounded list of design headings and files (with line ranges when long).
- Drift check A table (or "first card: no prior code").
- Build contract: files, exported signatures, which tools (by TOOL-CATALOG name) with their flags, production effect,
  spend estimator, secret handling, key kind, summaries used, Neon operations (method + path + operationId from
  `scripts/openapi-find.mjs`), SQL classes involved.
- Named tests: unit, write-contract per write tool, fake-Neon fixture per Neon call (validated against the vendored
  description), real-Postgres test when SQL is involved, db test when this server's tables change.
- Commands to run (with `set -o pipefail` when piping).
- Done when: observable conditions; what the successor inherits.

Validate coverage with `python3 docs/pr-cards/validate-index.py`.

## Concrete implementation packet

Use [Implementation recipes](../implementation-contracts/IMPLEMENTATION-RECIPES.md#card-packet) for verified seams,
API mappings and fixture setup, and the relevant row in [Remaining work routes](../implementation-contracts/REMAINING-WORK-ROUTES.md).
Include those bounded links in “Read only these”. Add input mappings, ordered slices, expected before/after effects,
refusal/cleanup fixtures and successor exports; label existing versus proposed paths. For the next unit see the
[B-3 worked example](../implementation-contracts/B-3-WORKED-EXAMPLE.md), then write the actual JIT card against current main.
The example is preparation, not approval or completed scope. Keep distant cards JIT; owner-input merge gates still apply.

## Effort guide for Sol 5.6

Light: read tools in an area whose pattern already exists; docs cards. Medium: safety layer, production guard, SQL guard,
spend guard, keys, login, passes, universal tools, developer runs, anything touching SQL or this server's tables. A
Sonnet/Opus second opinion is optional and limited to one concrete question; no mandatory model switch.
