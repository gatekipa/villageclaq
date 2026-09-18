# Harness substitutions (not runtime bypasses)

1. Tip `scripts/prove-f3-qualification-reset-local.mjs` uses fixtures/disposable-postgres unix socket peer-as-ubuntu → **MUST_LOCAL** in this VM (peer auth fails for user ubuntu). Offline checks + harness scenarios still PASS (12/12, overallOk).
2. Expanded proof uses docker `f3-reference-pg176` TCP + real psql against fresh task DB `f3_f14_qual_reset_local_20260917`, calling tip plan/run/eligibility/closures APIs and shared orchestration.
3. Empty `storage.buckets` stub created so capture SQL can plan (PostgreSQL plans both CASE arms). Not a wipe/auth bypass.
4. Disabled transport used only for before-mutation failure and uncertain-commit/replay-suppression cases; success leftover + unexpected/history rollbacks used real psql execute path.
