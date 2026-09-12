# F3-02 Stage A — canonical posting semantics

**Scope:** test/contract/oracle only. The future Daybreak-owned database RPC is the
single authoritative financial write path. Nothing here is imported by application
code, connects to a database, persists events, or implements a production ledger.

**Handoff base:** bc449bef9eef25aaa6ff189f8eb6bad8c96f8475.
**Branch:** feature/f3-02-posting-semantics-20260908.
**Contract version:** f3-posting-v1.

Authority: F2 design at a13b5e6c482e5e68ba2c92c41ae14b411668ae88,
F3 ticket freeze at 4b9286d196650afeda92a8bb9625ec3b416381c8, and the founder's
serialized Stage A authorization. The later authorization narrows the original
ticket's application-module suggestion to test-only implementation.

## Run and interpret

From the repository root, with Node 20 or later:

~~~sh
node --test tests/finance/f3-02/oracle.test.mjs
~~~

No dependencies, environment credentials, application imports, Docker, or database
are needed. The catalog assertion reads the frozen migration as text.
The oracle itself has no filesystem, environment, clock, or network access.
SHA-256 uses Node's built-in crypto implementation.

| Fixture class | Count |
|---|---:|
| Valid commands, complete exact posting-set assertions | 16 |
| Negative semantic inputs, named rejection code | 95 |
| Replay/identity decisions | 30 |
| Recognition, including three capability-only fixtures | 7 |
| Fixed canonical payload/bytes/SHA-256 vectors | 3 |

Additional assertions cover normalization, timestamp boundaries, all 18 fingerprint
fields, catalog parity, account epoch compatibility, closure, USD arithmetic,
opening allocations, and authorization-before-history. Total: **167 tests**.

'vectors.mjs' contains expectations independent of the oracle.
'replay-vectors.mjs' contains original/retry inputs and expected decisions.
'canonical-golden.json' pins independently specified payloads and exact digest bytes.
'oracle.test.mjs' checks literal economic results with independent BigInt arithmetic.

Passing these tests qualifies Stage A semantics only. These are not proof of RPC
authorization, concurrency, lock ordering, RLS, SQL persistence, or atomic rollback.
Those require Daybreak's database integration tests on the combined F3-02 SHA.

## Economic actions and server template selection

Amounts below use F3's internal debit-positive convention. These terms are backend
contract vocabulary; the later UI presents Money In, Money Out, Transfer, and
Opening / Adjustment without accounting jargon.

| Command action | Server effect | Event class | Exact two-line template | Recognition |
|---|---|---|---|---|
| money_in | manual_income | money_in | custody/account **+A**; income/category **-A** | Operating income A |
| money_out | manual_expense | money_out | expense/category **+A**; custody/account **-A** | Operating expense A |
| transfer | account_transfer | transfer | custody/source **-A**; custody/destination **+A** | Neither |
| private opening | opening_custody | opening_adjustment | custody/account **+A**; opening_position **-A** | Neither |

Every leg shares group, resolved epoch, currency, effective instant, and fund.
Each event has exactly two nonzero postings, summing to exactly zero. The template
alone selects control classes, category class, and signs. The oracle's array order
is deterministic; SQL row order is not economic identity. Database assertions
compare complete sets with multiplicity, without relying on physical row order.

The only initial server effect vocabulary is manual_income, manual_expense,
account_transfer, opening_custody. A caller submits a bounded action, not an
effect string. An ordinary manual endpoint must reject opening; it is a private
template for a later F3-05 command, not an authenticated opening endpoint today.

Generic adjustment, refunds, dues, fines, loans, relief, project-subledger and Njangi
effects are not public command types here. A category's display name never grants
subledger meaning. Future F4/F5 effects extend the server allow-list explicitly.

Manual income creates no receivable, obligation, dues payment, or allocation credit.
Manual expense creates no liability or loan classification. Transfer and opening
create neither income nor expense. Opening is not a payment or confirmed collection.
No rule equates cash entering custody with income.

## Exact command input

This is the logical input contract for the future server command, not an RPC
signature or a new runtime API. All unspecified keys are rejected, including keys
whose value is null. The browser cannot submit the oracle's trusted context.

| Field | Contract |
|---|---|
| action | Required exact enum: money_in, money_out, transfer; opening private only |
| group_id | Required UUID; authorization and every dimension scoped to this group |
| request_id | Required stable UUID for every manual command; null/absent for private opening |
| occurred_at | Required exact timestamp with explicit timezone; no server today default |
| amount | Required positive exact decimal **string**, never a JSON number |
| currency | Optional expected currency; supplied value must match account/epoch authority |
| account_id | Required source/custody UUID; no last-used-account default |
| destination_account_id | Required distinct UUID for transfer; null/absent otherwise |
| fund_id | Optional for Money In/Out: resolve active unrestricted General default; required explicitly for transfer/opening |
| category_id | Required INCOME category for Money In, EXPENSE for Money Out; null/absent for transfer/opening |
| member_id | Optional membership UUID for Money In/Out, not profile/user UUID |
| project_id | Optional project UUID for Money In/Out |
| description | Optional string; a NEW Money Out requires nonblank description per F2 §6.3 |
| reference_metadata | Optional object containing only reference (optional string) and evidence_ids (optional UUID array) |

Optional null and absence normalize identically. Empty UUID/currency strings do not
mean absence. Destination/category/member/project must be null/absent where
prohibited. Transfer/opening cannot default a missing fund. Missing, restricted,
inactive, or ambiguous General defaults fail rather than inventing a fund.

Caller fields source_module, source_record_id, effect_kind, event_class,
ledger_epoch_id, postings, control_class, amount_signed, category_class,
recognized_income, recognized_expense, created_by, status, fingerprint,
and opening_provenance_id are rejected. destination_fund_id is also rejected.
The server generates actor, status, event/posting IDs, audit timestamps, source
identity, canonical payload, and fingerprint. No attachment/update workflow is
implemented by accepting test metadata.

## Amount, currency, UUID, and time normalization

- Currency metadata exactly mirrors F3-01 financial_core.currency_scale.
  **0 decimals:** XAF, XOF, TZS, UGX, RWF.
  **2 decimals:** NGN, GHS, KES, ZAR, ETB, CDF, USD, EUR, GBP, CAD, CHF, AUD, AED.
- Currency is uppercase ASCII, without surrounding whitespace. The optional
  client currency is an assertion, not authority or an FX instruction.
- Amount syntax is unsigned digits with an optional decimal fraction. Leading
  zeroes are allowed and removed. Fractional digits cannot exceed catalog scale,
  even when the excess digits are zero. USD "500", "500.0", "500.00" all
  canonicalize to "500.00"; XAF "500" is valid but "500.0"/"500.5" are rejected.
- Reject zero, negative, non-finite text, JS numeric inputs, exponent notation,
  leading plus, whitespace, separators, missing integer/fraction digits, excess
  precision, input over 64 characters, and more than 22 normalized integer digits.
  The 22-digit bound matches F3-01 numeric(30,8) storage, before coercion/rounding.
- Canonical amounts have exactly the supported scale, including trailing zeroes.
  Arithmetic uses BigInt minor units only. No rounding or JS floating-point money.
- UUIDs use the standard hyphenated 8-4-4-4-12 hexadecimal form, canonical lowercase.
  Existing database IDs are not restricted to one UUID version.
- Input timestamps require YYYY-MM-DDTHH:mm:ss[.1–6 digits](Z|±HH:mm), uppercase
  T/Z, real Gregorian dates, year 0001–9999, and known offsets up to ±14:00.
  Reject leap seconds, unknown -00:00, date-only/local time, and excess precision.
  Canonical form is UTC YYYY-MM-DDTHH:mm:ss.ffffffZ with six fractional digits.
  Equivalent offsets fingerprint equally; one microsecond changes economic time.
  Calendar Date arithmetic never handles monetary amounts.

## Epoch and active-target resolution

For a new occurrence, resolve exactly one group epoch containing occurred_at in
the half-open interval [effective_from, effective_to), with an absent end meaning
unbounded. Then validate its currency against the source account. No match,
overlap, or mismatch fails. A new backdated occurrence can use a historical epoch
when its targets are currently active and all compatibility checks hold.
Today's active epoch and today's display currency do not replace effective time.

A compatible custody account belongs to the group, has the event currency, was
opened no later than occurred_at, and references a same-group/same-currency opening
epoch beginning no later than that instant. An older account may serve a later
same-currency epoch. Exact equality between opening and posting epoch is not
required by F3-01. A different-currency epoch cannot reuse the account through
relabeling. Both transfer accounts undergo the same checks.

NEW ordinary posts require active custody account(s), active fund, and active
category where applicable. Closed/inactive targets fail. Current authorization is
always revalidated. Historical records remain valid for existing events and later
F3-04 exact reversals. An identical authorized retry does not become a new post and
does not require its original targets still to be active.

One fund per event, on both sides, is mandatory. Ordinary account transfer preserves
that fund; it cannot reallocate funds, move between groups, or perform FX.
The whole journal sum is zero, not a fund balance measure.

Optional member/project attribution is copied to both legs of ordinary Money In/Out,
requires same-group records, and does not affect balance. The member dimension
identifies memberships.id; historical/inactive attribution records are permitted.
This is separate from the active membership requirement for the actor. Attribution
creates no member statement payment, dues obligation, standing input, or specialized
project workflow. Transfer/opening reject these dimensions in v1.

## Source identity and private opening provenance

Manual source identity is server-derived:

~~~text
source_module = manual_finance
source_record_id = canonical lowercase request_id
effect_kind = server mapping from bounded action
~~~

A browser cannot impersonate another module. Different request IDs represent distinct
manual occurrences even when their money fields happen to match; the UI must retain
one ID across retries. Never deduplicate unrelated events by amount alone.

The private opening oracle uses trusted context:

~~~json
{
  "channel": "opening_internal",
  "opening_occurrence": {
    "group_id": "<server-resolved group UUID>",
    "occurrence_id": "<stable allocation occurrence UUID>",
    "provenance": {
      "id": "<stable opening basis/provenance UUID>",
      "group_id": "<server-resolved provenance group UUID>"
    }
  }
}
~~~

It derives source_module = opening_finance, source_record_id = occurrence_id,
effect_kind = opening_custody, and fingerprints opening_provenance_id.
Source occurrence and provenance must both belong to the command group.
Missing provenance or cross-group source fails. These are resolved records in the
future server, never browser assertions. The oracle's authorized flag is a trusted
fixture verdict, not an authorization implementation.

F3-05 later owns the provenance record/workflow and stable allocation IDs. For a
10,000 Bank opening split across funds, distinct allocations of 8,000 General and
2,000 Restricted together open 10,000 custody. Do not open 10,000 first and then
open another 2,000 merely to label Restricted: that proposes 12,000 custody and
fails the allocation-total fixture. F3-05 must validate the complete intended total
before invoking templates; Stage A does not implement allocation persistence,
opening cutover, or a general fund-reallocation command.

## Canonical payload and fingerprint boundary

Version f3-posting-v1 contains **exactly 18 keys**:

~~~text
contract_version
group_id
ledger_epoch_id
event_class
effect_kind
currency
amount
occurred_at
source_module
source_record_id
request_id
account_id
destination_account_id
fund_id
category_id
member_id
project_id
opening_provenance_id
~~~

All keys are always present. Values are normalized strings or explicit null.
Resolved account currency, bound epoch, and actual resolved fund UUID are included.
Opening provenance is economic because it identifies the source position/basis.
Other economic reference identities are not supported as free-text fields in v1.

**Excluded:** description, narrative receipt/reference string, evidence UUID list,
created/posted/retry timestamp, UI locale, formatting, and temporary client state.
Narrative/evidence changes on retry return the existing event and do not update its
immutable description/reference metadata. Later auditable evidence APIs may record
such changes separately. Callers cannot smuggle classification or amounts inside
metadata; unknown metadata keys are rejected. This choice neither makes evidence
mutable today nor permits an unnoticed rewrite of F3-01 history.

Serialization is compact JSON with these flat ASCII keys sorted in ascending ASCII
order, double-quoted JSON strings, literal null, no spaces, BOM, or final newline.
All economic values are restricted to ASCII by the above grammars/allow-list.
Fingerprint = lowercase hexadecimal SHA-256 of those **UTF-8 bytes**.

Do not hash PostgreSQL jsonb::text directly: its rendering/key order/spacing is not
this serialization contract. Reproduce the pinned bytes and all three golden hashes.
Object construction order and presentation never change the fingerprint.

## Replay decision contract and Daybreak obligations

The pure oracle returns READY (one event, the complete two-posting expectation),
IDEMPOTENT_RETURN_EXISTING (original event/epoch/fingerprint, zero new events and
zero new postings), or throws a named SemanticError.

For every invocation, including retries, the future server must enforce current
authorization before exposing historical results. Reuse F3-01's active membership
plus finances.manage authority; authorization cannot come from client fields.
A revoked/inactive caller receives DENY, not an event or a conflict revealing data.

For manual commands lookup/serialize (group_id, request_id) first. Also
lookup/claim/serialize the occurrence:

~~~text
(group_id, source_module, source_record_id, effect_kind)
~~~

**This claim excludes epoch and happens before new epoch resolution.** Retain
F3-01's existing epoch-inclusive uniqueness as a final guard, but neither that
constraint nor its epoch-inclusive lock hook alone prevents cross-epoch duplication.
Stage B owns the additional serialization/constraints and a consistent lock order.

If either identity has an existing event:

1. Revalidate authorization under the server's protected operation.
2. Use that event's bound epoch, never today's active epoch.
3. Normalize retry inputs using the original currency if omitted and original
   resolved fund if an allowed defaultable fund is omitted. Explicit changes
   remain explicit; do not substitute live defaults.
4. Compare the complete canonical economic payload against the original.
   Same meaning returns the original event and zero writes; changed amount,
   period, currency, action, source, account, destination, fund, category,
   attribution, or economic provenance yields CONFLICT.
5. Do not perform new-target active checks or epoch/default resolution for an
   identical retry. Input grammar and prohibited-field checks still apply.
   Malformed retries receive their semantic rejection rather than being accepted.
6. Multiple matches across epochs, disagreeing request/source matches, corrupt
   stored fingerprint, or an incompatible stored payload version fail closed with
   OCCURRENCE_INTEGRITY. Do not arbitrarily select one event.

The database must preserve or reconstruct the exact original canonical payload
transactionally. F3-01 currently stores the digest but not a dedicated canonical
snapshot column. Stage B chooses protected storage/reconstruction using immutable
event/posting/source data; it must retain resolved defaults and private provenance.
It cannot reconstruct an omitted fund from today's configuration or infer actor
authority from a stored prior decision. A future version needs explicit replay
version handling, not silent reinterpretation of v1.

Only after both identity checks find nothing may the server resolve the new epoch,
validate all dimensions, derive the full template, and atomically insert the event,
bound payload/provenance, and both postings. Any failure commits nothing.
Serialize conflicting requests/occurrences/configuration transitions consistently.
Concurrent identical retries yield one event and one posting set; concurrent
different payloads sharing an identity produce one success and a conflict.
No database lock/claim implementation is included in this stage.

## Posting-set closure and later qualification

Each initial event is closed at exactly two postings. No caller can provide lines,
append a third line, or add a later balanced pair. F3-01's privileged structural
insertion capability is not a public command contract. Stage B must ensure all
external write access goes through the secured atomic command and cannot reopen
a committed event's posting set.

Daybreak's combined qualification must exercise these vectors through its actual
RPC and prove: hardened SECURITY DEFINER/empty search path, authorization on new
posts and retries, tenant isolation, RLS/grants, epoch-free occurrence serialization,
request/source collision handling, changed payload conflict, atomic rollback under
forced mid-command failure, and closure against late additions. Assert zero side
effects on all errors and zero inserts on idempotent returns. Stage A's pure counts
are expected decisions, not measured committed row counts.

## Recognition and arithmetic acceptance

USD foundation, before any correction:

| Measure | Exact value |
|---|---:|
| Bank | 9,300.00 |
| Cash | 1,000.00 |
| Total custody | 10,300.00 |
| Income | 500.00 |
| Expense | 200.00 |
| General Fund cash | 10,000.00 |
| Restricted Fund cash | 300.00 |

Opening Bank 10,000 + restricted donation 500 - restricted venue 200 - General
transfer 1,000 leaves Bank 9,300. Cash receives 1,000. No correction is implemented.

Capability-only fixtures assert receivable +1,000/custody -1,000, principal repayment
custody +200/receivable -200, and member savings custody +100/liability -100,
all with zero SoA income/expense. They are not public effects, loan workflows, or
Njangi workflows. There are no obligations, receipts, reminders, or standing writes.

## Qualification boundary

Preflight used the canonical workspace C:\Users\nanye\Documents\villageclaq.
Tracked files were clean. HEAD and the live remote integration tip were exactly
the authorized base. The local integration ref was stale at 99e17e2... and was
left untouched. The base's only changes from that local ancestor were the frozen
F3-01 migration and foundation DB test. No unexpected product drift was present.
The requested Stage A branch was absent remotely before creation.

The frozen migration and foundation tests are present and unchanged. Their
database harness was not run: it installs the migration into a disposable database,
and this authorization prohibits applying migrations. This stage runs only its
pure semantic suite and scoped lint.

Do not merge or ship this branch independently. Do not open the final F3-02 PR.
After Stage A qualification, Daybreak branches from the exact signed Stage A SHA
as security/f3-02-secure-posting-idempotency-20260908, adds the authoritative
RPC/security half, and opens the combined PR against codex/f3-core-ledger-foundation.

**F3-02 integration:** HOLD — COMBINED ASTRA + DAYBREAK UNIT NOT YET QUALIFIED.
**F3-03:** HOLD — F3-02 MUST COMPLETE FIRST.
**Production:** UNCHANGED.
