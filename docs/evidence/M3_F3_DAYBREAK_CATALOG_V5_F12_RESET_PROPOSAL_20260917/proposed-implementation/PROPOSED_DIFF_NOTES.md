# PROPOSED IMPLEMENTATION NOTES — NOT APPLIED — NOT AUTHORIZED

Frozen F12 functional tip `1ec0e4da782ed7715a543be23f79bc0f10a28af2` remains unchanged. Documentation only.

## Why implementation is required for a supported path

Tip wipe/`classifyInventory` HOLDs on `financial_*` or `schema_migrations_rows>0` and `buildWipeSql` refuses `DROP SCHEMA`. Clearing F3 qualify residue + PREASSIGNED history cannot be done by any supported command on `1ec0e4da782ed7715a543be23f79bc0f10a28af2`.

## Proposed files (minimal)

1. **Preferred:** add `scripts/lib/f3-db-push-qualification-reset.mjs` — separate from wipe — `planQualificationReset` / `buildQualificationResetSql` with hard allowlist (F8/F9 objects + PREASSIGNED predicates); refuse production; refuse extras.
2. Optionally add non-wipe verdict `QUALIFICATION_RESET_ELIGIBLE` in inventory when ambiguous ⊆ allowlist.
3. Wire qualify with explicit founder-gated flag distinct from `--wipe-to-baseline` (stays `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`).
4. Harness cases: allowlist-only eligible; extras HOLD; wipe flag rejected; production refuse; CLEAN_BASELINE short-circuit; no DELETE outside PREASSIGNED.

## DO NOT APPLY

Runtime remains frozen at `1ec0e4da782ed7715a543be23f79bc0f10a28af2`.
