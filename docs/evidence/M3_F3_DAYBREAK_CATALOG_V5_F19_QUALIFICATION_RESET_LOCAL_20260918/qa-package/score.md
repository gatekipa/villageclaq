# VillageClaq QA — F19 qualification-reset independent review

**Assigned by:** VillageClaq Chief  
**Reviewer:** independent Grok-family QA (not the implementer; no Daybreak/Astra contact)  
**Task / agent bc id:** `bc-8c2797cf-e789-5ab9-afd1-ff9a47a05cfa`  
**Repo:** `gatekipa/villageclaq`  
**Reviewed pin (FROZEN functional):** `dfbeb11b49f7e9b061a4c700e0335d125ac669e2`  
**Builder evidence parent:** `8e468ba5e82b0e717f28c4142dc7abca4b1641d9`  
**Start:** `1a4534c33bb80df273067354710582b9acc062ad`  
**F18 functional INHERITED:** `ca2c0d536037da8c7f55627ac1694cacb932d1d7`  
**F18 cloud QA INHERITED:** `bc-49cebacf-a8b4-5f38-9609-95ffe86d6adf` (not re-attributed as F19)  
**Draft #118:** non-authoritative  
**Date:** 2026-09-18

**Forbidden observed:** no Daybreak/Astra/hosted/disposable/production contact. No merge. Functional scripts not modified. F18 concurrency not re-run.

---

## Verdict: **F19 ACCEPT**

A/B independently executed and closed on `dfbeb11b49f7e9b061a4c700e0335d125ac669e2` via committed `runQualificationReset` + helper `processEvidence`/`record` + serialize/reread + interpret/attest/finalize.

F18 defects were first reproduced conceptually on `ca2c0d536037da8c7f55627ac1694cacb932d1d7`, then proven closed on the F19 tip.

**Overall: DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN**

**Floor:** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT

Score alone is insufficient. Raw logs and the four case execution outputs are in this package.

---

## Environment (this reviewer)

| Item | Value |
| --- | --- |
| OS | Ubuntu 24.04.4 LTS (`Linux cursor 6.12.94+`) |
| Node | v22.14.0 |
| PostgreSQL | **absent** (`psql` missing) |
| Classification | `MUST_LOCAL` |
| Functional checkout | git worktree `[REDACTED_PATH]/f19-dfbeb11` at `dfbeb11` |
| F18 conceptual checkout | git worktree `[REDACTED_PATH]/f18-ca2c0d5` at `ca2c0d5` |
| Helper blob | `821b0a7351ede56bbbfd7523ad6f61e370a82a93` (identical on `dfbeb11` and `8e468ba5`) |
| F18 helper blob | `d543b93e8f6c8422219d2bd9011cf6c21bc47736` |

Builder artifacts were not reused as raw proof. This reviewer re-executed the committed gates and an independent harness that imports frozen modules only.

---

## Commands run (fresh on `dfbeb11`)

```text
git worktree add [REDACTED_PATH]/f19-dfbeb11 dfbeb11b49f7e9b061a4c700e0335d125ac669e2
git worktree add [REDACTED_PATH]/f18-ca2c0d5 ca2c0d536037da8c7f55627ac1694cacb932d1d7
cd [REDACTED_PATH]/f19-dfbeb11
npm run test:f3-reset-design
npm run test:f3-reset
npm run test:f3-db-push
node scripts/prove-f3-qualification-reset-local.mjs
node [REDACTED_PATH]/f19-qa-independent.mjs
```

---

## Gates vs Builder

| Suite | This QA | Builder claim | Match |
| --- | --- | --- | --- |
| `test:f3-reset-design` | **30/30** | 30/30 | yes |
| `test:f3-reset` | **66/66** | 66/66 | yes |
| `test:f3-db-push` | **246 pass + 1 skip / 247** | 246 pass + 1 skip / 247 | yes |
| committed helper | **24 checks / 9 scenarios / 0 TX / 33 pass / MUST_LOCAL** | MUST_LOCAL | yes |

VillageClaq “242 pass + 1 skip” is **not** an F19 claim. This reviewer’s authentic combined gate is **246 pass + 1 skip / 247**, skip = `identity GET is skipped without token`.

C4-R01–R04 all PASS in this QA’s `test:f3-reset` log (ok 42–45).

---

## F18 defects reproduced conceptually on `ca2c0d5`

These defects were still present on the inherited F18 functional tip. They are **not** a new F18 campaign and do **not** reopen F18 concurrency.

| Defect | Observed on `ca2c0d5` |
| --- | --- |
| `record()` drops `thrown` | `processEvidence.thrown=true` but stored record has no `thrown` key after serialize |
| `processEvidence()` mutates streams after packaged hashes | path-redact stderr packaged sha `2be8fca3…` ≠ recovered after `secretsRemoved` sha `d300f71e…`; helper left `/file.sql` remainder + `DATABASE_URL`/`postgresql://` |
| `thrown:true` alone authorizes success | status 0 + T7 CLEAN_BASELINE + only `thrown:true` → `interpretedCommitted=true`, `processErrorPresent=false`, `processFailed=false`, `attestation.ok=true`, `genuineSuccess=true`, `finalization.ok=true` |

See `process-evidence/F18_DEFECTS.json`.

---

## Four F19 cases (independently executed on `dfbeb11`)

Chain: `runQualificationReset` transport → helper `processEvidence`/`record` → `JSON.stringify` → reread → `adaptStoredProcessRecordToParserInput` / interpret / attest / finalize.

Builder process-evidence files were **not** used as the recovered bodies below.

### 1. Real thrown EACCES

`spawnSync` against a mode-`0` helper produced a real `EACCES` (`code=EACCES`, syscall matches `/spawn/`, message matches `EACCES`).

| Field | This QA |
| --- | --- |
| `reread.thrown` | **true** |
| `structuredError.code` | `EACCES` |
| `structuredError.syscall` | `spawnSync [REDACTED_PATH]` |
| `structuredError.message` | `spawnSync [REDACTED_PATH] EACCES` |
| recovered stderr | `spawnSync [REDACTED_PATH] EACCES` |
| recovered stderr sha256 | `c4addd1a96d79a4a3cae4aacf2e4e298a16e3c9abd6f51b509e2c3b9b49587c2` |
| recovered stderr length | **32** |
| original stderr sha256 | `67ef16dd6c8df6ab5a3135357c7380b1f3a3cc868d8140b42e7bd20afa560307` |
| original stderr length | **51** |
| packaged stderr matches recovered | **true** |
| `interpretedCommitted` | **false** |
| `processErrorPresent` | **true** |
| `rolledBack` | **null** |
| success-claim attestation.ok | **false** |
| success-claim finalization.ok | **false** (`F18_ATTESTATION_INCONSISTENT`) |
| pathLeaks / secrets | 0 / 0 |

Original path identity ≠ sanitized body. Packaged hash/length match the recovered sanitized body.

**Disposition:** CLOSED.

### 2. Path-redaction stream

| Field | This QA |
| --- | --- |
| original stderr sha256 | `fbb170870a3748b00c847d63a5777c2f32d1345acd07f6d86378532e6cf1cf37` |
| original stderr length | **102** |
| packaged/recovered stderr sha256 | `7634adab7bf3ddaee21e72a24151a88c4b1e96c1d72f7e11bb095fb1872c70eb` |
| packaged/recovered stderr length | **73** |
| recovered stderr | `psql:[REDACTED_PATH] ERROR: boom [REDACTED]=[REDACTED]example.invalid/db\n` |
| original ≠ sanitized | **true** |
| packaged hash = recovered body | **true** |
| leftover original workdir / DATABASE_URL / postgresql:// | **absent** |
| pathLeaks / secrets | 0 / 0 |

**Disposition:** CLOSED.

### 3. Otherwise valid committed record with ONLY `thrown:true`

Status 0 + T7 CLEAN_BASELINE stdout + only `thrown:true`:

| Field | F18 `ca2c0d5` | F19 `dfbeb11` |
| --- | --- | --- |
| `interpretedCommitted` | true | **false** |
| `processErrorPresent` | false | **true** |
| `processFailed` | false | **true** |
| attestation.ok | true | **false** |
| genuineSuccess | true | **false** |
| finalization.ok | true | **false** |
| `rolledBack` | — | **null** |
| `reread.thrown` | dropped | **true** |

Status 0 / T7 / CLEAN_BASELINE cannot override explicit `thrown:true`.

**Disposition:** CLOSED.

### 4. Unchanged valid success still reparses/finalizes CLEAN_BASELINE

| Field | This QA |
| --- | --- |
| verdict | **CLEAN_BASELINE** |
| `interpretedCommitted` | **true** |
| `thrown` | **false** |
| `processFailed` | **false** |
| attestation.ok | **true** |
| `t7CommittedTrue` | **true** |
| finalization.ok | **true** |
| recovered stdout sha256 | `5e7654284c63718f55745d72700ccaa6051ac82e9efcc0ccfb20ffba61a4fadf` |
| recovered stdout length | **794** |
| recovered stderr sha256 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| recovered stderr length | **0** |
| packaged hashes match recovered | **true** |

**Disposition:** CLOSED.

---

## Preserve spot

| Check | This QA |
| --- | --- |
| F18 concurrency | **INHERITED PASSED — not re-run** |
| F18 cloud QA `bc-49cebacf-a8b4-5f38-9609-95ffe86d6adf` | **INHERITED** — not re-attributed as F19 |
| Bucket HOLDs | PASS (offline helper CLEAN_BASELINE_*_HOLD) |
| Read Committed + lock order documented | PASS |
| C4-R01–R04 | PASS |
| Wipe | `F3_WIPE_FORBIDDEN_FOR_STUB_LIVE_PIN_AUTH` |
| Migrations | unchanged vs start `1a4534c` (`supabase/migrations` diff empty) |
| Functional scripts | unchanged by this docs-only commit |
| Draft #118 | non-authoritative |

---

## Findings disposition

| Finding | Disposition |
| --- | --- |
| A final process-record integrity | **CLOSED** — sanitization completes before packaged hashes; `record()` preserves `thrown`; recovered bodies match packaged hashes/lengths; originals stay pre-sanitization |
| B thrown:true success path | **CLOSED** — interpretation, attestation, and finalization reject `thrown:true`; status 0 / T7 / CLEAN_BASELINE cannot override; `rolledBack` stays null where unproven |
| Hosted requalification | **HOLD** — not run |
| Production-equivalent replay | **HOLD by floor** — documented qualification fixture only |
| F18 concurrency | **INHERITED unchanged** — not re-run |

**P0 / P1 F19 local HOLD:** none.

---

## STOP

**F19 ACCEPT** on functional pin `dfbeb11b49f7e9b061a4c700e0335d125ac669e2`.

**Overall DAYBREAK HOLD — HOSTED REQUALIFICATION NOT RUN.**

Floor remains: DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT.

F18 concurrency remains INHERITED unchanged.
