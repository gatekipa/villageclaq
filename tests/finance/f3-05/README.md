# F3-05 Stage A: opening cash contract

TEST / CONTRACT ONLY. Never import these modules into product runtime. This
directory defines a pure oracle over explicit trusted fixture snapshots; it does
not implement an RPC, authorization, persistence, locks, SQL, or database rollback.

Base: `86d8ce351d95d44672b1e7e3131200166b88c5d2`.
Branch: `feature/f3-05-opening-cash-semantics-20260910`.
F2 authority: `a13b5e6c482e5e68ba2c92c41ae14b411668ae88`,
`docs/VILLAGECLAQ_F2_CANONICAL_FINANCIAL_DOMAIN_DESIGN.md`, especially
opening semantics and manual opening scope.
Ticket authority: `4b9286d196650afeda92a8bb9625ec3b416381c8`,
`docs/VILLAGECLAQ_F3_CORE_LEDGER_TICKET_FREEZE.md` §5.5.
The referenced documents are read at those commits; neither is edited.

## Model and public intent

One entry = one account + one explicit fund + one positive amount + one economic
occurred_at + one occurrence UUID + one provenance UUID. One Financial Event,
exactly two postings. Multiple balances are independent entries, not a new
user-visible Opening Batch.

The future secure opening endpoint accepts this exact object:

```json
{
  "group_id": "00000000-0000-4000-8000-000000000001",
  "opening_occurrence_id": "00000000-0000-4000-8000-000000000701",
  "opening_provenance_id": "00000000-0000-4000-8000-000000000801",
  "account_id": "00000000-0000-4000-8000-000000000101",
  "fund_id": "00000000-0000-4000-8000-000000000201",
  "amount": "10000.00",
  "occurred_at": "2026-09-08T12:00:00.000000Z",
  "currency": "USD",
  "provenance": {
    "source_description": "Opening bank statement",
    "source_at": "2026-09-01T00:00:00Z",
    "reference_metadata": {
      "reference": "STMT-001",
      "evidence_ids": ["00000000-0000-4000-8000-000000000850"]
    }
  }
}
```

Only currency is optional at the outer level; omission derives account/epoch
currency. Explicit NULL currency is rejected. All other outer fields are required
and non-NULL. UUIDs reuse F3-02 syntax and lowercase normalization. No default fund.
Unknown fields are rejected even when NULL. No action selector, ordinary
request_id, source fields, epoch assertion, fingerprint, actor, recorded_at,
event ID, posting ID, destination account, status or arbitrary posting lines.

Category, member, project, contribution type, dues obligation and payment fields
are prohibited, including NULL placeholders. An opening cannot masquerade as
Money In or a contribution; ordinary Money In cannot invoke the private opening
channel. Opening occurrence IDs must not reuse an existing same-group manual
request UUID. The namespaces remain distinct; this is not a retrofit of the frozen
manual endpoint or a new universal request namespace.

## Existing engine and exact two-line economics

Stage B maps the intent to the existing private F3-02
`financial_core.post_f3_command` opening path, with server-resolved p_opening:

```text
command.action = opening
command.group_id/account_id/fund_id/amount/occurred_at/currency = validated intent
p_opening.group_id = authenticated, authorized target group
p_opening.occurrence_id = normalized opening_occurrence_id
p_opening.provenance = { id: persisted opening_provenance_id, group_id: target group }
```

Source identity is `opening_finance` / occurrence UUID / `opening_custody`.
event_class = `opening_adjustment`; request_id = NULL; recognition = neither.
The adapter must never forward caller-provided trusted context into this engine.

| Posting | control_class | account_id | fund_id | amount_signed |
|---|---|---|---|---|
| 1 | custody | selected account | selected fund | +A |
| 2 | opening_position | NULL | SAME selected fund | -A |

Both lines share event, group, ledger epoch, native currency and occurred_at.
category_id/category_class/member_id/project_id are NULL on both. There are no
contribution/dues dimensions. Existing F3-02 emits all posting math; the F3-05
oracle adds intent/provenance/account-kind validation only.

## Account, fund, currency and time

**V1 account kinds: exactly bank, cash.** F2 and F3-01 also describe mobile_money,
wallet and other as custody kinds, with the same general custody mathematics.
That broader catalog does not expand the explicit bank/cash scope in frozen
F3-05 §5.5. These three kinds are rejected here; no special accounting is invented.

For a NEW occurrence, account must exist, belong to group, have allowed kind,
status active, and no closed_at. F3-01 already enforces active lifecycle consistency.
It must match the resolved epoch's currency. Its opened_ledger_epoch_id must
resolve to a same-group, same-currency epoch starting no later than occurred_at,
and account.opened_at must be <= occurred_at. An older compatible same-currency
account need not have been opened in the selected epoch. Inactive/closed accounts
are unavailable for new occurrences even when the command is backdated.

Fund is explicit, existing, same-group and active. Restricted/unrestricted are
both allowed. No category or default General inference. Archived configurations
remain visible historically and on authorized identical replay.

Money reuses F3-02 normalizeAmount without floating-point arithmetic: positive
decimal string, supported currency precision, at most 22 significant whole
digits for numeric(30,8), no rounding/exponent/locale formatting. USD uses at most
two fractional digits and canonical two-digit scale. XAF uses zero; even "1.0"
is invalid command precision. Zero, negative and JS numeric inputs are denied.

Currency derives from account and economic epoch; optional assertion must agree.
No FX, conversion or mixed-currency event. Separate group/currency buckets remain
separate, including historical USD and later XAF epochs in one group.

occurred_at is economic time, normalized by unchanged F3-02 to UTC with six
fractional digits. Resolve exactly one same-group interval [effective_from,
effective_to), with NULL upper bound unbounded. Zero matches fails; overlap fails.
Never substitute posted_at, created_at, recorded_at or provenance.source_at.

## Mandatory persistent provenance

Small immutable source record, not a document-management system:

| Stored field | Authority / rule |
|---|---|
| id | opening_provenance_id, stable UUID |
| group_id | server-bound authorized target group; immutable |
| details.source_description | required nonblank string, 1–1000 Unicode scalar values |
| details.source_at | optional source/effective timestamp, normalized UTC; NULL if absent |
| details.reference_metadata | optional bounded object, empty object if absent/NULL |
| recorded_by | authenticated server actor at first source persistence |
| recorded_at | server timestamp at first source persistence |

source_description and reference preserve original characters; no trim or NFC
rewrite. Whitespace-only strings, C0/C1 controls, DEL and unpaired surrogates are
rejected. reference, when present/non-NULL, follows the same text rules with a
500-scalar limit. evidence_ids, when present/non-NULL, is an array of at most
20 UUIDs, normalized lowercase with order preserved. Unknown nested keys reject.
source_at and optional metadata members accept absent/NULL; invalid dates/UUIDs
reject. Source date is descriptive evidence, not posting economic time.

Evidence IDs are opaque reference metadata, not grants to read documents.
If Stage B resolves them against a document/evidence catalog, it must independently
validate same-group access; this contract neither fetches documents nor permits
cross-tenant evidence disclosure.

Minimum persistence may be a private provenance relation plus existing private
occurrence binding; physical schema is Daybreak's responsibility. A UUID already
bound to another group must fail closed; never adopt/reassign it. Duplicate
provenance rows or missing provenance for a completed occurrence fail integrity.
Provenance existence and group scope must be verified by the server, not accepted
as caller assertions. Commit a newly created source atomically with its first entry.

**Sharing is allowed.** One statement can support Bank/General 8000,
Bank/Restricted 2000 and Cash/General 1000. Three distinct occurrences/events
reference one provenance. No posting or additional cash belongs to the provenance
record itself. New entries can instead provide distinct provenance UUIDs.

## Economic fingerprint and replay

Reuse unchanged **f3-posting-v1**; no wrapper/provenance fingerprint or new economic
serialization. The exact payload keys remain:
contract_version, group_id, ledger_epoch_id, event_class, effect_kind, currency,
amount, occurred_at, source_module, source_record_id, request_id, account_id,
destination_account_id, fund_id, category_id, member_id, project_id,
opening_provenance_id.

Use F3-02 canonicalBytes: ASCII lexicographic key ordering, compact JSON,
explicit NULLs, normalized UUID/currency/amount/time, UTF-8, SHA-256 lowercase hex.
Do not hash PostgreSQL jsonb::text as a substitute for the exact bytes.
Four fixed goldens independently assemble expected payloads and bytes without
oracle calls; their digests were computed separately using .NET SHA-256.
They cover USD General, USD Restricted, XAF, and shared provenance/distinct occurrence.

Opening identity is (group, opening_finance, occurrence UUID, opening_custody),
**independent of epoch**. Bind it immutably to the completed event, original
canonical payload/fingerprint, resolved epoch/currency and provenance.
Same authorized meaning returns SAME event; zero new events/postings/provenance.
Changed well-formed amount, account, fund, occurred_at, currency or provenance
under that identity conflicts. Invalid input rejects. A different occurrence
is independent; it is not deduplicated merely because amount/account/date match.

Replay compares against the frozen payload rather than resolving today's epoch
or active catalog. Archived account/fund does not invalidate an identical
authorized replay. Corrupt/duplicate source bindings fail closed.

All provenance narrative/reference/evidence/source_at is **outside** economic
fingerprint; provenance UUID is inside. Proposed metadata is still validated on
every request. First committed source details, evidence, actor and recorded_at win,
both on replay and on a NEW occurrence sharing that source ID. Never silently
update the source from a retry. A different source requiring new evidence should
use a distinct provenance ID for a new occurrence; this ticket provides no edit API.
Each new financial event independently records its current server actor and posting
time; sharing a source must not copy the first source actor into later event audit.

For event description/reference snapshot, Stage B uses the committed source's
source_description/reference_metadata, not changed retry text. Cashbook lineage
uses event_id -> opening_finance/source_record_id -> persisted opening occurrence
-> provenance. F3-03 does not expose private provenance payloads; no projection
column or mathematical change is required.

The oracle's rich plan/provenance result is a test artifact, not a proposed public
response. The secure command should return only a bounded completed-event result
(for example event_id and created/replayed disposition), not private canonical
payloads or evidence.

## Stage B security and atomicity requirements

These are required future database proofs, not claims established by JS fixtures:

1. Require authenticated active same-group membership and finances.manage before
   sensitive lookups, replay returns or writes. Follow existing F3 MVP policy;
   introduce neither finances.opening nor F7 cutover privilege.
2. Serialize occurrence independently of epoch and serialize first-use provenance.
   Establish a consistent lock order. Recheck current authorization AFTER waiting
   and before disclosure/commit; revocation yields DENY even on identical replay.
   The oracle's authorized/authorized_after_locks flags only model this decision.
3. Reload same-group source/configuration under appropriate protection before
   posting. Cross-group account/fund/epoch/provenance must fail with no partial
   event. New inactive/closed configuration must not race through validation.
4. Atomically persist provenance if new, occurrence/event binding, canonical
   fingerprint and exactly two postings through private F3-02. Roll back all
   artifacts on any failure; failed attempts must not reserve successful replay.
5. Prove concurrent identical retries yield one event and one existing result;
   changed meaning under one identity yields one winner plus conflict; rollback
   permits retry. Distinct occurrences sharing provenance serialize to one
   immutable source record and separate legitimate events. A rolled-back
   tentative narrative must never win over a committed source record.
6. Preserve existing append-only financial truth protections. No browser update
   or delete of economics/postings/provenance. No direct client access to trusted
   p_opening/private source tables; secure grants, tenant constraints and
   SECURITY DEFINER boundary belong to Daybreak. No migration is supplied here.
7. Verify database canonical byte parity, auth denial, post-wait revocation,
   tenant isolation, config races, source sharing and injected rollback points.
   Verify DB tables and any outbox/trigger paths have zero unrelated effects.

## Projection and forbidden effects

F3-03 remains unchanged. Account balance and fund cash sum only custody.
Fund net position includes custody (and other frozen position controls generally);
the opening_position offset is not extra cash or a deduction from starting
fund assets. Opening-only income, expense and operating result are zero in every
reporting period. Cashbook and movement retain exactly one custody row per opening,
movement_type opening_position, original economic time and opening source lineage.
The complete committed history survives later account/fund archival.

Per currency: sum opening custody by account = sum by fund = organization opening
custody. Every event balances exactly to zero. Never add a total Bank 10000 event
PLUS its 8000/2000 fund allocations: the TWO allocated entries are the whole 10000.
This contract has no statement-total object or importer to infer/detect an
operator intentionally entering a third independent occurrence.

| Executable case | Expected |
|---|---|
| General Bank opening | Bank / General / organization 10000 USD, SoA zero |
| General 8000 + Restricted 2000, same Bank | Bank / organization 10000; funds 8000 / 2000, SoA zero |
| Bank 9000 + Cash 1000, General | General / organization 10000, SoA zero |
| Shared provenance across three occurrences | Bank 10000, Cash 1000, General 9000, Restricted 2000 |
| XAF | 2500000 accepted, fractions rejected, own currency bucket |
| Archived after post | same historical account/fund/cashbook projection; new entry denied |
| Minimal later composition smoke proof | opening 10000 + donation 500 corrected to 450 - expense 200; transfer 1000: Bank 9250, Cash 1000, total 10250; income 450, expense 200 |

The last row is only a bounded compatibility fixture using existing F3-02,
F3-04 and F3-03; it does not implement F3-09 acceptance/UI.

Opening never writes payments, contribution_obligations,
payment_obligation_applications, standing history, member balances or contribution
types. No dues credit, confirmed collection, receipt, reminder suppression,
notification, email, SMS, WhatsApp, announcement or other messaging.
Standing continues its canonical confirmed-dues source unchanged.
The pure oracle has no side-effect interfaces; runtime/DB absence of those effects
still requires Stage B proof.

F3-04 correction eligibility is unchanged and rejects this opening with
TARGET_NOT_MANUAL. No opening correction/reversal UI or policy is introduced.
Dedicated opening remediation remains a future F7/cutover concern.
No receivables/payables, loans, Njangi, member savings/credits, dues arrears,
refund liabilities, projects, fines, relief, importer, cutover or caches.

## Execution and handoff

Run directly from repository root (no package.json changes):

```text
node --test tests/finance/f3-05/opening-oracle.test.mjs
node --test tests/finance/f3-04/correction-oracle.test.mjs
node --test tests/finance/f3-03/projection-oracle.test.mjs
node --test tests/finance/f3-02/oracle.test.mjs
```

Results: F3-05 **118/118** = 19 valid entry vectors + 62 negative vectors +
19 replay vectors (8 successful, 11 rejected) + 4 multi-entry scenarios +
10 additional integration/boundary checks + 4 canonical goldens.
The required changed-payload negatives are explicitly in the replay catalog.
Unchanged Astra regressions: F3-04 **168/168**, F3-03 **80/80**, F3-02 **167/167**.
Daybreak DB suites were not run; no compatibility blocker requires them in Stage A.

Files added: README.md, opening-oracle.mjs, opening-vectors.mjs,
replay-vectors.mjs, opening-oracle.test.mjs, canonical-golden.json.
Only tests/finance/f3-05 is changed. No production runtime imports, SQL, UI,
package changes, migration/RLS/security-function changes or frozen artifact edits.

After this Stage A signed commit is pushed, DAYBREAK BLUE may branch from its
exact SHA as security/f3-05-opening-cash-security-20260910 and implement Stage B.
No final combined PR yet. Combined qualification and the later draft PR against
codex/f3-core-ledger-foundation belong to the combined Stage B branch.

F3-05 integration: HOLD — COMBINED ASTRA + DAYBREAK UNIT NOT YET QUALIFIED.
F3-06: HOLD — F3-05 MUST COMPLETE FIRST.
Product consistency: TRACKED — DO NOT LOSE. Financial-report taxonomy;
Board Packet/dashboard/AI metric migration; notification cadence, payment reminder
policy, quiet hours, fail-closed external preference lookup; hosting/event/meeting
reminder timing; announcement producer cutover and shared scheduler remain tracked.
Release-cut planning follows the F3-05 checkpoint; none is implemented here.
Production UNCHANGED. No apply, main/integration merge, deploy, messages, receipts,
reminders or agentic activation. Next owner DAYBREAK BLUE; Stage A stops here.
