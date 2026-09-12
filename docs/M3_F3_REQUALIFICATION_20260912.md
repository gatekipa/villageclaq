# M3 / F3 POST-S0 / POST-M2 REQUALIFICATION

**Date:** 2026-09-12  
**Branch:** `docs/m3-f3-requalification-20260912`  
**Kind:** Planning + evidence only. No product implementation.

---

## OVERALL VERDICT

**PASS — M3/F3 REQUALIFICATION COMPLETE; READY FOR FOUNDER M3 IMPLEMENTATION DECISION**

This verdict means the requalification *package* is complete and evidence-backed. It does **not** mean previously shipped F3-01…F3-05 SQL can be merged or applied as-is.

| Decision | Recommendation |
|---|---|
| Can F3-01…05 be safely carried onto current main *as the old integration tip*? | **NO** |
| Merge `codex/f3-core-ledger-foundation` (`c7b4cd53…`)? | **NO** |
| Rebase old F3 onto main? | **NO** |
| Apply any old F3 migration to production / any live DB? | **NO** |
| Carry-forward strategy | **C — safer bounded approach** |
| F3-01…05 contract economics | Keep / frozen (F2 + freeze + Master PRD D-002) |
| F3-01…05 *files* on old tip | Candidate evidence + oracles only |
| Next product work if Founder authorizes | New forward migrations **after** `00117`, then F3-06 → F3-07 → **FCG-1** → F3-08 → F3-09 |
| Proposed future implementation branch (**do not create in this run**) | `feat/m3-f3-01-05-forward-foundation` from exact `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |

**Why not HOLD on the package:** every baseline pin verified; S0 COMPLETE and M2 CLOSED dormant on current main; collisions, SoA, Cut 1, money/notification, and FCG-1 gates are documented; Founder has a bounded path.

**Why not VALID AS-IS for the old SQL:** old tip is diverged (19 ahead / 61 behind), uses timestamp filenames that must not be inserted behind `00117`, depends on pre-F3 P0/P1 migrations that collide with `00104` / `00114`–`00117` (especially Cut 3 storage), and is not present on current main.

---

## Baseline pins (R28) — verified this run

| Pin | Required | Observed | Status |
|---|---|---|---|
| Current `origin/main` | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` | Exact match (PR #82 merge, M2) | **PASS** |
| Production migrations | 32 (do not apply anything) | Chief pin recorded; this run did **not** query or mutate live DB. Source trail: Cut 2 live inventory 29 → Cut 3 pre-apply 30 → +`00116`+`00117` ⇒ 32 | **PIN ACCEPTED — Chief live confirm** |
| S0 | COMPLETE (Cuts 1–3) | `00114`, `00115`, `00116` on main | **PASS** |
| M2 | CLOSED dormant (policy/trigger/occurrence rows 0) | `00117` on main; `docs/evidence/M2_DORMANCY_PROOF_20260912.json` | **PASS** |
| Old F3 integration tip | `c7b4cd535d7125737eab2ec0fad27cae9432e8c3` | Exact match | **PASS** |
| F3 ticket freeze PR #60 | `4b9286d196650afeda92a8bb9625ec3b416381c8` | Open draft; 1 file; not merged | **PASS** |
| F2 design SHA | `a13b5e6c482e5e68ba2c92c41ae14b411668ae88` | Commit present; `docs/VILLAGECLAQ_F2_CANONICAL_FINANCIAL_DOMAIN_DESIGN.md` | **PASS** |
| Master Rebuild PRD | PR #71 (docs) | Open draft; head `050be86c9df3455c66b27bb5853eb786228b4009`; Security Rev 1 `1430d1c52f10edf690b50304ec536f8f019e0372` | **PASS** |
| Historical unit PRs | #61–#65 merged **only** into old integration branch | Confirmed: base `codex/f3-core-ledger-foundation`; not on main | **PASS** |
| Old tip vs main | ~19 ahead / ~61 behind | `git rev-list --left-right --count origin/main...origin/codex/f3-core-ledger-foundation` = **61 / 19**; merge-base `ba479fb510343c37cdfa888f6e94aeb7ab07292f` | **PASS** |

**No baseline drift. HOLD-if-drift clause is not triggered.**

---

## Executive answer

Previously qualified F3-01…F3-05 **cannot** be treated as already-on-main KEEP/FROZEN artifacts. Current main is a post-S0 / post-M2 financial *subledger* (contributions, payments, applications, standing, module finance) with **zero** F3 ledger objects (`financial_events`, `financial_postings`, `financial_accounts`, `financial_funds`, `financial_categories`, `financial_core`, `financial_private`, posting/correction/opening RPCs).

The **contracts** (F2 SHA, PR #60 freeze, Master PRD D-002 / Security Revision 2) remain authoritative. The **old implementation files** remain high-quality candidate evidence. The **safe path** is Strategy C: replay *semantics* as **new sequential migrations after `00117`**, on a fresh branch from exact current main, then requalify in disposable PostgreSQL against the current Cut 1/2/3 + M2 floor. Do not merge, rebase, or apply the old tip.

Controlling product order after that foundation exists:

```
F3-06 → F3-07 → FCG-1 → F3-08 → F3-09
```

Do not skip FCG-1. Do not collapse 06–09 into one implementation batch. Do not start M4.

---

## R1 — Current main financial inventory

Canonical money engine on main is **app-side** `src/lib/money.ts` (confirmed payments only). There is no double-entry ledger.

| Domain | Current-main truth |
|---|---|
| Contributions / dues | `contribution_types`, `contribution_obligations`; trigger `generate_obligations_for_type`; statuses pending/partial/paid/overdue/waived |
| Payments | `payments` + `status` (00023) + `payment_date` + `relief_plan_id`; confirm/reject on history |
| Applications | `payment_obligation_applications` (00079); app cascade in `useRecordPayment` / `allocateConfirmedToObligations` |
| Balances | Derived in `money.ts` / `use-money-overview.ts` — not stored GL accounts |
| Standing | `calculateStanding()` + SQL `compute_member_standing` (00101); dues rule is confirmed-basis in TS |
| Fines | `fines`, `fine_types`; `fine_rules` **table dropped** (00034) |
| Loans | `loan_configs`, `loans`, `loan_schedule`, `loan_repayments` |
| Relief | plans, enrollments, claims, payouts, remittances; `get_relief_branch_summary` |
| Njangi | `savings_cycles`, `savings_participants`, `savings_contributions` |
| Transfers | `member_transfers` + RPCs (00082); `sub_group_transfers`; relief remittances |
| Reports | 24-report hub; financial 1–5 + loans 21–23 are **dues/module** reports, not F3 SoA |
| Finance RPCs | obligation/payment/standing/relief/transfer/Cut 1–3/M2 helpers — **no** `post_financial_command` |
| Permissions | `finances.record\|manage\|view`, `contributions.manage`, `reports.view\|export`, `relief.manage`, `savings.manage` |
| Storage | private `receipts` + `group-documents`; Cut 3 `storage_receipts_authorized` |
| Money notification producers | Cut 2 `enqueue_outbound_notification` for receipt/reminder/standing/loan/fine/relief/remittance |
| Finance migrations on main | 00002…00104…00117 (see evidence JSON). **No** `20260906*`–`20260910*` F3 files |

Full machine inventory: `docs/evidence/M3_CURRENT_FINANCIAL_ARCHITECTURE_20260912.json`.

---

## R2 — Production financial object expectations

This run inventories from **source + historical evidence**. Chief will run live read-only prod queries.

**Expected PRESENT in production (legacy subledger):**  
`contribution_types`, `contribution_obligations`, `payments`, `payment_obligation_applications`, `group_payment_config`, loan/fine/relief/savings/transfer tables, `notifications` / `notifications_queue`, standing helpers.

**Expected ABSENT in production (F3-01…05 objects — do not create this run):**  
`financial_ledger_epochs`, `financial_private.*`, `financial_core.*`, `financial_accounts`, `financial_funds`, `financial_categories`, `financial_events`, `financial_postings`, `posting_command_payloads`, `correction_command_payloads`, `opening_provenances`, RPCs `post_financial_command`, `get_financial_projection_bundle`, `get_financial_cashbook`, `correct_financial_event`, `post_financial_opening_cash`, `apply_payment_command`.

**M2 if `00117` is among the 32 applied:** tables exist, **0 rows**, `enabled` default false, no enqueue/send path.

**If Chief’s live query finds any F3 ledger object or any policy/occurrence activation:** HOLD implementation — that is drift vs this package.

---

## R3 — Every migration on the old F3 integration line

Eight SQL files exist on `origin/codex/f3-core-ledger-foundation` and **none** exist on current main. SHA-256 is of `git show` file bytes.

| Order | Ticket | Filename | SHA-256 | Predecessor |
|---|---|---|---|---|
| 1 | P0-pre-F3 epochs | `20260906140228_financial_ledger_epochs_expand.sql` | `524e46d943c825b90049f29a49709f8f2862c4e2cb28b60a50887d6d8d624bce` | live 00001–00113 |
| 2 | P1-pre-F3 payment integrity | `20260906140229_financial_payment_integrity.sql` | `7b4cdc97b42f753b793dd109cfe8efd40753f15d2c75895a180d031501999e99` | epochs |
| 3 | P0 standing hotfix | `20260908043912_standing_confirmed_basis_parity.sql` | `c2ac61485e7ec50f86fc39fb6b38f8f0fa7959c08e519d53c499ad2b98b27f31` | payment integrity |
| 4 | **F3-01** | `20260908154824_f3_core_ledger_foundation.sql` | `51c5ba071a8f978c60e97356058e2bf4a2ed637aca1b06629913b0361af14103` | epochs (composite FK) |
| 5 | **F3-02** | `20260908215831_f3_secure_posting_idempotency.sql` | `9a4a53b7abb838b660198569a42fcfc8ac6ad606e8aeb7374451959fac8ae063` | F3-01 |
| 6 | **F3-03** | `20260909022633_f3_projection_read_proof.sql` | `a89e4ee9a12223be8eafd65d0fa1822fee2d69056fead7f99418079d4e2fce6e` | F3-02 |
| 7 | **F3-04** | `20260909054500_f3_correction_reversal.sql` | `e237f21fbfad2a4c34be68a7c7ad0ad1b51328ed46d02fb75e393b45de92541f` | F3-02 |
| 8 | **F3-05** | `20260910054713_f3_opening_cash.sql` | `2c0134dc5f10cd8609fb46a114e3b34d8ac8063136211551ca40173d7568aaae` | F3-02 opening envelope |

**Filename / version collision vs `00114`–`00117`:** none (timestamp vs sequential).  
**Object collision:** yes — see R4 and the collision matrix.  
**Notifications / M2 objects in any of the eight:** **none**.

Full signatures, GRANTs, RLS, deps: `docs/evidence/M3_F3_MIGRATION_COLLISION_MATRIX_20260912.json`.

---

## R4 — Migration lineage reconciliation (safe forward strategy)

**Forbid:** renaming old files, rewriting history, inserting timestamp versions behind `00117`, merging the old tip, applying old SQL to prod.

**Required:** NEW forward migrations only, next free sequential number after `00117` (expected `00118+`), authored in a *future* implementation run — **not this run**.

| Old artifact | Forward strategy |
|---|---|
| P0 epochs | **Adapt** a minimal `financial_ledger_epochs` (or equivalent) so F3-01 composite FKs can exist. Do **not** blindly replay transfer-RPC replacements without Cut 1 / S0-008 review. |
| P1 payment integrity | **DO NOT REPLAY.** SCHEMA COLLISION with `00104` (drops/replaces `on_payment_changed`) and HIGH collision with `00116` restrictive receipt policies + `can_access_payment_receipt` vs `storage_receipts_authorized`. `apply_payment_command` is F0/P1, not F3-01…05. |
| Standing hotfix | Re-evaluate vs `00101` + `money.ts` + `00104` intent. Do not replace standing bodies unless a disposable proof shows confirmed-basis gap remains. |
| F3-01…05 | Recreate as new `00118+` files from frozen contracts; use old SQL as oracle. Preserve SECURITY DEFINER `search_path=''`, authenticated-only public RPCs, revoke `service_role` on private command impl, occurrence unique key, advisory locks, balanced deferrable guards. |

Recommended future apply order on a disposable DB that already has current main through `00117`:

1. Bounded epoch foundation (adapted)  
2. F3-01 schema / RLS / lock hook  
3. F3-02 posting + idempotency  
4. F3-03 projection  
5. F3-04 correction  
6. F3-05 opening command (no UX)  
7. **Stop.** F3-06 is UI on that floor.

---

## R5–R9 — F3-01…05 requalification

Classification vocabulary: `VALID AS-IS` | `VALID WITH COMPATIBILITY ADAPTATION` | `SUPERSEDED` | `SECURITY CONFLICT` | `SCHEMA COLLISION` | `PRD CONFLICT` | `CANNOT CONFIRM`.

| Ticket | Overall | Notes |
|---|---|---|
| **F3-01** | **VALID WITH COMPATIBILITY ADAPTATION** | Schema/RLS/lock-hook contracts match F2 §§3–4, 8–16, 21.1. Not as-is: missing epoch predecessor on main; new filename required; `UNIQUE (memberships.id, group_id)` add must be proven on live shape. Auth already requires `membership_status='active'` **and** `has_group_permission` — Cut 1 makes the helper itself active-gated (**SAFER OR UNCHANGED**). |
| **F3-02** | **VALID WITH COMPATIBILITY ADAPTATION** | `public.post_financial_command(jsonb)` authenticated-only; `financial_core.post_f3_command` has **no** EXECUTE grant; opening rejected on public RPC; no notification I/O. Must be re-hosted after adapted F3-01 + Cut 1 helper pin. |
| **F3-03** | **VALID WITH COMPATIBILITY ADAPTATION** | Projection RPCs + revoke raw SELECT on events/postings. SoA-lite invariants still match D-002 / Rev 2 (must be re-proven, not assumed). Blocks F3-07 until re-qualified on current main. |
| **F3-04** | **VALID WITH COMPATIBILITY ADAPTATION** | Append-only reversal + optional replacement; arithmetic `+500 − 500 + 450 = 450`. Contract VALID; files need forward port. |
| **F3-05** | **VALID WITH COMPATIBILITY ADAPTATION** + **PRD CONFLICT (UX only)** | Opening command semantics remain valid (custody vs opening-position; not period income). Master PRD **D-007**: do **not** expose opening creation in F3-07 until remediation path is qualified. Command may exist; UX must stay hidden. |

**No piece is VALID AS-IS as a file to apply on current main.**  
**No SECURITY CONFLICT** found that *weakens* Cut 1 (F3 write RPCs already require active membership + `finances.manage`).  
**P1 payment integrity** (not an F3-01…05 ticket, but on the old line) is **SCHEMA COLLISION** and partly **SUPERSEDED** by `00104` + `00116`.

Detail: `docs/evidence/M3_F3_01_05_RECONCILIATION_20260912.json`.

---

## R10 — Cut 1 active-authorization compatibility

F3-01 helpers:

```
financial_core.can_manage_finances / can_view_finances / assert_finances_manage
  → auth.uid() present
  → membership_status = 'active'
  → has_group_permission(..., 'finances.manage'|'finances.view', uid)
```

`00114` rewrites `has_group_permission` to also require active membership (and pins body MD5). Combining them is **defense in depth**.

**Verdict: SAFER OR UNCHANGED.** Weaker = HOLD — not observed.

Forward-port rule: F3 migrations must **CALL** `has_group_permission`, never `CREATE OR REPLACE` it. `00117` re-pins the same helper after M2 DDL.

---

## R11 — M2 isolation

Old F3 SQL creates **zero** `notification_policies` / `notification_policy_triggers` / `notification_policy_occurrences` rows or writers. It does not enqueue, drain, or enable channels.

Current main `00117` is dormant (0 rows immediately after apply in disposable proof). Forward F3 must keep that isolation: no policy activation, no occurrence DML from finance RPCs, no producer cutover.

**Verdict: PASS — isolated.**

---

## R12 — Money / notification separation

No F3-01…05 public RPC sends WhatsApp, SMS, or email, or inserts `notifications_queue`.

Trusted Cut 2 producers on current main (finance-adjacent): payment_receipt, payment_reminder, standing_changed, loan_approved, loan_overdue, fine_issued, relief_enrollment, relief_claim_*, remittance_*. Those remain the only outbound money-notification path. F3 commit ≠ notify (P-013, UX-002, F0 P1 closure).

**Forward ban:** F3 RPCs must not call `enqueue_outbound_notification` or insert queue/in-app notifications. M11 owns later domain migration.

---

## R13 — Cash-basis SoA contract (frozen)

Authority: F2 §5 / §5.1 / §18.1 at `a13b5e6c…` + Master PRD D-002 + Security Revision 2 (F4-002 / FCG-1).

| Occurrence | SoA / ledger effect |
|---|---|
| Dues assessment / obligation create | **Not** income; **not** journal AR |
| Confirmed non-refundable dues cash | Income + custody **once** at confirmation |
| Unapplied portion of that receipt | Operational **allocation credit** only — not liability, not second income on later allocation |
| Refundable / conditional unapplied | Liability / member credit until recognized or refunded |
| Pending / rejected / voided | Never SoA income (P1-C) |
| Fine assessment | Not income; payment is income + cash |
| Loan principal disburse / repay | Receivable ↔ custody; **never** income/expense |
| Loan interest | Income + cash |
| Njangi member money | Custody + liability; not association income; payout is liability ↓ + cash ↓ |
| Relief confirmed non-refundable owner receipt | Restricted income once (R-009); remittance does **not** recognize again |
| Internal transfer | Never SoA income/expense |
| Opening cash | Custody vs opening-position; **not** period income |
| Correction | Original + exact reversal + optional replacement **all** remain in arithmetic |

Current main **does not implement** this SoA (no ledger). App `money.ts` already treats confirmed cash as collection truth for *dues position*, which is compatible **input** for a future F4 adapter — it is not a substitute F3 SoA.

---

## R14 — FCG-1 reconciliation matrix (before F3-08/09)

FCG-1 is a **gate**, not a redesign license. It is **absent** from PR #60 and **required** by PR #71 §10 / Rev 2.

Status of each proof **as of this requalification** (pre-implementation):

| Proof | Status now | When it can close |
|---|---|---|
| D-002 matches frozen F2/F3 | Contract aligned; **not implemented** on main | After F3-03 re-qual + F3-08 labels |
| Dues assessment ≠ income/AR | Contract aligned; main has no journal | After F3-01…03 forward + explicit non-post on obligation create |
| Non-refundable unapplied = allocation credit | Rev 2 normative; old F3 oracles assume it; **NEEDS FCG-1 evidence** | After F3-02 templates + F4-002 fixture (may be FCG-1, not F3-07) |
| Later allocation ≠ second income/custody/occurrence | **NEEDS FCG-1** | Shared occurrence identity + F4 adapter (M5) — document the invariant in M3 even if adapter is later |
| Refundable unapplied = liability | Contract aligned; **NEEDS FCG-1** | F3-02 template + tests |
| Loan principal never income/expense | Frozen; F3 manual path must not offer it as Money In/Out income | F3-07 taxonomy + F5 later |
| Njangi custody/liability | Frozen; no F3 Njangi product | F3-07 must not mis-classify |
| Relief no double income | R-009; remittance ≠ second income | FCG-1 doc + M7 activation |
| Mixed-currency reject | F3-02 already same-currency; keep | Re-qual on current main |
| One occurrence, two paths | **MISSING** as a shared table across manual + module | **NEEDS FCG-1** before F3-08/09 freeze |

Matrix: `docs/evidence/M3_FCG1_RECONCILIATION_MATRIX_20260912.json`.

---

## R15 — Economic occurrence identity

P1-B key (F2 §9): `(group_id, source_module, source_record_id, effect_kind, ledger_epoch)`.

| Surface | Status on current main | Status on old F3 tip |
|---|---|---|
| Manual F3 posting identity | **MISSING** | **PRESENT** (unique + advisory lock + fingerprint) |
| Correction child identity | **MISSING** | **PRESENT** (v5 UUID + lineage) |
| Opening provenance identity | **MISSING** | **PRESENT** |
| Shared manual+module occurrence | **MISSING** | **NEEDS FCG-1** (F3 unique is ledger-side only) |
| Dues payment identity | payments.id / request patterns; **not** F3 source tuple | P1 `apply_payment_command` — do not replay |

---

## R16–R20 — F3-06 / 07 / 08 / 09 contracts (no implementation)

See `docs/evidence/M3_F3_06_09_SCOPE_MATRIX_20260912.json` and ASTRA gate.

| Ticket | Owner (freeze) | Objective | Hard deps | Hard bans |
|---|---|---|---|---|
| **F3-06** | Builder + Astra/Daybreak review | Accounts / Funds / Categories settings. Archive not delete. No balance edit. Currency immutable in place. | Forward F3-01…05 + ASTRA UX GATE + Founder auth | CoA builder; posting-line builder; fund-reallocation UI; Record Transaction |
| **F3-07** | Astra | Treasurer Money In / Out / Transfer calling **only** F3-02. Confirm account+fund. EN/FR, `formatAmount`, mobile. Durable request id; replay-time auth. | F3-02+03 **re-qualified**, F3-04, F3-06; F3-03 is a hard gate | Reuse `contributions/record` as org ledger writer; opening UX (D-007); debit/credit; JS float authority; notify-before-commit |
| **FCG-1** | Reconciliation gate | Close R14 proofs | After F3-07, **before** F3-08/09 | Skip; redesign F3-01…05 |
| **F3-08** | Astra | Account Balance, Fund Cash / Net Position, cashbook, cash-basis SoA, cash movement. Scope/period/currency/correction/opening labels. | FCG-1 PASS + F3-03 engine | Treat reports 1–5 as org SoA; contribution-only dashboard as org truth |
| **F3-09** | Builder fixtures under Astra | A–O + USD foundation 9,250 / 1,000 / 10,250 / income 450 / expense 200 / GF 10,000 / RF 250 + PRD recovery/scale | F3-08 UI + opening command + correction | Wholesale F4/F5 |

---

## R17 — ASTRA UX GATE (read-only)

**Status: ASTRA GATE NOW DUE** (S0 COMPLETE; this gate constrains F3-06/07/08).

Fresh review of current main design system + finance IA is in `docs/evidence/M3_ASTRA_UX_GATE_20260912.md`.

Headline constraints:

1. Current `/dashboard/finances` and reports 1–5 are **dues/contribution** surfaces. Do not silently promote them to F3 org truth.  
2. `/dashboard/contributions/record` stays the dues subledger writer until F4. F3-07 is a **new** Record Transaction surface.  
3. Accounts / Funds / Categories **do not exist** in IA today. F3-06 introduces them as settings (custody / purpose / classification) — not a chart-of-accounts builder.  
4. Sidebar `sectionMoney` today: Contributions, Finances, Loans. F3-06/07/08 must extend this without collapsing Njangi/Relief/Fines into “Money In”.  
5. Mobile-first 375px, EN/FR via `t()`, dark `dark:` tokens, `formatAmount()`, `PermissionGate` / `RequirePermission` — already platform law; F3 UI inherits them.  
6. Opening-Adjustment is **not** offered in F3-07 (D-007).  
7. F3-08 reports are additive foundational projections; they must not overwrite Who Hasn’t Paid / Contribution Ledger / Arrears as if those were SoA.

---

## R21 — Old harness requal

Historical results (PR bodies #61–#65; oracles on old tip only):

| Suite | Historical |
|---|---|
| F3-01 DB | 43/43 |
| F3-02 Astra oracle | 167/167 |
| F3-02 DB | 158/158 |
| F3-03 Astra | 80/80 |
| F3-03 DB | 25/25 |
| F3-04 Astra | 168/168 |
| F3-04 DB | 23/23 |
| F3-05 Astra | 118/118 |
| F3-05 DB | 31/31 |
| Opening goldens | 4/4 |
| Bounded F0 (various PRs) | 61–82 / same |

Those results were earned on the **old** migration chain (`20260906140228` → `20260910054713`) against product base `99e17e2…`, **not** current main + `00114`–`00117`.

**This run did not re-execute harnesses** (optional only if safe/local disposable; skipped to keep production/live DB untouched).

New matrix: `docs/evidence/M3_F3_REQUALIFICATION_TEST_MATRIX_20260912.json` — must run later on disposable PG 17 with current-main migrations through `00117` + **new** forward F3 files.

---

## R22 — Old integration branch disposition

| Option | Meaning | Recommendation |
|---|---|---|
| **A** salvage/replay old tip onto a fresh branch from current main | Cherry-pick/merge 19 commits / 8 SQL files | **Reject as primary.** P1 vs `00104`/`00116` is unsafe; timestamp versions cannot follow `00117` cleanly. |
| **B** recreate equivalent forward from frozen contracts only | Ignore old SQL | Acceptable but slower; discards proven oracles. |
| **C** safer bounded approach | Fresh branch from `d83d13d4…`; new `00118+` migrations; old SQL + `tests/finance/f3-0*` as oracles; exclude P1 overlays; re-qual Cut 1/2/3/M2 floor | **SELECT C** |

**Old integration branch merge recommended = NO.**

Keep `codex/f3-core-ledger-foundation` @ `c7b4cd53…` frozen as evidence. Do not add commits to it for product.

---

## R23 — Future M3 base

Exact current main: **`d83d13d4fe9915a0d1ff149ce29a53ad708c9853`**.

If `origin/main` moves before Founder authorization, **re-pin and re-check R10–R12** before any F3-06 work. Do not silently retarget.

---

## R24–R26 — This-run attestations

| Attestation | Value |
|---|---|
| Production mutation | **ZERO** |
| Financial writes | **ZERO** |
| New SQL migration authored | **NO** |
| UI implementation | **NO** |
| Runtime files added | **NO** |
| Old F3 branches merged / rebased | **NO** |
| PR #60 / #71 merged as product | **NO** (contract reference only) |
| M4 started | **NO** |
| Disposable harness executed | **NO** (optional; skipped) |
| Live DB queried | **NO** |

---

## R27 — PR #60 / #71

Contract reference only. Not merge targets for this run. Not product changes.

- PR #60: ticket freeze; F3-01…09 catalog; P1-A–H unchanged.  
- PR #71: Master Rebuild PRD v1 + Security Revisions; inserts **FCG-1**; D-002 cash-basis; D-007 opening UX hide.

---

## Preconditions

### Before F3-06

1. Founder M3 implementation authorization.  
2. Strategy C accepted (no old-tip merge).  
3. New forward F3-01…05 (+ bounded epoch) authored **after** `00117` and disposable-qualified on current-main floor.  
4. Cut 1 compatibility re-proven SAFER OR UNCHANGED (must not replace `has_group_permission`).  
5. M2 remains dormant; F3 RPCs still have zero notification I/O.  
6. ASTRA UX GATE recommendations accepted (this package).  
7. P1 payment-integrity overlays **not** replayed; Cut 3 receipt helper remains `storage_receipts_authorized`.  
8. Base SHA still `d83d13d4…` or a documented successor pin.

### Before F3-07

1. F3-06 shipped (settings; no balance edit; inactive/archived accounts not offered).  
2. F3-03 projection/read proof **re-passed** on current main (F3 freeze: Slice 7 blocked on Slice 3).  
3. F3-02 posting+idempotency re-passed (including lock-wait revocation).  
4. F3-04 correction command available (even if UX is later).  
5. F3-05 command may exist; **opening creation hidden** (D-007).  
6. New Record Transaction route exists in plan — not a silent reuse of `contributions/record`.  
7. Durable request identity + replay-time auth designed (PRD F3-07).  
8. FCG-1 **not** skipped; it still sits after F3-07.

### Before F3-08 / F3-09

FCG-1 PASS on the matrix in R14. Do not freeze reports as canonical org truth before that gate.

---

## Proposed future implementation branch name

**Do not create in this run.**

`feat/m3-f3-01-05-forward-foundation`

From: `d83d13d4fe9915a0d1ff149ce29a53ad708c9853`  
Then, only after that floor is qualified: `feat/m3-f3-06-account-fund-category-settings`

---

## Deliverables

| Path | Role |
|---|---|
| `docs/M3_F3_REQUALIFICATION_20260912.md` | This narrative + verdict |
| `docs/evidence/M3_CURRENT_FINANCIAL_ARCHITECTURE_20260912.json` | R1 inventory |
| `docs/evidence/M3_F3_01_05_RECONCILIATION_20260912.json` | R5–R13 |
| `docs/evidence/M3_F3_MIGRATION_COLLISION_MATRIX_20260912.json` | R3–R4 |
| `docs/evidence/M3_FCG1_RECONCILIATION_MATRIX_20260912.json` | R14–R15 |
| `docs/evidence/M3_F3_06_09_SCOPE_MATRIX_20260912.json` | R16–R20 |
| `docs/evidence/M3_F3_REQUALIFICATION_TEST_MATRIX_20260912.json` | R21 |
| `docs/evidence/M3_ASTRA_UX_GATE_20260912.md` | R17 |

---

## Chief report fields (55)

| # | Field | Value |
|---|---|---|
| 1 | Current main SHA | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| 2 | Production migrations (pin) | 32 — not applied to / not mutated this run |
| 3 | S0 status | COMPLETE (Cuts 1–3 on main) |
| 4 | M2 status | CLOSED dormant (0 policy/trigger/occurrence rows in proof) |
| 5 | Old F3 tip | `c7b4cd535d7125737eab2ec0fad27cae9432e8c3` |
| 6 | PR #60 SHA | `4b9286d196650afeda92a8bb9625ec3b416381c8` |
| 7 | F2 design SHA | `a13b5e6c482e5e68ba2c92c41ae14b411668ae88` |
| 8 | PR #71 | Docs authority; draft; head `050be86c9df3455c66b27bb5853eb786228b4009` |
| 9 | Historical unit PRs | #61 F3-01, #62 F3-02, #63 F3-03, #64 F3-04, #65 F3-05 — old line only |
| 10 | Divergence | 61 (main not in F3) / 19 (F3 not in main) |
| 11 | Merge-base | `ba479fb510343c37cdfa888f6e94aeb7ab07292f` |
| 12 | F3 objects on main | **ABSENT** |
| 13 | Old F3 migration count | 8 (3 pre-F3 + 5 ticket) |
| 14 | Filename collision vs 00114–00117 | **NONE** |
| 15 | Version collision vs 00114–00117 | **NONE** |
| 16 | Highest object collisions | P1 vs 00104 triggers; P1 vs 00116 storage; standing REPLACE vs 00101; `has_group_permission` pin if replaced |
| 17 | F3-01 class | VALID WITH COMPATIBILITY ADAPTATION |
| 18 | F3-02 class | VALID WITH COMPATIBILITY ADAPTATION |
| 19 | F3-03 class | VALID WITH COMPATIBILITY ADAPTATION |
| 20 | F3-04 class | VALID WITH COMPATIBILITY ADAPTATION |
| 21 | F3-05 class | VALID WITH COMPATIBILITY ADAPTATION + PRD CONFLICT (UX hide D-007) |
| 22 | P0 epochs class | VALID WITH COMPATIBILITY ADAPTATION (required dep; do not blindly replay RPC replacements) |
| 23 | P1 payment integrity class | SCHEMA COLLISION + SUPERSEDED in parts — **do not replay** |
| 24 | Standing hotfix class | VALID WITH COMPATIBILITY ADAPTATION / possibly SUPERSEDED by money.ts+00104 intent |
| 25 | Cut 1 compatibility | **SAFER OR UNCHANGED** |
| 26 | M2 isolation | **PASS** (no activation) |
| 27 | Money/notification separation | **PASS** (no F3 RPC notify/queue) |
| 28 | Cash-basis SoA | Contract frozen; **not implemented** on main |
| 29 | FCG-1 skip | **NO** |
| 30 | Collapse 06–09 | **NO** |
| 31 | Occurrence identity | PRESENT on old tip; MISSING on main; shared manual+module **NEEDS FCG-1** |
| 32 | ASTRA UX GATE | **ASTRA GATE NOW DUE** |
| 33 | Old harness | Historical PASS on old chain; **not** current-main PASS |
| 34 | New harness this run | **NOT RUN** (optional disposable skipped) |
| 35 | Disposition | **C** |
| 36 | Merge old tip | **NO** |
| 37 | Rebase old F3 onto main | **NO** |
| 38 | Future M3 base | `d83d13d4fe9915a0d1ff149ce29a53ad708c9853` |
| 39 | Proposed impl branch | `feat/m3-f3-01-05-forward-foundation` (not created) |
| 40 | Production mutation | **ZERO** |
| 41 | Financial writes | **ZERO** |
| 42 | New migration authored | **NO** |
| 43 | UI implementation | **NO** |
| 44 | M4 started | **NO** |
| 45 | PR #60 / #71 use | Contract reference only |
| 46 | Order | F3-06 → F3-07 → FCG-1 → F3-08 → F3-09 |
| 47 | Pre-F3-06 | Forward 01–05 + ASTRA + Founder auth + no P1 replay |
| 48 | Pre-F3-07 | F3-06 + F3-03 re-qual + D-007 hide opening + new route |
| 49 | Pre-F3-08/09 | **FCG-1 PASS** |
| 50 | service_role on F3 command RPCs | Old SQL revokes; keep revoke in forward port |
| 51 | `has_group_permission` | CALL only; never replace |
| 52 | Receipt auth going forward | Keep Cut 3 `storage_receipts_authorized`; do not add P1 restrictive overlays |
| 53 | 00104 vs F3 | Keep 00104 obligation recompute; F3 must not drop `on_payment_changed` |
| 54 | Founder decision needed | Authorize Strategy C + F3-01…05 forward foundation, then F3-06 |
| 55 | Package verdict | **PASS — M3/F3 REQUALIFICATION COMPLETE; READY FOR FOUNDER M3 IMPLEMENTATION DECISION** |
