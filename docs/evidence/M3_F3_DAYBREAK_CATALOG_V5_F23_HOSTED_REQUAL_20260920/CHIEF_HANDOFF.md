# F23 HOSTED REQUALIFICATION — SUMMARY

**Overall: DAYBREAK HOLD — HOSTED REQUALIFICATION STOPPED AT RESET (NOT PASS)**

| Field | Value |
|-------|-------|
| Outcome | **stopped** |
| Phase reached | **reset** |
| Reset exit code | **1** |
| Qual exit code | **n/a (NOT RUN)** |
| Functional SHA (execution) | `66be2b4797515975d737a0fd66656bc4c0de2145` |
| Plan commit | `a054585e187382533e7e06f44aeeea60810d1210` |
| Plan SHA-256 | `bf9ca7b6c408d72b9f1231f223628a41e77fe275132acf273cd5386dd8c3b138` (**verified**) |
| closureDigest | `b276d0cb9b39efd10f67422948b4cf9a6353359c116ab657d379c7c7f467a211` (**confirmed**, count 47) |
| scopeSqlIdentitySha256 | `d95d96e02a3a1844977d852fa23a64f742b79b5f767984b6a2d4512cbe02632f` (**confirmed**) |
| CLI | supabase **2.117.0** (`/home/box/.local/bin/supabase`) |
| Target | `jkorwnwwmdeflfntxntl` only |
| Production | never contacted (`llbnliixczcqfftxpsmb` rejected by contract) |
| Preserve baseline gate | **NOT REACHED** (inventory capture failed first) |
| btree_gist | N/A — no mutation; disposable intact |

## What ran

1. Preflight OK (HEAD, plan digest, closure/scope digests, CLI, credentials present, sentinel set).
2. Exactly **one** `--qualification-reset` with founder auth artifact.
3. Result: `F13_INVENTORY_CAPTURE_PROCESS_FAILED` — `inventoryCaptured=false`, `mutation=false`, `committed=false`.
4. **Stopped.** Qualification `--no-wipe --prep-floor --sequence-f3 --floor-mode=stub-live-pin --verification-mode=fault-injection` **not run**.
5. Budget: reset invocations **1/1**; qual **0/1**; secondReset **false**.

## Blocker

**`psql` client missing on Chief execution box.** Gated inventory capture cannot spawn `psql -X -q -t -A -w -v ON_ERROR_STOP=1 -f …`. Secure step missing before any new authorized attempt: install PostgreSQL client `psql` on this host. Do **not** retry under this consumed budget.

Password/mgmt env vars were present; password validity was **not** confirmed because capture failed before authenticated SQL.

## Known summary-field inconsistency

`qualify-result.json` `label` still says `F19 LOCAL CORRECTION CANDIDATE — AWAITING QA / LOCAL TX PROOF` (stale shared `fail()` label). This run is **F23 hosted stop at inventory capture**, not an F19 local correction.

## Evidence paths

- Live reset: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL/hosted/qualification-reset/`
- Dated package: `docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_HOSTED_REQUAL_20260920/`
- Qual-from-00118: **absent** (not run)

Floor (verbatim): **DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT**

Do **not** invent PASS. DAYBREAK HOLD pending assessment / new authorization after `psql` is available.
