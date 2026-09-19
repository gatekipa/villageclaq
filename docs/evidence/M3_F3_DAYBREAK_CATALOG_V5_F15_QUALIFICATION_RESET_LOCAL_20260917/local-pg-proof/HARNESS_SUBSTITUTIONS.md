# F15 framing follow-up local PG harness substitutions (not wipe/auth bypass)

1. **OS user for peer auth:** committed helper `createDisposableDatabase` uses unix-socket `[REDACTED_DSN]`. Box user is `box` (peer fails). Proof ran as `sudo -u ubuntu` so peer auth succeeds against local PostgreSQL 17.11 on `/var/run/postgresql`.
2. **storage.buckets stub on template1:** bare local PG lacks `storage.buckets`; inventory capture SQL plans that relation. Empty `storage.buckets` on `template1` so fresh `f3_*` task DBs inherit it. Not a wipe/auth bypass.
3. **git safe.directory for ubuntu:** offline plan validate calls `git rev-parse HEAD`; ubuntu needed `safe.directory`.

## Not substituted
- Committed helper path bytes at tip `49a91169…`
- Shared `runQualificationReset` + `createLocalFixtureQualificationResetTransportAdapter` + real process-result parser
- Wipe still rejected via `evaluateWipeToBaselineArg`
- No disposable / production / Daybreak / Astra contact
- Docker `f3-reference-pg176` remained available; committed helper binds local socket PG (fixture contract), not 55432

## Framing HOLD closed
PERFORM-in-DO + whitespace-only skip. Success TX reaches verifiable commit / CLEAN_BASELINE. Rollbacks still PASS.
