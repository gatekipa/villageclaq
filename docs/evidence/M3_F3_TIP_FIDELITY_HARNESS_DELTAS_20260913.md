# M3 F3 tip-fidelity harness deltas — 2026-09-13

**OVERALL VERDICT: tip-fidelity HOLD CLOSED on this land. Hosted QUALIFICATION PASS is now tip-reproducible. This VM did not hosted re-run.**

Required floor label:

`DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT`

Permitted hosted success label (already recorded by Chief; not re-run here):

`FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION`

Do **not** convert this packaging to production PASS.  
Do **not** claim clean `00001`–`00117` replay PASS.  
Do **not** merge/deploy.  
Do **not** wipe/cleanup disposable.  
Do **not** touch production `llbnliixczcqfftxpsmb`.  
Do **not** contact Daybreak Blue or Astra.

## Hosted PASS vs tip (closed)

Chief already recorded hosted disposable QUALIFICATION PASS using these four harness deltas **before** they existed on tip `caf2f844719f8b62ea3db1bff6c591173cdb4ffc`. That was a **tip-fidelity HOLD**: PASS was not tip-reproducible.

This land implements the same deltas on the PR tip. **Tip-fidelity HOLD is closed.** A later hosted re-run is **not** required for that close. This agent did **not** hosted re-run.

Prior hosted `FILE-BASED RUNNER MECHANICS PASS — STUB/LIVE-PIN QUALIFICATION FLOOR` remains **SUPERSEDED** (do not erase). See `docs/evidence/M3_F3_REPAIR_GATE_ACL_PORTABILITY_20260913.md`.

## Pins

| Pin | Value |
|-----|-------|
| Starting shared tip | `caf2f844719f8b62ea3db1bff6c591173cdb4ffc` |
| Starting functional | `d70db3e54e1992a96aae0c9eceda7f4e61f7b4a4` |
| Starting evidence | `6ca63131f4f09002cbdadd0aca1f388b1dc01096` |
| **Functional SHA** | `b6fadd313752ca77743f25c038041f07bdd00a7e` |
| **Evidence SHA** | `45879046c8b6bd81213390cbe1563caff7e1a89a` |
| **Tip SHA** | PENDING |
| PR #83 | `a293f5958b31548ccec7591b653eff2857ae9a90` unchanged |
| Main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Recognition | exactly `["manual_income"]` |
| ubuntu role created | **NO** |
| 00118–00123 SQL bytes | **unchanged** (ACL-portability freeze) |
| Hosted re-run | **NOT_RUN** (forbidden for this auth) |
| PR #84 / #85 / #86 | OPEN DRAFT; tree-identical |

## Four harness-only deltas (migration SQL unchanged)

1. **Object-probe JSON array parse** — `db query --output-format json` under `--workdir` may return a top-level array. `unwrapCliRowsEnvelope` / `rowsFromQuery` / `objectsPresentFromProbe` / `inventoryFromQuery` treat that array as `envelope.rows`. All probe cells must be non-null.
2. **Poison cleanup before `migration repair`** — `runRepairSafetyThenMaybeRepair` always removes inject poison in finally-style cleanup, then spawns repair only if the eight proofs passed. Repair does not run while poison remains.
3. **Per-file isolated workdir staging** — `stageIsolatedWorkdirTarget` leaves only the current 00118–00123 timestamp copy in `supabase/migrations` for each push and retry so repair+retry cannot cascade-apply later files in one push.
4. **Floor pin** — `STUB_CORE_SQL` installs thin `public.uuid_generate_v5(uuid,text)` calling `extensions.uuid_generate_v5`. 00122 needs `public.uuid_generate_v5` on hosted. F3 migration bytes stay frozen.

## Frozen digests (unchanged this land)

| File | SHA-256 |
|------|---------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `bb823ebdddcefba7774f3347a609a05393d9a67c9430d0bd925c3458eaf5efed` |
| `00119_f3_01_core_ledger_foundation.sql` | `b22e16783fbb429ccae0ce15291d83311861f4e873cd01363bbd630372633f11` |
| `00120_f3_02_secure_posting_idempotency.sql` | `d81c8f52d4fccea4b654c3a54806ffc07d654ffa2a33540c97b74721d56b9a60` |
| `00121_f3_03_projection_read_proof.sql` | `51f40ccbd7dad79362b8cf2cd9854b9c8cdfd7295e4c10be5892d953915e90ce` |
| `00122_f3_04_correction_reversal.sql` | `84f52b89b764a468db7748e5c572f2543c5d466e5369ff36e6889d85ca8434f3` |
| `00123_f3_05_opening_cash_command.sql` | `0c8af9d755e5329ca58d6c5ae967fbe5b18e3e41bb836c934cfea0c06afce96d` |

## Fresh local verification

| Suite | Result |
|-------|--------|
| `test:f3-db-push` | **70 pass / 1 skip / 0 fail** (71 tests). Skip: local PG17 ACL apply |
| `test:f3-recognition` | **40/40 PASS** — `["manual_income"]` |
| Frozen 00118–00123 digest check | **6/6 OK** |
| Hosted qualify | **NOT_RUN** |

## Claims

| Claim | Status |
|-------|--------|
| Hosted QUALIFICATION PASS (Chief, pre-tip) | **RECORDED** — used these deltas; this agent did not re-run |
| Tip-fidelity HOLD | **CLOSED** by this land |
| Production apply / approval | **NOT CLAIMED** |
| Clean 00001–00117 replay | **NOT CLAIMED** |
| FILE-BASED RUNNER MECHANICS PASS | **SUPERSEDED** (do not erase) |
| Merge / deploy | **DO NOT MERGE / DO NOT DEPLOY** |
| #83 touched | **NO** |
| New PR | **NO** |
