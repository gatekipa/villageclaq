# Financial Records and Reporting Review

> Baseline checkpoint. The later P1 continuation is documented in
> [Financial P1 Closure](financial-p1-closure.md). Its tested transaction,
> attribution, standing and receipt controls supersede this report's P1
> implementation holdbacks. The June audit and P2/P3 findings below remain
> historical evidence; neither report authorizes a production rollout.

Date: 2026-09-06
Repository: gatekipa/villageclaq
Working directory: C:\Users\nanye\Documents\villageclaq
Branch: codex/financial-reporting-consistency
Reviewed base: ba479fb510343c37cdfa888f6e94aeb7ab07292f

## Executive Verdict

**HOLD for the complete Financial Records and Reporting OS standard.**

This work improves deterministic contribution accounting, complete reads, cache
propagation, ledger filtering/export, and financial presentation. It does not
certify the entire financial mutation system as transactional, immutable, or
fully reconciled across all modules. The remaining P1 items below are material,
not cosmetic follow-ups. This is a local engineering branch, not a production
release or a migration approval.

## A. Current-State Audit

The initial local checkout was clean main at 407c80c. After a read-only remote
fetch, work began on a separate branch from current origin/main, ba479fb.
No OneDrive repository was used. June assumptions were checked against the
newer source, tests and migrations rather than treated as an implementation plan.

Relevant history:
- June money builds had already introduced money.ts, member balance views,
  participation reports, contribution scheduling, confirmed-only reads,
  standing exclusions and receipt-send confirmation safeguards.
- 5c17a1c hardened backend standing/date/dedup/log behavior.
- e189c62 and 407c80c repaired archival and relief-summary security behavior.
- 8de5194 fixed Report 16 hook order, report translations and prepared storage
  read-policy hardening.
- ba479fb added the inert action_intents ledger and read-only review inbox.
  Those newer boundaries were retained.

Reviewed sources include payment/contribution hooks, money.ts,
calculate-standing.ts and standing rules, finances, payment history, my-payments,
member detail, contribution matrix/object report/unpaid views, report pages,
CSV/PDF helpers, receipt URL/upload paths, schema/migrations and financial tests.
Fines, loans, projects, savings and relief were inspected for model/query
boundaries; their entire mutation lifecycle was not end-to-end certified.

Production inspection was limited to read-only database metadata on the
VillageClaq project. No business records or receipt contents were read or changed
for testing. Metadata showed RLS enabled on payments, contribution_obligations
and contribution_types, and the payment accounting/standing triggers present.
Local browser verification used synthetic records exclusively.

## B. June Reconciliation

"Before" describes the reviewed current implementation, not June's old snapshot.
COMPLETE is used only for the specific bounded item supported by evidence.

| June Financial Item | Current State Before Work | Action Taken | Final State |
|---|---|---|---|
| Independent contribution reports | PARTIAL: per-type participation, amounts, CSV and print existed | Paginated reads, restored type attribution, canonical overdue/remaining, compact summaries | PARTIAL: untyped-payment attribution and period views remain |
| Member financial statements | PARTIAL: member detail and self-service balance/history/proofs existed | Member-scoped complete payment reads; removed competing cross-type allocation on my-payments | PARTIAL: correction history and all statement variants need completion |
| Group financial rollups | PARTIAL: overlapping formulas and capped feeds | Canonical totals, complete payment/obligation reads, shared caches and unallocated credit | PARTIAL: general-payment slices and mixed currencies remain |
| Confirmed-only accounting | PARTIAL: shared engine existed, consumers diverged | Whitelisted confirmed/legacy statuses; pending separate; obligation-level debt; cent rounding | PARTIAL: read engine improved, SQL/write-path parity remains |
| Unified financial picture | PARTIAL: several independently modeled modules | Documented economic boundaries; did not combine unlike cash flows | PARTIAL |
| Event-linked reporting | PARTIAL: fines/events and project-purpose relations exist | Inspected actual relationships; no invented contribution/event links | PARTIAL |
| Report/export capability | PARTIAL: CSV, print and PDF helper already existed | Ledger CSV shares filters/order/totals; truthful all-time summary label | PARTIAL: uniform periods/report packs not completed |
| Payment History sorting/UX | PARTIAL: limited feed and limited controls | Complete ledger; date/type/method/status/search; accessible sort controls; page clamp; export parity | PARTIAL: broad role/device and very-large-ledger certification remains |
| Contribution-type lifecycle | PARTIAL: create/edit/close/reopen plus destructive delete | Removed destructive type-delete UI; retained close/reopen; invalidated dependent views | PARTIAL: database cascade/API historical protections remain |
| Receipt infrastructure | PARTIAL: private buckets, signing and proof association exist | Reviewed code and live policy metadata; retained secure signing | PARTIAL: legacy path fallback and role-based access tests remain |
| Pending-payment accounting | PARTIAL: intended exclusion existed but some consumers differed | Pending contributes zero collected/paid/standing credit; separately visible and tested | PARTIAL: full transactional confirmation/correction remains |
| Fines reporting | PARTIAL: fines and paid/pending summaries exist | Kept fines separate from contribution revenue; documented partial-payment limitation | PARTIAL |
| Loans reporting | PARTIAL: loans/schedules/repayments and reports 21-23 exist | Reviewed separate receivable/disbursement semantics; no artificial contribution income | PARTIAL |
| Savings/Njangi reporting | PARTIAL: cycles/participants/contributions and summary report exist | Documented contribution/payout distinctions; no cross-module netting | PARTIAL |

No full financial subsystem was rebuilt. Newer implementation superseded the
June assumption that member statements, per-contribution reports, scheduling,
private receipt access and confirmed-only logic did not exist at all.

## C. Financial Source of Truth

| Concept | Authoritative record / derivation | Important boundary |
|---|---|---|
| Contribution definition and schedule | contribution_types plus contribution-schedule.ts | is_active controls future use, not erasure of history |
| Member applicability / assessment | contribution_obligations membership_id, contribution_type_id, amount, due_date, period_label | Do not infer an assessment merely from a payment or current membership count |
| Payment amount and confirmation | payments.amount and payments.status | confirmed and legacy null/empty count; pending/rejected/unknown do not |
| Partial/full state | computeObligationStates / computeObligation | Derived from confirmed allocations, not stale amount_paid |
| Expected | Sum assessment amounts excluding explicit waived obligations | History remains even if a type/member is archived |
| Waived | Explicit obligation.status = waived | No invented payment; zero remaining; report waived separately |
| Confirmed cash collected | All confirmed non-relief dues payments in the authorized scope | Includes unallocated credit; not identical to assessment coverage |
| Pending | Pending payment count and amount | Informational only; no balance/standing credit |
| Outstanding | Sum of each non-waived obligation's positive remaining amount | One member/type's overpayment cannot erase another's debt |
| Overdue | Outstanding with due calendar date before today | A paid past-due assessment cannot make a future balance overdue |
| Unallocated credit | max(0, collected - (expected - outstanding)) | Exposes surplus/unattributed confirmed cash rather than concealing debt |
| Member position | Same allocation engine restricted to an immutable membership ID | Names are labels, not accounting keys |
| Contribution report | buildObjectReport using type/member identity and confirmed payments | Untyped payments need complete-scope attribution before slicing |
| Group rollup | computeMoneyFigures over all authorized dues records | Existing currency assumption is not an FX/consolidation engine |
| Assessment coverage rate | (expected - outstanding) / expected, zero for no assessment | Used by overview/financial summary; not gross cash divided by expected |
| Standing | calculateStanding, standing-rules and exclusions, plus persisted SQL standing | Read path remains side-effect free; persisted parity requires further work |
| Eligibility | Existing relief rules and standing-based member/benefit checks | No new eligibility policy; election UI also consumes stored good standing |

Typed payments remain restricted to that member and contribution type. Legacy
linked rows can recover missing member/type from their matching obligation;
conflicting links are not allocated to another member/type. General untyped
payments retain the existing oldest-due member-pool policy. Same-date ties now
use immutable obligation IDs. General payments must be allocated over the full
member scope before an independent report takes a type/period slice.

Money is rounded to two decimal places to match the existing NUMERIC(12,2)
storage. This is not a new multicurrency conversion policy. Relief-tagged
payments never cover ordinary dues.

## D. Event Propagation

| Financial event | Record and downstream path | Unfinished boundary |
|---|---|---|
| Confirmed payment recorded | payments -> confirmed allocation -> obligations/payment caches -> overview, statement, matrix, unpaid, reports, exports | Insert and legacy balance updates are separate client writes |
| Pending payment submitted | payments pending -> ledger pending total -> officer confirmation workflow | Does not count as collected or improve financial standing |
| Payment confirmed | status change -> database accounting trigger -> awaited cache invalidation -> all active financial reads | Persisted SQL standing and unlinked/cross-type behavior need parity testing |
| Payment rejected/corrected | status/amount change -> recomputation -> shared invalidation -> restored debt/updated collections | Current edit/delete flow is not an immutable adjustment ledger |
| New assessment / type edit / enrollment | definition/obligations -> shared invalidation -> expected/remaining/report reads | Recurrence/enrollment writes are not newly made transactional |
| Type closed/reopened | is_active update -> financial/type cache invalidation | Existing assessments/payments retained by UI |
| Member exits | Existing archival/status flow retains historical obligations/payments | No automatic waiver or historical rewrite invented |
| Explicit waiver | Existing waived assessment -> zero remaining, separate waived total | All waiver producers need final transaction/invalidation inventory |

invalidateFinancialQueries covers group payment/obligation/dashboard/matrix/
object/type caches and relevant member/standing caches. This is cache propagation,
not an autonomous executor. It never writes records or contacts members.
Legacy member-only keys are invalidated by membership ID, or conservatively
marked stale on a group-wide assessment change. Refetch permissions are unchanged.

The former finances "sync" button is now a read-only Refresh. A report refresh
must not rewrite financial truth. Missing/failed page reads throw instead of
silently showing partial totals or false zero balances.

## E. Implementation Inventory

- src/lib/money.ts: shared outstanding/overdue allocation, unallocated credit,
  conservative status handling, stable same-date allocation, cent normalization,
  object-report reconciliation and inclusive ledger-filter predicate.
- src/lib/read-all-pages.ts: complete bounded-page reads until an empty page;
  errors fail the whole read, including backend caps below the requested size.
- src/lib/financial-query-keys.ts: shared awaited financial cache invalidation.
- src/lib/hooks/use-supabase-query.ts: complete financial read modes, identity
  fields needed for allocation, left joins preserving history, member scoping,
  recorded-date duplicate preflight correction and shared invalidation.
- src/lib/hooks/use-money-overview.ts: reuse of existing complete query caches.
- src/lib/calculate-standing.ts: paginated, group/member-scoped dues reads only.
- Financial pages: finances, my-payments, contribution history, matrix, object
  report, contribution management, and reports/[reportId].
- src/components/finances/money-overview.tsx: unframed compact summary, evidence
  links, recent confirmed payments, next due and visible unallocated credit.
- src/lib/format.ts: date-only values stay on their calendar day across timezones.
- src/app/globals.css: apply the existing font where its CSS variable is defined.
- messages/en.json and fr.json: ledger filters/status wording and truthful
  all-time report name/description.
- package.json and financial tests: executable regression entry point and
  updated static guards; no new package/dependency.
- scripts/financial-qa-fixtures.mjs: loopback-only synthetic read-only fixture.
- This document: current state, June reconciliation, evidence and release holdbacks.

No provider, webhook, cron, bulk-receipt gating, action-intent executor,
production configuration or database migration file was changed.

## F. UX and Exports

The overview uses a compact responsive metrics band rather than nested summary
cards. Metrics link to the underlying ledger or outstanding records. Financial
history now has inclusive date, method, contribution, status and search filters,
reset, sortable columns, stable pagination, per-currency status totals, and CSV
in the same order as the filtered UI. A filter returning no rows has an explicit
empty state. Unknown payment statuses are not presented as confirmed.

The object report's twelve tall statistic cards became compact participation and
amount bands. Long type/member names wrap. Currency values use tabular numerals.
The summary report was labeled "Annual" despite computing all-time totals; its
EN/FR name and description now state the actual basis. Outstanding report order
matches amount owed and does not label a future balance "0 days overdue."

Existing printable and PDF paths remain. This work did not add a new document
generation subsystem or certify every report's PDF layout. Uniform report-period
selection across all reports remains unfinished.

## G-H. Correctness and Reconciliation Evidence

Local financial/static suite: 260 tests passed, zero failures at the recorded
checkpoint. This includes existing financial builds, schedule, standing,
exclusions, product money/dues and P0 bulk-receipt guards.
New executable invariants cover:
- 100 assessed / 100 confirmed -> 100 collected, zero outstanding, contributed.
- 100 assessed / 40 confirmed -> 40 collected, 60 outstanding, partial.
- 40 then 60 -> 100 collected, zero remaining across group/object/member figures.
- Rejected/corrected snapshots reverse totals without mutating test input history.
- Pending payments, explicit waivers, same-day vs overdue, exit/archive history.
- Multiple members/types; surplus cannot conceal a different member/type's debt.
- Legacy linked attribution and mismatched identity protection.
- Same-date allocation independent of input order and cent-precision completion.
- Inclusive date/method/type filtering, complete 1,205-row reads under a simulated
  100-row backend cap, and page-error rejection.
- Tenant-scoped cache invalidation and synthetic separated-group calculations.
- Calendar dates across New York, Los Angeles, Douala and Auckland.

These are not proof of live concurrent database transactions, historical
reversal persistence or authenticated multi-tenant RLS execution.

Synthetic browser reconciliation:
| Surface | Expected | Confirmed | Outstanding | Overdue | Pending |
|---|---:|---:|---:|---:|---:|
| Group overview / summary basis | 350 | 140 | 210 | 160 | 25 |
| Annual contribution object | 300 | 140 | 160 | 160 | 25 |
| Future special contribution | 50 | 0 | 50 | 0 | 0 |
| Member self-service statement | 150 | 100 | 50 | 0 | 0 |

The annual object has one fully paid, one partial and one pending member.
The pending member still owes 100. The officer outstanding view reconciles
100 + 60 + 50 = 210. The matrix agrees with the annual object.
The filtered ledger (September 1-10, cash) displays five rows and 25 confirmed;
the downloaded CSV was parsed and confirmed to contain five rows totaling 25.
Rejected 99 and pending 25 remain separate from the full ledger's confirmed 140.

## I. Browser / Responsive Verification

Used actual Next.js pages against loopback synthetic Supabase-shaped responses.
External browser requests and application mutation/send API requests were blocked.
The fixture has no upstream client and rejects every non-read method.

Verified at 1440x1000 and 390x844: overview, ledger, object report and self-service
statement; also inspected matrix, outstanding, reports 1/2, contribution list
and record-payment form. The form was not submitted. Filters, reset, empty
filters, empty ledger, read failure and French ledger labels were inspected.
No horizontal document overflow on the measured mobile financial pages. A
synthetic confirmed total of 123,456,889.12 also fit its mobile metric without
horizontal overflow, and the record-payment form fit the 390px viewport.
Date-only December 1 remains December 1 in the browser. The intended Geist font
renders after the shared body-class correction.

Screenshots are local QA artifacts, not production member information.
Residual UI limitations: existing global install prompt overlays lower content
until dismissed; wide detailed tables use contained horizontal scroll; some
older finance panels remain card-heavy; future-only balances still use overly
urgent member copy. Large-data pagination has executable coverage but not a
production-scale browser load benchmark. Full receipt viewing and submission,
live officer/member role switches, and all report PDF exports were not tested.

## J. Security / Authorization

No RLS policy, permission gate, service-role route or storage setting was changed.
Financial complete-read queries retain group filters; member self-service now
also constrains membership at the query boundary and waits for it to resolve.
Report grouping uses immutable IDs rather than potentially identical names.
The agentic inbox and action_intents infrastructure remain inert.

Read-only live metadata confirms RLS enabled on the three core financial tables.
The receipt SELECT policy is authenticated/group-based, not anonymous. However,
its legacy storage_path_group_id_v2(name) IS NULL fallback permits authenticated
access to unscoped legacy paths. Group-member access may also be wider than
member-private proof requirements. This requires a path/ownership inventory and
role-based tests before narrowing policy; it was not silently changed here.

No real receipts, full phone numbers, production tokens or provider payloads are
included in QA fixtures or this document. Static checks are not a credential
rotation or a complete security certification.

## K. Performance

Complete reads fix silent backend row-cap truncation; they do not promise
constant-size payloads. Page size is 500, continuing until empty even when the
server returns fewer rows. This avoids falsely treating a lower server cap as
the end of data. Stable unique ordering is required at each caller.

The overview now shares financial query caches instead of issuing a competing
set of queries. Financial summary and ledger share the complete payment basis.
Map-based membership/type allocation replaces conflicting page formulas.
The object report avoids an oversized obligation-ID filter by reading scoped
lean payments and filtering locally.

Remaining: offset paging is not a transaction snapshot under concurrent writes;
full joined ledger rows cost memory/network for very large groups; some legacy
module/report queries still use separate capped reads. A server-side read model
or scoped aggregate RPC needs an explicit consistency/authorization design,
not a parallel accounting subsystem.

## L. Schema / Infrastructure

No migration was created or applied. The present read-side fixes do not require
a schema change. Existing migrations were inspected, not executed.

Follow-up database design should provide an atomic, authorized payment command
with a caller operation ID, deterministic attribution, auditable correction/
reversal records, and trigger/standing parity. The current multi-write client
path is not made atomic by report cache invalidation. An exact migration should
follow the agreed command/attribution contract and be tested in an isolated
database before separate production approval.

Receipt policy changes likewise require scoped legacy-path remediation and
private access tests. No public-bucket workaround is appropriate.

## M. Production Safety

- No production financial/business data changed.
- No real WhatsApp, email or SMS sent.
- No reminders or receipts sent; no member contacted.
- No old failed notification rows retried.
- No production migration applied.
- No production deployment or main merge.
- No Meta/WABA, Stripe/payment-provider or production environment changes.
- No autonomous executor/reminder/receipt/financial mutation activated.
- Existing bulk receipts default OFF and both confirmation safeguards retained.
- Read-only metadata SELECTs only; all browser accounting scenarios synthetic.

## N. Remaining Financial Backlog

| Priority | Item | Required completion evidence |
|---|---|---|
| P1 | Atomic financial mutations, operation idempotency and corrections | Current useRecordPayment inserts then separately updates/cascades obligations; preflight duplicate detection is not atomic. History edit/delete remains mutable/hard-delete capable. Transactional command tests for failures/concurrency plus retained reversal evidence are required. |
| P1 | General-payment allocation and scoped reports | Typeless member pools must allocate once over full scope before type/year slices. Current independent type queries omit general cash; legacy write cascade can cross types while deterministic read allocation intentionally does not. Agree and implement one attribution contract. |
| P1 | Currency boundary | Ledger separates currency totals, but group/object/standing aggregates generally assume group currency. Mixed-currency records must be rejected, separated or converted by an explicit approved rule before aggregate certification. |
| P1 | Receipt privacy / legacy path fallback | Inventory legacy unscoped paths without exposing contents; validate owner/officer/member/cross-group access and prepare the narrow policy/path migration for separate approval. |
| P1 | Persisted standing and eligibility parity | Prove linked/unlinked payment confirmation, rejection and correction produce the same SQL-persisted standing as the read engine. Eligibility consumers use persisted standing in several paths. No new policy should be introduced. |
| P2 | Uniform report periods and complete detail | Ledger filters are implemented, but object and aggregate report periods are not uniform; historical snapshots and all module/detail queries need reconciliation. |
| P2 | Fines/loans/project/relief/Njangi reporting | Fines partial-paid summaries and independent modules need explicit comparable flow categories, complete reads and reconciliation without classifying payouts/disbursements as dues income. |
| P2 | AI insight freshness | AI consumes deterministic context, but existing one-shot cached narrative can outlive updated report data. Invalidate/recompute grounded narrative without letting AI supply financial amounts. |
| P2 | Scale and exports | Snapshot-consistent reads, large joined payload benchmarks, full mobile role matrix and all printable/PDF reports remain to verify. |
| P3 | Presentation cleanup | Reduce remaining duplicate cards, refine future-balance urgency copy and audit missing icon accessible names throughout older financial surfaces. |

No new P0 production incident was established by this bounded review. That does
not downgrade the material P1 release holdbacks.

## O. Next Gate

Review this local branch and the P1 findings first. Do not merge or deploy it as
a completed enterprise financial OS. Resolve the transactional attribution/
correction contract, currency handling and receipt authorization evidence,
then run isolated database mutation/concurrency/RLS tests and the remaining
desktop/mobile/export scenarios. Any production migration or communications
test requires separate explicit approval.

### Final Validation Record

- Financial regression suite: 260/260 passed on the final source.
- Storage and inert action-intent guardrails: 48/48 passed (static tests).
- WhatsApp static audit: passed; no live provider validation or sends.
- Webhook mock tests: 6/6 passed.
- Receipt-producer mock tests: 13/13 passed.
- TypeScript: npx tsc --noEmit passed; final npm run build also passed, including
  its TypeScript check and all 41 static pages. No deployment was performed.
- Targeted ESLint: zero errors, 15 warnings in existing unused declarations and
  memo dependencies. These warnings are not claimed to be resolved.
- git diff --check: passed. High-confidence changed-file secret/static scan:
  30 files checked, zero credential/full-phone matches, zero migration files or
  forbidden generated/env artifacts. This scan is not a complete secret audit.
- Aggregate: 327 passing tests across the financial, storage/action-intent,
  webhook and receipt-producer suites; the WhatsApp audit also passed.
- Local UI was verified at http://127.0.0.1:4318/en/dashboard/finances using the
  loopback fixture, not production. Dev/fixture sessions were stopped after QA;
  do not run financial browser tests against a production-backed .env file.
- Existing non-blocking build/browser notices: middleware convention warning,
  metadataBase fallback, an initial Recharts size warning and dev offline-page
  404s. They are not financial assertion failures and were not silently hidden.
