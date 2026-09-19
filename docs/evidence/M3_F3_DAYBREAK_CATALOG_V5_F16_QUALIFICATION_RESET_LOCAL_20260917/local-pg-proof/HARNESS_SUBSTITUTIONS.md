# F16 local PG harness substitutions (not wipe/auth bypass)

1. **PostgreSQL 17.11 installed locally** for the committed helper (fixture requires ^17). Cluster 17/main on unix socket `/var/run/postgresql` port 5432, role `ubuntu`.
2. **storage.buckets stub inside the committed helper** on each fresh `f3_*` task DB. Bare local PG lacks Storage API catalog; inventory capture SQL still plans `storage.buckets`. Stub is empty, not a wipe/auth bypass, and not an expanded deletion target.
3. No Daybreak/Astra/disposable/production contact.

## Not substituted
- Shared `runQualificationReset` + `createLocalFixtureQualificationResetTransportAdapter` + real process-result parser
- Wipe still rejected via `evaluateWipeToBaselineArg` → `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`
- Observation markers T1–T7 are records inside one SERIALIZABLE TX, not separate executed transactions
