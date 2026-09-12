# M2 Implementation Summary — 2026-09-12

**OVERALL VERDICT: PASS — M2 IMPLEMENTATION COMPLETE; DISPOSABLE QUALIFICATION PASS; READY FOR DAYBREAK IMPLEMENTATION SECURITY REVIEW**

**DO NOT MERGE.**  
**DO NOT APPLY 00117 TO PRODUCTION.**  
**NO REAL SENDS. NO PRODUCER CUTOVER. NO UI.**

## Pins

| Pin | Value |
|-----|-------|
| Planning authority | PR #81 @ `dc35c39a5b94b354c02e3f0f091271e74b8e93e5` |
| Base main | `0c147f8e1e7aadbfd14583f6a9bef465c2217fe1` |
| Branch | `security/m2-notification-policy-foundation-20260912` |
| Draft PR | https://github.com/gatekipa/villageclaq/pull/82 |
| Functional SHA | `cffdda852ab198ea6dfab4eefdb9e6a82bd8e03d` |
| 00117 path | `supabase/migrations/00117_m2_notification_policy_foundation.sql` |
| 00117 SHA-256 | `6e91d0997ee03df57a6174c37fec50f6f812fcdc54412cf8fa115019863eeb42` |
| Production project | `llbnliixczcqfftxpsmb` — **never mutated** |
| Production migrations | remain **31** |
| SECURITY DEFINER added | **NONE** |

## What shipped

- Pure evaluator `src/lib/notification-policy.ts` — `ENQUEUE_ELIGIBLE` = trusted-producer enqueue consideration only (SEND_NOW retired)
- Pure contracts `src/lib/notification-policy-contracts.ts` — Cut 2 AND + push DENY + adapters
- Dormant 00117 three-table schema; `enabled` / all channel defaults `false`; domain `payment|hosting|event` only
- RLS: `has_group_permission(group_id, 'settings.manage')` + ENABLE/FORCE RLS
- Occurrences: authenticated SELECT-only; no authenticated mutation; no service_role DML grant
- No `notifications_queue` grants; no `enqueue_outbound_notification` change
- No occurrence writer (SECURITY DEFINER not required for dormant foundation)

## Tests

| Suite | Result |
|-------|--------|
| `scripts/test-notification-policy.mjs` | **39/39 PASS** |
| `scripts/test-notification-policy-contracts.mjs` | **43/43 PASS** |
| `scripts/test-m2-cut2-nonregression.mjs` (M2-C2-01..20) | **20/20 PASS** |
| `scripts/test-m2-static-security.mjs` | **9/9 PASS** |
| Combined | **111/111 PASS** |
| Disposable schema qualify | **32/32 PASS** |
| `npx tsc --noEmit` | **PASS** |
| `npm run build` | **PASS** |

## Disposable qualification

Local PostgreSQL 16, database `m2_notification_policy_disposable`.  
Fixture: `scripts/_m2_disposable_fixture.sql` (00116-era stub).  
Apply: exact `00117_m2_notification_policy_foundation.sql`.  
**Not production.** Synthetic tenants only. Provider calls = 0.

## Dormancy

Immediately after 00117 COMMIT: policy/trigger/occurrence rows = 0; `notifications_queue` delta = 0.  
No DB trigger on `notifications_queue` from this migration.  
No producer import of the M2 engine. Live crons unchanged.

## Evidence artifacts

- `docs/evidence/M2_IMPLEMENTATION_SUMMARY_20260912.md` (this file)
- `docs/evidence/M2_CUT2_NONREGRESSION_RESULTS_20260912.json`
- `docs/evidence/M2_DISPOSABLE_SCHEMA_RESULTS_20260912.json`
- `docs/evidence/M2_IMPLEMENTATION_FILE_SCOPE_20260912.json`
- `docs/evidence/M2_DORMANCY_PROOF_20260912.json`
- `docs/evidence/M2_MIGRATION_SECURITY_FINGERPRINTS_20260912.json`

Evidence tip SHA is the docs/evidence-only commit on top of functional SHA `cffdda852ab198ea6dfab4eefdb9e6a82bd8e03d`.

## Left open / unmerged

- PR #81 planning-only
- PR #69 / #70 open, unmerged, not rebased
- This PR #82 stays **draft**

## Writer authority

No SECURITY DEFINER occurrence writer was added. Foundation does not require one.  
**Not HOLD — M2 WRITER AUTHORITY NOT FROZEN.** Writers remain a later ticket.
