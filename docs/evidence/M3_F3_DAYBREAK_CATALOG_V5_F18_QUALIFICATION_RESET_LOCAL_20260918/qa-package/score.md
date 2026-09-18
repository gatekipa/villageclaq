# VillageClaq QA — F18 qualification-reset independent review

**Assigned by:** VillageClaq Chief  
**Reviewer:** independent Grok-family QA (not the implementer; no Daybreak/Astra contact)  
**Task / agent bc id:** `bc-49cebacf-a8b4-5f38-9609-95ffe86d6adf`  
**Repo:** `gatekipa/villageclaq`  
**Reviewed pin (FROZEN functional):** `ca2c0d536037da8c7f55627ac1694cacb932d1d7`  
**Builder evidence parent:** `ba8fc0015337fd6aa854ccd0cc94a066e5c87166`  
**Start:** `3fcbcbc438ccc90faf7e87d06ba0d270e3d17598`  
**Draft #116:** non-authoritative  
**#115 F17 QA:** NON-AUTHORITATIVE — does not supply F18 raw proof  
**Date:** 2026-09-18

**Forbidden observed:** no Daybreak/Astra/hosted/disposable/production contact. No merge. Functional scripts not modified.

---

## Verdict: **F18 ACCEPT**

A/B/C independently executed and closed on `ca2c0d536037da8c7f55627ac1694cacb932d1d7` via the committed helper + shared runner + generated SQL on this VM’s local PostgreSQL.

**Overall: DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**

**Floor:** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

Score alone is insufficient. Raw logs, backend-bound lock observations, process records, and postconditions are in this package.

---

## Environment (this reviewer)

| Item | Value |
| --- | --- |
| OS | Ubuntu 24.04.4 LTS (`Linux cursor 6.12.94+`) |
| Node | v22.14.0 |
| **Actual PostgreSQL server version** | **17.11 (Ubuntu 17.11-1.pgdg24.04+2)** |
| psql client | psql (PostgreSQL) 17.11 (Ubuntu 17.11-1.pgdg24.04+2) |
| Socket | `/var/run/postgresql/.s.PGSQL.5432` (peer `ubuntu`) |
| Work DB | task-owned `f3_*` only (`f3_f15_qual_reset_5057_mu749l0q`) |
| Classification | `LOCAL_PG_EXECUTED` (not MUST_LOCAL; not a rerun from Builder artifacts) |
| Functional checkout | git worktree `[REDACTED_PATH]/f18-ca2c0d5` at `ca2c0d5` |
| Helper blob | `d543b93e8f6c8422219d2bd9011cf6c21bc47736` (identical on `ca2c0d5` and `ba8fc001`) |

LOCAL_PG was **not** present at agent start. This reviewer installed PostgreSQL 17.11 locally, started cluster `17/main`, created role `ubuntu`, and then executed the committed helper. Builder logs were not reused as proof.

---

## Commands run (fresh on `ca2c0d5`)

```text
git worktree add [REDACTED_PATH]/f18-ca2c0d5 ca2c0d536037da8c7f55627ac1694cacb932d1d7
cd [REDACTED_PATH]/f18-ca2c0d5
npm run test:f3-reset-design
npm run test:f3-reset
npm run test:f3-db-push
node scripts/prove-f3-qualification-reset-local.mjs
# plus independent process E2E + lock/reparse requalify importing committed modules only
```

---

## Gates vs Builder

| Suite | This QA | Builder claim | Match |
| --- | --- | --- | --- |
| `test:f3-reset-design` | **30/30** | 30/30 | yes |
| `test:f3-reset` | **62/62** | 62/62 | yes |
| `test:f3-db-push` | **243/243** | 243/243 | yes |
| committed helper | **24 checks / 9 scenarios / 8 TX / 33 pass / 0 fail** | 24/9/8 TX | yes |
| helper classification | `LOCAL_PG_EXECUTED` PG 17.11 | same | yes |

C4-R01–R04 all PASS in this QA’s `test:f3-reset` log (ok 42–45).

---

## A — backend-bound lock proof (independently executed)

Both two-session lock-wait cases ran through `prove-f3-qualification-reset-local.mjs --shared-reset-worker` → `runQualificationReset` → generated SQL on local PG. Waiter identity was the **reset backend from the same connection that executed reset SQL**, bound by process id + `pg_backend_pid()` / `F18_RESET_BACKEND` notice + T1 observation. Not “any available waiter.”

Sequence observed in both cases: **T1 → reset lock wait → holder commit (`HOLDER_COMMITTED`) → reset lock acquisition (T2 same backend) → T3 reject before mutation**.

| Field | Unapproved FK | Retargeted approved identity |
| --- | --- | --- |
| Scenario | `TX_T3_LOCKWAIT_UNAPPROVED_FK_ROLLBACK` | `TX_T3_LOCKWAIT_RETARGETED_FK_ROLLBACK` |
| Reset process id | **13830** | **14988** |
| Reset backend id | **14754** | **15811** |
| Holder backend id | **13827** | **14982** |
| stdout `backendPid` | 14754 | 15811 |
| `F18_RESET_BACKEND` notice | 14754 | 15811 |
| DB | `f3_f15_qual_reset_5057_mu749l0q` | same |
| Relation | `public.financial_accounts` | `public.memberships` |
| Holder lock | AccessExclusiveLock granted=true | AccessExclusiveLock granted=true |
| Waiter lock | AccessExclusiveLock granted=false, blockedByHolder=true, pid=reset backend | same pattern |
| Isolation | READ COMMITTED | READ COMMITTED |
| HOLDER_COMMITTED | true | true |
| `mutationPhaseReached` | **false** | **false** |
| `rolledBack` | **null** (unproven) | **null** |
| Drift retained | `unapproved_accounts_groups_fkey` | `public.profiles` |
| Independent `evaluateBackendBoundLockProof` | ok=true | ok=true |

Approved set still T7 **CLEAN_BASELINE** (`TX_T3_APPROVED_SET_SUCCESS`).

Negatives independently failed on both observations:

- unrelated waiter → `F18_LOCK_PROOF_ANY_WAITER` + `F18_LOCK_PROOF_WAITER_NOT_RESET_BACKEND`
- mismatched backend → `F18_LOCK_PROOF_ACQUISITION_BACKEND`
- mismatched relation → holder/waiter/acquisition relation mismatches
- missing commit → `F18_LOCK_PROOF_HOLDER_COMMIT_MISSING`
- missing acquisition → `F18_LOCK_PROOF_ACQUISITION_MISSING`

**Disposition A:** CLOSED. Live `pg_locks.granted` after holder commit was not sampled (`granted:false` with `t2LockedSameBackend:true`). The committed evaluator accepts T2 observation from the same reset backend after `HOLDER_COMMITTED`. Wait-phase binding is the stronger proof and was observed on `pg_locks`. Not a HOLD.

---

## B — process provenance E2E (independently executed)

Actual chain: `runQualificationReset` transport → `packageQualificationResetProcessEvidence` → `JSON.stringify` → reread → `adaptStoredProcessRecordToParserInput` / parser.

| Case | Result |
| --- | --- |
| Success | committed=true, verdict=CLEAN_BASELINE; original hashes captured before encode |
| Structured Error | `code=EACCES`, `name=Error`, `syscall=open` retained after reread |
| Timeout | `timedOut=true` and `timeout=true` retained; interpretedCommitted=false |
| Sanitized stderr | packaged stderr ≠ original; separate hashes (`f24c736f…` vs `a4893dad…`) |
| Malformed / double-encoded | rejected `F18_PROCESS_EVIDENCE_DOUBLE_ENCODED`; ambiguous shape rejected |

Original hashes were captured **before** encode/sanitize and matched `streams.original*Sha256` after reread. Original was not recomputed from transformed bytes.

**Disposition B:** CLOSED.

---

## C — success reparse (independently executed)

Finalized reread artifacts from **this** helper run (not Builder files):

| Artifact | `interpretedCommitted` | verdict | t7CommittedTrue |
| --- | --- | --- | --- |
| `TX_SUCCESSFUL_RESET` | **true** | CLEAN_BASELINE | true |
| `TX_T3_APPROVED_SET_SUCCESS` | **true** | CLEAN_BASELINE | true |

Failures stay rejected. Missing status → `F18_STORED_PROCESS_RECORD_STATUS_MISSING` and attestation `interpretedCommitted=false` (does not default to success).

**Disposition C:** CLOSED.

---

## Preserve spot

| Check | This QA |
| --- | --- |
| Bucket HOLDs | PASS (unexpected bucket / unexpected+named / unexpected storage / auth trigger / unnest) |
| Read Committed + locks before T3 | PASS (`READ_COMMITTED_LOCK_ORDER_DOCUMENTED`; lock-wait T3 after T2) |
| C4-R01–R04 | PASS |
| Wipe | `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH` |
| Migrations | unchanged vs start `3fcbcbc4` (`supabase/migrations` diff empty) |
| Functional scripts | unchanged vs pin (`scripts` diff empty on this docs-only commit) |

---

## Findings disposition

| Finding | Disposition |
| --- | --- |
| A unbound lock-wait waiter | **CLOSED** — independently proven backend-bound on local PG 17.11 |
| B process provenance | **CLOSED** — independently proven E2E |
| C success-reparse | **CLOSED** — independently proven from this run’s reread artifacts |
| D authentic QA on authoritative head | **CLOSED for F18 local slot** — this package is the independent QA on `ca2c0d5` |
| Hosted requalification | **HOLD** — not run |
| Production-equivalent replay | **HOLD by floor** — documented qualification fixture only |

**P0 / P1 F18 local HOLD:** none.

---

## STOP

**F18 ACCEPT** on functional pin `ca2c0d536037da8c7f55627ac1694cacb932d1d7`.

**Overall DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN.**

Floor remains: DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT.
