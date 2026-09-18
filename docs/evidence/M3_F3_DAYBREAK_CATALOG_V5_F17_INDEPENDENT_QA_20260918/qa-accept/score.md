# VillageClaq QA — F17 independent adversarial verification

**Role:** Grok-family QA. Not the implementer. Tests not weakened.
**Draft #114:** inspected, non-authoritative.
**Forbidden observed:** no Daybreak / Astra / hosted / disposable / production contact. No merge.

| Pin | SHA |
| --- | --- |
| Start | `10d2d578c18e372e633a033b31c2e515cd535a8b` |
| Functional tip (worked) | `83b9f79483f3ba53f4f8cd60016450ff38a723b4` |
| Builder evidence (inspected only) | `3fcbcbc438ccc90faf7e87d06ba0d270e3d17598` |
| F16 functional content pin (superseded) | `b74c6854869acf0e826446ea0488c42469621a3b` |

---

## Verdict: **F17 ACCEPT**

A / B / C / D are closed on the functional tip by independent inspection plus re-execution. No material HOLD remains on the local qualification-reset candidate.

**Overall still:** DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN.

Floor: DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT.

---

## Gates (this QA, functional tip `83b9f794`)

| Gate | Builder claim | This QA | Match |
| --- | --- | --- | --- |
| `test:f3-reset-design` | 30/30 | **30/30/0** | yes |
| `test:f3-reset` | 59/59 | **59/59/0** (F17-B02 6510 ms after local PG) | yes |
| `test:f3-db-push` | 240/240/0 | **240 tests / 239 pass / 0 fail / 1 skip** first run | count variance, not functional |
| `prove-f3-qualification-reset-local.mjs` | 20 / 9 / 8 TX `LOCAL_PG_EXECUTED` | **20 / 9 / 8 TX `LOCAL_PG_EXECUTED`**, 29/0 | yes |

db-push skip is `identity GET is skipped without token and fetch ledger stays empty`. Builder suite log contains the same named test as `ok` with footer `# skipped 0`. Disposition: environmental skip-count reporting, not an F17 defect.

Native Windows was **not** executed here. Builder historical Windows QA on F16 `b74c685` is not F17 PASS evidence.

---

## A — unexpected `storage_buckets` false CLEAN_BASELINE — CLOSED

F16 `b74c685` recorded `storage_buckets.dirtyBlocksCleanBaseline: false` and `classifier: false`. That is the false CLEAN_BASELINE defect.

On `83b9f794`, independent classifier/eligibility spots:

| Inventory | classify | eligibility | alreadyClean | wipeRouted |
| --- | --- | --- | --- | --- |
| `storage_buckets:["unexpected_secret_bucket"]` | HOLD | HOLD `F13_UNSUPPORTED_MANAGED_LEFTOVER` | false | false |
| named residuals + unexpected | HOLD | HOLD | false | false |
| `[]` or `FAILED_FLOOR_STORAGE_BUCKETS` only | CLEAN_BASELINE | CLEAN_BASELINE | true | false |
| auth trigger | HOLD | HOLD | false | false |
| `unnest_uuid_shim` | HOLD | HOLD (`F13_INVENTORY_CAPTURE_CONTRADICTION`) | false | false |
| unexpected storage policy | HOLD | HOLD | false | false |

Shared entrypoint spies (suite F17-A01/A02/A04 and F16-A01): inventory once, apply/sql/transport 0. Wipe code remains `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH`. Permitted identities are only `avatars` / `group-documents` / `receipts`. No auto-allowlist of `unexpected_secret_bucket`. `BASELINE_AFFECTING_INVENTORY_FIELDS` omitted-dirty set is empty.

---

## B — snapshot-before-lock concurrency — CLOSED (`LOCAL_PG_EXECUTED`)

Generated SQL is `BEGIN ISOLATION LEVEL READ COMMITTED`. T2 takes `schema_migrations` SHARE ROW EXCLUSIVE then allowlisted tables ACCESS EXCLUSIVE **before** T3 live-tuple revalidation. Lock order of leftover tables is dependents first (`financial_accounts` 770, `memberships` 1170, `groups` 1180, `profiles` 1190), so the two-session holders do not deadlock the referenced-side ALTER.

This QA installed local PostgreSQL 17.11 and **re-executed** `scripts/prove-f3-qualification-reset-local.mjs`. Not MUST_LOCAL. Not sleep-as-proof.

| Scenario | lockWait | wait_event | mutation | rollback | drift retained |
| --- | --- | --- | --- | --- | --- |
| `TX_T3_LOCKWAIT_UNAPPROVED_FK_ROLLBACK` | true; waiter 25416 vs holder 25011 | `Lock` / `relation` | false | null | `unapproved_accounts_groups_fkey` |
| `TX_T3_LOCKWAIT_RETARGETED_FK_ROLLBACK` | true; waiter 25865 vs holder 25461 | `Lock` / `relation` | false | null | `public.profiles` |
| `TX_T3_APPROVED_SET_SUCCESS` | n/a | n/a | true / T7 | null | n/a; verdict CLEAN_BASELINE |

`observedPhase` on reject paths is `T2_LOCK` because the T3 observation line is emitted only after the T3 DO succeeds; the RAISE is inside T3 and stdout stops after T2. That is consistent with reject-before-mutation, not a T3 skip.

---

## C — process evidence — CLOSED

- Packaged helper records original vs packaged stream SHA-256 / lengths; `originalByteEqual` stays false; no reconstruction from summaries.
- Independent scan of builder F17 package `3fcbcbc` : pathLeaks 0, secrets 0.
- Failure reparse: status 1, `EACCES` preserved, not success.
- Timeout reparse: status null, `timeout` true, `SIGTERM`, not success.
- F16 historical package is **byte-unchanged** `10d2d57` → `3fcbcbc`. F16 `TX_SUCCESS_RAW.json` still contains `/tmp/f15-qual-reset-...` (documented defect, not rewritten).

---

## D — portability — CLOSED locally; native Windows not claimed

`canonicalManifestPath` normalizes `\\` and `/` before the `supabase/migrations` assertion. Suite covers POSIX, Windows-shaped, and `supabase\\migrations\\file.sql` strings. This host is Linux. Native Windows was not run.

---

## Preserve spot checks

| Check | Result |
| --- | --- |
| C4-R01–R04 | PASS in 59/59 |
| Wipe `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH` | PASS (suite + helper + `evaluateWipeToBaselineArg(true)`) |
| `supabase/migrations` vs start | unchanged |
| Allowlist `10d2d57` → `83b9f79` | exactly eight scripts |
| Allowlist `83b9f79` → `3fcbcbc` | F17 evidence docs only |
| Closures on tip | runtime `0db1c600…c741` count 45; union `d3fd2eb5…41cb` count 48; F16 cited-not-expected `1ca2a1ce…ee78` / `989c6c99…8fb7ff` |

---

## Findings

- **P0 / P1 HOLD:** none
- **P2 / note:** db-push skip-count 239+1 vs builder 240/0 — environmental identity-GET skip, not a reset defect
- **P2 / note:** `t1ReachedThenWaited` is derived from `pg_locks` waiter presence plus SQL order, not a mid-wait T1 stdout parse. Acceptable given relation `wait_event` samples and post-hoc T1+T2 stdout

---

## STOP

**READY FOR CHIEF PASS/HOLD DECISION**

QA: **F17 ACCEPT** on `83b9f794`. Helper **LOCAL_PG_EXECUTED**. Overall **DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**. Do not merge.
