# PC-PAYMENT — Bounded implementation ticket (NOT STARTED)

**Status:** READY FOR BOUNDED IMPLEMENTATION (after schema PR qualifies; live cron HOLD)  
**Depends on:** PR #69 foundation + schema/domain contract PR (CREATE-NOT-APPLY)  
**Must not:** wire live cron, send messages, apply migration to production, change Meta/WABA

## Adapter contract (frozen in notification-policy-contracts.ts)
- Anchor: obligation `due_date` (legacy overdue-daily selection remains live until migration)
- Resolved: confirmed-full OR waived → resolved; partial/unpaid/pending_confirmation → unresolved
- pending_confirmation: economically unresolved; optional future `snooze_while_payment_pending` (not loosely implemented)
- Legacy parity: groups with NO saved policy keep overdue-daily behavior (`LEGACY_PAYMENT_CRON_CONTRACT`)

## Implementation order (later)
1. Apply schema only when founder-authorized (separate gate)
2. Read policy via precedence resolver; generate occurrences (dormant writes)
3. Dual-run / shadow compare vs live cron before cutover
4. Live cron wire only after E2E + Security PASS
