# Dependency-order correction

Smallest deterministic reordering of existing `DROP … RESTRICT` statements inside the approved object allowlist. Function `dropOrder` values only. Table FK order unchanged. No general dependency framework.

## Demonstrated ATTEMPT_2 inversion (pre-correction `66be2b47`)

| Object | Old dropOrder | Role |
|--------|---------------|------|
| `public.has_group_permission(uuid,text,uuid)` | **90** | function dropped first |
| `public.notification_policy_triggers` | 900 | table-owned `m2_npt_*` policies |
| `public.notification_policy_occurrences` | 910 | table-owned `m2_npo_*` policies |
| `public.notification_policies` | 920 | table-owned `m2_np_*` policies |

PostgreSQL: `cannot drop function has_group_permission(uuid,text,uuid) because other objects depend on it`. HINT named CASCADE. CASCADE remains forbidden.

## Pinned DDL that owns those dependents

Scanned by F24-D01 from file bytes, not from the implementation list:

| File | Owned dependents |
|------|------------------|
| `supabase/migrations/00117_m2_notification_policy_foundation.sql` | `CREATE POLICY m2_np_* / m2_npt_* / m2_npo_*` using `public.has_group_permission`; `CHECK (public.m2_is_valid_iana_timezone(timezone))`; `EXECUTE FUNCTION public.notification_policy_set_updated_at()` |
| `supabase/migrations/00118_f3_bounded_financial_epoch_foundation.sql` | financial trigger/policy helpers |
| `supabase/migrations/00119_f3_01_core_ledger_foundation.sql` | `can_manage_finances` / `can_view_finances` policies; `guard_financial_*` triggers; `currency_scale` CHECKs on accounts/events/postings |
| `supabase/migrations/00120_f3_02_secure_posting_idempotency.sql` | posting-closure trigger helpers |
| `supabase/migrations/00122_f3_04_correction_reversal.sql` | correction-lineage / payload trigger helpers |
| `supabase/migrations/00123_f3_05_opening_cash_command.sql` | opening-provenance trigger helper |

00121 has no additional owned policy/trigger/CHECK helper in this class.

## Corrected function orders (table orders stay 700–1210)

Notification helpers after notification tables (900–920) and before `position_assignments` (930):

| Function | New dropOrder |
|----------|---------------|
| `public.has_group_permission(uuid,text,uuid)` | **925** |
| `public.m2_is_valid_iana_timezone(text)` | **926** |
| `public.notification_policy_set_updated_at()` | **927** |

Financial trigger/policy/CHECK helpers after financial tables (700–800) and before notification tables (900):

| Function | New dropOrder |
|----------|---------------|
| `financial_core.guard_f3_opening_provenance()` | 801 |
| `financial_core.check_f3_correction_closure()` | 802 |
| `financial_core.guard_f3_correction_lineage()` | 803 |
| `financial_core.guard_f3_correction_payload()` | 804 |
| `financial_core.check_f3_posting_closure()` | 805 |
| `financial_core.guard_f3_posting_closure()` | 806 |
| `financial_core.guard_f3_payload()` | 807 |
| `financial_core.can_view_finances(uuid)` | 808 |
| `financial_core.can_manage_finances(uuid)` | 809 |
| `financial_core.check_event_balance_from_posting()` | 810 |
| `financial_core.check_event_balance_from_event()` | 811 |
| `financial_core.guard_financial_posting_history()` | 812 |
| `financial_core.guard_financial_event_history()` | 813 |
| `financial_core.guard_financial_event_epoch()` | 814 |
| `financial_core.guard_financial_category()` | 815 |
| `financial_core.guard_financial_fund()` | 816 |
| `financial_core.guard_financial_account()` | 817 |
| `financial_private.guard_ledger_epoch()` | 818 |
| `financial_core.currency_scale(text)` | 819 |

`currency_scale` moved from 630 because 00119 CHECKs bind it to `financial_accounts` / events / postings (730–770).

## Why not “all functions after all tables”

`financial_core.can_view_finances` and `can_manage_finances` are `LANGUAGE sql` with hard dependencies on `public.memberships` (1170) and `has_group_permission` (925). They must drop **before** those objects. Placing every function after every table would block `DROP TABLE memberships`. The 801–819 window sits after financial tables and before memberships / has_group.

## Cycle / out-of-scope

No cycle was found inside the approved allowlist. An out-of-scope leftover (`public.retained_out_of_scope` + policy `leftover_hgp` on `has_group_permission`) still blocks with `F13_UNEXPECTED_OBJECT_OR_DEPENDENCY`. That is required, not a defect.
