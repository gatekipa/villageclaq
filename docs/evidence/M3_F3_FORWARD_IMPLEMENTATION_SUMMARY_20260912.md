# M3 F3 Forward Implementation Summary — 2026-09-12

**OVERALL VERDICT: PASS — M3 F3-01…05 FORWARD FOUNDATION COMPLETE; DISPOSABLE QUALIFICATION PASS; READY FOR DAYBREAK + ASTRA IMPLEMENTATION REVIEW**

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
| **Functional SHA** | `a1e9311552a2698a8296e8f87eb1d000a5c259fe` |
| Superseded functional SHA | `90cae96593e223ba6a7001349c214bfbbc9c0bba` (pre-owner-pin) |
| Old F3 tip (REFERENCE ONLY) | `c7b4cd535d7125737eab2ec0fad27cae9432e8c3` |
| F2 | `a13b5e6c482e5e68ba2c92c41ae14b411668ae88` |
| F3 freeze | `4b9286d196650afeda92a8bb9625ec3b416381c8` |
| Master PRD PR #71 head | `050be86c9df3455c66b27bb5853eb786228b4009` |
| Prod migrations | 32; F3 objects ABSENT (not applied) |
| M2 | CLOSED dormant 0/0/0 |

## What shipped

Strategy C: **NEW sequential migrations after 00117**. No rebase/cherry-pick of old timestamp F3 history. `00001`–`00117` bytes untouched.

| File | Role | SHA-256 |
|------|------|---------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | Minimum epoch foundation (one event=one currency; immutable historical epoch; same-currency transfer; cross-currency DENY; no silent FX; S0-008 transfer RPCs left unchanged) | `e382fb033cf7f51a321cb2c84590d9375b49ec49d400f763ea4e08fe9d9d6697` |
| `00119_f3_01_core_ledger_foundation.sql` | F3-01 core ledger | `be20b1197ea5e971888357f05127ee8e4358af69ef6d63169b4c0fd560ad6269` |
| `00120_f3_02_secure_posting_idempotency.sql` | F3-02 posting / idempotency | `de8359d1d289933cf4d4f7d5970b2126e4e49373fe35b8fdfc7bbf89964bd499` |
| `00121_f3_03_projection_read_proof.sql` | F3-03 projections | `620f807c6119cc1ea14ef586b0b624350410bb513ef2c87fa96ec32bd0b29195` |
| `00122_f3_04_correction_reversal.sql` | F3-04 correction / reversal | `ea5daf5031170badc407aecbbc71af51b16b6dd38d08aee9caca7ec9f259b2e8` |
| `00123_f3_05_opening_cash_command.sql` | F3-05 opening cash **command only** | `f710844800794a5afaa9ae8adb7a143d14b0abc10d458b33947c87bbacae3191` |

Not replayed: `20260906140229_financial_payment_integrity.sql` (00104 / Cut 3 collision).  
Not replayed: `20260908043912_standing_confirmed_basis_parity.sql` (app `money.ts` already confirmed-basis; SQL standing gap is pre-existing; hotfix needs `ledger_epoch_id` columns this batch does not add).

## Disposable qualification

| Suite | Result |
|-------|--------|
| F3-01 DB | **43/43 PASS** |
| F3-02 DB | **158/158 PASS** |
| F3-02 Astra | **167/167 PASS** |
| F3-03 DB | **25/25 PASS** |
| F3-03 Astra | **80/80 PASS** |
| F3-04 DB | **23/23 PASS** (concurrent second DENY: exactly one success) |
| F3-04 Astra | **168/168 PASS** |
| F3-05 DB | **31/31 PASS** |
| F3-05 Astra | **118/118 PASS** (opening goldens **4/4**) |
| Post-S0 regression | **14/14 PASS** |
| M2 static security | **9/9 PASS** |
| Cut 1 static | **11/11 PASS** |
| Cut 2 non-regression | **20/20 PASS** |
| Cut 3 storage buckets | **11/11 PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** (dummy non-prod env; no production URL) |

Oracle expectation changes: **none** justified by S0/M2. Stub `memberships.is_proxy` was added so 00121 can read the current-main column (not an economics change).

## Security fingerprints (disposable)

- `has_group_permission` identity `(gid uuid, perm_key text, uid uuid)` DEFINER owner postgres `search_path=''` def MD5 `695368464e97297fbf0f90ce7345162f` / src `96a296dfd541c7fc75ec68c4da1d92ff` — **unchanged**
- Exactly one HGP overload; no 2-arg function
- `post_financial_command` / `correct_financial_event` / `post_financial_opening_cash`: DEFINER, owner **postgres**, `search_path=''`, EXECUTE **authenticated only** (anon/service_role/PUBLIC denied); grantor postgres
- Posted truth (`financial_events`, `financial_postings`): authenticated SELECT/INSERT/UPDATE/DELETE **false**
- F3 DEFINER owner drift (excluding HGP/enqueue): **empty**
- No F3 function inserts `notifications_queue`; enqueue pin unchanged

## Cut 1 / 2 / 3 / M2 regression

- Cut 1: CALL-only HGP; active membership SAFER OR UNCHANGED
- Cut 2: queue TABLE+COLUMN ACL live pin unchanged; no enqueue body change
- Cut 3: no storage helper/policy/receipt-parser tokens in 00118–00123
- M2: policy tables remain present and **dormant 0/0/0** after 00117+F3
- Contributions / payments / applications / relief / member-transfer stubs survive; `00082` RPCs not replaced

Greenfield replay of `00001`–`00117` on empty PG is **not clean** (historical `00030` unnest / `00061` parameter rename). That gap exists without F3. Qualification uses the S0/M2 method: stub + live pins + real `00117` + new `00118+`.

## FCG-1 readiness — NOT CLOSED

Manual natural key `(group_id, source_module, source_record_id, effect_kind, ledger_epoch)` is **PRESENT**.  
Shared occurrence identity across manual + module adapters remains **NEEDS_FCG1**.  
F3-06 / F3-07 / F3-08 / F3-09 are out of this PR.

See `docs/evidence/M3_F3_FCG1_READINESS_20260912.json`.

## Confirmations

- No F3-06 UI routes or opening-cash product UX
- No production apply / SQL / financial writes / storage mutation / queue insert / send / deploy
- No merge to main
- Evidence tip is docs-only after functional SHA `a1e9311552a2698a8296e8f87eb1d000a5c259fe`
