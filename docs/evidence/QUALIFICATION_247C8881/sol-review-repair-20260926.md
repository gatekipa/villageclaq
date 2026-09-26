# Focused independent-review repair — 2026-09-26

Executor: Daybreak Blue. Independent reviewer: actual GPT-6 Sol, approved by Jude as the substitute while GPT-6 Astra remained inaccessible. Branch: `codex/qualification-repair-247c8881`. Exact pushed candidate reviewed: `792cf7002a46e13a0035534d3ac99a323f0726c9`. Isolated Supabase branch: `nisipxbuvndobyxqqglf`, migration history through repository `00199`. Production remained read only.

## Independent review and bounded verdict

Sol's initial consolidated review independently returned **HOLD** on code `56f00e76ba22ef42902da8c2e34e0f4d655b6373` with four material findings:

1. New official attachments used four-segment object keys while the effective Storage helper accepted only the historical three-segment shape.
2. Historical official keys were not bound to the exact parent/state and allowed out-of-band update/delete.
3. Governance and standing commands checked permission before blocking target-row waits, so a revocation committed during the wait could leave stale authority.
4. Expired standing overrides could remain in `memberships.standing`; Elections 2.0 used that stored value for consequential eligibility.

The focused review of `9cf2b53073deabc73cf970a9924f286f0d711e90` closed findings 1, 3 and 4, but correctly kept finding 2 open because pre-00188 rows stored only `file_url` and 00188 had not backfilled `attachment_object_key`. Daybreak Blue added migration `00199`. Sol's permitted final blocker-only check reviewed exact pushed commit `792cf7002a46e13a0035534d3ac99a323f0726c9`, closed the legacy blocker, found no new material security or data-integrity issue in 00199, and returned **PASS for the four repaired findings**. Sol kept the real Storage API result classified as an environment evidence gap. This independent PASS does not waive the remaining release gates or Jude's separate live-release authorization.

## Repairs and executor evidence

- `00194` repairs G-005/G-009 by recognizing the mounted four-segment path, requiring the exact group, parent, stored key and parent visibility state, denying official-object update/delete, and retaining historical three-segment official objects only as exact-parent read-only records.
- `00195`, `00197` and `00198` repair the P-009/SEC-006 current-authorization boundary by locking the actor's active membership and permission sources after the command's target wait and again on replay.
- `00196` repairs G-008/E-003 by deriving authoritative election standing from calculated standing plus only the currently active override. The election page refreshes the effective value on interval/focus and immediately before vote; the database remains authoritative.
- `00199` repairs the legacy official-attachment compatibility gap. It strictly decodes historical bare/public/signed URLs, validates the three-segment prefix and tenant, joins to the exact existing `group-documents` object, preserves historical `updated_at`, and fails the upgrade if any historical official URL remains unresolved.
- Existing `scripts/test-elections-2-0.sql` returned `E010_RETENTION_PASS` after the standing-consumer migration.
- A hosted rollback expiry probe returned `EFFECTIVE_STANDING_EXPIRY_PASS`: expired warning became effective good; active warning remained warning; opening included the former and excluded the latter; the former cast successfully.
- The real-schema helper matrix returned `OFFICIAL_ATTACHMENT_POLICY_PASS`: authorized editable-parent insert, unlinked read denial, exact audited-link read, arbitrary sibling denial, ordinary published read, ordinary insert/update/delete denial, cross-tenant denial, withdrawn ordinary read denial and retained manager history read.
- A two-session hosted concurrency probe held the target minute row, suspended the fictional administrator, then released the row. The waiting command returned SQLSTATE `42501` (`MINUTES_NOT_AUTHORIZED`); its attempted title did not persist and its request created zero receipt and zero audit. This remained true after `00198`.
- `00199` applied to the isolated branch as migration version `20260926212436`. The branch contains zero historical URL-only official rows. A rollback-only real-schema fixture inserted a fictional legacy signed URL with percent-encoded UTF-8 and a space plus its exact `storage.objects` key. It returned `LEGACY_OFFICIAL_ATTACHMENT_BACKFILL_PASS`, preserved `updated_at`, and rejected an encoded nested separator and a cross-group key.

## Actual Storage API environment gap

The prepared `scripts/test-official-attachment-storage.mjs` authenticated fictional branch users, then the first actual upload returned `403 new row violates row-level security policy`. Read-only catalog inspection found **zero** `storage.objects` policies on the isolated branch. Production read-only inspection found the four expected select/insert/update/delete policies, all calling `storage_group_documents_authorized`. `storage.objects` is owned by `supabase_storage_admin`; the available branch `postgres` role cannot recreate provider-owned policy state. This is an environment/evidence blocker for the actual Storage API matrix, not a passing API test and not evidence that the repaired helper failed.

Required provider action: copy the four production-equivalent schema-only `storage.objects` policies to `nisipxbuvndobyxqqglf`, then let Daybreak Blue rerun the prepared upload/sign/read/update/delete actor matrix. Separately, the Supabase storage owner/provider must revoke effective `PUBLIC`/`anon`/`authenticated` `TRUNCATE` on `storage.objects`, `storage.buckets`, and `storage.buckets_analytics`, and return effective-grant evidence.

## Gates and limits

`npx tsc -p tsconfig.json --noEmit --incremental false`, targeted ESLint on the changed TypeScript/JavaScript files, `node --test scripts/test-product-standing.mjs` (30/30), optimized `npm run build`, and `git diff --check` passed for the application repair. `git show --check` passes at the exact migration candidate. Existing build metadata/middleware notices remain advisory. No enforced GitHub checks were visible through available metadata; branch-protection detail remained inaccessible with 403.

VC-01 and VC-02 remain closed in their prior tested financial scope because these repairs do not alter financial commands or their audit contract. Full release qualification remains HOLD for the actual Storage API matrix, provider-managed TRUNCATE remediation, finance-owner R-012 reconciliation, and the remaining explicitly listed VC-04 role/browser/mobile cases. The billed branch remains required at $0.01344/hour until those branch-dependent checks finish; Daybreak Blue owns cleanup after evidence and blocker decisions no longer depend on it.
