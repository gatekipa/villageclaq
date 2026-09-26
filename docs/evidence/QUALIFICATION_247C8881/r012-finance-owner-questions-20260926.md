# R-012 finance-owner reconciliation packet — 2026-09-26

The approved read-only manifest found two inactive legacy Relief plans under one owner. Plan A has one enrollment, two claims, no Relief receipt or payout rows, two confirmed remittances of 250,000 XAF each, and two disputed remittances of 90,000 XAF each from one collecting group. Plan B has one enrollment and no receipts, claims, payouts, or remittances. Amount equality is not evidence of duplication. Candidate migration `00177` keeps both plans quarantined; it posts no guessed opening event.

The finance owner must return a signed reconciliation worksheet keyed by the manifest's source row ID for each answer:

1. **Confirmed 250,000 XAF row 1:** Did cash actually leave the collecting group and settle with the plan owner before the cutover boundary? Supply the dated bank/cash proof, payer voucher or receipt, receiving-owner acknowledgment, currency, custody account, and effective settlement date. If no, state the correct unresolved/reversed status and why.
2. **Confirmed 250,000 XAF row 2:** Answer the same questions with its own evidence. State whether it is a separate economic transaction from row 1 and identify the unique source voucher/provider reference. Do not classify it from amount/date/description similarity.
3. **Disputed 90,000 XAF rows 1 and 2:** For each source row, identify the dispute decision, decision maker, decision date, supporting source, and whether any cash ever moved. No opening or settlement entry is permitted without evidence of cash movement and an approved final disposition.
4. **Opening balances at the boundary:** For every row accepted as settled cash, provide the collecting group's closing custody/liability and the owner's corresponding custody/receivable balance immediately before cutover, including account/fund/currency and source ledger or signed cashbook. Explain any difference rather than forcing a balancing entry.
5. **Claims without payout rows:** Confirm whether either legacy claim produced cash outside the Relief tables. Supply payment proof and source identity if it did; otherwise affirm that no payout/opening expense should be posted.
6. **Plan B:** Confirm that its empty economic history is intentional and that no off-system opening custody, liability, receivable, income, or payout belongs to it.
7. **Cutover disposition:** For each source row choose exactly one reviewed outcome: settled pre-boundary opening balance, unresolved quarantine, rejected/disputed with no financial effect, or corrected/reversed with explicit lineage. Identify the approver and approval timestamp.

Daybreak Blue closes R-012 only after the returned source-keyed decisions produce a deterministic manifest, reconcile to the approved opening balances, and pass an isolated cutover test with no duplicate financial effect or audit evidence.

