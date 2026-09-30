# FQ-09 owner calendar correction and focused closeout — 2026-09-30

## Boundary

Branch `codex/qualification-repair-247c8881`; incoming application `ee935b3d7b61eb878d7f22f13d66c332fe13d092`, evidence `3b2941f6fb4edf7d45e56bfabdd7b82c4b8e558a`. Isolated Supabase project `nisipxbuvndobyxqqglf` only. The approved Master Rebuild PRD and `docs/BUILD_STATUS.md` govern; the prior FQ-09 28-day expectation is superseded by Jude's explicit instruction. Landing redesign, R-012 quarantine, founder suppression, live billing and production database remain outside the changed scope. The prior repair report remains historical evidence for its tested application.

## Applied additive migrations

| Isolated history version | Repository file | Effect |
| --- | --- | --- |
| `20260930114102` | `20260930114102_fq09_calendar_anchor_and_tzs_precision.sql` | Generated obligation uses `min(selected due_day, last calendar day of occurrence month)` without changing `contribution_types.due_day`. TZS precision is 2 minor units. |
| `20260930114304` | `20260930114304_founder_enquiry_reader.sql` | Dedicated self-readable reader grant, contact SELECT policy, handling RPC and immutable handling log. Migration does not grant any identity. |
| `20260930114927` | `20260930114927_fq09_obligation_date_correction.sql` | Officer-authorized audited correction for untouched unpaid/non-waived obligations only; checks stale date, payment/allocation history and computes the date from the stored anchor. |

Applied `20260930035205` and `20260930035312` were preserved byte-for-byte. No production migration was applied.

## FQ-09 verification

- Rolled-back SQL trigger probe checked January 31 → February 28 → March 31 → April 30; February 29 in a leap year; day 30 returning after February; quarterly October 31 and leap February 29; annual leap February 29; December/January rollover; invalid-day rejection; duplicate rejection; and retry creating exactly one obligation. The probe left no contribution type in its group.
- Client schedule and preview tests: 20/20 passed. Focused FQ repairs: 13/13 passed. Updated historical Build 9/10 checks: 16/16 passed. TypeScript `--noEmit` passed. An initial sandboxed optimized build could not fetch Google Fonts; the network-enabled optimized build compiled, type-checked and generated all 47 static pages successfully. Targeted lint found only the inherited unused `useSubscription` warning in the contributions page after the new inbox effect was corrected.
- Reminder eligibility and confirmed-money basis were rerun against the changed due dates: 6/6 eligibility and 9/9 payment-basis checks passed, including group-local due date, DST, overdue opt-in, paid/waived/partial and per-type isolation.
- In the actual English contribution form, fictional monthly day 31 showed a September 30 preview. Submission stored type `a82eb7f7-513a-4799-afaf-8896ee756fb9` with `due_day=31`, and obligation `b4da0590-06b7-40bd-808e-66c5f243f24e` due `2026-09-30`.
- In the actual French contribution form, fictional quarterly day 29 displayed the short-month explanation. Submission stored type `e2e84833-35cd-4813-a237-8e7fea6e3522` with `due_day=29`, and obligation `398e1eff-ed68-4092-8db9-690e132a790b` due `2026-09-29`.
- Both form locales explain next to the due-day field that a short month ends on its last day and a later month returns to the selected day. The monthly preview uses that rule; quarterly and annual labels retain the established group-calendar behavior and avoid inventing a next occurrence.

### Existing obligations and correction boundary

One pre-existing monthly day-31 schedule `9e831f50-f893-448c-a417-18380d5fb498` had six September 28 obligations from the superseded rule. The audited command changed only untouched obligation `a261efce-d4c5-4eff-bce9-415e753119d3` to September 30. Its replay returned `ALREADY_CORRECTED` and created no second audit. An attempted correction of a payment-linked obligation returned `OBLIGATION_HAS_HISTORY`.

The other five retain September 28: two have confirmed payments totaling their 20.00 amount, one has a 5.00 partial confirmed payment, and two are waived. Their obligation status/amount_paid fields do not fully reflect the related payments, so reconciliation must use payment lineage as well as the obligation row. They require finance-owner review of historical presentation/reminder implications and a separately authorized history-safe correction if needed. No paid, partial or waived due date, financial posting, or waiver was silently rewritten. This remains a named historical-data blocker for full FQ-09 closeout; future schedule generation is repaired.

## Currency and unchanged financial callers

SIX's authoritative ISO 4217 List One records TZS at two minor units; XAF, XOF, UGX and RWF have zero. The prior application table had TZS at zero. Application and isolated `financial_core.currency_scale` now both use 2 for TZS. A hosted SQL probe returned TZS 2/XAF 0/USD 2 and accepted `TZS 1234.50`; XAF whole-unit value remained accepted. There are no TZS groups, payments or financial events in this isolated fixture to migrate. Existing FQ-10 proof covers all 18 offered currencies and shared dues, loan, ticket, Relief posting, balance, audit, once-only retry and denial, with persisted XAF/CAD payments. The earlier `financial_core.post_module_pair` repair itself was unchanged.

Source: [SIX ISO 4217 currency list](https://www.six-group.com/en/products-services/financial-information/market-reference-data/data-standards.html) and its linked [List One XML](https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml), checked 2026-09-30.

## FQ-11 and contact

FQ-11 code was unchanged. Its focused tests passed future/due-today/past-due, partial, paid and waived, timezone boundary, and complete paged retrieval. The previous isolated EN/FR browser checkpoints, 112.50 CAD outstanding / 35.00 CAD overdue, remain valid for the original dates. Correcting the one due date changes the live overdue interpretation for that specific old fixture, so the historical number must not be reused as a current screenshot claim. The remaining five historical dates are explicitly reported above.

The existing founder Auth identity was resolved from verified account/profile evidence and received the single `enquiry_readers` row; the account was not given a `platform_staff` role. A fictional anonymous `/en/contact` submission persisted as `b8bc5c4d-3662-4462-b6a8-be418dbfdb57`. The founder opened `/en/enquiry-inbox`, saw it, saved `in_progress` and an internal note, and the change persisted with a handling-log row. A separate SQL-created fictional enquiry also persisted and was handled. A signed-in ordinary member and an unrelated owner identity each read zero enquiries and zero reader grants; the unrelated identity's handling RPC returned `42501 ENQUIRY_ACCESS_REQUIRED`. Anonymous insert worked without SELECT/RETURNING, matching the form. No external email was sent. EN/FR contact copy and the inbox state that submissions/notes are stored without promising delivery; unverified telephone, address and mailbox claims were removed. No DNS or external provider change.

## Review and delivery

Actual GPT-6 Sol reviewed application `92f31c6` once as the consolidated independent round. It found one P2: the dedicated inbox's single read would omit enquiries after PostgREST's row cap. Application `b3e09dd` repairs this with shared exact-count paging and stable `created_at,id` ordering. The same GPT-6 Sol performed the permitted focused repair verification and returned **PASS**, with no remaining material new-code finding in the focused scope. Its financial/scheduling application verdict is PASS in that scope; the five historical FQ-09 obligations are a separate full-closeout HOLD. No final blocker-only round was used. Public promotion follows Jude's visual acceptance; the isolated backend, R-012 quarantine and rollback references remain in `BUILD_STATUS.md`.

Final application SHA: `b3e09ddbbfb7bf27beb07332cc23194c3acd191e`. Final READY protected Preview: `dpl_ELcPJNE7DB6XWsfjt6RK4BP5vkin`, `https://villageclaq-llvgk3hbk-gatekipas.vercel.app`. Vercel metadata identifies that exact application SHA. An authenticated preview status request returned founder mode, isolated binding, service credential verification, external delivery suppression and scheduled side-effect suppression all true. The evidence SHA is the repository commit containing this report and is supplied in the closeout handoff.
