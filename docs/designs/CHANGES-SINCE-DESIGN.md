# Changes since design

Dated entries only: contract changes (signatures, tables, guard behavior, defaults) that later cards inherit and that
are not yet in their design. A card consuming an entry says so; batch close-out (DRIFT-PROTOCOL C) retires consumed entries.

(none yet)

2026-10-11 C-1 (#38–#40): `resultScope(connection)` hashes trusted client/org/project/mode/profile, `bufferOversizeResult` caps common MCP outputs at 8KB and persists safe 24-hour `result_store` rows; C-2 should call the existing `dispatchReadOnlyTool` rather than raw handlers. `publicToolMetadata` derives listing annotations. SQL row formatting is private until D-5 public integration.
