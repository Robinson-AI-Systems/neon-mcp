# MAP-CLAIMS-1: every count, date and policy claim in the relational map is tied to its source

## Owner request 2026-11-20

The Second Shift run #2 findings (second-shift-20261120-094156) were handed over at Chris's direction: the relational map stated counts, dates, live-state claims and policy rules that nothing re-checked.

## Outcome and acceptance

- `scripts/check-map-counts.mjs` is the same dependency-free file in vercel-mcp, stripe-mcp, google-workspace-mcp, neon-mcp and github-mcp. Its new checks:
  - Counts are checked as number+label pairs (each `counts.json` entry has a `label`), so two counts swapping numbers is caught.
  - A count is still recognised with an identifier between the number and the noun ("253 registered vercel_* tools"). MAP-COUNTS-1 missed exactly this form.
  - Grouped numbers (1,243), approximations ("~", "about") and prefixed forms (-243, 0.243) never pass as the plain statement.
  - New `docs/relational-map/claims.json` ties each dated, live-state or policy claim to a source file and pattern (a STATUS entry, a code constant, a workflow line or a test name). The checker fails if the map no longer states the claim or the source no longer says it.
  - Every date (YYYY-MM-DD) in a map file must sit inside a registered claim. A date with no source fails the check.
- Proof the check bites: putting back a stale count, or adding an untied date, fails with the reason.

## Drift check

Docs and a check only; no tool or behaviour change.

## This repo

- Findings 12 and 13 and the three neon lows:
  - the counts carry labels, and "163 ops" now reads "163 operations", so the vendored-spec count is checked in both files;
  - the 2026-11-04 owner-release rule now names its enforcement (`ownerReleaseInvocation` in `.github/release/promote-live.mjs` and its test) and its record (the owner ruling in `docs/STATUS.md`).
- 8 claims tied: the fleet map rule, the refresh date, the hosted-copy retirement (STATUS 2026-11-08), the 2026-11-18 live re-check, the owner-release rule and its test, and the single merge gate (`ci.yml`).
