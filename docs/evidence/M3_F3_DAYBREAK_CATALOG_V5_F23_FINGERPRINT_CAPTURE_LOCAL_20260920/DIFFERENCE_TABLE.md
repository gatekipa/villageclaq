# F23 fingerprint difference table — authorized local capture 2026-09-20

Compare function (unchanged): `fingerprintCompleteAndExact` → `canonicalFingerprintEqual` after `canonicalizeFingerprintForCompare`.  
Fingerprint acceptance is unchanged. Frozen SQL / frozen oracle were not patched.

**This table is the actual authorized capture.** The prove command ran once. It did **not** produce phase-matched catalog expected/observed pairs because CLI `db push` never started.

Do not read empty `files` as equality. Do not reuse the prior closeout NOT RETAINED slogans as observations from this run.

## Capture result

| Item | Value |
|------|-------|
| Prove command | **ran once** (`--normal-application-only --fingerprint-diff-out`) |
| `captureExecuted` | `true` |
| `proveExitCode` | `0` |
| Window (UTC) | `2026-09-20T06:05:54Z` → `2026-09-20T06:06:02Z` |
| Classification | `LOCAL_PG_EXECUTED` |
| Server | `17.11 (Ubuntu 17.11-1.pgdg24.04+2)` |
| CLI | `2.117.0` (`matchesPin=true`) |
| Pre-floor verdict | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` |
| Qualify status | `HOLD` |
| `remainingHold` | `F3_DBPUSH_FLOOR_HOLD` |
| Qualify error | `HOLD: stub+live-pin qualification floor or pre-db-push gates failed; db push not started` |
| `floorInstalled` | `false` |
| `preDbPushGatesOk` | `false` |
| `sequenceLength` | `0` |
| `files` in [fingerprint-diff.json](fingerprint-diff.json) | `[]` (observed empty sequence — apply not started) |
| Phase reached | preserve-reset + pre-floor **passed**; stub+live-pin floor **HOLD**; `after_successful_normal_application` **not reached** |

## Six migrations and operation counts

| Item | Observed |
|------|----------|
| Expected history identities | `20260913173000` / `f3_bounded_financial_epoch_foundation` … `20260913173005` / `f3_05_opening_cash_command` |
| Observed history rows | `[]` |
| Missing versions | all six (`20260913173000`–`005`) |
| `migrationsAppliedThrough00123` | `false` |
| `completeThrough00123` | `false` |
| `localApplicationComplete` | `false` |
| `operationCounts.calibrationProbes` | `null` |
| `operationCounts.migrationApplications` | `0` |
| `operationCounts.retries` | `0` |
| `operationCounts.repairs` | `0` |
| `operationCounts.historyInjects` | `0` |
| `floorCalls` | `2` |
| `dbPushCalls` | `0` |
| `repairCalls` | `0` |

Helper catch discarded `failedAt` / step stderr. Leftover isolated workdir after the run contained only `floor-sql/floor-stub-core.sql` (first documented floor step). Cluster roles `anon` / `authenticated` / `service_role` were **absent** after capture. Role `ubuntu` was `LOGIN CREATEDB` only (`rolsuper=false`, `rolcreaterole=false`).

Membership (not a fingerprint field; retained): 264 `deptype=e` tuples; exact sets equal before reset / after reset / after qualification (`countsAloneInsufficient=true`).

## Differing fields

**None observed.** `retainQualifyFingerprintDiffs` received `qualify.sequence=[]`, so no file-level expected/observed catalog pairs exist.

This run does **not** recapture inherited `F23_FINGERPRINT_MISMATCH`. That remains historical F23 evidence. The hold from this capture is `F3_DBPUSH_FLOOR_HOLD`.

## Non-ACL differences

**None observed.** Apply never started, so schema shape, relations, constraints, indexes, triggers, RLS enablement, function bodies, and other non-ACL catalog keys were not compared. That is not an equality result.

| migration/object | field | expected | observed | phase |
|------------------|-------|----------|----------|-------|
| `00118`–`00123` | all `FINGERPRINT_REQUIRED_KEYS` and optional catalog keys | **not compared** | **not compared** | `after_successful_normal_application` — not reached (`F3_DBPUSH_FLOOR_HOLD`) |

## Smallest fixture-alignment proposal

**Proposal only — not authorized — do not apply. No second capture.**

This is **not** a fingerprint role/owner/ACL map. Mapping or waiver of hosted-oracle fingerprints remains **not approved**.

Smallest proposed fixture correction, from this capture plus the documented F18 local recipe:

- Recreate local role `ubuntu` as `SUPERUSER LOGIN` (`sudo -u postgres psql -c 'CREATE ROLE ubuntu SUPERUSER LOGIN;'` — [F18 COMMANDS.md](../M3_F3_DAYBREAK_CATALOG_V5_F18_QUALIFICATION_RESET_LOCAL_20260918/qa-package/COMMANDS.md)).
- Reason: committed stub-core floor SQL creates cluster roles `anon` / `authenticated` / `service_role`. `CREATEDB` alone cannot `CREATE ROLE`. This host used `CREATEDB` only (connection-guard / disposable-postgres specification + prior “smallest capability” list). Floor HOLD followed. F18/F23 hosts used SUPERUSER.

**Security implication:** SUPERUSER on a localhost-only temporary cluster lets the fixture create/drop roles and run later floor ownership/ACL SQL. It is a local-cluster privilege, not a hosted grant, and must not be treated as fingerprint equality or as a GRANT/REVOKE waiver. `CREATEROLE` alone might be smaller for the first stub statement but is **not** the documented F18/F23 fixture and may still fail later floor owner/ACL SQL. Do not grant these privileges on shared or hosted databases.

Do not patch frozen SQL. Do not align grants to manufacture a match. Do not rerun the capture from this proposal.

## What this package does not do

- Does not treat empty `files` as fingerprint equality
- Does not treat the old NOT RETAINED rows as field-level evidence from this run
- Does not waive equality
- Does not patch frozen oracle or migrations
- Does not run repair
- Does not consume a second capture
