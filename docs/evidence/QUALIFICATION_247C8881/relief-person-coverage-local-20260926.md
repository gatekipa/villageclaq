# R-004 person coverage and transfer checkpoint

Executor: Daybreak Blue. Code: `8b57314869126c45b2a590e0b52ddcd088bd0829` on `codex/qualification-repair-247c8881`. Production and the billed Supabase branch were not written in this checkpoint. This is local implementation evidence, not full release acceptance or independent review.

## Exact environment and upgrade

Fresh local PostgreSQL 17.11 UTF-8 catalog `villageclaq_upgrade_replay41` imported the preserved production S0/M2 **schema-only** baseline (SHA-256 `3b539557f807efca02b92fde9307228c45a6b398abc60a96e000150b1d1bdd4a`), filtered public import (`63983281e445e84aa14f0086b1696168144967bcbcc283b0c8afd137e5d1af9e`), synthetic platform fixture (`016170b2147631a4ca391a140ad6ff4ea96db12297668d6c54a65e4306e9151f`), and the local auth-trigger postlude. All **52** repository migration files `001170`–`00165` applied in filename order with `ON_ERROR_STOP=1`; local log `.vercel/local-replay41-apply.log`. This direct SQL replay **does not create Supabase migration history** or qualify a hosted deployment.

## Before and after behavior

Before `00158`–`00165`, Relief enrollment was keyed to a membership row, the old transfer RPC failed on a return to a prior group due to unique `(user_id,group_id)`, branch claim creation conflicted with the plan owner's group, and branch member linkage failed F3 owner payout. Contracted-plan enrollment and claim screens also used direct local-group writes.

The new server command binds a single plan/person coverage to the active membership, actor, tenant, request, material payload, frozen participation scope and topology. It computes maturity on the server. Direct member writes to a contracted enrollment are denied; legacy enrollments are not guessed into a coverage contract. Approved transfers version the responsibility; an out-of-scope move suspends coverage, and an authorized return restores it without resetting maturity. The transfer RPC serializes the approved transfer and recovers the same destination membership on a retry. Claim creation checks current coverage; historical claims keep their claimant link. Owner custody pays a covered branch claim through F3 without passing a cross-group membership ID, while the claim remains the source record. Contracted reports count the active projection once. The mounted enrollment/claim callers discover scoped plans and use server commands/current review and payout capabilities.

On replay41, all fictional probes ran in transactions that rolled back:

- `scripts/test-relief-plan-scope.sql`: direct contracted enrollment denied; same/fresh request recovers one coverage; changed material payload conflicts; cross-tenant and suspended actor cannot discover or recover; a covered branch member files an owner-group claim; a designated reviewer approves it; owner restricted-fund payout creates one event, two postings, one authoritative audit link and one paid claim; retry keeps that event. Transfer to the owner retains person coverage and maturity; a return transfer retry returns the same membership. Narrowing the participation scope and transferring out suspends coverage, and transferring back restores active coverage with the same maturity and four responsibility versions. Rollup does not double count. Scope/version/revocation checks from the prior probe still pass. Log: `.vercel/local-replay41-test-relief-plan-scope.log`.
- `scripts/test-relief-claim-decisions.sql`: decision version/history/retry/payload, revocation, cross-tenant and paid-history rollback pass. `scripts/test-relief-agency-receipts.sql`: branch agency receipt, owner recognition, remittance and rollup still pass with the expected postings, audits and exact sums. `scripts/test-hierarchy-2-0.sql`: root/deep topology, closure, move audit, cycle, cross-organization and grant/revocation probes pass. Logs have the corresponding `.vercel/local-replay41-*.log` names.
- `npx tsc --noEmit`, targeted `eslint --quiet` on the four affected TS/TSX files, and `git diff --check` pass.

## Limits and next acceptance

R-004 is implemented and locally verified for a newly contracted plan. A production-compatible hosted migration-history rehearsal, effective hosted permissions, candidate-bound browser/EN-FR/mobile journeys, and independent Sol review remain open. R-006 delegated branch payout authority, R-010 management projection, and R-012 legacy-plan manifest/cutover remain separate applicable requirements. VC-01/02 stay closed within their earlier financial tested scope. Production remains HOLD.
