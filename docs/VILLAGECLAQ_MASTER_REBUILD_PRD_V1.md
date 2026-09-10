# VillageClaq Master Rebuild PRD v1.0

**Status:** SECURITY REVISION 1 — HARD-FREEZE CANDIDATE pending Daybreak re-review and founder freeze  
**Date:** 2026-09-10  
**Production main at freeze input:** `0559b758bc53df3ec8081e361ffd022c1f19be43`  
**F0 financial track:** `99e17e2b4f4dc16753843f1e115312e70a8ae8ca`  
**F3 integration:** `c7b4cd535d7125737eab2ec0fad27cae9432e8c3`  
**Notification policy foundation:** PR #69 / `a8cdeaa98e6bb9e3a6cccaf815aa4ae4441b59a7`  
**Notification policy schema/adapter draft:** PR #70 / CREATE-NOT-APPLY / REQUALIFICATION REQUIRED  
**Security review input:** Daybreak review of PR #71 @ `7b7a276602fd094b91c120a473c0489c6fb6c728` returned HOLD; this revision incorporates the required bounded edits.

---

## 1. Purpose

VillageClaq will be completed as one coherent, mature multi-tenant SaaS product rather than a set of useful but inconsistently governed modules.

This PRD is the controlling rebuild plan. It combines the independent Astra architecture/UI/mobile audits, Kimi K3 defensive audit, live-production/Claude verification, F0/F3 qualification evidence, Product Consistency work, notification-policy work, and Daybreak's security review of this PRD.

This is **not** a wholesale rewrite. Strong work is preserved. Weak legacy boundaries are hardened, migrated, or rebuilt only where evidence shows that direct browser writes, permissive policies, stale tenant context, destructive cascades, false-success UI, non-idempotent workflows, inconsistent financial truth, or unqualified mobile/offline assumptions make the product unsafe or misleading.

Every subsystem is classified as KEEP, HARDEN, EXTEND, REBUILD, MIGRATE, DEPRECATE, or RETIRE.

---

## 2. Change-control rule

After this PRD is security-reviewed and hard-frozen, the architecture and build sequence remain fixed until completion.

The plan may change only for:

1. Verified P0/P1 security or data-integrity defect.
2. Verified architectural contradiction.
3. Legal/compliance requirement.
4. Critical platform/mobile incompatibility.
5. Unavoidable external dependency/platform change.
6. Explicit founder-approved product change.

A reviewer suggestion, preference, refactor idea, or P2/P3 improvement alone does not reopen architecture. It becomes backlog unless it blocks a frozen acceptance requirement.

---

## 3. Evidence hierarchy

When audits, comments, migrations, tests, and production differ, use this authority order:

1. Read-only/live production verification.
2. Executed database/browser behavior against an exact SHA/environment.
3. Exact code and SQL trace.
4. Static-analysis inference.
5. Test names/source-text assertions.
6. Comments and product documentation.

For every significant capability track separately:

- CLAIMED
- CODE EXISTS
- TESTED
- INTEGRATED
- DEPLOYED
- PRODUCTION ENABLED
- END-USER VERIFIED

These states are never synonyms.

---

## 4. Non-negotiable product principles

### P-001 — Operational tenant boundary
`group_id` remains the operational ownership and financial boundary for an operational group.

### P-002 — Organization hierarchy is separate from operational ownership
National/global topology is modeled by organization units around operational groups; aggregate hierarchy nodes need not be transactional groups.

### P-003 — One financial truth
Every economic occurrence has exactly one canonical economic owner and one canonical financial effect. Specialized domain records may project into the ledger but cannot create parallel financial truths. VillageClaq v1 canonical Statement-of-Activity recognition follows D-002 cash-basis rules unless a future founder-approved accounting-version change is separately designed and requalified.

### P-004 — Local ledger, higher-level projection
Every operational group has its own canonical ledger. Regional, national, subtree, and global views are authorized projections, not duplicate ancestor ledgers.

### P-005 — Native currency is authoritative
USD, XAF, GBP, EUR, and other currencies remain separate authoritative buckets. Converted management views are derived, reproducible, labeled, and never replace native truth.

### P-006 — Active status matters
Authorization for active work requires an active subject/membership unless a frozen workflow explicitly permits another status.

### P-007 — Tenant relationship does not imply PII access
Hierarchy, HQ status, or belonging to multiple groups never automatically grants unrestricted member-level PII.

### P-008 — Server-authoritative consequential commands
Money, approvals, voting, attendance finalization, standing overrides, publication, payouts, remittances, hierarchy changes, and privilege changes must not depend on unchecked direct browser writes.

### P-009 — Durable idempotency and replay authorization
Every consequential command must survive “server committed but response was lost” without duplicate effects, including retry from a fresh tab/session/device. Economic/request identity is server-enforced and tenant/actor/payload-bound. Replay requires current authorization and must fail closed if authority was revoked while waiting on a lock. Same identity + changed economic meaning conflicts rather than mutating history.

### P-010 — Correct/archive instead of destructive deletion
Financial, governance, election, attendance, standing, membership, Relief, Njangi, and official-document history uses correction, reversal, archival, withdrawal, supersession, or soft exit rather than ordinary destructive deletion.

### P-011 — Mature-SaaS UX
Success means the user can find, understand, complete, recover, and verify the task—not merely that a page or button exists. Consequential success is shown only after authoritative persistence.

### P-012 — Mobile is a first-class acceptance target
Critical workflows must be usable at 320–430px, EN/FR, light/dark, with software keyboard open, and be architecturally compatible with a future Capacitor wrapper.

### P-013 — No phantom notification success
Queued, sent-to-provider, delivered, read, failed, blocked, unavailable, deferred, superseded, and skipped are distinct states.

### P-014 — No hidden offline replay of high-risk commands
Votes, money movements, approvals, payouts, destructive/corrective actions, publication, standing overrides, and privilege changes are online-authoritative and may not be blindly queued.

### P-015 — Report is a projection, not truth
Financial and operational reports consume canonical observations. Recognition basis, scope, currency, period, topology version, and observation time are explicit. A report itself is never the underlying source of truth.

---

## 5. Frozen founder product decisions

These defaults are adopted for Rebuild v1 unless changed through Section 2.

### D-001 — Relief beneficial ownership
Each Relief plan names **one operational financial owner**. Participating branches may collect or pay as authorized agents. Ownership, agency, and participating scope are explicit and effective-dated.

### D-002 — Canonical financial recognition basis: cash basis for v1
VillageClaq Rebuild v1 preserves the already-qualified F2/F3 **cash-basis Statement of Activity** contract.

- Dues obligations/assessments remain authoritative operational Contributions & Dues receivable/arrears records, but **do not create journal income or ledger receivable merely because assessed**.
- Confirmed cash receipt is the canonical v1 income-recognition occurrence unless the receipt is refundable/conditional/agency-held, in which case it remains a liability or settlement position until its recognition condition is met.
- Pending/rejected submissions are not confirmed cash.
- Existing Contributions & Dues reports continue to show expected, paid, pending, waived, outstanding, and arrears as specialized operational reports.
- F3 Statement of Activity remains cash-basis; F3-01…05 economic semantics are not reopened by this PRD.
- An accrual/accounting-basis version may be added later only through explicit founder approval, versioned accounting policy, migration/reconciliation design, and full requalification. It may not be silently blended into v1.

### D-003 — Reporting perimeter
Hierarchy/global reporting initially provides **management reporting**, not statutory/legal consolidation. Any statutory consolidation product is separately scoped.

### D-004 — Election secrecy promise
VillageClaq v1 guarantees **application-level secret ballot separation with metadata minimization**, not cryptographic secrecy against database operators. Marketing/UI must not claim a stronger guarantee unless a stronger protocol is built and qualified.

### D-005 — Njangi scope
Njangi/Savings Circle is branch/local by default. Regional or national circles are explicit hosted circles with explicit participants, owner, one currency, and scoped permissions.

### D-006 — Offline policy
Published read-only content may be cached under explicit tenant/user rules. High-risk business commands remain online-authoritative. Existing generic offline business queues remain dormant until a separately qualified contract exists.

### D-007 — F3 opening cash correction
F3-05 opening cash is not exposed to end users until a bounded correction/reversal/remediation path is defined and qualified. F3-06 settings may proceed after S0/M2 gates, but F3-07 may not expose opening-entry creation without this closure.

### D-008 — Election reopen policy
A closed or cancelled v1 election is **not reopened in place**. If an open election must be abandoned or materially rescheduled after its electorate/choices were frozen, preserve the old election and create a new election/version with a new electorate snapshot. Draft elections may be edited before opening.

### D-009 — Ambiguous person identity fails closed for broader-scope elections
A regional/national/global election cannot open if one-person deduplication is unresolved or ambiguous. Local group elections may use the qualified local membership identity contract; broader scopes require verified organization-person identity.

---

## 6. Current-state classification

| Subsystem | Current disposition | Production today | Target |
|---|---|---:|---|
| Contributions & Dues | KEEP/HARDEN/MIGRATE | Yes | Specialized dues subledger feeding canonical cash-basis ledger |
| F0 financial hardening | KEEP | Partially staged / prerequisites unresolved | Production prerequisite for F3 lineage |
| F3-01 Ledger foundation | KEEP/FROZEN | No | Canonical ledger foundation |
| F3-02 Money In/Out/Transfer | KEEP/FROZEN | No | General manual financial commands |
| F3-03 projections | KEEP/FROZEN | No | Canonical cash-basis financial reporting backend |
| F3-04 correction | KEEP/FROZEN | No | Immutable manual correction/reversal |
| F3-05 opening cash | KEEP/FROZEN with remediation dependency | No | Opening custody with qualified correction path |
| Relief | KEEP/HARDEN/EXTEND | Yes | Hierarchy-aware secure workflow + F5 adapter |
| Njangi | KEEP concepts / REBUILD money boundary | Yes | Immutable server-authoritative subledger |
| Elections | KEEP ballot split / HARDEN | Yes | Scoped electorate + lifecycle + metadata-minimized secret ballot |
| Minutes | KEEP/HARDEN | Yes | Versioned official record + optional provisional sharing |
| Governing documents | KEEP concepts / REBUILD bounded publication/version workflow | Yes | Stable document identity + immutable revisions |
| Attendance | HARDEN/REBUILD command boundary | Yes | Server-time, tenant-safe, evidence-preserving attendance |
| Standing | REBUILD bounded decision model | Yes | One engine + durable overrides |
| Notifications | KEEP/HARDEN/MIGRATE | Yes | Shared policy/occurrence/evidence architecture |
| Announcements Build 8 | KEEP DORMANT | No | Future atomic queue-backed cutover |
| Organization branches | KEEP/EXTEND | Yes | Organization Hierarchy 2.0 |
| PWA/offline | HARDEN | Yes, limited | Safe cached reads; no blind high-risk replay |
| Capacitor | FUTURE EXTENSION | No | Explicit platform adapters and native acceptance |

---

## 7. Master execution order

The controlling sequence is:

### M0 — Independent audit — COMPLETE
Astra multi-audit + supplements, Kimi K3 defensive audit, live-production/Claude audit, Product Consistency audits, qualified F0/F3 evidence.

### M1 — Master PRD + security freeze — CURRENT
Create this PRD, run Daybreak security review, apply only bounded evidence-backed revisions, then hard-freeze.

### S0 — Production Stabilization & Recovery Gate
Mandatory before broad new production feature work.

### M2 — Notification Policy Foundation
Requalify and complete policy/schema contract. No live domain rewires yet.

### M3 — Complete F3
F3-06 → F3-07 → **FCG-1 Financial Contract Reconciliation Gate** → F3-08 → F3-09.

### M4 — Organization Hierarchy 2.0
Arbitrary hierarchy, scoped grants, route-authoritative tenant identity, multi-group/multi-tab safety.

### M5 — F4 Contributions & Dues integration
Canonical cash-basis dues posting/reconciliation with no double recognition.

### M6 — F5 Module Financial Commands & Adapters
Relief, Njangi, Loans, Fines, Projects, reimbursements/fees, inter-unit settlement primitives.

### M7 — Relief 2.0
Secure lifecycle, hierarchy, ownership, settlements, reports.

### M8 — Njangi 2.0
Immutable contribution/payout/fine/round subledger.

### M9 — Elections 2.0
Scoped governance, frozen electorate, lifecycle hardening, national/global elections.

### M10 — Records, Governance & Reporting
Minutes, governing documents, attendance, standing, retention, member transparency, hierarchy reporting, Board Packet, AI/report observations.

### M11 — Notification Domain Migration
Payment → Hosting → Events → Relief → Njangi → Elections → Announcements modernization.

### M12 — Mature-SaaS System Acceptance & Controlled Cutover
Whole-system qualification, migration rehearsal, mobile/accessibility/scale/security/recovery proof, founder-controlled production gates.

No stage is skipped because a downstream feature is visually ready.

---

## 8. S0 — Production Stabilization & Recovery Gate

### S0 objective
Stop verified/high-confidence security and data-integrity exposure, establish actual live-state truth, preserve recovery options, and make future migrations reproducible before broad implementation.

### S0-A — Read-only production truth snapshot
Capture and preserve exact production evidence before writing remediation migrations:

- current deployment SHA
- applied migration history
- critical table/column/enum definitions
- RLS policies and permissive/restrictive mode
- function definitions, SECURITY DEFINER flags, search paths, owner, grants
- table/schema/function grants
- storage policies
- critical constraints/indexes/triggers
- extensions and schemas
- PostgREST/API row-limit configuration where available
- F0/F3 prerequisite objects
- recovery/PITR/backup status

Classify every audit claim as CONFIRMED / NOT PRESENT / PARTIAL / CANNOT CONFIRM.

### S0-B — Recovery preservation and isolated restore proof
Immediately establish the retained pre-change PITR/backup window. Preserve a recovery point before security/data-integrity migrations where the platform supports it. Perform an isolated restore/recovery rehearsal sufficient to prove that the retained recovery mechanism can actually restore expected schema/data evidence. If recovery cannot be proven, state CANNOT CONFIRM and block destructive remediation assumptions.

Historical records already lost by past cascades are never described as recovered without evidence.

### S0-C — Migration baseline and replay hygiene
Create an authoritative production-baseline manifest. Resolve duplicate migration-version/history conflicts and repository/live drift sufficiently that a representative full-history or approved baseline replay can be rehearsed. Historical migration files are not casually rewritten; use a controlled baseline/compatibility strategy where immutable history requires it.

### S0-001 — Membership creation/authorization hardening
Verify and close any production path allowing unauthorized membership self-insert, self-approval, suspended/exited privileges, or status-agnostic helper behavior.

### S0-002 — Active-subject helper baseline
Create one qualified active-membership authorization primitive and migrate critical helpers/policies to it without weakening F3.

### S0-003 — Position/group integrity
`position_assignments.membership_id`, position group, target group, and permission evaluation must be tenant-consistent. No cross-tenant position-based privilege injection.

### S0-004 — Join-code / proxy-claim hardening
Any helper capable of membership/identity mutation requires explicit authorization, pinned search path, minimum grants, rate/attempt handling where applicable, and token/identity binding for proxy claims.

### S0-005 — Sensitive function grants
Review every SECURITY DEFINER function. `PUBLIC`/`anon` execute is denied by default unless explicitly required and independently safe.

### S0-006 — Notification outbound lockdown
No ordinary authenticated user may enqueue arbitrary provider-bound outbound content. Email/SMS/WhatsApp recipient guards cannot be bypassed via literal recipient, unverified self-assigned phone state, missing service credential, or stale tenant state.

### S0-007 — Fine/loan/attendance immediate authorization hardening
Until domain commands are rebuilt, legacy direct-write RLS prevents self-waiver, forged loan state, attendance-for-another-member, stale/cross-tenant foreign references, and suspended/exited actor mutation.

### S0-008 — Cross-currency member-transfer/standing guard
`request_member_transfer`, `execute_member_transfer`, and any direct/legacy transfer RPC must enforce the approved currency/standing transfer contract at the database boundary. An old/direct client cannot carry standing or incompatible financial state between different-currency groups merely because the UI would have blocked it. Cross-currency membership transfer requires explicit defined semantics or fails closed.

### S0-009 — Storage truth
Verify production storage remains private/group-scoped. Fix any write/delete parser NULL-fallback or signed-URL persistence defect without regressing currently-correct read privacy.

### S0-010 — Service-worker tenant/cache safety
Authenticated API/dashboard/Supabase responses may not live in a global cross-user cache without user/tenant partitioning, expiry, revocation behavior, and sign-out purge. Simplest acceptable v1 default: do not cache authenticated business responses in the service worker.

### S0-011 — Destructive-delete stop
Membership, event, election, Relief, Njangi, minutes, financial, and governing-record workflows cannot destroy consequential evidence through normal hard delete. Introduce soft-exit/archive protections and migration-safe compatibility.

### S0-012 — PR #70 requalification
Correct any invalid database timezone-validation mechanism, prove active-membership enforcement, compile/type-check the exact branch, execute the migration in disposable PostgreSQL, and run active/pending/suspended/exited/archived access cases plus replay/concurrency/amplification tests. PR #70 remains CREATE-NOT-APPLY until this passes.

### S0-013 — F3 deployability requalification
Verify every F0/F3 migration against production extension/schema layout. Any function-name/schema mismatch is corrected in a bounded compatibility migration or qualified revision before production application. Do not weaken frozen F3 business semantics to make deployment easier.

### S0 behavioral exit matrix
Each S0 control has executable behavioral evidence, not merely source inspection. At minimum:

- anon/unauthenticated denial where applicable
- active member permitted only where intended
- pending/suspended/exited/archived denied for active work
- dual-group actor tenant A/B tests
- cross-tenant IDs denied
- direct RPC path tested, not only UI
- current-authorization recheck after wait where lock/replay exists
- failed mutation produces no false audit/success side effect
- migration rehearsal and rollback/forward-recovery evidence

### S0 exit gate
No verified P0 remains open. Every verified P1 is remediated or has an explicit founder-approved compensating control and release block. Production/live manifest, recovery evidence, and S0 behavioral matrix are preserved.

---

## 9. M2 — Notification Policy Foundation

### M2-001 — Preserve qualified pure policy semantics
Keep anchor-qualified occurrence identity, multiple relative triggers, repeat cadence with bounded occurrence count, stop-after, stop-when-resolved, invalid-policy fail closed, IANA timezone validation, quiet-hours `DEFER_UNTIL`, reschedule supersession, and member channel opt-out intersection.

### M2-002 — Precedence
Initial v1 precedence remains `system legacy-compatible default → group/domain policy → object override`.

Hierarchy initially provides organization templates that groups/units explicitly adopt. No automatic deep inheritance in v1.

### M2-003 — Persisted configuration authorization
Policy create/change/delete and object overrides require an active authorized same-group actor using the existing approved settings-management capability. Every referenced group/object belongs to the same tenant and expected domain.

### M2-004 — Immutable policy version/audit history
Policy edits create durable version/audit evidence sufficient to reconstruct what schedule was effective for a generated occurrence. Consequential policy change and its audit/version record commit atomically.

### M2-005 — Occurrence persistence
Occurrence identity includes group, domain, object, canonical anchor/generation, trigger offset, and occurrence index. Old unsent occurrences become superseded after reschedule; sent history is immutable.

### M2-006 — Replay/concurrency/amplification safety
Concurrent identical policy/occurrence operations deduplicate. Conflicting change uses version/CAS semantics. Schedule edits cannot create unbounded notification amplification. Trigger count, repeat interval, max occurrences, and stop horizon are bounded and validated.

### M2-007 — Legacy parity
No saved policy preserves current behavior: Payment legacy overdue-daily behavior, Hosting one 7-day notice, Events one 48-hour notice. No surprise fan-out.

### M2-008 — No live wiring yet
M2 completion does not activate payment/hosting/event producers. Domain migration remains M11.

---

## 10. M3 — Complete F3 Financial Operating System

### F3-06 — Financial configuration UI
Build Accounts, Funds, and Categories management.

Requirements: `finances.manage` server authorization; explicit currency/class lifecycle rules; archive, not delete, referenced dimensions; default fund rules; account-close preflight; EN/FR; mobile acceptance; tenant-bound route/context; no stale tenant form submission; atomic audit evidence.

### F3-07 — Record Transaction UX
Treasurer-facing commands: Money In, Money Out, Transfer.

Requirements: exact decimal strings; durable request identity across tabs/sessions/devices; replay-time current authorization; account/fund/category validation; same-group refs only; ordinary transfer is same-currency unless an explicitly qualified FX workflow exists; no JS float as accounting authority; success only after authoritative commit/result; lost-response recovery; mobile-safe forms; no module event masquerading as generic manual finance.

Opening cash remains hidden until D-007 is implemented.

### FCG-1 — Financial Contract Reconciliation Gate
Before F3-08/F3-09 are frozen as the canonical reporting product, verify and document that:

- D-002 cash-basis recognition matches frozen F2/F3 semantics.
- Dues assessment does not create journal income/receivable in v1.
- F4/F5 posting templates do not require reopening F3 cash-basis SoA.
- Loan principal is receivable↔custody movement, never income/expense.
- Njangi member money is custody/liability unless separately earned by the association.
- Relief recognition follows R-009 and remittance settlement does not recognize income twice.
- Mixed-currency events and ordinary cross-currency transfers are rejected unless a separately qualified FX settlement workflow owns the conversion.
- One economic occurrence cannot be posted once manually and again through a module adapter. A shared economic-occurrence/source-link invariant exists before module cutover.

FCG-1 is a reconciliation/requalification gate, not a license to redesign F3-01…05.

### F3-08 — True Financial Reports UI
Expose canonical projections: Financial Overview/Health, Account Balances, Fund Cash, Fund Net Position, Statement of Activity, Cash Movement, Cashbook/Register.

Every report displays scope, period/as-of time, native currency, currency bucket behavior, source/observation state, correction treatment, and opening-position treatment. Statement of Activity is explicitly cash-basis under D-002.

Dashboard, Board Packet, Meeting Pack, exports, and AI do not use contribution-only shorthand as organization-wide financial truth after their migration phase.

### F3-09 — Acceptance
Prove authorization, concurrency, replay, fresh-session/device uncertain-result recovery, correction chains, historical epochs, account/fund archival, opening-cash remediation policy, reporting reconciliation, migration rehearsal, representative scale, mobile completion, exports, and no cross-tenant references.

---

## 11. M4 — Organization Hierarchy 2.0

### H-001 — Data model
Create organization units, effective-dated parent history, current closure projection, scoped organization grants, and organization-person identity foundation. A unit may reference one operational `group_id` or be aggregate-only.

### H-002 — Invariants
One root per organization; one current parent per non-root unit; same-organization edges only; no cycles; bounded depth initially 32; audited/authorized subtree moves; archive preserves history.

### H-003 — Supported topologies
Standalone Group; National HQ → Branches; Global Organization → Country → Region → Chapter → Branch. No mandatory geographic ladder.

### H-004 — Scope modes
Permissions/reporting use this unit, this unit + descendants, or entire organization. Capability is explicit; ancestor title alone grants nothing.

### H-005 — Aggregate-only units
Aggregate nodes may own reporting/governance scope but may not transact unless an operational financial owner is named.

### H-006 — Multi-group identity
One login can belong to multiple independent groups/organizations. Memberships remain independent entitlements.

### H-007 — Route-authoritative tenant context
Business-operation routes carry authoritative tenant/unit scope. localStorage stores only a default preference for unscoped entry. Tab A and Tab B may safely remain on different groups.

### H-008 — Tenant-generation guard
Forms and async results bind to the tenant generation/scope they were opened under. Switching group invalidates/discards tenant-bound drafts as appropriate and prevents stale submission.

### H-009 — Hierarchy UX
Persistent UI shows organization, current operational unit, current viewing scope, and action scope when ambiguity is possible.

### H-010 — Hierarchy acceptance
Behaviorally test two live tabs on different groups, delayed async responses after switch, stale forms, direct deep links, cross-organization parent attempts, cycle attempts, deep subtree moves, and revoked scope grants.

---

## 12. M5 — F4 Contributions & Dues → Canonical Ledger

### F4-001 — Preserve operational dues model
Keep contribution types, obligations, payments, payment applications, confirmed-basis logic, waivers, and member statements.

### F4-002 — Cash-basis canonical effect
Under D-002, an assessment/obligation does not create journal income or ledger receivable in v1. Confirmed cash receipt creates canonical custody + contribution income unless the amount is refundable/conditional/unapplied, in which case it creates or settles the appropriate liability until recognition/refund.

### F4-003 — Pending is not confirmed
Pending/rejected member submissions create no confirmed custody/income effect.

### F4-004 — Overpayment
Unapplied refundable amount is a liability/member credit until explicitly recognized/refunded.

### F4-005 — Durable idempotency across sessions/devices
Do not rely on sessionStorage/memory for economic request identity. Server-side identity prevents second economic effect across tabs/sessions/devices and requires replay-time authorization.

### F4-006 — No double posting
A Relief-tagged or other module-owned payment routes to the owning domain adapter and is not also ordinary dues income.

### F4-007 — Shared economic occurrence invariant
Manual and module command paths must not create two canonical financial effects for the same real-world receipt. Source linking, import/cutover manifest, and conflict behavior are explicit and testable.

---

## 13. M6 — F5 Module Financial Commands & Adapters

Every module adapter resolves:

`source occurrence → economic owner → group/epoch/currency → canonical postings → correction lineage`

Do not expose arbitrary caller-defined postings.

Required modules: Relief, Njangi, Loans, Fines, Projects, Reimbursements, Bank fees, Inter-unit settlements.

Minimum authoritative commands are part of M6 where today's browser writes are not safe enough to feed the canonical ledger.

### F5-001 — Loan principal
Loan principal disbursement is `receivable increase + custody decrease`; principal repayment is `custody increase + receivable decrease`. Principal is never income or expense. Interest/qualified fees are separate income events according to the approved cash-basis occurrence.

### F5-002 — Mixed currency
A single canonical event has one native currency. Ordinary account transfers require compatible currency. Cross-currency settlement uses a separately qualified FX/remittance workflow with sent amount, received amount, rate/evidence, fees, and settlement identity. Never silently convert inside a same-currency transfer command.

### F5-003 — Inter-unit settlement
Movement between organizational units is settlement/custody/receivable/liability activity according to ownership—not income merely because cash changed hands.

### F5-004 — Atomicity
Operational state + canonical financial effect commit atomically or through a transactional outbox with deterministic replay/reconciliation. Independent best-effort dual writes are prohibited.

---

## 14. M7 — Relief 2.0

### R-001 — Preserve core entities
Keep plans, enrollments, claims, payouts, remittances, waiting periods, enrollment types, notifications, and rollup concepts where valid.

### R-002 — Ownership
Each plan names owning unit, operational financial owner, participating units/subtree, collection authority, review authority, payout authority, and reporting audience.

### R-003 — Hierarchy scopes
Support local, regional, national, and global plans using one model.

### R-004 — Coverage portability
Enrollment/eligibility belongs to person + plan contract; branch transfer changes responsibility prospectively and does not silently reset waiting periods or rewrite history.

### R-005 — Claim state machine
Submitted/reviewing/approved/denied/withdrawn/paid or equivalent lifecycle has authoritative transitions, actor roles, version checks, idempotency, and immutable decision history.

### R-006 — Payout command
One idempotent payout command validates claim state, approved amount, owner/custody/fund, and writes operational + financial result atomically or via transactional outbox. No duplicate payout per economic occurrence.

### R-007 — Remittance maker/checker
Submission and confirmation/dispute authorities are distinct. Sender cannot self-confirm merely by being a branch admin.

### R-008 — Correct branch rollup
Pre-aggregate enrollments, payments, and remittances at their own grain before joining. Never repair fanout with `SUM(DISTINCT amount)`.

### R-009 — Relief recognition occurrence
D-002 applies to dues, not automatically to Relief. Relief v1 recognition is frozen separately:

- A non-refundable Relief contribution becomes restricted contribution income at the **confirmed receipt event** by the plan owner or an authorized collecting agent acting for that owner.
- If an authorized branch collects as agent, the branch records custody + liability to owner; the owner's financial projection/adapter records the corresponding receivable/recognized restricted contribution at the confirmed agency-receipt occurrence as defined by the plan contract.
- Remittance later settles branch liability/owner receivable and creates **no second income**.
- Refundable or conditional Relief receipts remain liabilities until the condition for recognition is satisfied or they are refunded.
- Claim payout is restricted expense or settlement of a separately recognized payable according to the frozen claim-accounting template; it is never inferred from enrollment type alone.

### R-010 — Projection-only internal elimination
Reciprocal inter-unit balances/transfers are eliminated only in authorized ancestor/subtree/global **management projections**. Local immutable ledgers are never rewritten merely to make consolidation look cleaner.

### R-011 — Sensitive detail
Hierarchy/global visibility defaults to aggregate financial/participation reporting. Claim detail requires separate permission.

### R-012 — Legacy deterministic cutover
Before Relief 2.0 write activation, reconcile each existing plan's owner, participating units, collections, payouts, remittances, currency, and outstanding settlement positions. Ambiguous records are quarantined, not guessed. Prove totals before/after by tenant/currency and preserve source IDs/history.

---

## 15. M8 — Njangi 2.0

### N-001 — Preserve cycle model
Keep cycle identity, participant identity/order, rotation concepts, and historical source rows for migration evidence.

### N-002 — Immutable contribution receipts
Replace cumulative read-add-upsert as transaction truth. Each partial/full contribution is its own idempotent receipt occurrence.

### N-003 — Accounting
Member contribution increases custody and member/pool liability; it is not association operating income by default. Round payout decreases liability and custody; it is not association expense by default.

### N-004 — Round transition commands
Create server-authoritative commands for participant add/change, round advance, cycle pause/close, collector assignment, contribution, payout, deduction, deferral, refund, and fine/issue assessment/settlement.

### N-005 — Payout evidence
Payout amount, beneficiary, method, deductions, reason, status, actor, and occurrence identity are durable records. Mutable participant summary fields are projections only.

### N-006 — Fines
Move mutable fines JSON into normalized records/events. Fine treatment depends on economic owner and cannot silently become association income.

### N-007 — Exact money
Use exact decimal/minor-unit arithmetic. No JS floating point is authoritative.

### N-008 — Rotation
Sequential remains supported. Random draw is authoritative/persisted/audited. Auction stays unavailable unless a complete qualified auction workflow is explicitly built.

### N-009 — Scope
Local by default. Cross-branch circles require explicit person identity, participation, custody owner, currency, and scoped permissions.

### N-010 — Legacy deterministic cutover
Create a per-cycle reconciliation manifest for cumulative contribution rows, participant payout fields, mutable treasury summaries, and fines JSON. Where exact historical partial occurrences cannot be reconstructed, preserve original evidence and create an explicitly labeled reconciled opening liability/custody position rather than inventing transaction history. Prove opening pool liability = reconciled participant obligations and reconcile to available custody evidence before activating new commands.

---

## 16. M9 — Elections 2.0

### E-001 — Preserve ballot split
Keep separate voter participation receipt and anonymous ballot choice stores.

### E-002 — Active eligibility
Voting requires an eligible active person/membership under frozen election rules.

### E-003 — Frozen electorate
At election opening: resolve participating hierarchy units using topology version; select eligible active memberships; deduplicate by verified organization-person identity where the scope requires it; snapshot eligibility evidence and constituency; freeze candidates/options/timing/rule version.

### E-004 — Ambiguous identity fail-closed
For regional/national/global scope, unresolved/ambiguous organization-person identity blocks opening for affected electorate computation rather than risking duplicate or excluded votes. Resolution is audited before the snapshot is frozen.

### E-005 — Transfers after opening
Branch transfer after opening does not grant another vote or silently alter the frozen electorate.

### E-006 — Candidate/position integrity
Candidate, qualifying membership/person, position, and election scope are same authorized organization/unit scope.

### E-007 — Lifecycle
Draft/open/closed/cancelled/finalize transitions are server-authoritative and audited. Candidate/option mutation after opening is prohibited except through cancellation/replacement. Closed/cancelled elections are not reopened in place under D-008.

### E-008 — Anonymity metadata
Do not store accessible precise ballot/receipt metadata that trivially correlates voter identity to ballot choice. Marketing/UI claims match D-004.

### E-009 — Result visibility
No unauthorized live tally. Cancellation does not automatically expose partial vote detail. Results publish through explicit authorized transition.

### E-010 — Evidence retention
Closing/cancelling/removing an election from active navigation may not destroy ballot/participation evidence required for audit/history.

### E-011 — Hierarchy
Support branch, regional, national, and global elections by explicit election scope/electorate snapshot—not by automatically querying descendants at vote time.

### E-012 — Secrecy acceptance
Behavioral tests prove no ordinary application role can correlate receipt rows to ballot choices, and privileged-access limitations are documented consistently with D-004.

---

## 17. M10 — Records, Governance & Reporting

### G-001 — Minutes lifecycle
Support Private Draft, Shared Provisional/Working Minutes, Published/Approved Minutes, and Amendment/Supersession/Withdrawal history. Published official content is not silently overwritten in place.

### G-002 — Minutes retention
Archiving/removing a calendar event does not cascade-delete official minutes.

### G-003 — Governing documents
Stable document identity + revision identity. Constitution v1 and Bylaws v1 do not conflict merely because both are version 1. Publication is atomic: failure leaves the previous official revision available.

### G-004 — Acknowledgment
Acknowledgment binds person/membership, exact document revision, tenant, and timestamp. Receipt acknowledgment is distinct from approval voting.

### G-005 — Attachment authorization across lifecycle
Store durable object keys, not short-lived signed URLs as permanent record truth. Parent-record authorization is required for **upload, replacement, signing/read, archival, and deletion**, not only read-time signing. Attachment lifecycle follows the owning record's publication, privacy, and retention policy.

### G-006 — Attendance commands
Separate self check-in, officer mark/correction, bulk correction, and finalization. Enforce same-group membership, active status, cancellation state, server time, and event window.

### G-007 — Attendance evidence
Preserve original check-in evidence and subsequent corrections. “Not recorded” and “absent” are distinct. Stale bulk screens cannot silently overwrite later QR/self check-ins.

### G-008 — Standing model
Maintain calculated standing, manual decision/override, and effective standing. Manual decision contains actor, reason, effective time, expiry/indefinite rule, and revocation history. Automatic recalculation respects active override. Use one authoritative standing engine/rule version.

### G-009 — Atomic consequential audit
For minutes publication/amendment, governing-document publication, attendance finalization/correction, standing override/revocation, and comparable governance actions, the consequential mutation and server-authored audit evidence commit atomically or not at all.

### G-010 — Retention schedule and enforcement
Define explicit product retention classes for official minutes/governing records, financial/correction history, attendance/standing decisions, elections, Relief/Njangi evidence, profiles/personal data, attachments, notifications/logs, and offline copies. Implement enforcement/migration tests. No fixed legal retention promise is made until separately approved.

### G-011 — Member transparency
Independent group settings may enable continuous read-only member access to published/provisional minutes and authorized current financial summaries. Financial transparency shows posted/confirmed state, currency, scope, period, updated-at, and keeps another member's private obligations/loans/claims/payment evidence private.

### G-012 — Authoritative report observation
Dashboards, Board Packet, exports, and AI consume a server-authorized observation containing scope, period, currency buckets, topology version, permission context, ledger/domain source version, and observation time. AI does not treat arbitrary caller-supplied/truncated report payload as canonical truth.

---

## 18. M11 — Notification Domain Migration

The live migration order is fixed:

1. Payment
2. Hosting
3. Events/Meetings
4. Relief
5. Njangi
6. Elections
7. Announcements modernization

Each domain proves current-default parity, configurable schedules, stable occurrence identity, no duplicate delivery, resolution/stop conditions, reschedule supersession, member preferences, quiet-hour defer, tenant-safe audience resolution, delivery evidence, and no false sent/delivered language.

Announcement Build 8 remains dormant until its entire atomic cutover is qualified, including queue producer, drain, webhook reconciliation, direct-dispatch retirement, evidence rollup, batching, provider-policy behavior, and rollback.

---

## 19. Cross-cutting UI/UX requirements

### UX-001 — No dead controls
Every visible actionable control is functional, explicitly disabled with reason, or intentionally preview-only and labeled. No dead button, placeholder action, silent handler, or phantom feature is accepted.

### UX-002 — Correct success semantics
Do not close dialogs, show success, send notification, or write audit success until authoritative persistence succeeds.

### UX-003 — Failure experience
Every consequential operation shows a user-actionable error and support-safe reference/code where useful.

### UX-004 — Tenant/scope visibility
Operational screens show current group/unit/scope when ambiguity is possible.

### UX-005 — Navigation coherence
The product reads as one system, with consistent terminology and information architecture across Finance, Contributions, Relief, Njangi, Elections, Meetings, Documents, Membership, and Enterprise.

### UX-006 — Loading/empty/error distinction
Query errors are not silently converted into empty state for critical data.

### UX-007 — Destructive/corrective action
Destructive/corrective operations show scope, consequence, authorization, and recovery model.

### UX-008 — EN/FR parity
Every critical workflow has key parity and user-reviewed natural language in EN/FR.

### UX-009 — Accessibility
Critical flows support keyboard, visible focus, correct modal focus return, labeled controls/errors, status beyond color, appropriate touch target, zoom/text growth, and both themes.

---

## 20. Mobile / Capacitor readiness

### MOB-001 — Required viewport matrix
Critical workflows complete at 320px, 360px, 375px, 390px, 430px, tablet, and desktop in EN/FR and light/dark.

### MOB-002 — Software keyboard
Primary submit/action controls remain accessible with keyboard open.

### MOB-003 — Platform adapter boundary
Before Capacitor packaging, isolate platform-specific behavior for OAuth/system browser, deep links/app links/universal links, file download/share, clipboard, camera/file picker, connectivity, lifecycle, push, and secure token/session handling.

### MOB-004 — Resume sequence
On app resume: validate session; preserve route tenant; refresh membership/permission authority; refresh critical balances/status/deadlines; reconnect realtime/subscriptions where used; resolve uncertain commands by idempotency identity.

### MOB-005 — Offline classifications
**MUST REQUIRE ONLINE:** voting, financial posting, payment confirmation, Relief approval/payout, Njangi payout/round transition, privilege changes, publication/standing override.

**SAFE CACHED READ:** explicitly authorized published minutes/documents/report snapshots with scope/staleness labels and retention controls.

**SAFE LOCAL DRAFT:** selected forms with clear “saved on this device” state and tenant binding.

**MUST NEVER BLINDLY QUEUE:** money, approvals, votes, roles, delete/correction commands.

### MOB-006 — Sign-out/account-switch cleanup
Protected local/cache/native storage is removed or rendered unusable on sign-out/account replacement. Acceptance proves User B cannot recover User A's protected cached data after sign-out, tenant switch, offline restart, or account replacement.

### MOB-007 — Deep link authorization
A deep link may open a specific payment, event, Relief claim, Njangi round, election, minutes, or announcement only after tenant/object authorization. Unauthorized response does not leak object existence.

---

## 21. Scale requirements

Acceptance fixtures cover at minimum 5,000 members, 500 branches/units, 50,000 payments/financial rows, large Relief/Njangi histories, and national/global electorate scenarios.

Required direction: server pagination/filtering; explicit server totals; no silent row-cap truncation; no client full-table financial truth; no browser sequential mass-message fan-out; set-based audience resolution; server-side election tallies/aggregates; bounded/server-generated large exports where browser memory would mislead/fail; AI receives complete bounded authoritative observations, not silent truncation presented as full analysis.

Exact latency budgets are established per implementation slice and measured; this PRD does not invent achieved benchmarks.

---

## 22. Required security posture

### SEC-001 — Full actor lifecycle matrix
Critical authorization tests cover anon/unauthenticated, ordinary active member, pending, suspended, exited, archived, officer/admin, dual-group user, revoked actor, and cross-tenant IDs.

### SEC-002 — SECURITY DEFINER discipline
SECURITY DEFINER functions use pinned safe search path, fully qualified objects where appropriate, explicit auth checks, and minimum grants.

### SEC-003 — Permissive-policy closure
Legacy permissive policies are removed/replaced where OR-combination weakens a newer policy.

### SEC-004 — Tenant-consistent references
Cross-group references use composite constraints, trigger validation, or authoritative commands so membership/account/fund/position/plan/object references cannot cross boundaries.

### SEC-005 — Server-authored audit
Consequential audit evidence cannot be forged by ordinary members and is atomic with the state change when the audit is required to prove authorization/history.

### SEC-006 — Replay-time authorization
Every replayable high-risk command revalidates current actor authorization before revealing prior result or committing work, including after lock waits.

### SEC-007 — No mixed-currency ambiguity
Canonical events are single-currency. Ordinary cross-currency transfers fail closed unless they use a separately qualified FX/settlement contract.

---

## 23. Universal high-risk acceptance matrix

Every high-risk command/workflow must have executable evidence covering the applicable rows below. This matrix is mandatory; individual feature tickets may add more tests but may not omit relevant rows.

1. **Real database/RPC behavior** against the exact migration/runtime SHA; source grep is insufficient.
2. **Tenant A/B:** correct tenant succeeds, foreign IDs fail, dual-member actor cannot cross-attribute state.
3. **Membership lifecycle:** active/pending/suspended/exited/archived/revoked behavior is explicit.
4. **Concurrent identical requests:** one economic/business effect.
5. **Concurrent conflicting requests:** one winner or deterministic conflict; no partial mixed state.
6. **Lost response after commit:** retry from a **fresh tab/session/device** resolves the original outcome without duplicate effect.
7. **Replay-time authorization:** revoke/suspend actor before replay or while waiting on lock; request fails closed without unauthorized history disclosure.
8. **Tenant/actor/payload binding:** same request identity cannot be replayed into another tenant, by an invalid actor, or with changed economic meaning.
9. **Injected failure/atomicity:** force failure after meaningful intermediate stages; command, financial effect, audit record, notification/outbox fact, and state transition roll back or reconcile according to the frozen contract.
10. **Rollback or forward recovery:** production-bound schema/workflow has demonstrated rollback or documented deterministic forward-recovery procedure.
11. **Representative migration rehearsal:** apply in disposable/representative database including production extension/schema layout and relevant baseline drift.
12. **Mobile completion:** user-facing high-risk workflow completes at required viewport(s), EN/FR, keyboard open, and handles network uncertainty without false success.
13. **No real external send during qualification** unless separately founder-authorized in a dedicated controlled test tenant.

---

## 24. Acceptance evidence model and merge/release gates

Every implemented PRD requirement has an evidence row with:

- Requirement ID
- exact base/head SHA
- implementation path
- behavior invariant
- test name/type
- expected result
- actual result
- security evidence
- tenant A/B evidence
- lifecycle evidence
- concurrency/replay evidence
- data-integrity evidence
- mobile evidence where relevant
- migration/recovery evidence where relevant
- production-readiness state
- CLAIMED / CODE / TESTED / INTEGRATED / DEPLOYED / PROD ENABLED / END-USER VERIFIED

Source-text tests may be guardrails but cannot be sole behavioral/security proof.

For every production-bound slice:

1. Exact base/head SHA pinned.
2. Scope verified.
3. Required behavioral tests pass.
4. TypeScript/build passes where applicable.
5. Security review passes.
6. Tenant/lifecycle tests pass.
7. Data-integrity/concurrency/replay tests pass where applicable.
8. EN/FR/mobile/accessibility acceptance passes where applicable.
9. Migration rehearsed in representative/disposable environment.
10. Recovery/rollback/forward-recovery procedure evidenced.
11. Production migration/deploy separately founder-authorized.
12. Post-deploy read-only smoke and evidence capture complete.

No broad migration runner is authorized merely because a feature branch passes.

---

## 25. Data migration / backward compatibility contract

### MIG-001 — Additive first
Prefer additive schema/command migration and explicit cutover manifests. Preserve historical operational rows and audit evidence.

### MIG-002 — No best-effort dual financial truth
Independent dual writes are prohibited. Operational record + canonical event is one atomic workflow or transactional-outbox workflow.

### MIG-003 — Per-tenant/currency cutover manifest
Every financial/domain cutover states whether pre-boundary history is imported or represented by opening/reconciled positions. The same economic activity may not appear in both.

### MIG-004 — Ambiguity quarantine
Ambiguous source records are quarantined/reconciled; never guessed into financial truth.

### MIG-005 — Immutable accepted history
Rollback disables/routes away from new writes or uses forward correction. It does not delete accepted financial/governance/election history.

### MIG-006 — Legacy Relief reconciliation
Before M7 activation, deterministically reconcile owner, collection, payout, remittance, and settlement positions by plan/unit/currency.

### MIG-007 — Legacy Njangi reconciliation
Before M8 activation, reconcile cumulative contributions, payout summaries, fines JSON, and pool liabilities. Where exact history cannot be reconstructed, create labeled reconciled openings and retain original evidence.

---

## 26. Post-build independent re-audit

When M0–M12 are believed complete, do not declare VillageClaq mature/finished from internal status reports alone.

Run two independent final defensive audits:

1. Kimi K3
2. Fable 5

Each receives the hard-frozen PRD, exact release/deployment manifest, evidence matrix, known limitations, and safe fixtures.

They independently try to prove that claimed features do not work, financial results do not reconcile, controls are bypassable, tenant contamination exists, multi-group/multi-tab behavior fails, Relief/Njangi/Elections violate frozen rules, notifications misbehave, dead controls remain, mobile/Capacitor readiness is overstated, or production differs from evidence.

Only evidence-backed P0/P1, legal/compliance, verified contradiction, critical platform incompatibility, or explicit founder change may reopen architecture. Other findings become backlog.

After both audits, Chief/Astra perform final acceptance reconciliation before founder-controlled production completion.

---

## 27. Definition of Done for VillageClaq Rebuild v1

VillageClaq Rebuild v1 is DONE only when:

1. M1 hard-freeze is complete.
2. S0 exit gate passes, including isolated recovery proof and live-schema baseline.
3. M2 notification foundation is qualified.
4. F3-06/F3-07/FCG-1/F3-08/F3-09 are complete and production-ready.
5. Organization Hierarchy 2.0 is qualified for standalone/direct-branch/deep hierarchy and two-tab/multi-group use.
6. F4 Contributions & Dues feeds canonical cash-basis financial truth without double counting.
7. F5 domain adapters/commands cover the committed module list.
8. Relief 2.0 meets workflow, accounting, hierarchy, privacy, reconciliation, and rollup invariants.
9. Njangi 2.0 meets immutable money/round/payout/fine/reconciliation invariants.
10. Elections 2.0 meets scope, eligibility, anonymity-promise, lifecycle, electorate, and retention invariants.
11. Minutes/governing records/attendance/standing/retention meet M10 invariants.
12. Payment/Hosting/Event/Relief/Njangi/Elections notifications use the shared policy system.
13. Announcements either complete the qualified queue-backed cutover or remain honestly limited/dormant per founder release decision.
14. Critical workflows pass tenant-switch/two-tab/stale-form tests.
15. Critical workflows pass 320–430px EN/FR acceptance and accessibility baseline.
16. Capacitor readiness blockers are closed or explicitly documented as pre-wrapper gates.
17. Scale fixtures produce complete, non-truncated results.
18. No verified P0 remains open.
19. No verified P1 remains open without explicit founder-approved compensating control.
20. Universal high-risk acceptance matrix is satisfied for applicable commands.
21. Kimi K3 final audit completes.
22. Fable 5 final audit completes.
23. Evidence-backed final findings are reconciled.
24. Final production deployment/cutover is founder-authorized and verified.

---

## 28. Immediate continuation point after hard freeze

After Daybreak re-review returns PASS and Chief hard-freezes this PRD, the next implementation work is **S0-A — Read-only production truth snapshot**, followed immediately by **S0-B — Recovery/PITR preservation and isolated restore proof**.

No remediation migration is written before S0-A resolves the current repository/production drift claims.

After S0-A/S0-B:

1. classify each claimed P0/P1 CONFIRMED / NOT PRESENT / PARTIAL / CANNOT CONFIRM
2. preserve recovery evidence
3. implement only confirmed highest-blast-radius S0 fixes in bounded cuts
4. requalify PR #70
5. requalify F3 migration deployability
6. pass S0 exit gate
7. complete M2
8. continue M3 onward in this document

---

## 29. Safety boundaries retained

Until explicitly changed by founder approval:

- No real WhatsApp/email/SMS sends during QA.
- No reminder/receipt triggering during implementation tests.
- No production financial mutation without exact authorization.
- No broad migration apply.
- No Meta/WABA/provider/env changes without explicit authorization.
- Announcement Build 8 remains dormant until dedicated atomic cutover.
- Agentic execution remains inert unless separately activated.
- F3 migrations remain unapplied until production release gate.
- No F3-06 implementation before M1 hard freeze and S0 sequencing is accepted.

---

## 30. Master status board

| Stage | Status |
|---|---|
| M0 Independent Audit | COMPLETE |
| M1 Master PRD | SECURITY REVISION 1 — RE-REVIEW REQUIRED |
| S0 Production Stabilization | NEXT AFTER HARD FREEZE |
| M2 Notification Foundation | PARTIALLY BUILT / PR #70 REQUALIFICATION REQUIRED |
| M3 F3 Completion | F3-01…05 FROZEN; F3-06 NOT STARTED; FCG-1 ADDED |
| M4 Hierarchy 2.0 | NOT STARTED |
| M5 F4 Contributions Integration | NOT STARTED |
| M6 F5 Module Financial Commands | NOT STARTED |
| M7 Relief 2.0 | NOT STARTED |
| M8 Njangi 2.0 | NOT STARTED |
| M9 Elections 2.0 | NOT STARTED |
| M10 Records/Governance/Reporting | NOT STARTED |
| M11 Notification Domain Migration | NOT STARTED |
| M12 Mature-SaaS Acceptance/Cutover | NOT STARTED |

---

## 31. Daybreak Security Review 1 — bounded closure map

This revision closes the Daybreak HOLD items as follows:

| Daybreak required edit | PRD closure |
|---|---|
| Accrual vs frozen cash-basis contradiction | D-002 revised to cash basis; P-003/P-015/F4/F3 aligned |
| Cross-currency member transfer/standing guard | S0-008 |
| Strong universal high-risk acceptance matrix | Section 23 |
| Replay-time auth + tenant/actor/payload binding | P-009, SEC-006, Section 23 |
| Atomic server-authored audit evidence | SEC-005, G-009, Section 23 |
| M2 authorization/version auditing | M2-003/M2-004/M2-006 |
| Loan principal classification | F5-001 |
| Mixed-currency classification | SEC-007/F5-002/FCG-1 |
| Relief recognition occurrence | R-009 |
| Projection-only Relief eliminations | R-010 |
| Relief deterministic legacy reconciliation | R-012/MIG-006 |
| Njangi deterministic legacy reconciliation | N-010/MIG-007 |
| Election reopen semantics | D-008/E-007 |
| Ambiguous electorate identity fail closed | D-009/E-004 |
| Attachment authorization for all mutations | G-005 |
| Retained recovery evidence + isolated restore proof | S0-B |
| Duplicate migration/baseline handling | S0-C |
| Behavioral S0 exit tests | S0 behavioral exit matrix |
| Financial reconciliation gate before reports | FCG-1 |

No other architecture expansion is authorized by this revision.

---

## 32. Governing statement

**Build to this PRD, not around it.**

The rebuild is intended to finish VillageClaq into a coherent, secure, tenant-safe, financially reconcilable, mobile-ready, supportable mature SaaS product. Strong existing work is preserved. Weak boundaries are replaced deliberately. Every release is evidence-backed. Architecture stays stable unless Section 2 is met.
