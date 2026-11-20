# Rules

## Relational map rule

Relational map rule: every feature built or changed refreshes
docs/relational-map/ in the same change; a feature is not landed
until the diagram matches the code.

(Adopted fleet-wide by Chris, 2026-11-18. The map lives in
`docs/relational-map/`, pointed to by `docs/MAP.md`.)

Counts, dates, live-state claims and policy rules the map states are checked against the code by `scripts/check-map-counts.mjs` (MAP-COUNTS-1, MAP-CLAIMS-1), using `docs/relational-map/counts.json` and `docs/relational-map/claims.json`; a count or date with no registered source fails the check.
