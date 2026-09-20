# Chief handoff — F23 normal application local

**HOLD: F23_FINGERPRINT_MISMATCH**
**LOCAL APPLICATION COMPLETE:** false
**LOCAL_PROOF:** HOLD — six migrations applied with exact identities; QUALIFICATION PASS withheld on hosted-oracle fingerprint inequality
**FUNCTIONAL_TIP:** `77fd61dbf51652acabec0093d2a8549524b2dd75`
**QA identity:** VillageClaq QA — F23 HOLD PACKAGE ACCEPT
**Local classification:** `LOCAL_PG_EXECUTED`
**Overall status:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

Independent VillageClaq QA (Grok-family; distinct from builder) recorded **F23 HOLD PACKAGE ACCEPT** for FUNCTIONAL_TIP `77fd61dbf51652acabec0093d2a8549524b2dd75` + evidence tip reviewed `c0a6746516b115b9e1db6ce311c4a4fe80113b01`. That ACCEPT is HOLD-package integrity only. It is **not** LOCAL APPLICATION COMPLETE, **not** LOCAL CANDIDATE READY, and **not** hosted authorization. Fingerprint HOLD must not be credited as application success. Complete local prove re-run was NOT EXECUTED on the QA host (no local PG); check 2 artifact-inspected only. See `qa-package/QA_PROVENANCE.md`. Astra: prior F22 service-access failures only; no Astra verdict. Do not contact Daybreak/Astra.

## Pins

| Role | SHA / value |
|------|-------------|
| FUNCTIONAL_TIP (frozen) | `77fd61dbf51652acabec0093d2a8549524b2dd75` |
| Evidence SHA (QA package content) | `b61c640b069c8568820d4e02516518bd45a7fc7f` |
| Evidence tip reviewed by QA / prior PR heads | `c0a6746516b115b9e1db6ce311c4a4fe80113b01` |
| Package content before QA | `dccaa795c800a2fe0b4f370b6234f875bd2655d9` |
| Starting #84/#85/#86/#126 head | `adb6ade2233f90aa34459bc8ac4fb381d23971a4` |
| F22 FUNCTIONAL_TIP | `f1d30b28830db902962467f801932254997e64c3` |
| F22 QA content | `f18331337c36e7c50cd1323c0202a298a4704e03` |
| Success / already-clean | `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` |
| Local application HOLD | `F23_FINGERPRINT_MISMATCH` |
| Fault-injection HOLD | `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` |
| QA verdict | F23 HOLD PACKAGE ACCEPT (HOLD-package integrity only; NOT LOCAL APPLICATION COMPLETE; NOT LOCAL CANDIDATE READY) |
| This package | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_NORMAL_APPLICATION_LOCAL_20260920/` |
| F22 package (historical) | `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F22_PRESERVE_BASELINE_QUAL_GATE_LOCAL_20260919/` |
| PRs | #84 / #85 / #86 OPEN DRAFT UNMERGED DAYBREAK HOLD (authoritative #84); #126 non-authoritative; builder #127 |

Ancestry: this QA bind → `b61c640b069c8568820d4e02516518bd45a7fc7f` → `c0a6746516b115b9e1db6ce311c4a4fe80113b01` → `dccaa795c800a2fe0b4f370b6234f875bd2655d9` → `77fd61dbf51652acabec0093d2a8549524b2dd75` → `ff6c933e017e8d7fba517cb43596fb0d24f1d1dd` → `acd3e23711112a5c87ce83901e07f1e23443d5b6` → `adb6ade2233f90aa34459bc8ac4fb381d23971a4` → `f18331337c36e7c50cd1323c0202a298a4704e03` → `6d6bdd7591d738e593bc7290d5f60e4be0de88ec` → `686269dd3036ef654948d1812902d1b9a141ee3b` → `f1d30b28830db902962467f801932254997e64c3` → …

## Scope

Authorized executables only:

- `scripts/qualify-f3-db-push-disposable.mjs`
- `scripts/prove-f3-qualification-reset-local.mjs`
- `scripts/test-f3-db-push-harness.mjs`
- `scripts/test-f3-qualification-reset.mjs`

No additional executable scope. No migration, financial/security behavior, CLI-version, privilege, or reset-scope changes.

## Normal application result through 00123

Fresh isolated run-owned PostgreSQL 17.11 (btree_gist preinstalled). Mode `normal-application` recorded before DB ops. Preserve reset → pre-floor `QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1` → stub+live-pin floor → CLI 2.117.0 apply 00118–00123.

- migrationsAppliedThrough00123: **true**
- Exact identities: 20260913173000 / f3_bounded_financial_epoch_foundation … 20260913173005 / f3_05_opening_cash_command
- operationCounts: calibrationProbes=6, migrationApplications=6, retries=0, repairs=0, historyInjects=0
- Inject objects absent; repair not exercised
- completeThrough00123: **false** (fingerprints not canonically equal)
- localApplicationComplete: **false**
- Remaining HOLD: `F23_FINGERPRINT_MISMATCH`

Local identity/transport substitutions (not hosted identity proof): see `local-pg-proof/FIXTURE.json` and `COMPLETE_SEQUENCE.json`.

## Separate fault-injection + repair coverage

F22 path re-executed on a **fresh** `f22_fault_inject` database (not the F23 DB).

- Split: `PRE_COMMIT_OR_ATOMIC_ROLLBACK`; repairCalls=0 (correct)
- Remaining HOLD: `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` (still authentic)
- Historical package preserved; F22 HOLD PACKAGE ACCEPT inherited as HOLD-package integrity only

| Repair coverage | Statement |
|-----------------|-----------|
| Freshly exercised | F22 induced history failure; repair-safety gate refused; repairCalls=0 |
| Inherited accepted evidence | F22 HOLD PACKAGE ACCEPT for `F22_LOCAL_CLI_ATOMIC_ROLLBACK_REPAIR_REFUSED` |
| Unexercised | post-commit filename-version repair after objects remain; hosted split where SQL commits and history INSERT fails |
| Mandatory under approved contract | **yes** |
| Promoted not-exercised to PASS | **no** |

## Membership / history / catalog

- F22 and F23: 264 deptype=e tuples; exact OID-bearing sets equal before reset / after reset / after qualification (counts alone insufficient)
- History: six exact version/name identities on the normal path; zero history rows on the fault-injection path
- Catalog: objects present after each successful normal apply; inject/poison absent
- Fingerprint: hosted-oracle ACL/owner ≠ local ubuntu fixture — HOLD, SQL not patched

## QA slot / package integrity

- Reviewer: VillageClaq QA (independent Grok-family; distinct from builder)
- Functional tip: `77fd61dbf51652acabec0093d2a8549524b2dd75`
- Evidence tip reviewed: `c0a6746516b115b9e1db6ce311c4a4fe80113b01`
- Verdict: **F23 HOLD PACKAGE ACCEPT** (HOLD-package integrity only; NOT LOCAL APPLICATION COMPLETE; NOT LOCAL CANDIDATE READY)
- Builder claim corroborated: `F23_FINGERPRINT_MISMATCH`; `migrationsAppliedThrough00123=true`; `completeThrough00123=false`
- Fingerprint HOLD must not be credited as application success
- Suites QA-executed: design 33/33, reset 81/81, harness 116/116
- Complete local prove re-run: NOT EXECUTED on QA host (no local PG)
- Material findings: none
- Filled slot: `qa-package/QA_SLOT_FILLED.md` (template `qa-package/QA_SLOT.md` retained, superseded)
- Closures remain those computed from functional tip blobs (see `closure/DIGESTS.json`)
- Sanitization keeps semantic evidence (repo-relative paths, migration identities, SQLSTATE/error codes, catalog tuples); QA absolute workspace paths redacted before hash
- unindexed=0 after outer evidence-index
- No renewed line-ending investigation (no contradictory raw-byte evidence)

## Smallest remaining founder decision

Whether **local-fixture ACL/owner substitution may be excluded** from hosted-oracle fingerprint equality when declaring local application complete through 00123, **or** fingerprint equality remains mandatory (local CLI as ubuntu cannot satisfy hosted postgres/service_role/authenticated fingerprints). Frozen SQL must not be patched to manufacture a match.

Separately, post-commit repair remains mandatory and unexercised. Local CLI atomic rollback cannot satisfy it. One concrete decision if that requirement still binds: whether a **hosted filename-version split** (objects remain after inject) can be authorized. Do not mark unapplied SQL applied or manufacture committed objects.

## PR heads

Prefer FF onto existing PR head branches. #84 authoritative; #85/#86 aligned; #126 may FF (non-authoritative). Titles remain DAYBREAK HOLD. OPEN DRAFT UNMERGED.

DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN
DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT
