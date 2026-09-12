# F3-04 Stage A — canonical correction / reversal semantics

**Qualification:** TEST / CONTRACT ONLY. No database correction RPC is implemented.
The authoritative production posting command remains
`public.post_financial_command(p_command jsonb)`; reads remain
`public.get_financial_projection_bundle(...)` and `public.get_financial_cashbook(...)`.
These test modules must never become an application import or a second production
financial engine. The oracle has no IO, persistence, clock, network or actual locks.

- Exact base: `347e493fde799bdb822e1127e7ae7ae7c5683668`.
- Branch: `feature/f3-04-correction-semantics-20260909`.
- Canonical workspace: `C:\Users\nanye\Documents\villageclaq`.
- F2 design: `a13b5e6c482e5e68ba2c92c41ae14b411668ae88`.
- F3 ticket freeze: `4b9286d196650afeda92a8bb9625ec3b416381c8`.
- The founder's later Stage A authorization limits file ownership to this directory.
  No F3-01/02/03 migration, F2/ticket document, package, UI, RLS or F0 file changes.

## Run and qualification boundary

~~~sh
node --test tests/finance/f3-04/correction-oracle.test.mjs
node --test tests/finance/f3-02/oracle.test.mjs
node --test tests/finance/f3-03/projection-oracle.test.mjs
~~~

Node 20+, built-ins only; no dependencies, credentials, database or environment
configuration. The oracle imports the unchanged F3-02 TEST posting evaluator and
normalizers, and F3-03 TEST exact decimal helpers. Tests directly feed the unchanged
F3-03 projection evaluator complete original + reversal + replacement snapshots.

| Class | Exact count |
|---|---:|
| Valid correction/reversal vectors | 28 |
| Negative semantic/eligibility vectors | 83 |
| Replay/identity vectors | 26 |
| Named serialized race vectors | 6 |
| Additional chain, period, graph, identity, audit, precision and compatibility tests | 21 |
| Canonical golden cases (root and all applicable children) | 4 |
| **F3-04 total** | **168** |
| Unchanged F3-02 regression | 167 |
| Unchanged F3-03 regression | 80 |

Literal expected posting tuples are independent of the correction implementation.
The golden JSON contains independently assembled literal payloads, canonical bytes
and SHA-256 values; tests never regenerate their expected answers with the oracle.
Four cases cover USD CORRECT, USD REVERSE, XAF CORRECT and Unicode reason
normalization, including four reversal and three replacement fingerprints.

Race tests evaluate permitted serial histories, including opposite winner orders.
The commit helper only installs a successful proposal into a cloned TEST snapshot.
Discarding a proposal models a failed transaction. Neither this helper nor the
atomicity vector proves PostgreSQL rollback, lock ordering, MVCC, authorization,
RLS or race safety. **Daybreak must prove those with real database sessions.**
Fixture `authorized` / `authorized_after_locks` values represent required decisions,
not an implementation of permission checking.

## Targets, immutable truth, and two intents

V1 targets only a currently POSTED same-group F3 manual Money In, Money Out or
Transfer, with server-owned F3-02 occurrence/replay provenance, or a POSTED
replacement created by a completed F3-04 correction. A known event UUID or a
manual-looking source string is insufficient. The trusted adapter must load the
persisted canonical economic snapshot, committed postings and private source
binding; none may be supplied by the browser. Fixture `economic` is an adapter
view of that immutable source truth, not a proposed new public event column.

Dues, fines, loans, Njangi, relief, project-subledger events, opening, cutover,
importers and future subledger sources are ineligible. A manual event with member
or project attribution remains manual; it creates no subledger rights or credits.

| Intent | Complete committed result | Target transition |
|---|---|---|
| CORRECT | Original + exactly one exact reversal + exactly one replacement | posted → corrected |
| REVERSE (the void economic intent) | Original + exactly one exact reversal; replacement NULL | posted → reversed |

There is no generic edit action or in-place economic update. Original amount,
currency, epoch, accounts, fund, category/class, member/project, occurred_at, source
identity, fingerprint, description/reference snapshot, created_by and posting rows
remain immutable. Only status, replacement_event_id, corrected_at and
correction_reason advance on the target. A linked private audit records the actor
and request; the original created_by never becomes the correcting actor.

## Exact reversal and economic time

For EVERY committed target posting, emit one posting with amount_signed exactly
negated. Preserve group_id, ledger_epoch_id, currency, occurred_at, account_id,
fund_id, category_id, category_class, member_id, project_id and control_class.
Retain multiplicity. Allocate new event/posting IDs and a new source identity.
Stored numeric trailing zeroes may serialize at currency scale without changing
value. No floating-point money, rounding or FX.

**Reversal occurred_at is ALWAYS the original occurred_at.** Do not resolve any
current epoch, account, fund, category, default or currency for the inverse, even
when historical dimensions are closed/inactive/archived. The discovery/action
instant belongs to corrected_at, posted_at/created_at and audit, not economic time.
The reversal has event_class `opening_adjustment`, effect_kind
`correction_reversal`, status posted and reversal_of_event_id = exact target ID.
This classification does not make it an opening event or confer opening eligibility.

The reversal description/reference snapshot copies the target snapshot; it does
not carry caller-controlled economic identity. Its correction_reason/corrected_at
lifecycle fields remain NULL while posted. The target and private audit hold the
reason/time, preserving the existing posted-state constraint.

## Replacement: full corrected truth resolved from delta-like intent

Replacement uses the unchanged F3-02 bounded two-line templates. There is no
special replacement accounting. The test oracle invokes that evaluator with a
fully resolved payload and a narrowly adjusted trusted historical-status fixture.
Daybreak implements these semantics in its secure correction write unit, not by
calling the public ordinary posting RPC twice.

| Replacement field | V1 verdict and omission/null behavior |
|---|---|
| action | REJECT class change. Omission retains class; explicit identical class allowed; NULL rejected. |
| amount | ALLOW positive exact decimal string per F3-02. Omission retains original magnitude. NULL rejected. |
| occurred_at | ALLOW valid corrected instant inside the ORIGINAL epoch. Omission retains original. NULL invalid. |
| currency | REJECT change. Optional assertion normalizes uppercase and must equal original. Omission retains; NULL invalid. |
| account_id | ALLOW valid same-group/same-currency custody account. Omission retains original. NULL rejected. |
| destination_account_id | ALLOW change for transfer; distinct same-currency account required. Omission retains. NULL rejected for transfer; NULL only for other classes. |
| fund_id | ALLOW change; one fund on both legs. Omission retains ORIGINAL resolved fund, even if default changed. NULL rejected; never resolve today's default. |
| category_id | ALLOW change. Money In requires income; Money Out expense; transfer NULL only. Omission retains original; NULL invalid for in/out. |
| member_id | ALLOW set/change/clear for in/out. Omission retains; NULL clears. Transfer NULL only. |
| project_id | ALLOW set/change/clear for in/out. Omission retains; NULL clears. Transfer NULL only. |
| description | ALLOW snapshot replacement. Omission retains original. NULL allowed for in/transfer; Money Out still requires nonblank description. |
| reference_metadata | ALLOW whole-object replacement per F3-02 reference/evidence_ids shape. Omission retains original; NULL becomes empty object. No partial metadata merge. |

All unspecified keys are rejected, including NULL keys. Caller cannot submit
ledger_epoch_id, category_class, postings, source_module, source_record_id,
effect_kind, created_by, status, child IDs or fingerprints.

Action-class changes (including money_in → money_out, money_in → transfer,
transfer → money_out) fail `ACTION_CHANGE_PROHIBITED`. If required, explicitly
REVERSE and separately post the correct manual transaction with a new identity;
these are separate user intents/transactions, not an implicit compound operation.

Resolve the corrected timestamp independently against group half-open epoch
intervals. No match → EPOCH_NOT_FOUND; overlap → EPOCH_AMBIGUOUS. A different epoch,
even with the same currency, fails CROSS_EPOCH_REPLACEMENT. A different currency
assertion/account fails CROSS_CURRENCY_REPLACEMENT. No silent epoch reuse or FX.
Cross-epoch/currency corrections require explicit reversal plus separate valid post.

A retained account/fund/category ID in the SAME role may remain inactive, closed
or archived. This exception waives only current active status: the row must still
exist, belong to the group, preserve currency/class, and satisfy account opening
date/epoch compatibility at corrected occurred_at. A CHANGED dimension must meet
normal F3-02 target validation. Transfer source and destination retention is
role-specific; swapping two archived endpoints does not grant an exception.
Member/project validation inherits F3-02: same-group existing membership/project,
without inventing a new activity-status restriction or subledger eligibility.

An empty replacement object, identical full replacement or metadata-only
restatement is allowed with a valid reason, and still creates the complete linked
correction. It does not mutate the old event.

## Reason and audit

correction_reason is mandatory, non-NULL string. Normalize NFC, replace runs of
Unicode White_Space (U+0009–000D, 0020, 0085, 00A0, 1680, 2000–200A, 2028,
2029, 202F, 205F, 3000) with one ASCII space, trim, then require **3–1000 Unicode
scalar values**. Trimming removes only the collapsed ASCII spaces. Reject unpaired surrogates, residual C0/C1 controls, DEL, U+200B
and U+FEFF. Store only the normalized reason. It is part of command identity;
a materially changed normalized reason under the same request conflicts.

Mandatory audit fields: group_id, correction_actor (current authenticated actor),
correction_request_id, correction_reason, corrected_at (server timestamp),
target_event_id, reversal_event_id and nullable replacement_event_id.
Child created_by is correction_actor; child posted_at/created_at is corrected_at.
These times and actor are server supplied and excluded from economic fingerprints.
An authorized retry returns the FIRST committed result/audit unchanged.

Stage B must explicitly guard reason IS NOT NULL as well as normalized length:
F3-01's length(trim(correction_reason)) check alone admits SQL UNKNOWN on NULL.
This is a required Stage B closure, not permission to edit the F3-01 migration here.

## Linear correction graph

Only the latest POSTED eligible truth can be targeted. Corrected/reversed targets
fail TARGET_ALREADY_CORRECTED. A reversal event is never eligible, regardless of
posted status: REVERSAL_TARGET_PROHIBITED. Further correction targets the current
replacement: A → B → C. B may instead be reversed to close the chain.

Each target has at most one reversal, exactly one for a committed corrected or
reversed target. Each corrected target has one newly created replacement; a
reversed target has none. A replacement has at most one parent. All edges are
same-group, acyclic and never self-linked; shared replacement targets and
reversal-of-reversal edges are forbidden. Children are freshly derived IDs;
collision with ANY existing event/posting aborts CHILD_ID_COLLISION, never reuses
a node. The test graph guard rejects cycles, shared replacements and duplicate
reversals. Stage B enforces these invariants atomically in the database.

## Request, source, child identities, and effect vocabulary

Input envelope contains ONLY group_id, correction_request_id, target_event_id,
intent (exact CORRECT / REVERSE), correction_reason and replacement. CORRECT
requires a replacement object; REVERSE accepts absent/NULL replacement only.
Server injects contract version. UUIDs normalize to lowercase.

The private correction request namespace is (group_id, correction_request_id),
**independent of target and epoch**. Do not reuse any same-group original manual
request UUID for a correction. Persist request → target, intent, canonical payload,
fingerprint, original frozen resolution snapshot and completed result atomically.

Both children use source_module `manual_finance_correction`:
- Reversal source_record_id = lowercase correction UUID + `/reversal`;
  effect_kind = `correction_reversal`.
- Replacement source_record_id = lowercase correction UUID + `/replacement`;
  effect_kind = `correction_replacement`.

These are actual repo-safe text source IDs (under 256 characters), not arbitrary
caller inputs. Child event request_id is **NULL**: the F3-01 unique non-NULL
(group_id, request_id) index cannot hold both children under one correction UUID,
and neither child should claim an original manual posting request identity.
The private correction replay namespace holds the stable root request instead.
The natural occurrence tuple retains group/source/effect/epoch.

Event IDs use UUIDv5 with standard URL namespace
`6ba7b811-9dad-11d1-80b4-00c04fd430c8` and UTF-8 name:
`villageclaq/f3-correction-v1/{group_uuid}/{correction_uuid}/{role}`.
Roles are `reversal` and `replacement`. Posting IDs use the same namespace/name
prefix, with role `reversal/posting/{original_posting_uuid}` or
`replacement/posting/1` and `replacement/posting/2` in frozen F3-02 template order.
No epoch, clock, actor, reason or amount enters ID derivation. Hash/UUID collisions
fail closed. UUIDv5 here is identity derivation, not an authorization token.

Replacement event_class remains original action class. Accounting classification
always comes from committed control classes, not these new effect names. No
F3-03 SQL or oracle change is needed.

## Canonical command and child fingerprints

Root version: **f3-correction-v1**. Exact root keys:
contract_version, group_id, correction_request_id, target_event_id,
target_economic_fingerprint, intent, correction_reason, replacement.

replacement is explicit NULL for REVERSE. Otherwise exact keys:
action, amount, occurred_at, currency, account_id, destination_account_id,
fund_id, category_id, member_id, project_id, ledger_epoch_id.
All fields are fully resolved; no undefined/omitted canonical values.

Description and reference metadata are validated but OUTSIDE the fingerprint,
consistent with F3-02. First committed snapshots win; changed narrative on retry
neither creates new children nor updates history. Reason is mandatory audit intent,
so it remains INSIDE the root fingerprint. A later authorized actor may retry the
same request; current authorization is required but actor is not economic identity.

Canonicalization: recursive lexicographic ordering of all object keys (the field
vocabulary is ASCII), ordered arrays, compact JSON with ECMAScript JSON.stringify
string escaping, explicit NULL, lowercase UUIDs, uppercase currency, canonical
F3-02 amount scale and six-microsecond-digit UTC timestamps, UTF-8 without BOM,
SHA-256 lowercase hexadecimal. SQL must reproduce these bytes, not hash ordinary
jsonb::text with its different spacing. Reason normalization occurs before hashing.

Each child has its OWN immutable fingerprint, version **f3-correction-child-v1**.
Exact child payload keys: contract_version, correction_request_id, target_event_id,
target_economic_fingerprint, role, event, economic, postings.
- event exact keys: id, group_id, ledger_epoch_id, currency, occurred_at,
  event_class, source_module, source_record_id, effect_kind, request_id,
  reversal_of_event_id.
- economic: NULL for reversal; replacement's ten economic fields above, excluding
  ledger_epoch_id (already in event).
- postings: complete rows with id, event_id and all eleven preserved dimensions
  listed in the reversal section plus amount_signed. Stored posting created_at is
  excluded: Stage B assigns a new server audit timestamp on inserted postings.
  Reversal array is ordered
  by original posting UUID; replacement array is frozen F3-02 template order.

This binds exact inverse dimensions, amounts, multiplicity, source identity and
lineage without reusing the original fingerprint. Reason/narrative/actor/action
time are not child economic fields. A CORRECT and a REVERSE with the same request
would have the same inverse child payload but DIFFERENT root meaning; only one
root may commit. Golden JSON pins all bytes, event/posting IDs and digests.

USD 500 → 450 root SHA-256:
`d9de94259f815640ff402c158975f176438c8313f0f55cf2b8011fdffc91bd6c`.

## Replay, authorization, concurrency and atomicity

1. Require current authenticated active group membership and finances.manage,
   preserving existing owner/admin policy. Authorization precedes history disclosure.
2. Serialize the correction request independently from target. Stage B chooses and
   proves a global lock order. Recheck CURRENT authorization after waiting, before
   returning replay data or writing. Revoked authorization always yields DENY.
3. A completed same-group request compares canonical meaning using the FROZEN
   original resolution snapshot, not today's defaults/active catalogs/current leaf.
   Same meaning returns the exact completed result with zero new events/postings.
   Changed well-formed meaning (target, intent, reason or replacement economics)
   conflicts. Malformed input is rejected. Never revalidate archived dimensions
   on an identical retry; never edit its first narrative, actor or audit time.
4. For a new request, serialize/reload the target, validate eligible current truth
   and graph, then resolve/validate replacement and allocate deterministic children.
   Two distinct requests on one target permit exactly one winner. The loser fails
   TARGET_ALREADY_CORRECTED, including CORRECT versus REVERSE.
5. Atomically commit reversal event/postings, optional replacement event/postings,
   target status/link/audit and private request replay identity/result, ALL or NONE.
   Failures release uncommitted request claims; a rolled-back request may retry.
   No visible target-corrected state may precede a replacement or its postings.

Identical concurrent same-request retries yield one effect plus an existing result.
Same request/different payload or target yields one winner plus CONFLICT (when both
requests are otherwise valid). If a winning transaction rolls back, a waiter may
become the sole winner. A pre-completion failure must not become a saved successful
replay. No externally observable in-progress result or private payload is returned.
An old successful request may replay after its replacement was corrected again:
return its original completed result, never create another reversal.

## Projection, cashbook and executable economic results

F3-03 includes all committed original, reversal and replacement postings. Status
is audit/presentation only. No deletion, status exclusion, deduplication, current
epoch restriction or correction-specific projection exception.

| Case | Expected result |
|---|---|
| Money In 500 → 450 | Cash +450; operating income 450 |
| Money Out 200 → 175 | Cash -175; expense 175; no liability |
| Transfer 1000 → 900 | Bank -900; Cash +900; income/expense zero |
| Reverse any of these | Original account movements, income and expense net to zero |
| Jan 10 income corrected Feb 20, same economic date | January 450; February activity zero; audit Feb 20 |
| Jan 10 500 moved to Feb 5 | January zero; February 500; reversal still Jan 10 |
| Historical USD correction with current XAF activity | USD 450 and XAF 700 in separate buckets; no conversion |
| Retained archived account/category/fund | Amount correction succeeds; inverse retains original IDs |
| A 500 → B 450 → C 425 | Five events retained; final income 425 |
| A 500 → B 450, then reverse B | Four events retained; final income/cash zero |

Cashbook retains original status, replacement link and authorized reason/time;
reversal has reversal_of_event_id; replacement is independently posted and
traceable by correction source request. Existing F3-03 read permissions remain
unchanged. Private replay/canonical payloads are not cashbook fields and must not
leak through RPC error/result objects. The oracle's rich plan is a TEST artifact,
not the future public RPC response shape.

## Daybreak handoff / remaining qualification

READY for Stage B implementation only after this branch's signed Stage A commit
and passing regressions. Daybreak branches from that EXACT commit as
`security/f3-04-correction-security-20260909`, implements the secure correction RPC,
private replay/source provenance, audit persistence, request/target serialization,
post-wait authorization, lineage constraints, explicit NULL-reason rejection,
canonical byte parity and atomic rollback. Stage B must test real concurrent
sessions, denial on revoked retries, two valid targets under one request, and
every injected failure point. The existing F3-01 NULL CHECK gap is a known item
for a NEW Daybreak migration; all frozen migrations remain untouched here.

No final combined F3-04 PR yet. Only the qualified combined Daybreak branch later
opens that PR against `codex/f3-core-ledger-foundation`. No integration/main/F0
branch modification, production apply, deploy, messages, receipts, reminders,
opening/cutover/import workflow, F3-05 implementation or UI is authorized here.

**F3-04 integration:** HOLD — COMBINED ASTRA + DAYBREAK UNIT NOT YET QUALIFIED.
**F3-05:** HOLD — F3-04 MUST COMPLETE FIRST.
**Production:** UNCHANGED. **Next owner:** DAYBREAK BLUE.
