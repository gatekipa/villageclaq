# F3-03 Stage A — canonical projection/read contract

**Contract:** `f3-projection-v1`. **Qualification:** Stage A semantics only.
**Exact base:** `4570deff65404bd95fdb5d6c403209131fc62b44`.
**Branch:** `feature/f3-03-projection-read-contract-20260908`.
**Workspace:** `C:\Users\nanye\Documents\villageclaq`.

Authority: the founder's serialized F3-03 Stage A authorization; F2 design at
`a13b5e6c482e5e68ba2c92c41ae14b411668ae88`; F3 ticket freeze at
`4b9286d196650afeda92a8bb9625ec3b416381c8`; frozen F3-01/F3-02 at the base above.
The later authorization limits this implementation to tests and this contract.

Reports are projections of financial truth, not financial truth. The authoritative
write path remains `public.post_financial_command(p_command jsonb)`. The eventual
database projections are the sole production read mathematics. This oracle must
never be imported into `src/`, UI, runtime services, or exports. It has no database,
network, filesystem, environment, clock, persistence, or authorization access.
It imports only the frozen F3-02 **test** currency catalog and time/UUID normalizers.

## Run, counts, and qualification boundary

Run from the canonical repository with Node 20 or later:

```sh
node --test tests/finance/f3-03/projection-oracle.test.mjs
node --test tests/finance/f3-02/oracle.test.mjs
```

| Stage A class | Exact test count |
|---|---:|
| Valid projection vectors, all projection outputs compared | 35 |
| Forbidden algorithm counterexamples | 18 |
| Invalid snapshot/amount inputs with named rejection | 18 |
| Additional query, pagination, snapshot, audit, compatibility, precision, position, zero-row, and catalog checks | 9 |
| **F3-03 total** | **80/80** |
| **Unchanged F3-02 regression** | **167/167** |

The 35 valid vectors assert exact currency, aggregate/posting grain, amounts,
contributing posting IDs, effective period/as-of population, dimensions, cashbook
order, movement classification, and traceability. Reconciliation runs within each
valid case; assertions are not inflated into extra test counts. There are **36**
anti-pattern/negative cases in total (18 + 18). No skipped tests.

Literal expectations live in `projection-vectors.mjs`, independently of the oracle.
Golden aggregate tuples contain dimension keys, currency, exact amount, and the
explicit contributing posting references. Activity tuples additionally contain
category/class, fund, member, and project. SoA tuples contain currency, income,
expense, result, and posting references. Book tuples contain posting reference,
currency, account, fund, member/project, signed amount, full-history running balance,
movement type, category context, and counterpart control classes. `N:L` means
fixture event N / posting leg L; it is only a short spelling for deterministic UUIDs.
Aggregate ordering is not a public contract; cashbook ordering is.

The direct compatibility check consumes actual outputs from the unchanged F3-02
ordinary command oracle and compares their cash/income/expense to its literal
vectors. Capability, opening, correction, and mixed-posting fixtures here do **not**
authorize new RPC actions. The four-line mixed fixture is a structural capability
probe; F3-02 ordinary posting sets remain exactly two lines and closed.

Passing Stage A is not proof of PostgreSQL parity, RLS, authorization, labels,
tenant isolation, real MVCC concurrency, or SQL performance. Daybreak must qualify
those against this exact eventual handoff SHA. No DB suite or UI suite is needed
to claim this narrower Stage A result.

## Population, query, exact money, and zero rows

The logical input is a single group's **entire committed posting history visible
in one database snapshot**, joined to its owning events. Persisted
`financial_postings` rows are the population; no new `committed` flag/table is
introduced. F3-02 already commits an event and its complete balanced set atomically.
Originals with `corrected` or `reversed` status remain included. No `status='posted'`
predicate, distinct-by-request/source deduplication, current epoch filter, active
configuration filter, payment table, obligation total, or manually stored balance
may replace this population. The atomic writer prevents duplicate occurrences;
projections sum each distinct committed posting once.

The oracle's snapshot is trusted test input, not a client-supplied proof of commit.
It rejects duplicate IDs, orphan/scope-mismatched postings, non-committed states,
unknown controls, invalid posting shapes, zero postings, and incomplete/unbalanced
events. It is not a replacement for F3-01 constraints or F3-02 write validation.

One query envelope contains `group_id`, required `from` and `to`, and nullable
`as_of_exclusive`. All timestamps have explicit zones and normalize to UTC with
six fractional digits, following F3-02. `from < to` is required; local dates must
be converted to exact instants before calling the projection. No server-today or
report-specific date default is allowed.

| Read axis | Exact predicate |
|---|---|
| Income, Expense, SoA-lite, Cash Movement, Cashbook | `from <= occurred_at AND occurred_at < to` |
| Account Balance, Fund Cash, Fund Net Position, organization custody | `occurred_at < as_of_exclusive`; null means all visible committed history |

These axes are independent: the balance cutoff does not silently truncate the
activity period. A same-period bundle should explicitly request
`as_of_exclusive = to`. A different balance cutoff must be identified as such.
`posted_at`, `created_at`, and `corrected_at` are audit dates, never activity dates.

Money mathematics uses signed exact decimal values / BigInt minor units, never JS
floating-point numbers. The currency scale is the frozen F3-01/F3-02 catalog.
Stored `numeric(30,8)` text such as USD `500.00000000` or XAF `500.00000000`
is accepted without rounding; nonzero fractional digits beyond currency precision
are rejected. This differs deliberately from the stricter F3-02 **command** syntax.
Aggregates are not capped at an individual posting's 22-integer-digit limit.

SQL must aggregate exact numeric values and serialize money at the read boundary
as unlocalized decimal strings (USD `9300.00`, XAF `2500000`). JSON numbers that
could be decoded as JS Number are not an exact-money transport. No symbols,
grouping separators, FX conversions, or currency-formatted strings belong in
authoritative SQL arithmetic. Later consumers use the existing money helpers
through a lossless adapter, without `parseFloat`/`Number` coercion of large values.

Aggregate rows exist for dimensions with at least one selected contributing
posting, even when the result is zero or negative. Never `HAVING sum(...) <> 0`
to hide history. A never-used account/fund is not fabricated as a financial row;
configuration lists can independently show it with no-history semantics.
Income/expense detail is empty when no selected economic lines exist. SoA has one
row per currency present anywhere in that group's visible committed snapshot,
including zero activity rows; an entirely empty ledger has no invented currency.

## Projection formulas and exact grains

Every row carries `group_id` and `currency`; every result carries the version,
effective query boundaries, and consistent snapshot metadata. Period is part of
activity grain via the envelope. Null attribution is a real grouping value.

| Projection | Logical row grain | Included controls / formula |
|---|---|---|
| Account Balance | group / account / currency | `SUM(amount_signed)` of custody only |
| Fund Cash | group / fund / currency | `SUM(amount_signed)` of custody only |
| Fund Net Position | group / fund / currency | Signed custody + receivable + liability |
| Organization custody | group / currency | Signed custody only; reconciliation measure |
| Income | group / period / currency / category / fund / member / project | **Negative** sum of income controls |
| Expense | group / period / currency / category / fund / member / project | Sum of expense controls |
| SoA-lite | group / period / currency | Income minus Expense; detailed breakdown is the above activity rows |
| Cash Movement | group / custody posting | One signed cash leg plus event economic context |
| Cashbook / register | group / custody posting | The same cash leg, trace context, and account running balance |

Income and expense carry `category_class` as well as category ID; F3-01 fixes that
class for an ID. Activity grouping always retains the fund, project, and membership
dimensions present on the posting. Account/fund totals intentionally roll these up;
the cashbook retains the original dimensions for drilldown. Attribution alone
creates no dues payment, member balance/standing, project budget, or subledger state.

Fund Net Position excludes income, expense, and opening_position controls directly:
these explain equity/activity, not additional current assets. Liability credits
are negative under the debit-positive convention. Summing all fund postings is
the event's zero-sum journal, not Fund Cash or Fund Net Position. Neither net
position nor cash held is automatically "unrestricted money available to spend."

Currency is never optional in a grouping or result. Historical epochs in one group
may contribute different currency buckets. Same-currency epochs can aggregate in
their native currency; epoch ID remains available on cashbook rows. USD and XAF
never produce one numeric grand total. Parent/HQ aggregation and FX are not built.

## Cash Movement classification and category linkage

Cash Movement deliberately uses custody-posting grain rather than event/account
collapse. This retains split postings, deterministic IDs, source/destination legs,
and future attribution without changing multiplicity. Organization cash change
may sum these legs **within one currency**; no new financial truth is stored.

For the initial templates, use the committed counterpart **control class**, not
the sign of custody, category name, event status, or a payment status:

| Counterpart | `movement_type` | Ordinary meaning |
|---|---|---|
| income | operating_income | Operating receipt; reversal remains this type with negative cash |
| expense | operating_expense | Operating payment; reversal remains this type with positive cash |
| other custody | internal_account_transfer | Same-group/currency transfer between distinct accounts, each fund preserved |
| opening_position | opening_position | Opening custody, separately identified from ordinary receipts |
| receivable | receivable_movement | Non-operating asset movement: principal lending/repayment |
| liability | liability_movement | Liability receipt/payout, never organization income |

`direction` is independently `cash_in` for positive cash and `cash_out` for negative
cash. It never implies operating income/expense. `control_classes` lists sorted
distinct non-custody counterpart classes. All-custody events that do not satisfy
the above transfer conditions are `unclassified_custody`, never invented income.
Multiple counterpart classes are `mixed_non_custody`; expose those classes and
event context without allocating the full cash amount to each. These fallback
labels are read semantics for future capability, not new writable effect types.

**Schema compatibility:** F3-01 requires custody posting category ID/class to be
null. Income/expense postings own their categories. For ordinary two-line events,
derive the custody row's category context from the economic companion in the same
event and group. `category_contexts` is a sorted distinct array of category ID/class,
fund, member, and project from economic companions. Preserve those companions'
dimensions; do not copy a category onto an unrelated cash allocation. With multiple
categories this is **event context**, not a category allocation of each cash leg.
Never expand a cash row through a one-to-many join and then sum duplicated money.
Activity category totals come directly from economic postings instead.

## Cashbook, audit, and running balance

Each cashbook row exposes logical fields: posting/event/group/epoch IDs;
occurred_at and posted_at; custody account, fund, currency, signed amount;
event_class/effect_kind, movement_type/direction/control_classes; category contexts;
member/project attribution; source_module/source_record_id; and status.
Authorized audit readers additionally receive request_id, created_by, the immutable
event description and the allow-listed narrative `reference` from reference_metadata.
Return nullable reversal_of_event_id, replacement_event_id, corrected_at, and
correction_reason when authorized/available. Use source links for later audit.

Do not expose the economic fingerprint, private canonical replay payload,
opening provenance internals, arbitrary reference_metadata JSON, evidence access
tokens, or contact/profile details. Actor IDs may be null under the existing
`ON DELETE SET NULL` behavior; this does not erase the financial event. Display
status/linkage can advance; committed monetary fields remain immutable.

Ascending cashbook order is exactly:

```text
occurred_at ASC, event_id ASC, posting_id ASC
```

Use PostgreSQL native timestamp/UUID order. Canonical lowercase UUID text order in
the oracle agrees with UUID byte order; input array order and locale collation do
not decide financial row order. Preserve microseconds. Do not use timestamps alone,
random result order, or `posted_at` to reorder equal effective times.

Running balance at a row is the sum of **all** custody postings for that
group/account/currency whose ordered tuple is <= the row's tuple, across **all
funds and all earlier history**. Window first with a `ROWS`-equivalent prefix, then
filter the display period and paginate. Never restart a period or page at zero.
Opening and transfer legs are included. Current configuration status has no effect.

`cashbookPage` is an offset/limit reference selector for one account and currency,
over an already computed result with a matching snapshot identity. It returns
the rows, total period rows, and `opening_balance = first running balance - first
signed amount`. An empty page returns no rows and null opening_balance, not a
fictional zero. Daybreak can implement offset or keyset transport, but must preserve
this order, page population, and opening offset. A keyset cursor must bind the full
tuple, group/account/currency, query boundaries, and snapshot identity. Fund/category
display filters must never turn an account running balance into a filtered subtotal.
Such additional filters are deliberately not inputs to the v1 oracle.

## Effective time versus consistent read snapshot

`as_of_exclusive` is an **economic-time cutoff**, not a commit watermark. A later
transaction can commit a backdated posting below the same cutoff. `posted_at`
is not a reliable commit sequence either; timestamps can precede actual commit.
Changing an event's audit status must not exclude its original rows.

Daybreak must execute every projection in a requested bundle against **one MVCC
snapshot**: one statement, or one read-only REPEATABLE READ transaction with a
shared snapshot across its statements. Independently timed READ COMMITTED reads
with identical effective cutoffs do not satisfy this contract. Configuration labels
and audit fields in the bundle must be read consistently with that snapshot.
Authorization must be evaluated server-side for the request, including any later
page request; a snapshot token is not permission.

The logical response identifies a server-owned snapshot/read identity, observation
instant, and the exact effective boundaries. The oracle's `snapshot_id`/`observed_at`
are explicit fixture provenance, not an implemented DB watermark or a token API.
If pages are one report, they must use its retained snapshot. If a server cannot
retain that snapshot across requests, it must restart the report with a new
snapshot identity and explicitly disclose the refresh; it cannot silently splice
page 2 from newer truth into page 1. Expired/mismatched snapshot continuations fail.
No caching or snapshot persistence service is implemented by Stage A.

## Labels, historical configuration, and read authorization

The following is a **required Stage B output contract**, not an RLS implementation.
The oracle returns trusted arithmetic/audit shapes; its fixture `display` catalog
does not authorize or resolve public output. `_posting_ids` and `_population` are
test-only evidence, never required public payload arrays. Production must add the
following minimal display data through authorized, tenant-scoped read enrichment:

| Projection | Required core display data |
|---|---|
| Account Balance | account ID/name/kind/status, currency |
| Fund Cash / Fund Net Position | fund ID/name/is_restricted/status, currency |
| Income / Expense details | category ID/name/class/status; fund ID/name/is_restricted/status; authorized member/project display attribution |
| SoA-lite totals / organization custody | currency; details use the activity/account/fund contracts above |
| Cash Movement / Cashbook | account and fund display data above; category-context ID/name/class/status where economically applicable; authorized member/project display attribution |

Core account/fund/category labels are required for an authorized group finance
reader, even if current raw configuration SELECT policies are manager-only. They
must not receive a naked category UUID because a label join was suppressed by RLS.
Missing required core labels is an explicit projection integrity/access failure,
not silently omitted money. Enrichment must neither drop nor multiply ledger rows.
This does **not** grant configuration mutation rights or authorize broad raw SELECT.

Core names are the authorized configuration names **at the read snapshot**, not
claimed posting-time name snapshots (F3-01 does not store those). Event description
and narrative reference are immutable event snapshots. Renaming configuration
can change a display label but cannot change amounts or IDs. Inactive/closed
accounts and inactive funds/categories retain their historical labels and totals;
archival is not deletion. New posting selectors continue to reject inactive targets.

`member_id` means a membership ID, not a profile/user ID. Member/project data is
attribution only. Stage B's presentation boundary supplies `not_present`, `visible`,
or `redacted` visibility for optional attribution and audit details. Visible
attribution includes the authorized ID and display-safe name; absent/redacted
attribution contains neither a disallowed ID nor name. Preserve the underlying
logical dimension grouping and monetary rows when redacting presentation fields;
identical redacted displays do not entitle the client to invent a new aggregate.
Use membership/proxy-aware name resolution consistent with `getMemberName()`.
Never expose contact details or infer profile names for proxy members. Restrict
description/reference/request/actor/correction-reason fields in the same way when
their visibility requires it; redaction must not suppress the cashbook row.

| Read class | Required boundary |
|---|---|
| Group finance | Existing active-member authority with `finances.view` **or** `finances.manage`, including existing owner/admin permission behavior |
| Ordinary member self-read | P1-F remains: own statement without `finances.view`, no peer finance; dedicated later projection only |
| Ordinary member group ledger | Denied; no raw group financial_events/postings/accounts/funds/categories exposure |
| Anonymous/inactive/other tenant | No group projection authorization from a caller-supplied group, dimensions, or snapshot token |

Daybreak owns safe views/RPCs, security-invoker/RLS choices, minimal grants, safe
label exposure, tenant isolation, and PostgreSQL parity. Stage A does not solve
RLS with a new DEFINER function, raw member grants, or application aggregation.
It builds neither final dues/member statement nor any P1-F replacement.

## Economic fixtures and reconciliation invariants

Opening affects custody, Fund Cash, Net Position, Cashbook and opening-class Cash
Movement, with zero period operating effect. Loan disbursement custody -1000 /
receivable +1000 reduces cash by 1000 while leaving net position and SoA unchanged.
Savings custody +100 / liability -100 raises cash by 100 while leaving net position
and SoA unchanged. Repayment/payout fixtures reverse those cash directions without
inventing income or expense. No loan/Njangi UI or F5 business workflow is present.

Correction fixtures include **original + exact reversal + replacement**. A corrected
500 donation contributes `500 - 500 + 450 = 450` to income and cash. Each posting uses
its own occurred_at. A reversal-only period can show negative income or expense;
never clamp or take absolute values. The original is retained even when a reversal
falls in a different period. No correction RPC or F3-04 workflow is implemented.

| Measure | USD foundation | USD correction extension | Independent XAF |
|---|---:|---:|---:|
| Bank | 9300.00 | 9250.00 | 2100000 |
| Cash account | 1000.00 | 1000.00 | 400000 |
| Total custody | 10300.00 | 10250.00 | 2500000 |
| General Fund cash | 10000.00 | 10000.00 | 2000000 |
| Restricted Fund cash | 300.00 | 250.00 | 500000 |
| Income | 500.00 | 450.00 | 600000 |
| Expense | 200.00 | 200.00 | 100000 |
| Operating result | 300.00 | 250.00 | 500000 |

XAF independently opens 2000000, receives 600000, pays 100000, and transfers 400000.
The long-range same-group historical-epoch fixture returns **USD 10300.00** and
**XAF 2500000** separately. A separate-group fixture excludes the XAF tenant from
the USD group's projection; this is arithmetic scope proof, not security proof.

Machine-testable invariants for a shared snapshot and compatible cutoffs:

- Sum Account Balances per currency = organization custody per currency.
- Sum Fund Cash per currency = the same organization custody per currency.
- Internal account transfer changes each account leg while preserving total custody
  and fund cash; it contributes zero SoA income/expense.
- Income minus Expense = operating result in each currency, including negatives.
- Opening, loan principal and member liability movements have zero operating effect.
- Signed custody + receivable + liability gives Fund Net Position; lending/savings
  fixtures conserve it while changing cash.
- Original + reversal + replacement remain in all applicable projection populations.
- Cashbook/Cash Movement contain each selected custody posting exactly once; category
  enrichment never multiplies money. Page opening offsets preserve earlier history.
- Later exports and report UI must use these same database-owned projections and
  compatible snapshots/boundaries; they cannot reconstruct totals from legacy tables.

## Performance/index handoff

Read-only inspection of the frozen F3-01 migration confirms the relevant existing
bounded indexes; no additional index has a demonstrated need at Stage A:

| Projection access | Existing index / key |
|---|---|
| group/account/effective period | `financial_postings_account_period (group_id, account_id, occurred_at DESC)`; partial non-null account |
| group/fund/effective period | `financial_postings_fund_period (group_id, fund_id, occurred_at DESC)` |
| group/category/effective period | `financial_postings_category_period (group_id, category_id, occurred_at DESC)`; partial non-null category |
| event/posting joins | `financial_postings_event (event_id)` plus event/posting primary keys and event scope unique keys |
| group effective history | `financial_events_group_occurred (group_id, occurred_at DESC, id)` and `financial_events_group_epoch_occurred` |
| member attribution history | `financial_postings_member_period (group_id, member_id, occurred_at DESC)` |

These are a sufficient starting access-path contract, **not measured performance
qualification**. Daybreak must bound tenant/time queries and inspect actual plans
with representative history, especially the cashbook prefix and equal-time sort.
Existing period indexes do not by themselves guarantee the full event/posting tie
order; an explicit stable sort/window remains required. Do not claim a missing
composite index without a concrete plan/performance problem. The small pure oracle
uses simple scans for clarity; it is not a SQL execution-plan prescription.
No new index, cache, partition, analytics database, or materialized view is added.

## Handoff and unchanged boundaries

Only four files are added under `tests/finance/f3-03/`: this README, the projection
oracle, literal vectors, and tests. No package change, product import, SQL migration,
RLS/DEFINER change, UI, F0/standing change, F2/ticket-doc edit, correction command,
opening endpoint, receipts, reminders, messages, deployment, or production apply.

After the single signed Stage A commit is normally pushed, Daybreak may branch
from its **exact SHA** as `security/f3-03-projection-read-security-20260909` and
implement the secure database half. No final combined PR is opened by Stage A.
The later combined PR targets `codex/f3-core-ledger-foundation`, never main here.

**F3-03 integration:** HOLD — COMBINED ASTRA + DAYBREAK UNIT NOT YET QUALIFIED.
**F3-04:** HOLD — F3-03 MUST COMPLETE FIRST.
**Production:** UNCHANGED. **Next owner:** DAYBREAK BLUE.
