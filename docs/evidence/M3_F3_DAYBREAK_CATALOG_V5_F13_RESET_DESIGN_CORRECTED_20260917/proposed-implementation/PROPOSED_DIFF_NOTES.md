# Phase 2 proposed diffs — NOT APPLIED

Frozen F12 functional tip `1ec0e4da782ed7715a543be23f79bc0f10a28af2` is the accepted functional baseline and is not relabeled. Phase 1 adds design validators only.

## Minimal notes (after QA accept)

1. Add `scripts/lib/f3-db-push-qualification-reset.mjs` that **imports** `f3-db-push-qualification-reset-design.mjs` and emits SERIALIZABLE SQL:
   - T0–T7 comments as executable statements
   - `DROP … RESTRICT` in `dropOrder`
   - `DELETE FROM supabase_migrations.schema_migrations WHERE version = $v AND name = $n RETURNING version, name`
   - `GET DIAGNOSTICS` / row-count asserts
   - final `SELECT` probes that allowlisted `to_reg*` identities are null
   - refuse to emit `CASCADE`, `name IS NULL`, or `financial_*` loops
2. Qualify argv: parse `--qualification-reset` and `--founder-authorization-artifact`. Call `validateFounderAuthorizationBinding`. If wipe flag present, keep `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`.
3. Inventory: eligibility only when every extra identity is in `FINITE_OBJECT_ALLOWLIST` and every history row matches `AUTHENTICATED_HISTORY_KEYS`. Prefix match remains HOLD.
4. Transport: existing gated `psql -X -v ON_ERROR_STOP=1 -f` only. Not Management API. Not wipe library `DROP SCHEMA`.
5. Uncertain commit: map session-loss during COMMIT to `UNCERTAIN_COMMIT`; do not replay.

## Explicitly not in Phase 2 scope unless re-authorized

- New project or broadened disposable
- Signing service / cloud authorization bus
- `--wipe-to-baseline` enable
- Automatic second reset
