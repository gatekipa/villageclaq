# M3 F3 Forward Implementation Summary — 2026-09-13 (recognition remediation supersedes 2026-09-12)

**OVERALL VERDICT: REMEDIATION PASS — recognition denylist HOLD closed on draft PR #84; disposable qualification re-run for affected suites**

This document **supersedes** `M3_F3_FORWARD_IMPLEMENTATION_SUMMARY_20260912.md`.

**Prior recognition coverage claims in the 2026-09-12 evidence tip
`d5c045b7c329f1e4615d6b4d071abd4b357335dc` (bound to functional
`a1e9311552a2698a8296e8f87eb1d000a5c259fe`) were OVERSTATED and are superseded.**
The old `isRecognizedSoaIncome` used a denylist and defaulted unknown kinds to income.

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO F3-06 UI. NO PRODUCTION FINANCIAL WRITES. NO M4.**  
**FCG-1 IS NOT CLOSED.**

Draft PR: https://github.com/gatekipa/villageclaq/pull/84

## Pins

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Planning PR #83 tip | `a178068384290b37ec6c17b02428b399d52ddd10` |
| **Functional SHA** | `bb0c918201f4114303404a3498f312d9679c36cd` |
| Superseded functional SHA | `a1e9311552a2698a8296e8f87eb1d000a5c259fe` |
| Superseded evidence tip | `d5c045b7c329f1e4615d6b4d071abd4b357335dc` |
| Prod migrations | 32; F3 objects ABSENT (not applied) |
| M2 | CLOSED dormant 0/0/0 |

## Recognition fix

Allowlist is EXACTLY `manual_income`. Fail closed otherwise. See
`M3_F3_RECOGNITION_ALLOWLIST_REMEDIATION_20260913.md`.

## Frozen migrations (bytes unchanged)

| File | SHA-256 |
|------|---------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `e382fb033cf7f51a321cb2c84590d9375b49ec49d400f763ea4e08fe9d9d6697` |
| `00119_f3_01_core_ledger_foundation.sql` | `be20b1197ea5e971888357f05127ee8e4358af69ef6d63169b4c0fd560ad6269` |
| `00120_f3_02_secure_posting_idempotency.sql` | `de8359d1d289933cf4d4f7d5970b2126e4e49373fe35b8fdfc7bbf89964bd499` |
| `00121_f3_03_projection_read_proof.sql` | `620f807c6119cc1ea14ef586b0b624350410bb513ef2c87fa96ec32bd0b29195` |
| `00122_f3_04_correction_reversal.sql` | `ea5daf5031170badc407aecbbc71af51b16b6dd38d08aee9caca7ec9f259b2e8` |
| `00123_f3_05_opening_cash_command.sql` | `f710844800794a5afaa9ae8adb7a143d14b0abc10d458b33947c87bbacae3191` |

## Fresh disposable qualification (this remediation)

| Suite | Result |
|-------|--------|
| Recognition direct | **40/40 PASS** |
| F3-02 DB | **159/159 PASS** |
| F3-02 Astra | **169/169 PASS** |
| F3-04 DB | **23/23 PASS** |
| F3-04 Astra | **170/170 PASS** |
| Post-S0 regression | **14/14 PASS** |
| M2 static security | **9/9 PASS** |
| Cut 1 static | **11/11 PASS** |
| Cut 2 non-regression | **20/20 PASS** |
| Cut 3 storage buckets | **11/11 PASS** |
| `tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (dummy non-prod env; no production URL) |

F3-01 / F3-03 / F3-05 were **not** re-run this remediation (SQL unchanged;
recognition not referenced). 2026-09-12 counts for those suites are historical
only.

## Disposable boundary

Greenfield replay of `00001`–`00117` on empty PG is **not clean**. Qualification
uses stub + live pins + real `00117` + new `00118+`.

## Confirmations

- No F3-06 UI routes or opening-cash product UX
- No production apply / SQL / financial writes / storage mutation / queue insert / send / deploy
- No merge to main
- No Astra / Daybreak contact
- Evidence tip is docs-only after functional SHA `bb0c918201f4114303404a3498f312d9679c36cd`
