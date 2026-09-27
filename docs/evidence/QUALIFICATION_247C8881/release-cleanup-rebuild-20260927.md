# Release cleanup, clean rebuild, and later-delta review — 2026-09-27

Executor: Daybreak Blue. Independent reviewer: actual GPT-6 Sol. Live-release authority: Jude.

Starting application: `ab9e2aad7bc355db4c336cf341415f1403a1ddaa`. Starting evidence tip: `96b7b0aa625a4542d7c25c7ae0a68a78a6219ef7`. Branch: `codex/qualification-repair-247c8881`. Isolated Supabase project: `nisipxbuvndobyxqqglf`, branch ID `2799efdd-2a84-46b6-9cc4-ec8709e0ce39`. Production `llbnliixczcqfftxpsmb` remained read only.

## Preservation and cleanup

Before cleanup, the isolated branch contained 63 nonempty `public`/`financial_core` tables, 10 Auth users, 7 groups, 19 memberships, 12 financial events, 24 postings, 3 Relief plans, zero Relief remittances, three Storage buckets, and zero Storage objects. The ignored recovery packet `.vercel/release-archive-20260927/` contains the full fictional application row set, Auth identity/contact metadata without password hashes/tokens/sessions, 410 foreign-key definitions, Storage manifests, recovery instructions and SHA-256 hashes.

The separate R-012 packet preserves the two inactive production Relief plans and dependent records, including all four remittances. Its disposition is `UNRESOLVED_QUARANTINE_NO_FINANCIAL_INFERENCE`. No settlement, duplicate, opening balance or cash-ownership conclusion was added. Production data was not modified.

An integrity-preserving deletion rehearsal ran inside a transaction and rolled back at `POSTING_COMMAND_PAYLOAD_IMMUTABLE`. No trigger, constraint or financial guard was disabled. The supported Supabase branch reset was then used. It removed branch data but reported `MIGRATIONS_FAILED`: migration history began at the S0/M2 boundary and the reset did not recreate the older `public` schema.

Daybreak regenerated the S0/M2 schema only from the read-only production catalog. The empty branch matched production at 45 enums, 92 tables, 112 functions, 411 constraints, 208 non-constraint indexes, one view, 382 policies, 79 public triggers plus one Auth trigger, table/function/column grants, and zero application/Auth rows. Default-privilege statements owned by managed Supabase roles were not fabricated.

Repository migrations replayed one file per recorded migration through:

- history version `20260927233513`
- name `00167_manual_module_source_overlap_guard`

Automatic action review rejected `00168_relief_delegated_payout_pairs.sql`. The migration replaces the shared private `financial_core.post_module_pair` implementation used by Relief, loans, events and dues, adds two delegated Relief effects and branch-scoped authorization, and revokes direct execution from `PUBLIC`, `anon`, `authenticated` and `service_role`. The rejection classified that shared finance/privilege change as a broad high-impact action requiring Jude's explicit approval after disclosure. No workaround, indirect apply or retry was attempted.

Current isolated facts at the stop boundary: 121 public tables, 411 public policies, zero Auth users, zero groups, no `cron` schema, zero `storage.objects` policies, and effective `TRUNCATE` for `anon`/`authenticated` on `storage.objects` and `storage.buckets`. Supabase still labels the branch `MIGRATIONS_FAILED` from the supported reset even though the catalog is queryable and baseline plus `001170`–`00167` are recorded.

## Independent later-delta review and repair

Actual GPT-6 Sol independently reviewed material changes from prior PASS `792cf7002a46e13a0035534d3ac99a323f0726c9` through application `ab9e2aad7bc355db4c336cf341415f1403a1ddaa`. It returned HOLD with two material findings:

1. transient database errors during payment-reminder delivery recheck were returned as ordinary ineligibility and terminally dead-lettered;
2. an Africa's Talking recipient status other than 101 could still return `sent:true` when the provider supplied a message ID.

The repair distinguishes retryable lookup failures from terminal missing/ineligible records, sending transient errors through `settle_notification_delivery(success:false)` and its bounded retry/dead-letter contract. The SMS transport now returns sent only for numeric status 101 plus a nonempty message ID; rejection, missing status and missing ID are provider failures.

Verification:

- focused communications/reminder/announcement suite: 33/33 pass;
- new failure-classification tests: 2/2 pass within that suite;
- `npx tsc --noEmit --incremental false`: pass;
- targeted `eslint --quiet`: pass;
- actual GPT-6 Sol focused repair verification: PASS for both findings.

The reviewer noted that an absent `CRON_SECRET` alone cannot prove all database scheduling is disabled. Direct catalog inspection resolved that note for the current isolated state: schema `cron` does not exist.

## Release state and next action

Vercel production deployment `dpl_8j2JAMtsjvCwEUZ9n3hBPZeS8RzS` remains assigned to `villageclaq.com` / `www`; no promotion occurred. Its founder status route returns binding and suppression flags, but the bound backend currently has no founder accounts/groups and is incomplete after `00167`. The site is therefore not currently ready for founder acceptance.

Jude must explicitly approve application of `00168_relief_delegated_payout_pairs.sql` with the shared finance-function and privilege scope described above. Daybreak can then resume exact replay through `00203` plus `20260927210445` and `20260927210932`, verify schema/permissions, restore the two minimal fictional founder accounts, run clean-start and Storage checks, and promote only if all applicable gates pass. Supabase Storage owner/provider action remains separately required for four managed policies and ordinary-role `TRUNCATE` removal.

Application rollback reference remains `dpl_8j2JAMtsjvCwEUZ9n3hBPZeS8RzS`; earlier application rollback `dpl_GRkwD2GNFgDyMMa7yuJjKLyDc8fs` is also preserved. Database recovery depends on the ignored recovery packet and schema-compatible reviewed restoration; an application rollback cannot restore cleaned data.
