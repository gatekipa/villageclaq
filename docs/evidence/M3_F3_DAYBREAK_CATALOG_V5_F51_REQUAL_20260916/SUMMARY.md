# M3_F3_DAYBREAK_CATALOG_V5_F51_REQUAL_20260916

## Verdict: PASS (exact F5.1 hosted requal — stub/live-pin floor)

### Scope
- Hosted candidate: exact F5.1 `55995cf0ab5f89dd0b59775eb99a7f63a5e0d5b1` (parent F5 `228549412cf3b7a3cfa3a1c6c6bdee553a1c0a65`)
- F5→F5.1 delta: ONLY `scripts/lib/f3-db-push-repair-safety-gate.mjs` +3/−1 adding `current_database()`/`current_user` to `POISON_ABSENT_PROBE_SQL`
- No functional changes in this evidence commit
- CLI 2.117.0 isolated; disposable `jkorwnwwmdeflfntxntl`; production never contacted

### Local (Phase A)
- Ancestry E4→F5→F5.1→E5 exact; sealed Catalog-V5 hashes unchanged
- Poison/target-binding negatives PASS (repairCalls=0 continuationCalls=0 on rejects)
- test:f3-db-push 125/124/0/1; tsc 0; next build 0; recursive closure complete

### Hosted (Phases B–D) — one reset only
- CLEAN_BASELINE after exactly one bounded qualification reset
- Floor: DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
- All six migrations: push status 1 → repair 0 → retry 0; POST_COMMIT_HISTORY_FAILURE; V5 fingerprints exact equality (zero drift)
- Final poison: exact schema; database_name=postgres; user=postgres; authenticated disposable target; poisonPresent:false
- Process exit 0; durable FILE evidence-out

### Supersession
- Explicitly supersedes `M3_F3_DAYBREAK_CATALOG_V5_SELF_FK_REQUAL_20260915` hosted HOLD (empty database_name/user under tip/F5 probe)
- Prior HOLD package preserved untouched under docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_SELF_FK_REQUAL_20260915/
- V3/V4 dirs unmodified; not production/merge auth

### PRs
- #84/#85/#86 remain OPEN DRAFT UNMERGED head-identical; title kept: DAYBREAK HOLD — catalog-v5 self-FK RI roles + fail-closed
