# Phase 2 proposed implementation file list

**NOT APPLIED. Awaiting independent QA accept. Mutation entrypoint stays closed in Phase 1.**

| # | Path | Purpose | Phase 1 status |
|---|------|---------|----------------|
| 1 | `scripts/lib/f3-db-push-qualification-reset.mjs` | Runtime planner: `planQualificationReset` / `buildQualificationResetSql` from the finite allowlist; `RESTRICT` only; exact history predicates; refuse extras/production/wipe | **New in Phase 2.** Phase 1 design module is the contract it must import or mirror |
| 2 | `scripts/lib/f3-db-push-qualification-reset-design.mjs` | Keep as the fail-closed allowlist/history/auth validators; runtime planner must call these before emit | Exists now (Phase 1). Do not weaken |
| 3 | `scripts/lib/f3-db-push-inventory.mjs` | Optional exact-identity eligibility verdict when observed leftovers ⊆ allowlist. **Do not** add a `financial_*` prefix match | Unchanged in Phase 1 |
| 4 | `scripts/qualify-f3-db-push-disposable.mjs` | Wire `--qualification-reset` + `--founder-authorization-artifact`. Keep `--wipe-to-baseline` rejected. Do not execute without T0–T7 + artifact | Unchanged in Phase 1 (not wired) |
| 5 | `scripts/test-f3-db-push-harness.mjs` | Add cases only after wiring: extras HOLD; wipe still rejected; production refuse; name mismatch aborts; CASCADE refused | Unchanged in Phase 1 |
| 6 | `scripts/test-f3-qualification-reset-design.mjs` | Keep Phase 1 offline suite green | Exists now |

No new signing service. No general-purpose reset framework. No `--wipe-to-baseline` enable/bypass.
