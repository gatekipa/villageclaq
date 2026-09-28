# Clean-start release gate — 2026-09-28

## Exact state

- Branch: `codex/qualification-repair-247c8881`
- Application candidate: `7166270603834cfccec897feea9a051f04424ef7`
- Reviewed parent: `f6df21e60013663723193102ea675bd327d96a07`
- Isolated Supabase project: `nisipxbuvndobyxqqglf`
- Production Supabase project `llbnliixczcqfftxpsmb`: unchanged
- Public Vercel deployment: unchanged at `dpl_8j2JAMtsjvCwEUZ9n3hBPZeS8RzS`
- Final isolated Preview: `dpl_6e6BT9rWKPsw4u8wFMM3G9qpvzrn` / `https://villageclaq-y94et90lf-gatekipas.vercel.app`, READY
- Rollback deployment: `dpl_8j2JAMtsjvCwEUZ9n3hBPZeS8RzS`; database recovery material remains the preserved ignored archive because an application rollback cannot reverse data changes

## Migration replay and identities

Jude explicitly approved `00168_relief_delegated_payout_pairs.sql`. The isolated branch now records the exact repository sequence through `00203`, followed by the two previously hosted dated migrations and the two clean-start repairs. No production migration ran.

| Repository migration | SHA-256 | Isolated history version |
|---|---|---|
| `00168_relief_delegated_payout_pairs.sql` | `3CC5100C4AC2E5F81DA9CD852FB9FD20A5B4D00F8D3FF84D5D5C73F648B94A93` | `20260927235022` |
| `20260927210445_active_contribution_obligations.sql` | preserved repository file | `20260927235345` |
| `20260927210932_notification_delivery_status_enum.sql` | preserved repository file | `20260927235349` |
| `20260927235959_group_financial_epoch_bootstrap.sql` | `109DD8DFFD451FD815ED63378B770171EF218DD0065085E6F1CD89A47FE0CBA8` | `20260928001259` |
| `20260928003000_event_ticket_read_acl.sql` | `BCA4BFC2B35781478BBE1CC0391CDE8704414ED3640F043E9C59C0AF8DBE3C7B` | `20260928001754` |

`00169`–`00203` are present in order at versions `20260927235038`–`20260927235340`; no file was skipped. Effective privilege inspection confirms `financial_core.post_module_pair(...)` is not executable by `PUBLIC`, `anon`, `authenticated`, or `service_role`. The intended public dues, loan, event, and Relief RPCs remain executable by `authenticated` and not by `anon` or `service_role`.

## Behavioral evidence

- Rollback-only hosted SQL passes Security Revision 2 dues, loan repayment voucher conflict, loan disbursement/retry, loan repayment/retry, event tier and purchase/retry/authorization, and Relief agency/delegated receipt and payout paths through their public authenticated entry points.
- The clean-start epoch probe inserts a fictional group and proves exactly one XAF active epoch, creator/approver lineage, no event/posting/account/fund/category effect, and no API-role execution of the private trigger function; it rolls back.
- The production-compatible baseline exposed ineffective event ticket read policies: `authenticated` had no table `SELECT`. The narrow repair grants only `SELECT` to `authenticated`; ticket write privileges remain revoked and existing RLS policies remain the row boundary. The event rollback probe then passes.
- Clean-start browser execution created two fictional Auth identities, one private fictional group, independent active admin/member memberships, one XAF cash account, one default unrestricted fund, one income category, one Relief expense category, and one one-time fictional contribution with exactly two obligations. Reload proves contribution persistence. No financial event or posting was created by setup.
- Founder login is restored on the existing public deployment and the application remains bound to `nisipxbuvndobyxqqglf` with the fictional-data banner and delivery/scheduler suppression. Credentials remain only in ignored `.vercel/founder-test-access.txt` and are absent from Git and this report.
- `node --test scripts/test-clean-start-navigation.mjs`: 3/3 pass after the focused cancellation/retry repair.
- `npx tsc --noEmit --incremental false`: pass.
- Optimized local build: pass. The final `7166270` Vercel Preview build is READY, and its protected status endpoint returns `founderTestMode=true`, `bindingMatches=true`, `serviceCredentialVerified=true`, `externalDeliverySuppressed=true`, and `scheduledSideEffectsSuppressed=true`.

## Independent review

Actual **GPT-6 Sol** independently reviewed `f6df21e60013663723193102ea675bd327d96a07` in the final blocker-only round. Sol found one P1 race: an interrupted zero-membership invitation check retained its key, so the same actor/route could remain on a spinner. Sol found no additional blocker in the two migrations or rollback probes and made no edits.

Daybreak Blue repaired the race at `7166270603834cfccec897feea9a051f04424ef7`: cleanup releases only its matching in-flight key and the effect depends on stable `user.id`. The regression asserts that the effect depends on `user?.id` rather than provider object identity, cancels the first membership check in its focused harness, and proves a check with the same actor ID and route can start again. This directly removes Sol's latched-key cause of the persistent spinner. TypeScript also passes.

On 2026-09-28 Jude accepted this focused executor evidence as direct coverage of Sol's reported race and the required navigation acceptance criteria. This is **Jude's risk acceptance at the exhausted review cap**. Sol's verdict remains HOLD for the reviewed parent; no Sol PASS is claimed and no independent review was restarted. VC-06 is closed by release-authority acceptance for this delta.

## Remaining blockers

Storage is not restored. The isolated branch has zero required `storage.objects` policies. `anon`, `authenticated`, and `service_role` still have effective `TRUNCATE` on `storage.objects`, `storage.buckets`, and `storage.buckets_analytics`; all are owned by `supabase_storage_admin`. The available `postgres` capability cannot make this owner-only change and the unchanged failed privilege path was not retried.

Exact provider/owner action on **isolated project `nisipxbuvndobyxqqglf` only**:

1. Execute as `supabase_storage_admin` or the provider's supported managed-table owner.
2. Create `gdocs_select_group`, `gdocs_insert_group`, `gdocs_update_group`, and `gdocs_delete_group` on `storage.objects`, calling `public.storage_group_documents_authorized(name, operation)` in the applicable `USING` and `WITH CHECK` clauses.
3. Revoke `TRUNCATE` on `storage.objects`, `storage.buckets`, and `storage.buckets_analytics` from `PUBLIC`, `anon`, and `authenticated` (and return effective `service_role` evidence for the disclosed managed-table grant).
4. Return the policy definitions and effective privilege evidence. Daybreak Blue then runs the prepared real Storage API upload/sign/read/update/delete matrix.

Read-only owner-path inspection confirms that the available connector runs as `postgres`, all three managed tables are owned by `supabase_storage_admin`, and `postgres` is not a member of that role. The exact owner transaction and readback are in [storage-owner-repair-nisipxbuvndobyxqqglf.sql](storage-owner-repair-nisipxbuvndobyxqqglf.sql). The single supported next action is the [ready-to-send Supabase Support request](storage-owner-support-request-20260928.md); the failed privilege path must not be retried and ownership must not be changed.

R-012 remains archived and quarantined without inferred settlement, deduplication, or opening balance. The finance owner retains reconciliation ownership.

## Decision

**HOLD on Storage only.** Founder login and non-Storage clean-start execution are restored. Jude accepted the focused navigation repair evidence at the exhausted review cap. Promotion is withheld because the mandatory Storage owner action and real Storage API matrix remain incomplete. The current public deployment and rollback reference stay unchanged.
