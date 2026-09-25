# VillageClaq Master Rebuild PRD v1.0 — Security Revision 2

**Status:** NORMATIVE BOUNDED AMENDMENT — pending Daybreak final re-review and founder hard freeze  
**Date:** 2026-09-10  
**Parent PRD:** `docs/VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md`  
**Parent PRD SHA reviewed by Daybreak:** `1430d1c52f10edf690b50304ec536f8f019e0372`  
**Scope:** F4-002 and FCG-1 only. No other product architecture or build-order change.

---

## 1. Purpose and precedence

Daybreak's Security Revision 1 re-review found one remaining P1-grade financial-integrity specification contradiction: the parent PRD's F4-002 wording could classify all unapplied confirmed dues cash as a liability, while the frozen F2/F3 cash-basis contract distinguishes **non-refundable dues advances** from **refundable or conditional credits**.

This amendment closes only that contradiction.

For VillageClaq Rebuild v1, this document **normatively supersedes only the conflicting F4-002 wording and adds the FCG-1 clarification below**. Every other requirement, decision, safety boundary, stage, dependency, and acceptance gate in the parent PRD remains unchanged.

If a future implementation, ticket, test, or comment conflicts with this amendment, this amendment controls unless the Master PRD change-control rule is formally invoked.

---

## 2. Replacement for F4-002 — Cash-basis canonical effect

### F4-002 — Cash-basis canonical effect — SECURITY REVISION 2

Under D-002, a dues assessment/obligation does **not** create journal income or a ledger receivable in VillageClaq Rebuild v1.

A **confirmed non-refundable dues cash receipt** is recognized **once** as contribution income at confirmation, even when some or all of that confirmed cash is not yet allocated to a specific obligation.

Any unapplied portion of that confirmed non-refundable dues receipt remains an **allocation credit** in the Contributions & Dues operational subledger. Later allocation of that already-confirmed amount to an obligation is a classification/application event only and **must not create a second income event, second custody event, or second canonical financial posting for the same receipt**.

A **refundable or conditional unapplied receipt** is different: it remains a liability/member credit until the applicable recognition condition is satisfied or the amount is refunded.

Therefore the v1 classification is:

| Confirmed dues cash state | Canonical v1 treatment |
|---|---|
| Non-refundable and allocated | Recognize income once at confirmation; allocation does not re-recognize |
| Non-refundable and unapplied | Recognize income once at confirmation; carry unapplied amount only as operational allocation credit |
| Refundable unapplied | Custody + liability/member credit until recognized or refunded |
| Conditional unapplied | Custody + liability until condition is satisfied; then recognize once |
| Pending/rejected submission | No confirmed custody/income effect |

No workflow may treat the same confirmed receipt as both already-recognized non-refundable contribution income **and** a liability merely because allocation is pending.

---

## 3. FCG-1 clarification — dues advance classification

The FCG-1 Financial Contract Reconciliation Gate must explicitly prove all of the following before F3-08/F3-09 are frozen as canonical reporting:

1. **Non-refundable unapplied dues advance:** recognized exactly once as income at confirmed cash receipt under D-002/F4-002; any unapplied balance is an operational allocation credit, not a second ledger liability.
2. **Later allocation:** applying that credit to one or more obligations creates no new income, custody, or duplicate canonical economic occurrence.
3. **Refundable/conditional credit:** remains a liability until the recognition condition is met or the amount is refunded.
4. **Shared occurrence identity:** confirmation and later allocation remain linked to the same underlying receipt/source identity so no manual/module/allocation path can duplicate recognition.
5. **Correction/refund:** any reversal, correction, refund, or reclassification preserves lineage to the original receipt and reverses/reclassifies the original economic effect rather than adding an unrelated compensating receipt.
6. **Reporting reconciliation:** Contributions & Dues allocation/arrears views reconcile to the canonical cash-basis ledger without implying that unallocated non-refundable confirmed cash is unrecognized revenue.

These clarifications do **not** reopen F3-01 through F3-05 economic semantics and do **not** introduce accrual accounting into Rebuild v1.

---

## 4. No build-order change

The controlling order remains:

`M0 COMPLETE → M1 PRD HARD FREEZE → S0 → M2 → F3-06 → F3-07 → FCG-1 → F3-08 → F3-09 → M4 → M5 → M6 → M7 → M8 → M9 → M10 → M11 → M12`

No implementation begins from this amendment. After Daybreak final PASS and founder/Chief hard freeze, the next implementation remains **S0-A — Read-only production truth snapshot**, followed by **S0-B — Recovery/PITR preservation + isolated restore proof**.

---

## 5. Security Revision 2 acceptance statement

This amendment is closed only when Daybreak confirms that:

- the F4-002 contradiction is resolved;
- P-003 "one financial truth" is no longer internally ambiguous for unapplied confirmed dues cash;
- non-refundable confirmed dues cash cannot be recognized twice when later allocated;
- refundable/conditional unapplied cash remains a liability until recognized/refunded;
- FCG-1 contains the same distinction;
- the build order remains dependency-safe;
- no additional PRD architecture change is required for this issue.

No code, migration, deployment, production mutation, payment, reminder, notification send, provider change, or F3 implementation is authorized by this document.
