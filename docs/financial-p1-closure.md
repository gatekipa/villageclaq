# Financial P1 Closure

## Scope And Baseline

This is the P1 continuation of financial-records-reporting-review.md, not a
replacement for its June audit or an enterprise-wide certification.

- Repository: gatekipa/villageclaq, local C:\Users\nanye\Documents\villageclaq.
- Branch: codex/financial-reporting-consistency.
- Original P1 starting HEAD: ba479fb510343c37cdfa888f6e94aeb7ab07292f.
- F0 application-integration base after Daybreak remediation:
  df10229d6b21adfa61c9fad26f9943cb623f6248.
- Only transaction integrity, durable retries/corrections, financial attribution,
  currency/standing parity and receipt authorization were extended in this pass.
- Previous UI/report work and P2/P3 findings remain in the baseline report.

## P1 Result

Local implementation and isolated verification: PASS WITH FOLLOW-UP.
Release recommendation: READY FOR INDEPENDENT QA.

This is NOT approval to release the frontend without its database boundary.
The exact migration has only been applied to a disposable synthetic database.
Production rollout requires independent review, a production preflight and
separate explicit migration/deployment authorization. Production state was not
inspected or changed during this P1 continuation.

## Root Causes

| P1 defect before this pass | Closure |
|---|---|
| Browser payment insert, obligation cascade, balance updates and standing were separate writes | One authorized Postgres command encloses all mandatory financial writes |
| UI duplicate preflight was only a warning; retries had no durable request identity | Private command table with group/request uniqueness and stored result |
| History edit/delete rewrote or removed financial evidence | Versioned corrections and non-destructive void, with before/after/actor/reason |
| General funds were absent from type reports or could be reassigned after filtering | Full-scope typed-first/general-FIFO applications, then report/type/exclusion slicing |
| Aggregates assumed the displayed group currency without validating records | Explicit group/currency assertions and database write/history guards |
| Linked-only payment trigger and separate standing trigger could disagree | Rebuild applications/cache and compute existing standing policy in one transaction |
| Legacy storage fallback and group-only receipt visibility were too broad | Restrictive linked-member/officer receipt policies, no legacy anonymous/group fallback |
| Old finance-reader helper could retain an exited officer role | Active-membership restrictive SELECT overlay, without replacing existing read permissions |

## Transaction Contract

Authoritative endpoint: public.apply_payment_command(group, request, action,
values, payment, expected_version, reason).

Supported actions:
- record: authorized officer records a confirmed payment for an active membership.
- submit: member submits their own pending evidence/payment; an officer may also
  submit. Pending is not collected and does not settle an obligation.
- confirm/reject: transition an existing pending payment.
- correct: change permitted monetary/evidence fields using the current version.
- void: retain the payment row, mark its current effect rejected, record why.

The command authenticates the caller, checks active group permission, verifies
member/type/obligation identity and currency, locks the group/member/request,
writes the command record and payment, reconciles the existing application
table and obligation caches, updates standing and mandatory audit evidence,
then stores the retry result. Any exception rolls back ALL these writes.

Existing payments, contribution_obligations and payment_obligation_applications
remain the accounting records. The private command table contains operation
identity and history, not a second accounting balance or financial subsystem.
Direct INSERT/UPDATE/DELETE on payments cannot bypass the command, even with a
forged session setting. A private in-flight command must match transaction,
actor, payment and request. Physical financial deletion is rejected.

Standing-policy decisions remain in the existing compute_member_standing
function. Proxy/lifecycle exemptions retain the existing policy. The 00098
self-escalation guard is preserved except for a private transaction proof that
permits its own calculated standing update; all role, lifecycle, group, user
and proxy-field freezes remain. A finance-position officer can settle their own
debt without acquiring permission to directly change their standing.
Relief-linked payments retain the existing separate monthly,
quarterly, annual/per-event and administrative-suspension semantics; they do
not become dues income. Their confirmation/correction/void recomputes relief
contribution status before standing.

### Storage And Notification Boundary

Storage upload is not a distributed transaction with Postgres. Evidence is
uploaded under an opaque, immutable object key first. A new payment may attach
only an existing caller-owned object for the same group; cross-member reuse
is denied. Failed payment commands may leave private, unlinked evidence, but
cannot leave an authoritative partial payment. API users cannot overwrite or
delete receipt-bucket objects, including during attachment. Controlled orphan
retention cleanup is future work; nothing automatically deletes evidence.

Communications are not part of the financial commit and are not newly activated.
Existing receipt opt-ins, bulk default OFF, confirmation gates, server-side
receipt producer and notification idempotency remain in place. This pass sent
no notifications, receipts or reminders.

## Durable Idempotency

- Client source: crypto.randomUUID(), retained per operation in sessionStorage
  (in-memory fallback for non-browser tests).
- Record identity is scoped by group, actor and member; self-service submission
  by group, actor and obligation. History actions include group, action,
  payment ID and expected version.
- Authoritative uniqueness: primary key (group_id, request_id) in private
  payment_commands; a transaction advisory lock serializes concurrent retries.
- Same key + same actor + same normalized JSON input returns the committed
  result with replayed=true. It does not insert another payment.
- Same key with changed actor/input fails IDEMPOTENCY_KEY_CONFLICT.
- Uncertain requests retain their identity. Acknowledged record/submission
  success, after invalidation, permits the next independent operation.
- Corrections require financial_version; stale concurrent edits fail closed.
- Distinct request IDs mean distinct intentional commands. This does not claim
  semantic duplicate detection for two independently keyed offline entries.
  The existing officer duplicate-warning preflight is retained.
- No financial provider/payment-ingestion webhook exists in this command
  surface. WhatsApp delivery callbacks are not financial mutations. No new
  payment provider event ingestion or retry worker was introduced.

## Attribution And Reconciliation Contract

The old officer cascade and canonical read engine already supplied the member
and oldest-due ordering concepts. This pass reconciles those existing concepts
into one reproducible contract, rather than guessing a new cross-member policy:

1. Validate one group and one currency across the full dues scope.
2. Exclude relief-linked, pending and rejected payments from dues collections.
3. Apply typed payments first, within that member's matching contribution type.
   A valid legacy obligation link can supply its missing type.
4. Within each class, order payments by recorded_at then payment ID.
5. Apply general payments to that member's remaining assessments, oldest due
   date first, with obligation ID as a stable tie-breaker.
6. Never apply to waived assessments or past their assessed amount.
7. Keep surplus as explicit member/group unallocated credit.
8. Build all applications BEFORE slicing contribution reports, matrix filters
   or standing exclusions. An exclusion cannot spend the same general money again.

SQL materialized application rows are compared against money.ts output in the
isolated database suite. The application table is derived and rebuilt in the
same transaction; command snapshots preserve the history of what was corrected.

| Synthetic scenario | Confirmed | Outstanding | Standing/result |
|---|---:|---:|---|
| Assessed 100; record 40 | 40 | 60 | Partial; existing overdue policy suspends |
| Then record 60 | 100 | 0 | Paid; standing good |
| Correct second payment 60 to 20 | 60 | 40 | Partial; standing suspended |
| Void original 40 | 20 | 80 | Original row retained; standing suspended |
| Submit pending 80 | 20 | 80 | Pending not collected |
| Confirm that pending 80 | 100 | 0 | Paid; standing good |
| Typed 80 + general 50 across two 100 assessments | 130 | 70 | Type reports: 100 + 30 collected |
| One member owes 200, another 100; first pays general 250 | 250 | 100 | Surplus 50 cannot cover peer's debt |

For non-waived assessments:
expected = applied confirmed + outstanding.
For cash including surplus:
expected = confirmed cash - unallocated credit + outstanding.
Waived amounts are separately explained/excluded from collectible expected;
they are not counted as revenue. Pending general funds remain visible at
member/group scope but are not falsely assigned to one contribution.

## Currency Contract

Group currency owns this dues ledger. Contribution definitions, assessments and
payments must match it. Historical group currency cannot be silently changed
once financial records/definitions exist. Attribution and aggregation throw
FINANCIAL_SCOPE_REQUIRES_REVIEW for mixed groups/currencies or a mismatched
display currency. Current lean queries include group_id and currency to make
that validation meaningful.

No FX engine or cross-module currency conversion was introduced. Existing
enterprise transfer calculations remain separately labeled; unlike economic
categories are not merged into contribution revenue. The new migration fails
rather than silently converting conflicting legacy financial records.

## Correction And History Contract

financial_version starts at 1. Confirm, reject, correct and void increment it.
Correct and void require a nonblank reason of at least three characters.
Group/member/type/obligation/relief attribution cannot be edited in place.
Changing attribution requires a documented void and a separately authorized
new record, not historical reassignment. Rejected rows cannot be edited/voided
again; replacement is a new record.

Each committed operation retains actor, timestamp, action, request ID, reason,
before and after snapshots, and the returned accounting effect. Receipt URLs
in history are normalized to object keys, not signing tokens. The authorized
payment_command_history RPC exposes that evidence to the owner/officer.
No new history-browser screen was built during this P1 pass.

Corrections without a changed date retain original recorded_at ordering.
Current reports use the corrected current valid effect; history retains the
original record. Backfill cannot reconstruct pre-existing deleted/history-less
events and does not claim to do so.

## Standing And Propagation

record/confirm/correct/void/reject
-> authoritative payment + command history
-> deterministic application rows
-> obligation amount_paid/status
-> existing standing policy + persisted membership standing + required audit
-> committed result
-> awaited shared financial cache invalidation
-> member statement, contribution report, matrix, ledger, outstanding,
dashboard and exports recompute from the same records.

Assessment amount/waiver changes also reconcile applications and standing.
Permitted assessment deletion (only without payment history) does so too.
Derived amount_paid cannot be manually overwritten into a conflicting balance.
Zero-value overdue assessments are paid, not an artificial suspension.
Closed contribution definitions retain their historical assessments/payments.
No autonomous actions, notifications or new standing rules were added.

Standing exclusions filter only after full allocation, preventing excluded
types from releasing already-used general cash for another debt. SQL persisted
standing, SQL policy output and canonical figures are checked after supported
transitions. Existing eligibility consumers still read that same standing.
This does not redesign non-financial eligibility or historical as-of snapshots.

## Receipt Authorization

Verified against restrictive policies layered over deliberately permissive
legacy storage policies in isolated Postgres:

- Active payment owner and finance-authorized officer can read.
- Peer member, other group, anonymous and exited member/officer cannot read.
- Bare modern keys, legacy public URLs, signed URLs and URL-encoded paths resolve
  to the same private linked object; URL query tokens are removed.
- Ambiguous cross-member legacy linkage fails closed.
- Unlinked normal group-prefixed uploads are uploader-only.
- Shared fine-dispute evidence keeps explicit member/group authorization.
- Receipt objects cannot be replaced or deleted through authenticated storage
  policies. Other buckets are unchanged.
- A public receipts bucket aborts installation instead of silently pretending
  object RLS can secure public downloads.

Important platform limitation: already-issued signed URLs remain bearer
capabilities until expiry. The existing helper permits up to 24-hour export
links. Before production certification, separately verify the maximum live TTL,
allow older links to expire or use an approved revocation procedure. No token,
object or production setting was changed in this pass. Unknown legacy keys
must be inventoried privately; denied access is not permission to publish them.

## Exact Database Change

Created as a staged, unapplied sequence:

- `supabase/migrations/20260906140228_financial_ledger_epochs_expand.sql`
- `supabase/migrations/20260906140229_financial_payment_integrity.sql`

Applied: ONLY to a disposable PostgreSQL 15 container labeled
villageclaq.test=p1-isolated, network=none, no published ports or host bind
mounts. No production migration and no broad migration runner was used.
The fixture imports explicit current schema/function definitions needed by the
tests; it is not a claim that the entire historical Supabase stack was replayed.

| Phase / statement group | Why required |
|---|---|
| Phase A: financial_ledger_epochs | Dated, non-overlapping native-currency ledger scopes with one active epoch per group |
| Phase A: nullable row epoch keys + bridge triggers | Old application inserts remain compatible while clean rows gain explicit scope |
| Phase A: durable conflict inventory + live conflict view | Surface non-PII legacy ambiguity without allowing an inventory edit to hide current bad links |
| Phase A: deterministic clean backfill | Scope only provably single-currency, internally consistent history; mixed history stays unresolved |
| Human reconciliation between phases | Approve an evidenced epoch assignment or correction for every conflict; no automatic conversion, deletion, relabeling or reassignment |
| Application cutover between phases | New application code reads/writes explicit epochs while Phase A remains backward compatible |
| Phase B: current-conflict and approval gates | Abort before authoritative reconciliation if a live conflict or unapproved inventory item remains |
| Phase B: NOT NULL + composite foreign keys | Enforce group, native currency and epoch agreement for types, obligations, payments and applications |
| BEGIN / COMMIT | Installation/backfill succeeds or rolls back as one unit |
| private schema + revokes | Keep command evidence and internal mutation functions out of API access |
| payments.financial_version | Reject stale corrections instead of silently overwriting another edit |
| payment_commands + primary key | Durable result replay and immutable operation history |
| payment_commands_payment index | Authorized payment-history lookup |
| payment_applications_obligation index | Reconciliation lookup without repeated unindexed application scans |
| reconciliations table | Private transaction proof; blocks forged cached-balance writes and trigger recursion |
| can_manage / can_read | Active authenticated actor and tenant/member-specific authorization |
| decode_uri_path / receipt_path | Legacy evidence identity without leaking signing parameters |
| prevent_membership_self_escalation replacement | Preserve 00098 verbatim except for private calculated-standing proof; no caller-set flag bypass |
| assert_member_scope | Abort mixed tenant/currency/attribution state instead of misallocating it |
| reconcile_member | Existing application/cache/standing convergence under one transaction |
| guard_payment + financial_payment_guard | Prevent direct-write and physical-delete bypasses |
| reconcile_relief | Preserve separate relief semantics and reverse invalid current effects |
| four DROP TRIGGER statements + payment_changed | Replace overlapping old payment triggers, not add competing balance writers |
| obligation_guard / obligation_changed | Keep assessment edits/waivers and derived state consistent |
| currency_guard + controlled transition function | Preserve historical units and close/open dated epochs atomically; direct currency rewrites fail |
| apply_payment_command | Authenticated atomic record/submit/transition/correction boundary |
| payment_command_history | Read-only scoped correction evidence |
| can_access_payment_receipt | Linked financial ownership for current/legacy evidence |
| is_active_financial_reader + two restrictive SELECT policies | Existing reader policy still applies; exited roles cannot retain access |
| four restrictive storage policies | Narrow reads/uploads; prohibit evidence overwrite/delete despite permissive legacy policies |
| private-bucket assertion | Fail installation when public delivery would bypass object policy |
| explicit function revokes/grants | Only the intended authenticated command/history/read predicates are exposed |
| final DO backfill | Rebuild derived application/obligation/relief/standing state; no new payments, assessments or communications |

Later rollout order is strict: (1) re-run read-only production preflight and
backup/recovery checks; (2) apply Phase A only; (3) resolve every inventoried
legacy conflict through separately approved financial decisions; (4) deploy the
epoch-aware application cutover; (5) prove old-client traffic has drained; and
(6) apply Phase B in a controlled maintenance window. Phase B must never be
included in the Phase A apply command or a broad migration runner. A failed
Phase A transaction rolls back cleanly; after Phase A commits, recovery is
forward through evidenced conflict resolution, not destructive epoch removal.
The transition helper is an immediate cutover command: it rejects future-dated
activation rather than changing `groups.currency` before the effective moment.
The future Clean Start, Opening Position and Full Historical Migration workflows
are not implemented here; dated epochs and provenance fields merely keep those
paths possible without rewriting native-currency history.

Before either production phase, independently verify live function/policy/schema
compatibility, legacy currency/member/type identity, private receipt bucket,
receipt-path inventory, existing signed-link TTL and backup/rollback procedure.
Nothing here authorizes applying either migration, deploying, changing
production storage or contacting a member.

## Test Evidence

Final unique automated cases: 400 passed, 0 failed, 0 skipped.
- Financial regression suite: 260 passed.
- New P1 pure/mocked suite: 24 passed.
- Isolated real-Postgres P1 suite: 36 passed.
- Storage/inert-action-intent guardrails: 48 passed.
- WhatsApp webhook mock suite: 6 passed.
- Payment-receipt producer mock suite: 13 passed.
- Payment-reminder producer mock suite: 13 passed.

The 364-case regression invocation includes the 24 pure P1 cases; the final
separate database invocation contains 36 SQL integration cases. Earlier combined
runs are not double-counted. Earlier assertion failures were fixed and rerun; they are not hidden
as skipped tests. No tests issued real communications.

Additional validation:
- npm run audit:whatsapp: PASS, static/dry-run; no live provider calls.
- npx tsc --noEmit: PASS.
- npm run build: PASS, including TypeScript and all 41 static pages. Build only,
  with synthetic database environment values; no deployment. A subsequent
  unused-variable removal was typechecked and linted again.
- Targeted ESLint over all changed TS/TSX/MJS: zero errors, 15 pre-existing
  warnings (unused declarations and translation memo dependencies).
- git diff --check: PASS.
- Changed-file static scan: 43 files, zero credential-pattern hits, zero new
  full-phone-pattern matches, zero forbidden env/generated artifacts. Three
  unchanged phone-pattern matches already exist in the baseline translation
  files; they were neither added nor printed. This is not a complete secret audit.
- Existing build notices: middleware convention, edge/static-generation notice
  and metadataBase fallback. No new financial build error.

Database evidence includes same-key concurrency, distinct competing requests,
injected post-insert failure, mandatory audit failure, partial/full payment,
pending/reject, correction/void, immutable identity/history, allocation parity,
overpayment isolation, currency conflict, exclusion/waiver parity, zero-value
assessments, relief reversal/quarterly rules, private helper access, and
legacy/current/encoded/shared-bucket receipt authorization.

The final fixture also includes the actual 00098 self-escalation trigger and
current permission helpers. Its replacement was compared against that source:
all original guard code is preserved except the private standing proof clause.
Full Supabase Storage HTTP signing and a production-scale schema/data rehearsal
remain independent QA/rollout gates; isolated Postgres proves the authorization
predicates and transaction invariants, not those external service integrations.

To reproduce only the isolated database checks, create a dedicated container:

```powershell
docker run --detach --name villageclaq-p1-isolated --network none --label villageclaq.test=p1-isolated --env POSTGRES_HOST_AUTH_METHOD=trust postgres:17.11
npm run test:financial-p1-db
```

The test refuses a container without the exact label/network isolation or with
host bind mounts/published ports. It resets only that dedicated synthetic
database. Never substitute a Supabase project/database URL. Do not run this
script concurrently against the same test container.

### Visual Checks

Synthetic loopback fixture only; browser network limited to local GET/HEAD/
OPTIONS, API/message/mutation requests blocked, service workers blocked.

- Desktop 1440x1000: correction reason required; Save enabled only with reason.
- Mobile 390x844: void retains explanatory history copy, long member name fits,
  reason gate works, no document overflow.
- Mobile French: translated correction reason and controls fit; no overflow.
- Rejected ledger rows disable both edit and void.
- No submit/confirm/void request was executed in browser QA.
- Fixture counters: blockedWrites=0, realSends=0, upstreamRequests=0.
- Local dev and fixture processes were stopped after verification.
- The verified isolated database container and its disposable volume were
  removed after the final 36-case database run passed.

Images are synthetic local artifacts in the Codex visualizations folder:
financial-p1-desktop-edit.png, financial-p1-mobile-void.png and
financial-p1-mobile-fr-edit.png. The prior report retains the broader
desktop/mobile/report/CSV review from the baseline pass.

## Files Changed In This P1 Pass

The complete worktree includes the preserved baseline. P1 additions/changes:
- New migration listed above.
- src/lib/payment-command.ts: durable command client.
- src/lib/payment-evidence.ts: immutable retry-safe upload helper.
- src/lib/money.ts: full-scope applications, type attribution, currency guard.
- src/lib/hooks/use-supabase-query.ts: atomic record command and scoped reads.
- src/lib/calculate-standing.ts: allocate before standing exclusions.
- src/lib/storage-urls.ts: safe legacy normalization and diagnostic output.
- src/components/payments/pay-now-dialog.tsx: pending submit through command.
- contributions/history/page.tsx: versioned confirm/reject/correct/void,
  translated reason requirement, no physical delete.
- contributions/record/page.tsx: opaque receipt filename.
- contributions/[typeId]/report/page.tsx, contributions/matrix/page.tsx,
  finances/page.tsx: correct full-scope attribution before slicing.
- my-dashboard/page.tsx and enterprise/transfers/page.tsx: lean currency/scope
  fields for existing financial read consumers; no transfer-policy redesign.
- messages/en.json and messages/fr.json: correction/void labels/reason copy.
- package.json: local P1 test commands.
- scripts/test-financial-p1.mjs, scripts/test-financial-p1-db.mjs and
  scripts/fixtures/financial-p1.sql: synthetic/inert unit and SQL tests.
- Existing product-money/dues/standing build assertions and storage test:
  changed only where old structural expectations contradicted the new command,
  allocation or immutable upload contract.
- This report and a pointer in the preserved baseline review document.

## Remaining P2/P3 Work

These are not substitutes for production prerequisites or hidden P1 exceptions:
- P2: uniform report periods and independently validated as-of historical views.
- P2: broader fine/loan/Njangi/project/relief report reconciliation, keeping
  income, debt, payouts and disbursements distinct.
- P2: snapshot-consistent large-data reads, benchmark full joined ledgers and
  finish PDF/export and full role/device matrix.
- P2: officer history-browser UI over the authorized correction-history RPC.
- P2: separately approved orphan-evidence retention/cleanup workflow.
- P2: deterministic AI-context freshness, without AI-originated accounting.
- P3: older card/table accessibility/presentation cleanup and future-due copy.

## Safety And Next Gate

Production financial data is unchanged. No WhatsApp/email/SMS, real receipt,
reminder, retry or member contact occurred. No production migration/deployment,
main merge, environment/provider/Meta change or domain promotion occurred.
Agentic execution remains inert. Bulk receipts remain default OFF with existing
explicit confirmation safeguards.

Next: independent review of the local branch, migration and isolated test
evidence, followed by separately authorized staged database/frontend rollout.
Do not use production financial records or message delivery to validate this
branch. Recommendation: READY FOR INDEPENDENT QA.

## F0 Ledger-Epoch Application Integration

This bounded follow-up implements the application side of Daybreak's dated
ledger-epoch model. It follows the Financial Operating System PRD at planning
commit aa470c920737ce293c59b58bdd03010c39fe35e1 without merging or cherry-picking
that planning branch and without implementing F1-F10.

### Application Currency Model

- New authoritative contribution types, obligations and payment commands first
  resolve exactly one active `financial_ledger_epochs` row for the group.
- The application never accepts a caller-supplied epoch. Record/submit commands
  verify linked obligation/type attribution against the resolved active epoch
  before calling the command RPC. Missing schema, missing/ambiguous active epoch,
  unresolved legacy scope and stale historical attribution all fail closed.
- Historical types, obligations and payments retain their stored native currency
  and epoch. Corrections operate on the existing payment identity; they do not
  relabel its currency or epoch.
- The canonical money engine allocates only within group/member/type/epoch.
  General payment surplus remains credit in its native epoch. Same-currency
  repeated epochs can be reported together but never settle one another's debt.
- Multi-currency history and parent/HQ data are represented as deterministic
  currency buckets. No FX conversion or synthetic scalar total is produced.

### Currency-Context Audit

| Usage class | Inspected surfaces | Result |
|---|---|---|
| A: current activity | group dashboard headline, record-payment defaults, active contribution forms | Current group currency remains presentation/default context; payment/type writes are independently active-epoch validated |
| B: active epoch required | contribution type create, member auto-enrol obligations, enrol-all obligations, payment record/submit/general payment | Active epoch resolved; clean attribution required; no direct-write fallback |
| C: row-native history | payment history/corrections, recent payments/feed, member dashboard, member statement, contribution object report, member payment statement | Payment/type/obligation currency drives display and exports |
| D: parent/HQ buckets | relief rollup, Report 24, platform admin dashboard/reports/transactions, contribution financial reports and AI context | Currency buckets replace incompatible scalar sums |
| E: non-ledger modules | fines, loans, projects, relief plans, savings/Njangi, subscription pricing, phone-country defaults | Existing module-specific currency semantics retained; no F1 schema unification attempted |

### Parent And Export Audit

- Enterprise relief rollup now shows collected and remitted amounts per branch
  currency.
- Report 24 derives collected/remitted buckets, renders row-native amounts and
  exports explicit `Currency` columns in CSV/PDF.
- Reports 1-4, 16, 17 and the report landing AI payload preserve bucketed dues
  totals; AR and unpaid drill-down rows carry native currency.
- Platform admin revenue, month trends, averages, transaction volume and
  top-group comparisons are confirmed-only and bucketed by currency.
- AI receives `moneyByCurrency`; federated relief uses
  `NATIVE_CURRENCY_BUCKETS` instead of a false combined amount.
- Legacy transfer summaries contain scalar monetary fields without epoch/currency
  detail. The application now hides those monetary scalars with an operator
  warning while retaining non-monetary history.

### Rollout Compatibility Matrix

| State | New application behavior | Gate |
|---|---|---|
| Old DB + new app | Active-epoch schema probe fails before the payment RPC or contribution/obligation insert | FAIL CLOSED as required |
| Phase A + new app | Clean ledgers resolve one active epoch; record/submit attribution is checked client-side; inventoried legacy conflicts have no active epoch and remain blocked | COMPATIBLE for clean ledgers |
| Phase B + new app | Application checks remain; database composite scope, command and reconciliation enforcement are authoritative | COMPATIBLE |
| Phase B + old app | Direct financial table writes and incompatible payment commands fail under Phase B | PAYMENT PATH COMPATIBLE; transfer caveat below |

### Bounded Daybreak Finding

The existing `request_member_transfer` / `execute_member_transfer` database
contract still permits an older client to persist `carry_over_standing=true`
between groups whose currencies differ, and execution copies the source standing
without comparing currencies. The new application forces false for new
cross-currency requests and refuses to execute a legacy unsafe request, but an
old or direct RPC client can bypass that application guard. This means the full
Phase B + old-app compatibility claim is not yet enforceable for transfers.

This is a database integrity boundary owned by Daybreak. No RLS, grant,
SECURITY DEFINER function or migration was changed in this application pass.
Daybreak should add a narrow currency comparison to both transfer request and
execution before F0 release qualification.

### F0 Validation Evidence

- Focused ledger-epoch and currency-bucket tests: 16 passed, 0 failed,
  0 skipped.
- Canonical financial consistency tests: 39 passed, 0 failed, 0 skipped.
- Preserved Financial P1 application tests: 25 passed, 0 failed, 0 skipped.
- Network-isolated Financial P1/epoch database tests: 39 passed, 0 failed,
  0 skipped. The labeled container had no network, published port or bind mount
  and was removed after the run.
- Broader contribution, dues, standing and schedule regressions: 74 passed,
  0 failed, 0 skipped.
- Total automated assertions: 193 passed, 0 failed, 0 skipped.
- TypeScript no-emit and the Next.js production build passed under Node 24.
- Targeted ESLint completed with 0 errors. It retained 28 unrelated legacy
  warnings rather than widening F0 into cosmetic cleanup.
- `git diff --check` passed and the changed-file secret scan found 0 matches.

### F0 Visual Checks

The existing read-only loopback fixture was used; it blocks all non-GET/HEAD/
OPTIONS requests and has no upstream connection.

- Desktop 1440x1000: financial overview, native-currency summary figures,
  collection rate, recent payments and outstanding drill-down rendered without
  an error overlay or clipped amounts.
- Mobile 390x844: two-column money summary, horizontal contribution navigation,
  actions and long labels remained readable. Document width reconciled exactly
  at 390 CSS pixels, with no page-level horizontal overflow.
- Fixture counters after the run: blocked writes 0, real sends 0, upstream
  requests 0. The local fixture and dev server were stopped.
- A follow-on member-route navigation timed out in the browser harness after the
  financial overview evidence was captured; no mutation was attempted. The
  production build and existing member-statement static/invariant tests passed.

### F0 Safety

Both staged epoch migrations remain unapplied to production. The unresolved
production XAF/USD conflict was not inspected, normalized or changed. No
production data, storage, provider, environment, deployment, domain, message,
receipt, reminder, queue or agentic-execution action occurred. The branch was
not merged.
