# F15 local PG harness substitutions (not wipe/auth bypass)

1. **OS user for peer auth:** committed helper `createDisposableDatabase` uses unix-socket `[REDACTED_DSN]`. Box user is `box` (peer fails). Proof ran as `sudo -u ubuntu` so peer auth succeeds against local PostgreSQL 17.11 on `/var/run/postgresql`.
2. **storage.buckets stub on template1:** bare local PG lacks `storage.buckets`; inventory capture SQL plans that relation. Created empty `storage.buckets` on `template1` so fresh `f3_*` task DBs inherit it (same class as F14 expanded proof stub). Not a wipe/auth bypass.
3. **git safe.directory for ubuntu:** `buildProposedQualificationResetHostedPlan` calls `git rev-parse HEAD`; ubuntu needed `safe.directory` to read tip SHA for offline plan check.

## Not substituted
- Committed helper path: `scripts/prove-f3-qualification-reset-local.mjs` (unchanged tip bytes)
- Shared `runQualificationReset` + `createLocalFixtureQualificationResetTransportAdapter` + real process-result parser
- Wipe still rejected via `evaluateWipeToBaselineArg`
- No disposable / production / Daybreak / Astra contact
- Docker `f3-reference-pg176` remained available; committed helper binds local socket PG (fixture contract), not 55432

## Exact HOLD — TX_SUCCESSFUL_RESET observation framing
Under `-At`, `SELECT pg_advisory_xact_lock(k1,k2);` (void) emits a leading blank line before the first F15 observation JSON. `parseQualificationResetTxObservationStdout` rejects blank lines (`F13_TX_OBSERVATION_FRAMING`), so interpreter returns `F13_RESET_NOT_COMMITTED` despite:
- status 0
- full T1…T7 JSON including `committed:true` after the blank
- physical effects: `financial_accounts` dropped; history count 0

Rollback TX scenarios still PASS (SQL failure path). Pre-plan unexpected-object block PASS.
