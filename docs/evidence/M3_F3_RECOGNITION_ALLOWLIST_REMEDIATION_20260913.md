# M3 F3 Recognition Allowlist Remediation — 2026-09-13

**VERDICT: REMEDIATION PASS**

**DO NOT MERGE.**  
**DO NOT APPLY 00118+ TO PRODUCTION.**  
**NO F3-06 UI. NO PRODUCTION FINANCIAL WRITES. NO M4.**  
**FCG-1 IS NOT CLOSED.**  
**NO CONTACT WITH ASTRA OR DAYBREAK.**

Draft PR: https://github.com/gatekipa/villageclaq/pull/84  
Branch: `feat/m3-f3-01-05-forward-foundation-9b17` (additive commits only; draft/unmerged)

## Supersession (explicit)

This evidence tip **supersedes**:

| Pin | Old SHA | Status |
|-----|---------|--------|
| Old functional | `a1e9311552a2698a8296e8f87eb1d000a5c259fe` | SUPERSEDED |
| Old evidence tip | `d5c045b7c329f1e4615d6b4d071abd4b357335dc` | SUPERSEDED |

**NEW functional SHA:** `bb0c918201f4114303404a3498f312d9679c36cd`  
All artifacts in this 2026-09-13 set bind to that functional SHA.

**Prior recognition coverage claims were OVERSTATED and are superseded.**  
`docs/evidence/M3_F3_02_RESULTS_20260912.json` claimed a recognition gate that
"pending/rejected/voided/relief-misapplied/dues assessment/opening arrears/
refundable/njangi/unconfirmed" were not SoA income. That claim described a
**denylist**. `isRecognizedSoaIncome` defaulted unknown/future/empty kinds to
**income** (`return !NON_INCOME.includes(kind)`). That is the Astra HOLD defect.
Those strings were never F3-02 `effect_kind` values. The old gate did **not**
prove fail-closed recognition.

## Pins

| Pin | Value |
|-----|-------|
| Base main | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| Planning PR #83 tip | `a178068384290b37ec6c17b02428b399d52ddd10` |
| **Functional SHA** | `bb0c918201f4114303404a3498f312d9679c36cd` |
| Superseded functional | `a1e9311552a2698a8296e8f87eb1d000a5c259fe` |
| Superseded evidence tip | `d5c045b7c329f1e4615d6b4d071abd4b357335dc` |
| Prod mutations | none |

## Final allowlist

`F3_RECOGNIZED_SOA_INCOME_EFFECT_KINDS = ['manual_income']`

`isRecognizedSoaIncome(kind)` is true **only** for exact string equality with
`manual_income`. Empty / whitespace (trim-then-empty still false) / malformed /
unknown / future kinds return **false**. No fuzzy match. No case fold. No trim
onto the allowlist.

Frozen F3-02 authority (oracle + 00120 posting command):

| Action | effect_kind | SoA income? |
|--------|-------------|-------------|
| money_in | `manual_income` | yes (`operating_income`) |
| money_out | `manual_expense` | no |
| transfer | `account_transfer` | no |
| opening | `opening_custody` | no |
| correction | `correction_reversal` | no |

No dues / fine / interest / relief module kinds were invented.

## Direct test matrix (`tests/finance/f3-recognition/recognition.test.mjs`)

| Input | Result |
|-------|--------|
| `manual_income` | true |
| `manual_expense` | false |
| `account_transfer` | false |
| `opening_custody` | false |
| `correction_reversal` | false |
| `correction_replacement` | false |
| `dues_allocation` | false |
| `loan_principal_repayment` | false |
| `relief_remittance` | false |
| `future_income_v2` | false |
| `pending` | false |
| `rejected` | false |
| `voided` | false |
| `relief_misapplied` | false |
| `dues_assessment` | false |
| `opening_arrears` | false |
| `refundable_deposit` | false |
| `njangi_contribution` | false |
| `unconfirmed` | false |
| `""` | false |
| `" "` / `"   "` / tab / newline / mixed whitespace | false |
| `"manual_income "` / `" manual_income"` / `"manual_income\\n"` | false |
| `MANUAL_INCOME` / `Manual_Income` / `manual-income` | false |
| `"manual_income\\0"` | false |
| `not_a_real_effect` / `arbitrary_unknown` | false |
| non-strings (`undefined`, `null`, numbers, bools, `{}`, `[]`, symbol) | false |

Plus F3-02 command binding (only `money_in` → true), identical money_in retry
(idempotent return does not invent income), and F3-04 reversal/replacement /
identical correction retry (not income).

**Recognition suite: 40/40 PASS** (fresh).

## Fresh disposable reruns (do not reuse old counts)

| Suite | Result | Notes |
|-------|--------|-------|
| Recognition direct | **40/40 PASS** | new focused suite |
| F3-02 Astra | **169/169 PASS** | was 167; +2 allowlist/retry proofs |
| F3-02 DB | **159/159 PASS** | was 158; +1 stored effect_kind vocabulary proof |
| F3-04 Astra | **170/170 PASS** | was 168; +2 reversal/retry proofs |
| F3-04 DB | **23/23 PASS** | SQL security unchanged |
| Post-S0 regression | **14/14 PASS** | stub + live pins + 00117 + 00118+ |
| M2 static security | **9/9 PASS** | |
| Cut 1 static | **11/11 PASS** | |
| Cut 2 non-regression | **20/20 PASS** | |
| Cut 3 storage buckets | **11/11 PASS** | |
| `./node_modules/.bin/tsc --noEmit` | **PASS** | |
| `npm run build` | **PASS** | dummy URL `https://example.invalid.supabase.local` — not production |

F3-01 / F3-03 / F3-05 DB+Astra were **not re-run**. Recognition is not referenced
there; 00118–00123 bytes are unchanged. Prior 2026-09-12 counts for those suites
remain historical only and are **not** restated as fresh.

## Frozen migration digests (unchanged)

| File | SHA-256 |
|------|---------|
| `00118_f3_bounded_financial_epoch_foundation.sql` | `e382fb033cf7f51a321cb2c84590d9375b49ec49d400f763ea4e08fe9d9d6697` |
| `00119_f3_01_core_ledger_foundation.sql` | `be20b1197ea5e971888357f05127ee8e4358af69ef6d63169b4c0fd560ad6269` |
| `00120_f3_02_secure_posting_idempotency.sql` | `de8359d1d289933cf4d4f7d5970b2126e4e49373fe35b8fdfc7bbf89964bd499` |
| `00121_f3_03_projection_read_proof.sql` | `620f807c6119cc1ea14ef586b0b624350410bb513ef2c87fa96ec32bd0b29195` |
| `00122_f3_04_correction_reversal.sql` | `ea5daf5031170badc407aecbbc71af51b16b6dd38d08aee9caca7ec9f259b2e8` |
| `00123_f3_05_opening_cash_command.sql` | `f710844800794a5afaa9ae8adb7a143d14b0abc10d458b33947c87bbacae3191` |

## Disposable boundary (disclosed; not clean greenfield)

Qualification uses **stub + live Cut 2 HGP/enqueue/queue pins + real 00117 + new 00118+**.  
Greenfield replay of `00001`–`00117` on empty PG is **not clean** (historical
`00030` unnest / `00061` parameter rename). That gap exists without F3. This
remediation does not claim a clean 00001–00117 greenfield.

Disposable Postgres: `17.11 (Ubuntu 17.11-1.pgdg24.04+2)`.  
Production URL `llbnliixczcqfftxpsmb` was **not** used.

## Confirmations

- No production apply / merge / deploy / DB writes / notifications
- No Astra or Daybreak contact
- 00118–00123 bytes identical to frozen digests
- No F3-06+ UI and no M4
- Additive commits only; draft PR #84 unmerged
