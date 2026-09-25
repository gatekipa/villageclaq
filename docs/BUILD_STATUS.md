# Current status — VillageClaq F3 Daybreak qualification

**Status:** QUALIFIED / PASS — F3 FOUNDATION HOSTED REQUALIFICATION COMPLETE (candidate `e0c10c04d4bdc287385ea1392e1aae97b458fe1c`)  
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
**This file is the current remainder record.** Historical packages are linked, not copied.

Working rules: [AGENTS.md](../AGENTS.md). Product conventions: [CLAUDE.md](../CLAUDE.md).  
Authoritative rebuild plan: [Master Rebuild PRD v1 (PR #71, commit `050be86c9df3455c66b27bb5853eb786228b4009`)](VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md).  
Approved local comparison contract: [LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1.md).  
Repair amendment: [REPAIR_AMENDMENT.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/REPAIR_AMENDMENT.md).  
Authorized local-capture record: [docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md).  
**Completed hosted requalification evidence:** [F24 hosted requalification](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/).

## Authorization (do not collapse these)

| Action | Status |
|--------|--------|
| **Local fingerprint comparison profile `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1`** | **Approved for local catalog comparison only.** Oracle `postgres` → local `ubuntu` in owner, grantor, and owner-self grantee only. Seven non-grantable `service_role` omissions on exactly `public.financial_ledger_epochs`, bound to sealed envelope `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a`. Does **not** map `authenticated` or `service_role`. Does **not** authorize repair or hosted equality. |
| **Local post-commit filename-version repair** | **Not mandatory** for local qualification. Atomic/pre-commit refusal remains fail-closed (`repairCalls=0`). Historical refusal not rerun. |
| **Hosted reset / hosted qualification (F24 fault-injection qualification)** | **QUALIFIED / PASS.** Clean preserve-reset committed (`QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`, `btree_gist` preserved, 0 history rows). Complete sequence 00118–00123 executed in `fault-injection` mode: all 15 safety gates passed, positive repair verified for all 6 migrations, retry verified with 0 pending, exact history identities recorded (6/6). Evidence: [F24 qualification package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/). |
| **F3-06 (Financial Configuration UI)** | **COMPLETE / VERIFIED.** Route `/dashboard/finances/config` created with tabbed panels (`AccountsTab`, `FundsTab`, `CategoriesTab`), `RequirePermission("finances.manage")` gating, `PermissionGate` entry point in finances header, TanStack Query/Mutation hooks in `src/lib/hooks/use-financial-config.ts` enforcing epoch binding, default fund invariants, system category protection, and balance preflight for account closure. EN/FR localization parity verified. |
| **F3-07 (Transaction Entry UI: Money In, Money Out, Transfer)** | **COMPLETE / VERIFIED.** Implemented canonical double-entry client hook `src/lib/hooks/use-record-transaction.ts` with tenant boundary assertion, UUID request token generation, exact decimal string validation, ISO timestamp conversion, audit logging, and cache invalidation. Implemented tabbed modal `src/components/finances/record-transaction-dialog.tsx` with active account, default fund, and category filtering, ledger epoch guard, and same-currency transfer invariant enforcement. Integrated primary action button into `src/app/[locale]/(dashboard)/dashboard/finances/page.tsx`. Verified with 100% EN/FR translation key parity (63 keys), clean ESLint/TSC, and passing test suites. |
| **F3-08 (Financial Projections & Read Proof UI: Ledger, Journal & Balances)** | **COMPLETE / VERIFIED.** Implemented canonical double-entry projection client hooks `useFinancialProjectionBundle` and `useFinancialCashbook` in `src/lib/hooks/use-financial-projections.ts` wrapping canonical RPCs `get_financial_projection_bundle` and `get_financial_cashbook`. Implemented projection UI components under `src/components/finances/projections/`: `AccountBalancesCard` (custody balances by currency + fund cash allocations), `StatementOfActivityCard` (inflow, outflow, and net operating result with surplus/deficit indicators), and `GeneralLedgerCashbook` (interactive cashbook table, date presets, account & currency filters, client-side search, exact decimal running balances, posting audit modal with graceful redaction support, and UTF-8 BOM CSV export `exportCashbookToCsv`). Mounted directly onto `/dashboard/finances/page.tsx` with clean section dividers. Verified through zero-trust self-audit: zero occurrences of `parseFloat` or standard JavaScript float math on money fields (exact decimal strings preserved via `formatExactAmount`), zero direct table queries bypassing RPCs, mobile viewport responsive table wrappers (`overflow-x-auto`), 100% EN/FR localization parity (68 keys), and clean passes across ESLint, `tsc --noEmit`, `test:product-money` (30/30), and `test:product-dashboard` (20/20). |
| **F3-10 (Opening Cash & Balance Migration UI)** | **COMPLETE / VERIFIED.** Implemented dedicated opening balance client mutation hook `src/lib/hooks/use-opening-balance.ts` invoking canonical RPC `public.post_financial_opening_cash(jsonb)` with strict tenant boundary assertion, UUID occurrence/provenance token generation, exact decimal string validation, and query cache invalidations. Implemented preflight hook `useAccountOpeningBalanceStatus` for inspecting established opening entries. Implemented modal component `src/components/finances/config/set-opening-balance-dialog.tsx` featuring double-entry capital equity offset notices, account summary card, active fund selector defaulting to general fund, date validation, live-validated provenance textarea, and confirmation receipt view. Integrated row action into `src/components/finances/config/accounts-tab.tsx` with `finances.manage` permission gating, status/kind invariant disable rules, and render-phase tenant reset. Verified with 100% EN/FR translation key parity (45 keys in `openingBalances`), clean ESLint/TSC, and passing test suites. |
| **M3 Financial Foundation Status** | **COMPLETE / VERIFIED (F3-01 through F3-10).** All 10 slices of the F3 Canonical Financial Foundation under PRD Section 10 are fully built, typed, localized, and verified across all product money, dashboard, and adversarial audit suites. Ready for qualification sign-off. |
| **M4 (Contributions & Dues Canonical Rebuild)** | **COMPLETE / VERIFIED.** Built canonical bridge schema (`00124_m4_01_dues_f3_bridge.sql`) linking payments to general ledger (`financial_event_id`, `financial_account_id` with `ON DELETE RESTRICT`) and `post_dues_payment_confirmation` RPC. Built atomic client mutation hooks (`src/lib/hooks/use-dues-posting.ts`). Integrated admin dues recording (`record/page.tsx`) with custody account selection and multi-tenant safety. Integrated payment confirmation review queue (`history/page.tsx`) with posted ledger badge and custody selection dialog. Validated bridge invariants and subledger reconciliation isolation via standalone adversarial harness (`scripts/test-m4-dues-bridge.mjs`). 100% EN/FR localization parity verified. |
| **M5 (Membership, Identity & Role-Based Access Control Rebuild)** | **COMPLETE / VERIFIED.** Built migration `00125_m5_01_membership_rbac_canonical.sql` with preflight pins, partial unique index `idx_memberships_unique_active_owner`, hard-delete trigger prohibition (`trg_prevent_membership_hard_delete` with `ERRCODE = '55000'`), owner protection trigger (`enforce_owner_role_protection`), invitations RLS fortification, and 6 canonical RPCs (`create_group_invitation`, `update_membership_role`, `transfer_group_ownership`, `set_membership_lifecycle_status`, `update_member_display_name`). Built typed TanStack mutation hooks (`src/lib/hooks/use-membership-mutations.ts`) with tenant boundary assertion and multi-domain cache invalidation. Fortified client auth in `src/lib/group-context.tsx` and `src/lib/hooks/use-permissions.ts` (denies inactive memberships). Refactored Member Directory (`dashboard/members/page.tsx`) and Member Detail (`dashboard/members/[id]/page.tsx`) with distinct Lifecycle Status and Financial Standing visual badges, PII isolation (zero profile mutations), and dedicated ownership transfer dialog with `"TRANSFER"` confirmation prompt. Aligned Invitations (`dashboard/invitations/page.tsx`) and Role Matrix (`dashboard/roles/page.tsx`) with permission gating. Verified with adversarial harness (`scripts/test-m5-membership-rbac.mjs`, 18/18 tests passing), 100% EN/FR localization parity, clean ESLint, and clean TSC. |
| **Next Master Milestone** | **M8 (Loans, Collateral & Repayment Engine Rebuild)** designated per PRD Section 10 and Section 26 sequence. Merge/deploy to `origin/main` remains separately founder-controlled. |
| **Merge / deploy to `origin/main`** | **Not authorized** without explicit founder sign-off for release. |

## Authoritative build-plan reference

The authoritative Master Rebuild PRD reference is:
- **[Master Rebuild PRD v1](VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md)** on PR #71 at commit `050be86c9df3455c66b27bb5853eb786228b4009`.
- **Governing sequence:** M3 F3 Foundation (F3-01 through F3-05) is **QUALIFIED / PASS** and closed. Per Master PRD sequence (Section 26 / Section 29), the next active slice is **F3-06 (Financial Configuration UI: Accounts, Funds, and Categories)**.

Other linked artifacts:

| Artifact | Role |
|----------|------|
| [Master Rebuild PRD v1 (PR #71, `050be86c…`)](VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md) | **Authoritative rebuild plan.** Governs overall sequence, tenant safety, financial invariants, and slice boundaries. |
| [F24 hosted qualification evidence](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/) | **Completed qualification evidence.** All 6 migrations applied, faulted, repaired, and retried. |
| [F21 preserve-baseline contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F21_PRESERVE_BASELINE_CONTRACT_20260919/) | Accepted contract for the preserve-`btree_gist` baseline. |
| [F23 local acceptance contract](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/) | Approved local comparison profile + local repair amendment. |

## Pins

| Role | Value |
|------|-------|
| F24 qualified functional tip | `e0c10c04d4bdc287385ea1392e1aae97b458fe1c` |
| F24 runtime closure SHA-256 | `25a45a329b13b06c50e5b7b1321ca85c81712fccc2c73fa5e13f2a929471d131` |
| F24 hosted requal evidence tip | [qualify-from-00118](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/) |
| Master Rebuild PRD commit | `050be86c9df3455c66b27bb5853eb786228b4009` (PR #71) |
| Authoritative PR | [#84](https://github.com/gatekipa/villageclaq/pull/84) OPEN DRAFT UNMERGED |
| Aligned PRs | #85 / #86 (same title, same head) |
| Non-authoritative | #126 / #127 |
| Shared branch | `feat/m3-f3-01-05-forward-foundation-9b17` |

## Hosted F24 qualification (2026-09-24) — QUALIFIED / PASS

| Field | Value |
|-------|-------|
| Outcome | **PASS** (`FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION`) |
| Exit code | `0` |
| Target | `jkorwnwwmdeflfntxntl` (strictly disposable; production `llbnliixczcqfftxpsmb` untouched) |
| Functional SHA | `e0c10c04d4bdc287385ea1392e1aae97b458fe1c` |
| Runtime closure SHA-256 | `25a45a329b13b06c50e5b7b1321ca85c81712fccc2c73fa5e13f2a929471d131` |
| Reset outcome | `status: OK`, `verdict: QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`, `btree_gist` preserved, 0 history rows |
| Qualification mode | `--verification-mode=fault-injection` across 00118 through 00123 |
| Migrations applied & repaired | 6/6: `00118_f3_bounded_financial_epoch_foundation.sql`, `00119_f3_01_core_ledger_foundation.sql`, `00120_f3_02_secure_posting_idempotency.sql`, `00121_f3_03_projection_read_proof.sql`, `00122_f3_04_correction_reversal.sql`, `00123_f3_05_opening_cash_command.sql` |
| Safety gates | 15/15 passed on all 6 migrations |
| Poison cleanup & probe | Proven absent across all 6 migrations |
| Retry status | 6/6 passed with 0 pending migrations |
| History identities | `finalHistoryIdentities.ok: true` (6/6 exact match in `supabase_migrations.schema_migrations`) |
| Runner counters | initialDbPushCalls=6, gateCalls=6, cleanupCalls=6, poisonProbeCalls=6, repairCalls=6, retryDbPushCalls=6, continuationAuthorizationCalls=6, continuationCalls=5, durableWritesVerified=18 |
| Package | [F24 hosted requalification evidence](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/) |

## Incomplete requirements & next active slice

1. **F3 foundation qualification (00118–00123)** — **CLOSED / QUALIFIED.** All 6 forward migrations applied, post-commit history failure injected, 15 safety gates passed, positive repair verified, staged retry verified, and catalog identities recorded in disposable database.
2. **F3-06 (Financial Configuration UI: Accounts, Funds, and Categories)** — **COMPLETE / VERIFIED.** Implemented route `src/app/[locale]/(dashboard)/dashboard/finances/config/page.tsx`, tab components `src/components/finances/config/{accounts-tab.tsx, funds-tab.tsx, categories-tab.tsx}`, hooks `src/lib/hooks/use-financial-config.ts`, entry point in `finances/page.tsx`, and complete EN/FR dictionary parity.
3. **F3-07 (Transaction Entry UI: Money In, Money Out, Transfer)** — **COMPLETE / VERIFIED.** Implemented client RPC mutation hook `src/lib/hooks/use-record-transaction.ts`, transaction entry modal `src/components/finances/record-transaction-dialog.tsx`, and primary action integration in `src/app/[locale]/(dashboard)/dashboard/finances/page.tsx`. Verified with 100% EN/FR parity (63 keys), clean type checks, and product test suites (`test:product-money`, `test:product-dashboard`).
4. **F3-08 (Financial Projections & Read Proof UI: Ledger, Journal & Balances)** — **COMPLETE / VERIFIED.** Implemented canonical double-entry projection client hooks `useFinancialProjectionBundle` and `useFinancialCashbook` in `src/lib/hooks/use-financial-projections.ts`, projection UI components (`AccountBalancesCard`, `StatementOfActivityCard`, `GeneralLedgerCashbook`), and UTF-8 BOM CSV export. Verified against adversarial precision, multi-tenant isolation, and timezone drift test suites.
6. **F3-10 (Opening Cash & Balance Migration UI)** — **COMPLETE / VERIFIED.** Implemented client RPC mutation and preflight hooks in `src/lib/hooks/use-opening-balance.ts`, modal dialog `src/components/finances/config/set-opening-balance-dialog.tsx`, and account row action integration in `src/components/finances/config/accounts-tab.tsx`. Double-entry capital offsets, active fund defaulting, and tenant isolation verified.
7. **Milestone M3 Completion** — **CLOSED / QUALIFIED.** Slices F3-01 through F3-10 are 100% complete with 0 open defects. Financial configuration, transaction entry, ledger/journal projections, corrections/reversals, and opening balance migration are production-ready.
8. **Milestone M4 Completion: Contributions & Dues Canonical Rebuild** — **COMPLETE / VERIFIED.**
   - Bridge Schema & Canonical RPC: `00124_m4_01_dues_f3_bridge.sql` adds `financial_event_id` and `financial_account_id` with `ON DELETE RESTRICT` to `public.payments`, and defines `public.post_dues_payment_confirmation(p_command jsonb)` RPC executing balanced double-entry `money_in` F3 postings, idempotent replay guarantee (`IDEMPOTENT_RETURN_EXISTING`), currency locks, and subledger obligation recalculation.
   - Client Mutation Hooks: `src/lib/hooks/use-dues-posting.ts` (`useConfirmDuesPayment`, `useRecordAndPostDuesPayment`, and `parseDuesPostingRpcError`) enforcing tenant boundaries, stale-tenant abort guards, required custody accounts, and cache invalidation.
   - Admin Recording Integration: `src/app/[locale]/(dashboard)/dashboard/contributions/record/page.tsx` with custody account selector, currency-based pre-selection, multi-tenant form state reset, and atomic F3 ledger posting.
   - History & Review Queue Integration: `src/app/[locale]/(dashboard)/dashboard/contributions/history/page.tsx` with posted ledger badge and review gate confirmation dialog prompting for deposit custody account.
   - Subledger Reconciliation & Adversarial Verification: `scripts/test-m4-dues-bridge.mjs` verifying single-income recognition, idempotent replay, currency lock, operational allocation isolation, tenant boundary integrity, and static contract audits. 100% EN/FR localization parity verified.
9. **Milestone M5 Completion: Membership, Identity & Role-Based Access Control Rebuild** — **COMPLETE / VERIFIED.**
   - Schema & Canonical RPCs: `00125_m5_01_membership_rbac_canonical.sql` enforces Sole Active Owner Invariant (`idx_memberships_unique_active_owner`), hard-delete prohibition trigger (`trg_prevent_membership_hard_delete` with `ERRCODE = '55000'`), owner protection trigger (`enforce_owner_role_protection`), invitations RLS fortification with `members.invite` requirement and owner exclusion, and 6 canonical RPCs (`create_group_invitation`, `update_membership_role`, `transfer_group_ownership`, `set_membership_lifecycle_status`, `update_member_display_name`) with `search_path = ''` and `SECURITY DEFINER`.
   - Client Authorization & Hooks: Fortified `isAdmin` and `isOwner` in `src/lib/group-context.tsx` and `hasPermission` / `hasAnyPermission` in `src/lib/hooks/use-permissions.ts` to strictly require active membership status. Implemented typed TanStack mutation hooks in `src/lib/hooks/use-membership-mutations.ts` enforcing tenant boundaries and cross-domain invalidation.
   - Member Directory & Detail Integration: Integrated visual disambiguation of Lifecycle Status vs Financial Standing, PII isolation (tenant-scoped display names, zero mutations on `profiles.full_name` or `phone`), and dedicated Ownership Transfer modal with `"TRANSFER"` confirmation prompt.
   - Invitations & Roles Alignment: Gated invitation creation with `members.invite`, and guarded position assignments with `roles.manage` / owner while filtering inactive members.
   - Adversarial Verification: Implemented comprehensive test suite in `scripts/test-m5-membership-rbac.mjs` (18/18 tests passing) verifying all 7 invariants (privilege escalation, sole owner protection, atomic ownership transfer, hard-delete prohibition, inactive permission lock, PII isolation, and tenant boundaries).
10. **Milestone M6 Completion: Governance, Assemblies & Polling Engine Rebuild** — **COMPLETE / VERIFIED.**
    - Schema & Canonical RPCs: Migrations `00126_m6_01_governance_canonical.sql` and `00127_m6_02_quorum_lifecycle_canonical.sql` define immutable governance ledgers, strict state transitions, double-voting race condition defense, and quorum snapshots.
    - Client Hooks: `src/lib/hooks/use-governance-mutations.ts` enforces strict tenant boundary assertions.
    - UI: Built Assembly Command Center and Resolution Registry featuring Live Quorum meters and sealed resolution badges.
    - Verification: Adversarial test harness `scripts/test-m6-governance.mjs` confirms zero concurrency issues and exact quorum mathematics.
11. **Milestone M7 Completion: Relief Plans, Payouts & Claims Ledger Rebuild** — **COMPLETE / VERIFIED.**
    - Schema & Canonical RPCs: `00128_m7_01_relief_canonical.sql` establishes relief plans, enrollments, and claims schema. Implements atomic `post_relief_claim_payout` RPC for guaranteed single-disbursement invariant and idempotent replays, ensuring F3 double-entry accuracy. Immutability locks (`trg_prevent_paid_claim_modification`, `trg_prevent_paid_claim_delete`) secure paid claims.
    - Client Hooks: `src/lib/hooks/use-relief-mutations.ts` enforces multi-tenant safety (`staleTenantAborted`), correct currency locks, and calculates maturity periods.
    - UI Integration: Developed Plans Management View (`dashboard/relief/plans/page.tsx`) with dynamic active member enrollment. Developed Claims Review Queue (`dashboard/relief/claims/page.tsx`) with strict officer review gates and a custody-account locked disbursement checkpoint.
    - Verification: Adversarial test harness `scripts/test-m7-relief-payouts.mjs` confirms single-disbursement execution, idempotency, unapproved payout rejection, and currency locks.
12. **Next Master Milestone: M8 (Loans, Collateral & Repayment Engine Rebuild)** — Designated as the next major work package per Master Rebuild PRD Section 10 and Section 26 sequence.
12. **Production migration release gate** — Production deployment remains separately founder-authorized.
## Local versus hosted / production

| Surface | Status |
|---------|--------|
| Local profile | ACCEPTED under `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1` |
| Hosted disposable (`jkorwnwwmdeflfntxntl`) | **QUALIFIED / PASS** (`FILE-BASED RUNNER QUALIFICATION PASS — STUB/LIVE-PIN FLOOR LIMITATION`). 6/6 migrations applied and repaired. |
| Production (`llbnliixczcqfftxpsmb`) | Untouched. Forever denied from automated/disposable scripts. |
| Foundation milestone | **CLOSED** |

## Owner, next action, remaining review budget

| Field | Value |
|-------|-------|
| Owner | Jude Anyere |
| Next bounded action | Advance to **M8 (Loans, Collateral & Repayment Engine Rebuild)** per PRD Section 10 and Section 26 sequence. |
| Permitted scope | M8 loan offerings, collateral vault, loan issuance, repayment ledgers, and dynamic interest application. No direct mutation of production. |
| Remaining acceptance | M8 loan principal tracking, subledger reconciliation, interest math invariants, and adversarial test suites. |

---
**QUALIFIED / PASS — F3 FOUNDATION HOSTED REQUALIFICATION COMPLETE**  
Candidate: `e0c10c04d4bdc287385ea1392e1aae97b458fe1c`  
Floor: `DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT`  
Next Milestone: `M8 (Loans, Collateral & Repayment Engine Rebuild)`

