# Current status — VillageClaq F3 Daybreak qualification

**Status:** QUALIFIED / PASS — F3 FOUNDATION HOSTED REQUALIFICATION COMPLETE (candidate `e0c10c04d4bdc287385ea1392e1aae97b458fe1c`)  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
**This file is the current remainder record.** Historical packages are linked, not copied.

Working rules: [AGENTS.md](../AGENTS.md). Product conventions: [CLAUDE.md](../CLAUDE.md).  
Authoritative rebuild plan: [Master Rebuild PRD v1 (PR #71, commit `050be86c9df3455c66b27bb5853eb786228b4009`)](VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md).  
Approved local comparison contract: [LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1.md).  
Repair amendment: [REPAIR_AMENDMENT.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/REPAIR_AMENDMENT.md).  
Authorized local-capture record: [docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md).  
**Completed hosted requalification evidence:** [F24 hosted requalification](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/).

## Authorization (do not collapse these)

| Action | Status |
|--------|--------|
| **Local fingerprint comparison profile `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1`** | **Approved for local catalog comparison only.** Oracle `postgres` → local `ubuntu` in owner, grantor, and owner-self grantee only. Seven non-grantable `service_role` omissions on exactly `public.financial_ledger_epochs`, bound to sealed envelope `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a`. Does **not** map `authenticated` or `service_role`. Does **not** authorize repair or hosted equality. |
| **Local post-commit filename-version repair** | **Not mandatory** for local qualification. Atomic/pre-commit refusal remains fail-closed (`repairCalls=0`). Historical refusal not rerun. |
| **Hosted reset / hosted qualification (F24 fault-injection qualification)** | **QUALIFIED / PASS.** Clean preserve-reset committed (`QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`, `btree_gist` preserved, 0 history rows). Complete sequence 00118–00123 executed in `fault-injection` mode: all 15 safety gates passed, positive repair verified for all 6 migrations, retry verified with 0 pending, exact history identities recorded (6/6). Evidence: [F24 qualification package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/). |
| **Next active slice** | **F3-06 (Financial Configuration UI: Accounts, Funds, and Categories)** designated per Master PRD sequence. Merge/deploy to `origin/main` remains separately founder-controlled. |
| **Merge / deploy to `origin/main`** | **Not authorized** without explicit founder sign-off for release. |

## Authoritative build-plan reference

The authoritative Master Rebuild PRD reference is:
- **[Master Rebuild PRD v1](VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md)** on PR #71 at commit `050be86c9df3455c66b27bb5853eb786228b4009`.
- **Governing sequence:** M3 F3 Foundation (F3-01 through F3-05) is **QUALIFIED / PASS** and closed. Per Master PRD sequence (Section 26 / Section 29), the next active slice is **F3-06 (Financial Configuration UI: Accounts, Funds, and Categories)**.

Other linked artifacts:

| Artifact | Role |
|----------|------|
| [Master Rebuild PRD v1 (PR #71, `050be86c…`)](VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md) | **Authoritative rebuild plan.** Governs overall sequence, tenant safety, financial invariants, and slice boundaries. |
| [F24 hosted qualification evidence](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/) | **Completed qualification evidence.** All 6 migrations applied, faulted, repaired, and retried. |
| [F21 preserve-baseline contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_CONTRACT_20260919/) | Accepted contract for the preserve-`btree_gist` baseline. |
| [F23 local acceptance contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/) | Approved local comparison profile + local repair amendment. |

## Pins

| Role | Value |
|------|-------|
| F24 qualified functional tip | `e0c10c04d4bdc287385ea1392e1aae97b458fe1c` |
| F24 runtime closure SHA-256 | `25a45a329b13b06c50e5b7b1321ca85c81712fccc2c73fa5e13f2a929471d131` |
| F24 hosted requal evidence tip | [qualify-from-00118](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/) |
| Master Rebuild PRD commit | `050be86c9df3455c66b27bb5853eb786228b4009` (PR #71) |
| Authoritative PR | [#84](https://github.com/gatekipa/villageclaq/pull/84) OPEN DRAFT UNMERGED |
| Aligned PRs | #85 / #86 (same title, same head) |
| Non-authoritative | #126 / #127 |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |

## Hosted F24 qualification (2026-09-24) — QUALIFIED / PASS

| Field | Value |
|-------|-------|
| Outcome | **PASS** (`FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION`) |
| Exit code | `0` |
| Target | `jkorwnwwmdeflfntxntl` (strictly disposable; production `llbnliixczcqfftxpsmb` untouched) |
| Functional SHA | `e0c10c04d4bdc287385ea1392e1aae97b458fe1c` |
| Runtime closure SHA-256 | `25a45a329b13b06c50e5b7b1321ca85c81712fccc2c73fa5e13f2a929471d131` |
| Reset outcome | `status: OK`, `verdict: QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`, `btree_gist` preserved, 0 history rows |
| Qualification mode | `--verification-mode=fault-injection` across 00118 through 00123 |
| Migrations applied & repaired | 6/6: `00118_f3_bounded_financial_epoch_foundation.sql`, `00119_f3_01_core_ledger_foundation.sql`, `00120_f3_02_secure_posting_idempotency.sql`, `00121_f3_03_projection_read_proof.sql`, `00122_f3_04_correction_reversal.sql`, `00123_f3_05_opening_cash_command.sql` |
| Safety gates | 15/15 passed on all 6 migrations |
| Poison cleanup & probe | Proven absent across all 6 migrations |
| Retry status | 6/6 passed with 0 pending migrations |
| History identities | `finalHistoryIdentities.ok: true` (6/6 exact match in `supabase_migrations.schema_migrations`) |
| Runner counters | initialDbPushCalls=6, gateCalls=6, cleanupCalls=6, poisonProbeCalls=6, repairCalls=6, retryDbPushCalls=6, continuationAuthorizationCalls=6, continuationCalls=5, durableWritesVerified=18 |
| Package | [F24 hosted requalification evidence](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/) |

## Incomplete requirements & next active slice

1. **F3 foundation qualification (00118–00123)** — **CLOSED / QUALIFIED.** All 6 forward migrations applied, post-commit history failure injected, 15 safety gates passed, positive repair verified, staged retry verified, and catalog identities recorded in disposable database.
2. **Next active slice: F3-06 (Financial Configuration UI: Accounts, Funds, and Categories)** — Designated as the active work item per Section 26 and Section 29 of the Master Rebuild PRD (`docs/VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md`).
3. **Production migration release gate** — Production application remains separately founder-authorized after completion of F3-06…F3-09.

## Local versus hosted / production

| Surface | Status |
|---------|--------|
| Local profile | ACCEPTED under `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1` |
| Hosted disposable (`jkorwnwwmdeflfntxntl`) | **QUALIFIED / PASS** (`FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION`). 6/6 migrations applied and repaired. |
| Production (`llbnliixczcqfftxpsmb`) | Untouched. Forever denied from automated/disposable scripts. |
| Foundation milestone | **CLOSED** |

## Owner, next action, remaining review budget

| Field | Value |
|-------|-------|
| Owner | Jude Anyere |
| Next bounded action | Advance to **F3-06 (Financial Configuration UI: Accounts, Funds, and Categories)** per Master PRD sequence. |
| Permitted scope | F3-06 implementation. No direct mutation of production. |
| Remaining acceptance | F3-06 UI and configuration contracts. |

---
**QUALIFIED / PASS — F3 FOUNDATION HOSTED REQUALIFICATION COMPLETE**  
Candidate: `e0c10c04d4bdc287385ea1392e1aae97b458fe1c`  
Floor: `DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT`  
Next Slice: `F3-06 (Financial Configuration UI: Accounts, Funds, and Categories)`
