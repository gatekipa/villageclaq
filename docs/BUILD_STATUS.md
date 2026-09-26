# Current status — VillageClaq build and release qualification

**Current release-candidate qualification:** **HOLD** for the focused repair branch `codex/qualification-repair-247c8881`, based on `review-audit-m15` at `247c8881b875b7f013254cc3efc6ddc16bcfc3c3`. See the [consolidated repair qualification](QUALIFICATION_REPAIR_247C8881.md) and [initial before evidence](POST_BUILD_AUDIT_REPORT.md). This does not reopen the F24 migration-mechanics result.
**F3 foundation hosted requalification:** QUALIFIED / PASS for the documented fixture at `e0c10c04d4bdc287385ea1392e1aae97b458fe1c` only.
**Floor (verbatim):** DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT  
**This file is the current remainder record.** Historical packages are linked, not copied.

Working rules: [AGENTS.md](../AGENTS.md). Product conventions: [CLAUDE.md](../CLAUDE.md).  
Authoritative rebuild plan: [Master Rebuild PRD v1 (PR #71, commit `050be86c9df3455c66b27bb5853eb786228b4009`)](https://github.com/gatekipa/villageclaq/blob/050be86c9df3455c66b27bb5853eb786228b4009/docs/VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md).
Approved local comparison contract: [LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1.md).  
Repair amendment: [REPAIR_AMENDMENT.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_LOCAL_ACCEPTANCE_CONTRACT_20260920/REPAIR_AMENDMENT.md).  
Authorized local-capture record: [docs/evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md](evidence/M3_F3_DAYBREAK_CATALOG_V5_F23_FINGERPRINT_CAPTURE_LOCAL_20260920/CAPTURE_ATTEMPT_2/CHIEF_HANDOFF.md).  
**Completed hosted requalification evidence:** [F24 hosted requalification](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/).

## Current repair qualification checklist — base `247c8881` (updated 2026-09-26)

### VC finding tracker (same qualification outcome)

VC-01 and VC-02 reconcile to the two P1 findings in the [initial audit report](POST_BUILD_AUDIT_REPORT.md) and are one financial-integrity outcome. VC-03 is the existing discarded-migration evidence gap; VC-04 the existing runtime/browser evidence gap; VC-05 the existing mandatory-gate gap; VC-06 the existing Astra access blocker. These are the supplied IDs for the current outcome, not new findings or review rounds.

**VC-01 + VC-02 combined outcome:** focused code repair and isolated behavioral verification are complete; release qualification remains open until representative migration/browser evidence and independent review close. Production remains HOLD.

| ID | Owner | PRD requirement | Status | Next action | Closure evidence | Exact verified commit |
|---|---|---|---|---|---|---|
| **VC-01 — durable financial retry identity** | Daybreak Blue; Astra independent verification pending | P-009, F3-07, universal high-risk matrix 4–9 | **Repair implemented; focused PG17 PASS; release open.** Same-intent replay, legitimate second intent, changed payload, concurrency, tenant/actor and revoked-authority cases pass. | Run fresh-device browser recovery on a full-schema isolated candidate and obtain independent review. | [Before probe](evidence/QUALIFICATION_247C8881/fresh-device-finance-retry.result.txt); [after regression](evidence/QUALIFICATION_247C8881/manual-intent-regression.result.txt); [consolidated report](QUALIFICATION_REPAIR_247C8881.md). Browser closure pending. | `4f90266e9716ad11c55fce6443359a1260f9e172` (focused local behavior/build). |
| **VC-02 — trustworthy atomic financial audit** | Daybreak Blue; Astra independent verification pending | SEC-005, P-008, universal high-risk matrix 10–11; applicable G-009 atomicity | **Repair implemented; focused PG17 PASS; release open.** Ordinary forgery/direct bypass denied; new F3 events have one server-authored audit; injected audit failure rolls back and retry has no duplicate success row. | Rehearse `00137` on a full-schema isolated Supabase candidate, inspect legitimate activity workflows in browser, and obtain independent review. | [Before audit code/policy path](POST_BUILD_AUDIT_REPORT.md); [after regression](evidence/QUALIFICATION_247C8881/manual-intent-regression.result.txt); [consolidated report](QUALIFICATION_REPAIR_247C8881.md). Full-schema closure pending. | `4f90266e9716ad11c55fce6443359a1260f9e172` (focused local behavior/build). |
| **VC-03 — discarded F3 migration edits** | Daybreak Blue | P-003, F3-09, high-risk matrix 11–12 | **Evidence gap open; functional impact not demonstrated.** Incomplete fragment preserved; all 141 visible nonblank additions occur in current 00118–00123. F24 passed those six migration mechanics on its documented fixture, without proving a clean replay or every approved F3 journey. | Use applicable F3 behavior in the full-schema isolated qualification for VC-04; preserve uncertainty about missing fragment lines. Do not repeat the exhausted recovery search. | [Incomplete fragment](recovery/recovered-migrations-incomplete.patch), [F24 fixture evidence](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/), [repair report](QUALIFICATION_REPAIR_247C8881.md). Full behavioral closure pending. | `e0c10c04d4bdc287385ea1392e1aae97b458fe1c` (F24 fixture); `4f90266e9716ad11c55fce6443359a1260f9e172` (unchanged F3 files in repair). |
| **VC-04 — essential browser and hook verification** | Daybreak Blue | F3-09, H-008/H-010, UX-001–009, MOB-001–002; applicable high-risk matrix 1–3, 6, 13–14 | **Runtime evidence gap open.** Local build and focused database behavior pass; authenticated finance, navigation, admin, search-param, callback, phone-input, tenant and EN/FR mobile journeys remain unexecuted on a suitable candidate. Existing disposable lacks `group_audit_logs` and M15 profile/request tables; the READY branch preview has no proven isolated database binding. | Establish a full-schema isolated Supabase candidate with fictional users and a verified preview/database binding, then execute the named journeys and negatives. | [Current qualification report](QUALIFICATION_REPAIR_247C8881.md); Vercel preview [READY at this SHA](https://vercel.com/gatekipas/villageclaq/Ch3S9EdXKCposqAEGR4zBWzaE2VR) proves build only. Browser closure pending. | `4f90266e9716ad11c55fce6443359a1260f9e172` (build and focused DB); none browser-verified. |
| **VC-05 — mandatory CI and lint classification** | Daybreak Blue; repository administrator for protected-gate visibility | PRD §24 merge/release gates 4–5 | **Gate gap open.** Repair SHA: `tsc`, changed-file ESLint and build PASS; full `npm run lint` exits 1 with 82 errors/398 warnings (53 source errors, zero in changed code), matching the previously recorded 82/53 baseline errors. No `.github` workflow or ruleset is visible; branch-protection read was denied. Vercel preview status is success, but mandatory enforcement remains unidentified. | Obtain the actual required branch/security check policy from an authorized admin; compare/enforce the required gates on this SHA. Keep inherited lint warnings in one advisory backlog unless a required gate makes them blocking. | [Exact-SHA local gates](evidence/QUALIFICATION_247C8881/vc05-current-gates.result.txt), [repair report](QUALIFICATION_REPAIR_247C8881.md), and [Vercel success](https://vercel.com/gatekipas/villageclaq/Ch3S9EdXKCposqAEGR4zBWzaE2VR). Required-check closure pending. | `4f90266e9716ad11c55fce6443359a1260f9e172`. |
| **VC-06 — Astra independent review access** | Astra (independent reviewer) when accessible; Daybreak Blue coordinates; Jude owns reviewer substitution | PRD §24 security review; repository independent-review cap | **Access blocker open.** Actual `gpt-6-astra` delegation returned HTTP 403 before execution twice; no independent round, findings, or verdict exist. No changed access condition supports an identical retry. | Enable a supported Astra standard-safeguard path, or obtain Jude's explicit reviewer-substitution decision, then run only the bounded remaining review on the repair SHA. | [Repair report](QUALIFICATION_REPAIR_247C8881.md) and recorded 403 agent status; no independent closure evidence. | `4f90266e9716ad11c55fce6443359a1260f9e172` ready for review; none independently verified. |

| Scope | Current evidence and disposition |
|-------|----------------------------------|
| Recovered F3 edits | Fragment preserved at [recovered-migrations-incomplete.patch](recovery/recovered-migrations-incomplete.patch). It starts with a truncation marker; all 141 visible nonblank added lines are present in current 00118–00123 SQL. Lost lines and behavioral completeness cannot be inferred. F24's unchanged 00118–00123 migration mechanics remain qualified on its stated fixture floor. |
| Hook repairs | Changed navigation, admin, search-param, callback, and phone-input files compile and targeted ESLint has 0 errors. Authenticated browser behavior remains unexecuted. |
| Financial/tenant/retry/receipt | The original duplicate and audit defects are preserved as before evidence. Repair `00137` and the UI now provide actor-bound durable intent recovery and atomic server audit for new F3 events. Isolated PG17 regression passes same-intent/second-intent/conflict/concurrency/revocation, forgery denial, audit rollback, and bridge-style audit. Receipt producer 13/13 and bulk receipt 9/9 pass. Full-schema/browser and independent acceptance remain open. |
| Essential browser journeys | Exact-SHA Vercel preview is READY, but no isolated M4–M15 schema, users, and fictional fixtures are configured. Preview GET/auth response is not an approved end-to-end browser pass. |
| Mandatory gates | Repair branch `tsc --noEmit`, network-enabled `next build`, and targeted changed-file ESLint pass. Product money 30/30, receipt producer 13/13, bulk receipts 9/9 pass. Repository-wide ESLint has inherited failures; no `.github` workflow or ruleset is present, and branch-protection read is permission-denied, so the mandatory CI gate set is not fully established. |
| Independent review | GPT-6 Astra delegation attempted with exact SHA and bounded scope; model access returned 403 before execution. No independent round was consumed; Astra PASS/HOLD remains pending. |

## Authorization (do not collapse these)

| Action | Status |
|--------|--------|
| **Local fingerprint comparison profile `LOCAL_FINGERPRINT_COMPARISON_PROFILE_V1`** | **Approved for local catalog comparison only.** Oracle `postgres` → local `ubuntu` in owner, grantor, and owner-self grantee only. Seven non-grantable `service_role` omissions on exactly `public.financial_ledger_epochs`, bound to sealed envelope `eb58900b492b95371decfdab86b3786afc2c8089c6b0a117497f9e0b22c41a2a`. Does **not** map `authenticated` or `service_role`. Does **not** authorize repair or hosted equality. |
| **Local post-commit filename-version repair** | **Not mandatory** for local qualification. Atomic/pre-commit refusal remains fail-closed (`repairCalls=0`). Historical refusal not rerun. |
| **Hosted reset / hosted qualification (F24 fault-injection qualification)** | **QUALIFIED / PASS.** Clean preserve-reset committed (`QUALIFICATION_BASELINE_PRESERVE_BTREE_GIST_V1`, `btree_gist` preserved, 0 history rows). Complete sequence 00118–00123 executed in `fault-injection` mode: all 15 safety gates passed, positive repair verified for all 6 migrations, retry verified with 0 pending, exact history identities recorded (6/6). Evidence: [F24 qualification package](evidence/M3_F3_DAYBREAK_CATALOG_V5_F24_HOSTED_REQUAL/hosted/qualify-from-00118/). |
| **F3-06 (Financial Configuration UI)** | **COMPLETE / VERIFIED.** Route `/dashboard/finances/config` created with tabbed panels (`AccountsTab`, `FundsTab`, `CategoriesTab`), `RequirePermission("finances.manage")` gating, `PermissionGate` entry point in finances header, TanStack Query/Mutation hooks in `src/lib/hooks/use-financial-config.ts` enforcing epoch binding, default fund invariants, system category protection, and balance preflight for account closure. EN/FR localization parity verified. |
| **F3-07 (Transaction Entry UI: Money In, Money Out, Transfer)** | **REPAIRED IN BRANCH; CURRENT RELEASE QUALIFICATION HOLD.** A private prepared intent persists the exact command for same-actor recovery across sessions/devices; the UI offers retry and explicit separate transaction. New F3 event audit is server-authored in the posting transaction. Focused isolated regression passes, while full-schema/browser and independent acceptance remain open. See the [repair report](QUALIFICATION_REPAIR_247C8881.md). |
| **F3-08 (Financial Projections & Read Proof UI: Ledger, Journal & Balances)** | **COMPLETE / VERIFIED.** Implemented canonical double-entry projection client hooks `useFinancialProjectionBundle` and `useFinancialCashbook` in `src/lib/hooks/use-financial-projections.ts` wrapping canonical RPCs `get_financial_projection_bundle` and `get_financial_cashbook`. Implemented projection UI components under `src/components/finances/projections/`: `AccountBalancesCard` (custody balances by currency + fund cash allocations), `StatementOfActivityCard` (inflow, outflow, and net operating result with surplus/deficit indicators), and `GeneralLedgerCashbook` (interactive cashbook table, date presets, account & currency filters, client-side search, exact decimal running balances, posting audit modal with graceful redaction support, and UTF-8 BOM CSV export `exportCashbookToCsv`). Mounted directly onto `/dashboard/finances/page.tsx` with clean section dividers. Verified through zero-trust self-audit: zero occurrences of `parseFloat` or standard JavaScript float math on money fields (exact decimal strings preserved via `formatExactAmount`), zero direct table queries bypassing RPCs, mobile viewport responsive table wrappers (`overflow-x-auto`), 100% EN/FR localization parity (68 keys), and clean passes across ESLint, `tsc --noEmit`, `test:product-money` (30/30), and `test:product-dashboard` (20/20). |
| **F3-10 (Opening Cash & Balance Migration UI)** | **COMPLETE / VERIFIED.** Implemented dedicated opening balance client mutation hook `src/lib/hooks/use-opening-balance.ts` invoking canonical RPC `public.post_financial_opening_cash(jsonb)` with strict tenant boundary assertion, UUID occurrence/provenance token generation, exact decimal string validation, and query cache invalidations. Implemented preflight hook `useAccountOpeningBalanceStatus` for inspecting established opening entries. Implemented modal component `src/components/finances/config/set-opening-balance-dialog.tsx` featuring double-entry capital equity offset notices, account summary card, active fund selector defaulting to general fund, date validation, live-validated provenance textarea, and confirmation receipt view. Integrated row action into `src/components/finances/config/accounts-tab.tsx` with `finances.manage` permission gating, status/kind invariant disable rules, and render-phase tenant reset. Verified with 100% EN/FR translation key parity (45 keys in `openingBalances`), clean ESLint/TSC, and passing test suites. |
| **M3 Financial Foundation Status** | **HISTORICAL BUILD COMPLETION (F3-01 through F3-10); CURRENT RELEASE QUALIFICATION HOLD.** The F24 00118–00123 migration mechanics result remains qualified on its stated fixture. Focused F3-07 and financial-audit repairs pass an isolated PG17 regression; complete candidate qualification remains open. |
| **M4 (Contributions & Dues Canonical Rebuild)** | **COMPLETE / VERIFIED.** Built canonical bridge schema (`00124_m4_01_dues_f3_bridge.sql`) linking payments to general ledger (`financial_event_id`, `financial_account_id` with `ON DELETE RESTRICT`) and `post_dues_payment_confirmation` RPC. Built atomic client mutation hooks (`src/lib/hooks/use-dues-posting.ts`). Integrated admin dues recording (`record/page.tsx`) with custody account selection and multi-tenant safety. Integrated payment confirmation review queue (`history/page.tsx`) with posted ledger badge and custody selection dialog. Validated bridge invariants and subledger reconciliation isolation via standalone adversarial harness (`scripts/test-m4-dues-bridge.mjs`). 100% EN/FR localization parity verified. |
| **M5 (Membership, Identity & Role-Based Access Control Rebuild)** | **COMPLETE / VERIFIED.** Built migration `00125_m5_01_membership_rbac_canonical.sql` with preflight pins, partial unique index `idx_memberships_unique_active_owner`, hard-delete trigger prohibition (`trg_prevent_membership_hard_delete` with `ERRCODE = '55000'`), owner protection trigger (`enforce_owner_role_protection`), invitations RLS fortification, and 6 canonical RPCs (`create_group_invitation`, `update_membership_role`, `transfer_group_ownership`, `set_membership_lifecycle_status`, `update_member_display_name`). Built typed TanStack mutation hooks (`src/lib/hooks/use-membership-mutations.ts`) with tenant boundary assertion and multi-domain cache invalidation. Fortified client auth in `src/lib/group-context.tsx` and `src/lib/hooks/use-permissions.ts` (denies inactive memberships). Refactored Member Directory (`dashboard/members/page.tsx`) and Member Detail (`dashboard/members/[id]/page.tsx`) with distinct Lifecycle Status and Financial Standing visual badges, PII isolation (zero profile mutations), and dedicated ownership transfer dialog with `"TRANSFER"` confirmation prompt. Aligned Invitations (`dashboard/invitations/page.tsx`) and Role Matrix (`dashboard/roles/page.tsx`) with permission gating. Verified with adversarial harness (`scripts/test-m5-membership-rbac.mjs`, 18/18 tests passing), 100% EN/FR localization parity, clean ESLint, and clean TSC. |
| **M9 (Events, Attendance, Calendar & Ticketing Ledger Rebuild)** | **COMPLETE / VERIFIED.** Built migration `00130_m9_01_events_ticketing.sql` adding `ticket_tiers`, `ticket_purchases`, and canonical RPCs. Implemented F3-integrated financial flow for ticket purchases via `financial_core.post_f3_command` enforcing strict double-entry ledger parity, currency match, and active custody account existence. Built typed TanStack mutation hooks (`src/lib/hooks/use-events-mutations.ts`) wrapping all M9 canonical RPCs. Monolithically refactored `events/page.tsx` and `attendance/page.tsx` to strip thick-client mutations, wiring up canonical hooks and custody gates. Verified with standalone adversarial harness `test-m9-events-ticketing.mjs` ensuring idempotency, capacity enforcement, and ledger integrity. 100% EN/FR localization parity verified. |
| **Next Master Milestone** | **M12 (Production Hardening, E2E Verification & Disaster Recovery)** designated per PRD Section 10 and Section 26 sequence. Followed by M13 (§31 Planned), M14 (§31 Planned), M15 (§31 Planned). Merge/deploy to `origin/main` remains separately founder-controlled. |
| **Merge / deploy to `origin/main`** | **Not authorized** without explicit founder sign-off for release. |

## Authoritative build-plan reference

The authoritative Master Rebuild PRD reference is:
- **[Master Rebuild PRD v1](https://github.com/gatekipa/villageclaq/blob/050be86c9df3455c66b27bb5853eb786228b4009/docs/VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md)** on PR #71 at commit `050be86c9df3455c66b27bb5853eb786228b4009`.
- **Governing sequence:** M3 F3 Foundation (F3-01 through F3-05) is **QUALIFIED / PASS** and closed. Per Master PRD sequence (Section 26 / Section 29), the next active slice is **F3-06 (Financial Configuration UI: Accounts, Funds, and Categories)**.

Other linked artifacts:

| Artifact | Role |
|----------|------|
| [Master Rebuild PRD v1 (PR #71, `050be86c…`)](https://github.com/gatekipa/villageclaq/blob/050be86c9df3455c66b27bb5853eb786228b4009/docs/VILLAGECLAQ_MASTER_REBUILD_PRD_V1.md) | **Authoritative rebuild plan.** Governs overall sequence, tenant safety, financial invariants, and slice boundaries. |
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
7. **Milestone M3 Completion** — Historical build-completion record retained. Current release qualification is **HOLD** for F3-07 fresh-device retry and consequential audit; the earlier “0 open defects” and “production-ready” claims do not describe candidate `247c8881`.
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
12. **Milestone M8 Completion: Loans, Collateral & Repayment Engine Rebuild** — **COMPLETE / VERIFIED.**
    - Schema & Canonical RPCs: `00129_m8_01_loans_canonical.sql` hardens the schema with strict principal and interest bounds. Integrates atomic double-entry F3 posting for disbursements and repayments. `trg_assert_loan_guarantor_eligibility` defends against self-guarantee and bad-standing guarantors.
    - Client Hooks: `src/lib/hooks/use-loans-mutations.ts` abstracts UI mutation states into safe RPC calls with deterministic error mapping (`parseLoanRpcError`).
    - UI Integration: Monolith refactor of `loans/page.tsx` introduces `getCustodyAccounts` resolver and strict Defensive Modal Gates protecting against currency mismatch, negative inputs, and overpayment.
    - Verification: Adversarial test harness `scripts/test-m8-loans-engine.mjs` verifies double-entry split math, idempotent replay, guarantor rules, overpayment prevention, and auto-settlement transitions.
13. **Milestone M10 Completion: Financial Reporting, Auditing & Export Engine Rebuild** — **COMPLETE / VERIFIED.**
    - Schema & Canonical Views: Migrations `00131_m10_01_financial_statements.sql` establishes canonical reporting views `v_f3_trial_balance` and `v_f3_account_ledger`, integrating strict epoch offsets and double-entry invariants.
    - Client Hooks & UI Refactor: `src/lib/hooks/use-reports-queries.ts` safely handles currency partitioning. `<CanonicalReportRenderer />` excises legacy `.reduce()` logic.
    - Auditing & Exports: Tamper-evident cryptographic fingerprint (SHA-256) pipeline is built into `export.ts` / `export-pdf.ts` locking statement validity.
    - Verification: Adversarial test harness `scripts/test-m10-financial-reports.mjs` verifies mathematical equilibrium, multi-currency isolation, temporal date constraints, and SHA-256 fingerprint determinism.
14. **Milestone M11 Completion: Transactional Communications & Notification Delivery Engine Rebuild** — **COMPLETE / VERIFIED.**
    - Schema & Transactional Outbox: Migration `00132_m11_01_communications_outbox.sql` fortifies the queue with leased locks, composite unique constraints (`group_id`, `idempotency_key`) for idempotency, and explicit `status` enums. Built canonical RPCs `queue_transactional_notification`, `claim_notification_batch` (using `FOR UPDATE SKIP LOCKED`), and `settle_notification_delivery` for transactional draining and exponential backoff.
    - Template Engine & Sanitization: Built `src/lib/communications/template-engine.ts` establishing deterministic rendering for all event templates. Implemented strict Anti-XSS `escapeHtml` primitives and enforced `https://` only URL sanitization.
    - Client Hooks & UI Refactor: Replaced un-safe client-side mutations with canonical hooks in `src/lib/hooks/use-communications-mutations.ts`. Monolithically refactored `dashboard/announcements/page.tsx` eliminating raw `.insert()` calls, enforcing render-phase tenant cache hygiene.
    - Workers Fortification: Architected `drain-notification-queue` worker with leased batching, resilient mock-dispatch, settlement routines, and 5000ms Vercel timeout guards. Rebuilt `send-scheduled-announcements` to use atomic `UPDATE ... RETURNING` resolving race conditions.
    - Verification: Adversarial test harness `scripts/test-m11-communications.mjs` verifies zero-overlap locking, deduplication, stolen lease defense, exponential backoff, dead_letter transitions, anti-XSS escape logic, atomic claims, and cross-tenant isolation.
15. **Milestone M12 Completion: Production Hardening, E2E Verification & Disaster Recovery** — **COMPLETE / VERIFIED.**
    - Security Posture: `00133_m12_01_security_hardening.sql` dynamically enforces `search_path = ''` on all `SECURITY DEFINER` RPCs across `public` and `financial_core`. 
    - Tenant Isolation: `financial_core` execution strictly revoked from `public`/`anon`. RLS explicitly mandated on internal ledger tables (`epoch_transitions`).
    - Disaster Recovery: `src/lib/disaster-recovery/ledger-replay.ts` implements strict snapshot extraction and deterministic `rehydrateLedger()` calculation.
    - E2E Lifecycle: `test-m12-e2e-lifecycle.mjs` executes full tenant simulation covering Dues, Loans, Relief, Events, and Governance, proving global state invariant equilibrium.
16. **Milestone M13 Completion: Group Referrals & Ingress Architecture** — **COMPLETE / VERIFIED.**
    - Schema & Attribution: `00134_m13_01_referrals_and_ingress.sql` defines `organization_referrals` with strict `search_path = ''` canonical RPCs enforcing `issued` -> `claimed` -> `activated` transitions.
    - Privacy Isolation: Referrals fully partitioned. Public tokens expose zero financial/PII data.
    - Client Ingress & Hooks: `useGroupReferral` and `useReferralIngress` correctly buffer tokens in `sessionStorage` and claim atomically during organization provisioning.
    - Edge Defenses: WhatsApp & SMS deep links gracefully strip injected query trackers and encode UTF-8 correctly.
    - Verification: Full UI mock and API algorithmic simulations in `test-m13-client-ingress.mjs` and `test-m13-referrals-ingress.mjs` successfully executed.
17. **Milestone M14 Completion: Share a Community Card or Achievement** — **COMPLETE / VERIFIED.**
    - Schema & Projections: `00135_m14_01_community_cards.sql` defines `community_share_cards` with a strict `display_data` sanitization boundary and consent assertions.
    - Privacy Invariants: Financial data, PII, and internal UUIDs are completely omitted from edge projections.
    - Opaque Verification & Revocation: `verify_public_share_token` allows public read-only assertions, while `revoke_share_card` enforces strict RLS-like ownership checks.
    - Client Hardening: Hooks, payload parsing (`sanitizePublicCardPayload`), and the public verification UI were constructed to fail closed and drop anomalous schema fields.
    - Verification: Adversarial execution in `test-m14-community-cards.mjs` and `test-m14-ui-flows.mjs` confirmed zero-leakage constraints.
18. **Milestone M15 Completion: Optional Public Organization Page** — **COMPLETE / VERIFIED.**
    - Schema & Ingress: `00136_m15_01_public_org_profiles.sql` enforces private-by-default profiles and isolates membership requests.
    - Hooks & Validation: `useOrganizationPublicProfile` and `useMembershipRequestSubmission` successfully trap route drift and enforce XSS/length sanitization client-side.
    - SEO & Edge Rendering: The dynamic `/org/[slug]` page safely renders public data without exposing internal invariants, generating strict metadata bounds.
    - Verification: Full UI mock and API algorithmic simulations in `test-m15-ui-flows.mjs` and `test-m15-client-hooks.mjs` validated all edge defenses.
19. **VILLAGECLAQ MASTER REBUILD PROGRAM (M0 - M15) — FULLY SEALED AND QUALIFIED.**
20. **Production migration release gate** — Production deployment remains separately founder-authorized.
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
| Next bounded action | None. The Master Rebuild Program is complete. Await founder deployment authorization. |
| Permitted scope | Program sealed. |
| Remaining acceptance | Master Rebuild successfully concluded. |

---
**QUALIFIED / PASS — F3 FOUNDATION HOSTED REQUALIFICATION COMPLETE**  
Candidate: `e0c10c04d4bdc287385ea1392e1aae97b458fe1c`  
Floor: `DOCUMENTED QUALIFICATION FIXTURE — NOT A CLEAN 00001–00117 REPLAY AND NOT PRODUCTION-EQUIVALENT`  
Next Milestone: `PROGRAM COMPLETE / SEALED`
