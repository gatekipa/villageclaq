# M3 F3 Forward Implementation Summary — 2026-09-13 (external-ledger remediation)

**OVERALL VERDICT: EXTERNAL-LEDGER REMEDIATION PASS — post-COMMIT / pre-history failure+repair proved on the Management API file-stream equivalent; 00118–00123 SQL bytes unchanged**

This document **supersedes** the atomicity tip bound to `fc3d4ff` / `acd3b41`, the recognition-allowlist revision bound to `bb0c918` / `a983157`, and earlier 2026-09-12 evidence. The 14/14 suite remains SQL pre-commit rollback only (not CLI-equivalent).

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO F3-06 UI. NO PRODUCTION FINANCIAL WRITES. NO M4.**  
**FCG-1 IS NOT CLOSED.**

Draft PR: https://github.com/gatekipa/villageclaq/pull/84

## Pins

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Planning PR #83 (unchanged) | `a293f5958b31548ccec7591b653eff2857ae9a90` |
| **Functional SHA** | `968660d4e079ceb6c8d081be9f985597eaed0465` |
| Superseded functional SHA | `fc3d4ff8cb59ad09abdc07033cbfd20cec75e585` |
| Superseded evidence tip | `acd3b41bc04474cb9446e3d889c2b28425fdd901` |
| Also superseded | `bb0c918` / `a983157` |
| Prod migrations | 32; F3 objects ABSENT (not applied) |
| M2 | CLOSED dormant 0/0/0 |

## Atomicity fix

Generator strips the oracle's premature top-level `COMMIT` and emits the sole final `COMMIT` after HGP postconditions, owner pinning, grants/revokes, role-switch verification, and `RESET ROLE`. See `M3_F3_ATOMICITY_REMEDIATION_20260913.md`.

Recognition allowlist remains EXACTLY `manual_income`.

## Regenerated migrations

| File | SHA-256 |
|------|---------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `517774fd883ecc8c8ba7d2e287c7245a1289b21623c839f594b0801611968f3c` |
| `00119_f3_01_core_ledger_foundation.sql` | `9b09a733ed848e2a88a894db0815bd0f33f86335b58f7c9cd58845b6607d785d` |
| `00120_f3_02_secure_posting_idempotency.sql` | `4b870418ea15160a7aec0e6df707d9c8a3afc435f2d8bd1c861e0af7c47eb505` |
| `00121_f3_03_projection_read_proof.sql` | `568ae0b15b1b6e6c0a7effd9e9b5644a294cc22d76dbbf0e6714a28888825cf5` |
| `00122_f3_04_correction_reversal.sql` | `fd2c6e8729d1c7983421804b5f028edd16170c9f9056c8db2f3994f4dff8bdf9` |
| `00123_f3_05_opening_cash_command.sql` | `848b7cbe7e4e20e2e284d88f9954be0be8ffdfe4fc6d7c649e536d0c09aab699` |

## Fresh disposable qualification (this remediation)

| Suite | Result |
|-------|--------|
| Post-commit / pre-ledger failure+repair | **6/6 PASS** |
| External-ledger suite (incl. runner/runbook pins) | **9/9 PASS** |
| Failure-atomicity + retry (SQL pre-commit only) | **14/14 PASS** |
| Recognition direct | **40/40 PASS** |
| F3-01 DB | **43/43 PASS** |
| F3-02 DB | **159/159 PASS** |
| F3-02 Astra | **169/169 PASS** |
| F3-03 DB | **25/25 PASS** |
| F3-03 Astra | **80/80 PASS** |
| F3-04 DB | **23/23 PASS** |
| F3-04 Astra | **170/170 PASS** |
| F3-05 DB | **31/31 PASS** |
| F3-05 Astra | **118/118 PASS** |
| Post-S0 regression | **14/14 PASS** |
| Combined `npm run test:f3` | **895/895 PASS** |
| M2 static security | **9/9 PASS** |
| Cut 1 static | **11/11 PASS** |
| Cut 2 non-regression | **20/20 PASS** |
| Cut 3 storage buckets | **11/11 PASS** |
| `tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (dummy non-prod env; no production URL) |

## Disposable boundary

Greenfield replay of `00001`–`00117` on empty PG is **not clean**. Qualification uses stub + live pins + real `00117` + new `00118+`.

## Confirmations

- No F3-06 UI routes or opening-cash product UX
- No production apply / SQL / financial writes / storage mutation / queue insert / send / deploy
- No merge to main
- No Astra / Daybreak contact
- PR #83 unchanged
- Evidence tip is docs-only after functional SHA `968660d4e079ceb6c8d081be9f985597eaed0465`
- See `M3_F3_EXTERNAL_LEDGER_REMEDIATION_20260913.md`
