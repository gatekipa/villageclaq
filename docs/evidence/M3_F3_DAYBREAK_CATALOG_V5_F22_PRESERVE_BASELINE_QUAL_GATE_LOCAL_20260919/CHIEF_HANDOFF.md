# Chief handoff — F22 preserve-baseline qualification gate

**HOLD: F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED**
**LOCAL_PROOF:** HOLD — complete qualification through 00123 not obtained
**FUNCTIONAL_TIP:** `f1d30b28830db902962467f801932254997e64c3`
**QA identity:** VillageClaq QA — F22 HOLD PACKAGE ACCEPT
**Local classification:** `LOCAL_PG_EXECUTED`
**Overall status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

Independent VillageClaq QA (Grok-family; distinct from builder) recorded **F22 HOLD PACKAGE ACCEPT** for FUNCTIONAL_TIP `f1d30b28830db902962467f801932254997e64c3` + evidence tip `6d6bdd7591d738e593bc7290d5f60e4be0de88ec`. That ACCEPT is HOLD-package integrity only. It is **not** LOCAL CANDIDATE READY and **not** hosted authorization. See `qa-package/QA_PROVENANCE.md`. Astra: both prior delegations failed at service access; no Astra verdict. Do not contact Daybreak/Astra.

## Pins

| Role | SHA / value |
|------|-------------|
| FUNCTIONAL_TIP (frozen) | `f1d30b28830db902962467f801932254997e64c3` |
| Evidence SHA (package content tip) | `686269dd3036ef654948d1812902d1b9a141ee3b` |
| QA-reviewed evidence tip / prior PR heads | `6d6bdd7591d738e593bc7290d5f60e4be0de88ec` |
| Starting #84/#85/#86 head | `a38db9c1c0e122dcc5900e1bd41c3857ecca6bd5` |
| F21 functional | `3fe7314ab7cfb2abbcd66d8eb09f26ba2ed0a9e0` |
| F21 local evidence | `964fe8431f7ca22534a4277246e8330732373f64` |
| Contract | `b7d16544cdbb86ce47baba329835bd93dcb16d6d` |
| Success / already-clean | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` |
| Remaining HOLD | `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` |
| QA verdict | F22 HOLD PACKAGE ACCEPT |
| This package | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F22_PRESERVE_BASELINE_QUAL_GATE_LOCAL_20260919/` |
| PRs | #84 / #85 / #86 OPEN DRAFT UNMERGED DAYBREAK HOLD; builder PR #126 |

Ancestry: this QA evidence commit → `6d6bdd7591d738e593bc7290d5f60e4be0de88ec` → `686269dd3036ef654948d1812902d1b9a141ee3b` → `f1d30b28830db902962467f801932254997e64c3` → a38db9c → 964fe843 → 3fe7314 → b7d16544 → …

## Operational-path correction

Policy-scoped pre-floor gate for `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` authenticates applicable policy, target, current inventory, and typed membership **before** floor preparation. Wired into `scripts/qualify-f3-db-push-disposable.mjs` via `resolvePreFloorQualificationGate`. Historical `evaluatePreStubFloorCleanCheck` / `CLEAN_BASELINE` unchanged. Fresh capture required. Missing reset verdict → `F21_PRESERVE_BASELINE_VERDICT_REQUIRED`.

Call evidence: `local-pg-proof/COMPLETE_SEQUENCE.json`, `suite-logs/prove-helper.out`, `F22_CASES.json`.

No additional executable scope beyond the authorized list. Local floor adapter creates hosted-equivalent `extensions` schema only after the authenticated gate allows floor preparation.

## Complete local qualification

Preserve reset → authenticated pre-floor → stub+live-pin floor → CLI 2.117.0 db push 00118 on run-owned PostgreSQL 17.11.

- Pre-floor: `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`, allowFloor
- Floor installed exact; pre-db-push gates ok
- Induced history inject: `F3_DBPUSH_DISPOSABLE_HISTORY_INJECT` SQLSTATE P0001
- Split: `PRE_COMMIT_OR_ATOMIC_ROLLBACK`; repair not spawned
- 00119–00123 not started
- F21 direct 00118 `F3_ABORT` remains negative-only

Substituted hosted interfaces (not hosted identity proof):
- hosted `getDisposableProjectIdentity (Management API)` → local `local-fixture identity adapter; not hosted identity proof`
- hosted `listDisposableMigrationsViaGet (Management API)` → local `local schema_migrations query via run-owned psql`
- hosted `constructImmutableValidatedTargetFromConnection` → local `local-fixture target; production ref still rejected; not hosted identity proof`
- hosted `runDbQuery / runGatedRemoteSqlText / runIsolatedPoisonPsqlQuery` → local `local-fixture psql (-t -A -w / -f) against run-owned f3_*`
- hosted `installHostedFloor (gated remote psql)` → local `installStubLivePinFloorLocal (same SQL steps, local psql -f)`
- hosted `runDbPushCandidate / runFilenameVersionRepair via hosted --db-url` → local `CLI 2.117.0 db push and migration repair as separate commands against local --db-url; not assertConstructedDbUrl hosted pooler`

## Membership preservation

Exact OID-bearing membership sets compared (counts + nonempty array insufficient):

- before reset = after reset = after qualification
- memberCount 264
- See `local-pg-proof/MEMBERSHIP.json`

## Raw-Git-byte adjudication

At F21 packaging head a38db9c, independently verified with `git cat-file blob` (LF, no normalization):

- Contract index sha256: `2cfcc004dcda81e14d8bbdf21b475a502e88a2a3abaab8f24ff665a2e9c54bc5`
- Local index: `5e709c37f89c17b06abbb6f7a1f3f5594124a05accc6a3b827bb93271b7129a9`
- Plan index: `b543d24840ddd0c4120b7acd3b6aff0ee3d81dae7ee7233437221f02a61dfa52`
- Proposed-plan bytes: `94256d3d8f594e109cc3b1ae76a74c11405cc15f4bac3aa7c436a59404b86f93`

## Closures (recomputed from functional tip blobs)

See `closure/DIGESTS.json`. Runtime `89e46973eb9312e35dff9efda30505b0c9ce140d83ff7246f7fd9c12097b8a3b` (count 45); union `64dfd55296d3c287a56499a47e749122269f00311920f5f3ad9c4d39b56dbc1c` (count 48).

## Independent QA (attributable)

- Reviewer: VillageClaq QA (independent Grok-family; distinct from builder)
- Functional tip reviewed: `f1d30b28830db902962467f801932254997e64c3`
- Evidence tip reviewed: `6d6bdd7591d738e593bc7290d5f60e4be0de88ec`
- Verdict: **F22 HOLD PACKAGE ACCEPT**
- Suites QA-executed: design 33/33, reset 78/78, harness 115/115
- Complete local prove re-run: NOT EXECUTED on QA host (no local PG); check 2 artifact-inspected only
- Astra: both prior delegations failed at service access; no Astra verdict; Daybreak/Astra not contacted
- Material findings: none
- Filled slot: `qa-package/QA_SLOT_FILLED.md` (template `qa-package/QA_SLOT.md` retained)

## What remains

- Decide whether hosted filename-version split (objects remain after inject) can be authorized; local CLI atomic rollback is the remaining complete-run HOLD
- Dedicated disposable credential provision after future authorization (do not acquire now)
- Plan remains PROPOSED ONLY — NOT AUTHORIZED — DO NOT EXECUTE

DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
