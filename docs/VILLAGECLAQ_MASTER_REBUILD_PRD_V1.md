# VillageClaq Master Rebuild PRD v1.0

**Status:** HARD FROZEN — IMPLEMENTATION AUTHORITY  
**Hard-freeze date:** 2026-09-10 (America/New_York)  
**Hard-freeze lineage tip:** `a04cdc640234ef7db95e6da3bde8e7f4668062c6` (PR #71 Security Revision 2)  
**Daybreak Blue final verdict:** PASS — MASTER REBUILD PRD V1 SAFE FOR HARD FREEZE (F4-002 PASS, FCG-1 PASS, P-003 PASS, build order PASS)  
**Next stage:** S0-A (read-only production truth snapshot) — M0 COMPLETE; M1 COMPLETE after this freeze  
**Main merge:** NOT authorized by freeze alone — founder merge authorization required separately  
**Date:** 2026-09-10  
**Production main at freeze input:** `0559b758bc53df3ec8081e361ffd022c1f19be43`  
**F0 financial track:** `99e17e2b4f4dc16753843f1e115312e70a8ae8ca`  
**F3 integration:** `c7b4cd535d7125737eab2ec0fad27cae9432e8c3`  
**Notification policy foundation:** PR #69 / `a8cdeaa98e6bb9e3a6cccaf815aa4ae4441b59a7`  
**Notification policy schema/adapter draft:** PR #70 / CREATE-NOT-APPLY / REQUALIFICATION REQUIRED  
**Security review history:** Daybreak review of PR #71 @ `7b7a276602fd094b91c120a473c0489c6fb6c728` returned HOLD; Security Revision 1 @ `1430d1c52f10edf690b50304ec536f8f019e0372` closed all but one bounded F4 classification contradiction. Security Revision 2 is recorded in `docs/VILLAGECLAQ_MASTER_REBUILD_PRD_V1_SECURITY_REVISION_2.md` and normatively supersedes only the conflicting F4-002/FCG-1 wording.

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

### M1 — Master PRD + security freeze — COMPLETE
Create this PRD, run Daybreak security review, apply only bounded evidence-backed revisions, then hard-freeze. **Hard-frozen 2026-09-10** at tip `a04cdc640234ef7db95e6da3bde8e7f4668062c6`.

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
Authenticated API/dashboard/Supabase responses may not remain in a global cross-user cache without user/tenant partitioning, expiry, revocation behavior, and sign-out purge. Simplest acceptable v1 default: do not cache authenticated business responses in the service worker.

### S0-011 — Destructive-delete stop
Membership, event, election, Relief, Njangi, minutes, financial, and governing-record workflows must not destroy consequential evidence through normal hard delete. Introduce soft-exit/archive protections and migration-safe compatibility.

### S0-012 — PR #70 requalification
Correct invalid database timezone validation mechanism; prove active membership; compile/type-check exact branch; execute migration in disposable PostgreSQL; test active/pending/suspended/exited/archived access; same-tenant object refs; policy version/CAS/audit rules.

### S0-013 — F3 deployability requalification
Verify every F0/F3 migration against production extension/schema layout and baseline. Any schema-qualified function mismatch or replay incompatibility is corrected in bounded compatibility work and requalified before apply.

### S0-014 — S0 behavioral security exit matrix
For every S0 control execute applicable tests as unauthenticated/anon, active member, pending member, suspended member, exited member, archived member, privileged officer, dual-group actor, and foreign-tenant-ID actor. Include direct-RPC bypass attempts, cross-group reference injection, false-success injection, consequential mutation + audit atomicity, replay/current-auth checks, and migration/restore evidence.

### S0 exit gate
No verified P0 remains open. Every verified P1 is remediated or has an explicit founder-approved compensating control plus release block. S0 evidence includes live manifest, migration baseline, retained recovery evidence, isolated restore result, and behavioral exit matrix.

---

## 9. M2 — Notification Policy Foundation

### M2-001 — Preserve qualified pure policy semantics
Keep anchor-qualified occurrence identity, multiple relative triggers, repeat cadence with bounded count, stop-after, stop-when-resolved, invalid-policy fail closed, valid timezone handling, quiet-hours `DEFER_UNTIL`, reschedule supersession, and member channel opt-out intersection.

### M2-002 — Precedence
Initial v1 precedence remains `system legacy-compatible default → group/domain policy → object override`. Hierarchy initially supplies templates that units/groups explicitly adopt; no automatic deep inheritance.

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
- **Security Revision 2 controls unapplied confirmed dues cash:** a confirmed non-refundable dues receipt is recognized once as income at confirmation; an unapplied portion is only an operational allocation credit and does not create a ledger liability or second income event when later allocated. Refundable/conditional unapplied cash remains a liability until recognized/refunded. See `docs/VILLAGECLAQ_MASTER_REBUILD_PRD_V1_SECURITY_REVISION_2.md`.
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

### F4-002 — Cash-basis canonical effect — SECURITY REVISION 2
Under D-002, a dues assessment/obligation does **not** create journal income or a ledger receivable in VillageClaq Rebuild v1.

A **confirmed non-refundable dues cash receipt** is recognized **once** as contribution income at confirmation, even when some or all of that confirmed cash is not yet allocated to a specific obligation. Any unapplied portion remains an **operational allocation credit** in Contributions & Dues. Later allocation of the already-confirmed receipt creates no second income event, second custody event, or duplicate canonical posting.

A **refundable or conditional unapplied receipt** remains a liability/member credit until the recognition condition is met or the amount is refunded.

The detailed normative matrix and FCG-1 closure are in `docs/VILLAGECLAQ_MASTER_REBUILD_PRD_V1_SECURITY_REVISION_2.md`.

### F4-003 — Pending is not confirmed
Pending/rejected member submissions create no confirmed custody/income effect.

### F4-004 — Overpayment
A non-refundable confirmed dues overpayment/unapplied advance is recognized once under F4-002 and carried as an allocation credit; later allocation creates no second income. A refundable or conditional unapplied amount is a liability/member credit until recognized or refunded.

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

### F5-004 — Shared occurrence uniqueness
Manual, import, and module paths use a shared source/economic occurrence identity or deterministic conflict mapping so one real-world economic event cannot be posted twice through different entry paths.

---

## 14. M7 — Relief 2.0

### R-001 — Preserve core entities
Keep plans, enrollments, claims, payouts, remittances, waiting periods, enrollment types, notifications, and rollup concepts where valid.

### R-002 — Ownership and participation
Each plan records owning unit, operational financial owner, participating units/subtree, collection authority, review authority, payout authority, reporting audience, and effective dates.

### R-003 — Hierarchy scopes
Support local, regional, national, and global plans using one scope model.

### R-004 — Coverage portability
Enrollment/eligibility belongs to person + plan contract; branch transfer changes responsibility prospectively and does not silently reset waiting periods or rewrite history.

### R-005 — Claim state machine
Submitted/reviewing/approved/denied/withdrawn/paid or equivalent lifecycle has authoritative transitions, actor roles, version checks, current authorization, and immutable decision history.

### R-006 — Payout command
One idempotent payout command validates claim state, approved amount, owner/custody/fund, tenant, actor, request identity, and writes operational + financial result + required audit evidence atomically or via qualified transactional outbox. No duplicate payout per economic occurrence.

### R-007 — Remittance maker/checker
Submission and confirmation/dispute authorities are distinct. Sender cannot self-confirm merely by being a branch admin. Receiver/owner authority is server-validated at decision time.

### R-008 — Correct branch rollup
Pre-aggregate enrollment, payment, and remittance facts independently at their correct grain before joining. `SUM(DISTINCT amount)` is prohibited as a fanout repair.

### R-009 — Relief cash-basis recognition and agency accounting
Relief has its own explicit recognition rule and does not inherit a dues assessment rule:

- A confirmed non-refundable Relief contribution received for the plan owner is the v1 recognition occurrence for restricted contribution income.
- A branch collecting as agent records custody + liability/settlement due to the owner; the owner records the corresponding settlement/receivable and recognized restricted receipt according to the single occurrence identity.
- Remittance settles the reciprocal branch/owner balances and **does not recognize contribution income again**.
- A refundable or conditional receipt remains liability/custody until its condition is satisfied or it is refunded.
- A claim payout is restricted expense/custody settlement for the owner, or agent settlement when a delegated branch pays for the owner, according to the authorized plan contract.

### R-010 — Projection-only eliminations
Reciprocal inter-unit balances/transfers are eliminated only in authorized ancestor/subtree/global **management projections**. Elimination never rewrites either operational group's immutable local ledger.

### R-011 — Sensitive detail
Hierarchy/global visibility defaults to aggregate participation/financial information. Claim detail and claimant PII require separate permission.

### R-012 — Deterministic legacy cutover
Before Relief 2.0 financial activation, reconcile each existing plan's owner, collecting groups, contribution receipts, payouts, remittances, settlement state, currency, and source IDs. Ambiguous economic ownership/status is quarantined for explicit resolution; never guessed or double-posted. Cutover manifest proves pre-boundary/opening/post-boundary treatment.

---

## 15. M8 — Njangi 2.0

### N-001 — Preserve cycle model
Keep cycle identity, participant identity/order, rotation concepts, and historical source evidence.

### N-002 — Immutable contribution receipts
Replace cumulative read-add-upsert as transaction truth. Each partial/full contribution is its own idempotent receipt occurrence.

### N-003 — Accounting
Member contribution increases custody and member/pool liability; it is not association operating income by default. Round payout decreases liability and custody; it is not association expense by default.

### N-004 — Server-authoritative transitions
Participant add/change, round advance, cycle pause/close, collector assignment, contribution, payout, deduction, deferral, refund, and fine/issue assessment/settlement use authoritative commands with current authorization, tenant validation, concurrency controls, durable request identity, and audit evidence.

### N-005 — Payout evidence
Payout amount, beneficiary, method, deductions, reason, status, actor, and occurrence identity are durable. Mutable participant summary fields are projections only.

### N-006 — Fines
Move mutable fines JSON to normalized records/events. Fine treatment depends on economic owner and cannot silently become association income.

### N-007 — Exact money
Use exact decimal/minor-unit arithmetic. JS floating point is not accounting authority.

### N-008 — Rotation
Sequential remains supported. Random draw is authoritative/persisted/audited. Auction remains unavailable unless a complete qualified auction workflow is separately approved.

### N-009 — Scope
Local by default. Cross-branch circles require explicit person identity, participation, custody owner, one currency, and scoped permissions.

### N-010 — Deterministic legacy reconciliation
Before cutover, reconcile legacy cumulative contribution rows, participant payout markers/amounts, current round, fine/issue JSON, currency, and participant liability. When exact historical partial-payment events cannot be reconstructed, preserve original evidence and create a clearly labeled reconciled opening liability/custody position rather than inventing transaction history. Migration totals must reconcile before new commands are enabled.

---

## 16. M9 — Elections 2.0

### E-001 — Preserve ballot split
Keep separate voter participation receipt and anonymous ballot-choice stores.

### E-002 — Active eligibility
Voting requires an eligible active person/membership under frozen election rules.

### E-003 — Frozen electorate
At opening: resolve participating hierarchy units using topology version; select eligible active memberships; deduplicate by verified organization-person identity; snapshot eligibility evidence and constituency; freeze candidates/options/timing/rule version.

One person receives one electorate entry even with multiple memberships.

### E-004 — Ambiguous identity fails closed
Regional/national/global election opening fails if organization-person deduplication is missing, ambiguous, or unresolved. The system does not guess identity equivalence.

### E-005 — Transfers after opening
Branch transfer after opening does not grant another vote or silently alter the frozen electorate.

### E-006 — Candidate/position integrity
Candidate/person/membership evidence, position, election, and organization/unit scope are server-validated and tenant-consistent.

### E-007 — Lifecycle / no in-place reopen
Draft may change before opening. Once an electorate/choices are frozen and the election opens, choices/electorate are immutable. A closed or cancelled election is not reopened in place. Material reschedule/restart creates a new election/version preserving the old evidence.

### E-008 — Anonymity metadata
Do not expose/store application-accessible precise metadata that trivially correlates receipt identity with ballot choice. Acceptance explicitly tests correlation against every application role within D-004's threat model.

### E-009 — Result visibility
No unauthorized live tally. Cancellation does not automatically reveal partial vote detail. Results require explicit authorized publication.

### E-010 — Evidence retention
Closing/cancelling/archiving may not destroy ballot/participation evidence required for history/audit.

### E-011 — Hierarchy
Branch/regional/national/global election scope comes from the frozen electorate snapshot, not dynamic descendant-membership lookup at vote time.

---

## 17. M10 — Records, Governance & Reporting

### G-001 — Minutes lifecycle
Private Draft → optional Shared Provisional/Working Minutes → Published/Approved → Amendment/Supersession/Withdrawal. Published official content is not overwritten in place without preserved revision lineage.

### G-002 — Minutes retention
Archiving/removing a calendar event does not cascade-delete official minutes.

### G-003 — Governing documents
Stable document identity + revision identity. Constitution v1 and Bylaws v1 may coexist. Publication is atomic; failure leaves prior official revision available.

### G-004 — Acknowledgment
Acknowledgment binds person/membership, exact revision, tenant, actor context as appropriate, and timestamp. Receipt acknowledgment is not approval voting.

### G-005 — Attachment lifecycle authorization
Store durable object keys, not temporary signed URLs as record truth. Every attachment operation—upload, replacement, signing/read, archive, and deletion—first authorizes the actor against the parent record, tenant, record state, and required permission. A storage-key possession alone grants nothing. Attachment mutation + required audit evidence is atomic where consequential.

### G-006 — Attendance commands
Separate self check-in, officer mark/correction, bulk correction, and finalization. Enforce same-group membership, active status, cancellation state, server time, and event window.

### G-007 — Attendance evidence
Preserve original check-in evidence plus corrections. “Not recorded” and “absent” are distinct. Stale bulk screens cannot silently overwrite later self/QR evidence.

### G-008 — Standing model
Maintain calculated standing, manual decision/override, and effective standing. Manual decision includes actor, reason, effective time, expiry/indefinite rule, and revocation history. Recalculation respects active override. One authoritative standing engine/rule version.

### G-009 — Atomic consequential audit
Standing, publication, governing-record, attendance finalization/correction, and comparable consequential governance mutation commits required server-authored audit evidence atomically. Audit failure prevents an unaudited success state.

### G-010 — Retention schedule
Define product retention classes for official records, financial/correction history, attendance/standing, elections, Relief/Njangi evidence, profiles/personal data, attachments, notifications/logs, and offline copies. No legal retention period is promised without separate approval.

### G-011 — Member transparency
Independent settings may enable continuous authorized read-only access to published/provisional minutes and current financial summaries. Financial transparency shows posted/confirmed state, currency, scope, period, updated-at, and preserves private member obligations/loan/claim/payment evidence.

### G-012 — Authoritative report observation
Dashboards, Board Packet, exports, and AI consume a server-authorized observation containing scope, period, currency buckets, topology version, permission context, source version, and observation time. AI does not treat arbitrary caller-supplied/truncated report payload as canonical truth.

---

## 18. M11 — Notification Domain Migration

Fixed live migration order:

1. Payment
2. Hosting
3. Events/Meetings
4. Relief
5. Njangi
6. Elections
7. Announcements modernization

Each domain proves current-default parity, configurable schedules, stable occurrence identity, idempotent recipient/channel delivery, resolution/stop conditions, reschedule supersession, member preferences, quiet-hour defer, tenant-safe audience resolution, delivery evidence, and no false sent/delivered language.

Announcement Build 8 remains dormant until atomic cutover is qualified: queue producer, drain, webhook reconciliation, direct-dispatch retirement, evidence rollup, batching, provider-policy behavior, rollback.

---

## 19. Cross-cutting UI/UX requirements

### UX-001 — No dead controls
Every visible actionable control is functional, explicitly disabled with reason, or intentionally preview-only and labeled. No dead button, placeholder action, silent handler, or phantom feature is accepted.

### UX-002 — Correct success semantics
Do not close dialogs, show success, send side-effect notification, or write audit success before authoritative persistence succeeds.

### UX-003 — Failure experience
Every consequential operation shows an actionable error and support-safe reference/code where useful.

### UX-004 — Tenant/scope visibility
Operational screens show current group/unit/scope when ambiguity is possible.

### UX-005 — Navigation coherence
Use consistent terminology/information architecture across Finance, Contributions, Relief, Njangi, Elections, Meetings, Documents, Membership, and Enterprise.

### UX-006 — Loading/empty/error distinction
Critical query failures are not silently converted into empty state.

### UX-007 — Destructive/corrective action
Show scope, consequence, authorization, and recovery model before consequential destructive/corrective action.

### UX-008 — EN/FR parity
Critical workflows have translation-key parity and natural EN/FR wording.

### UX-009 — Accessibility
Critical flows support keyboard, visible focus, modal focus return, labeled controls/errors, status beyond color, touch targets, zoom/text growth, and both themes.

---

## 20. Mobile / Capacitor readiness

### MOB-001 — Viewport matrix
Critical workflows complete at 320, 360, 375, 390, 430px, tablet, desktop, EN/FR, light/dark.

### MOB-002 — Software keyboard
Primary submit/action remains reachable with keyboard open.

### MOB-003 — Platform adapter boundary
Before Capacitor packaging, isolate OAuth/system-browser, deep links/universal/app links, file download/share, clipboard, camera/file picker, connectivity, app lifecycle, push, and secure session/token behavior.

### MOB-004 — Resume sequence
On app resume: validate session; preserve route tenant; refresh membership/permission authority; refresh critical balances/status/deadlines; reconnect subscriptions if used; recover uncertain command by idempotency identity.

### MOB-005 — Offline classifications
**MUST REQUIRE ONLINE:** voting, financial posting, payment confirmation, Relief approval/payout, Njangi payout/round transition, privilege changes, publication, standing override.

**SAFE CACHED READ:** explicitly authorized published minutes/documents/report snapshots with scope/staleness labels and retention controls.

**SAFE LOCAL DRAFT:** selected forms with visible local-only state and tenant binding.

**MUST NEVER BLINDLY QUEUE:** money, approvals, votes, privilege, destructive/corrective commands.

### MOB-006 — Sign-out/account-replacement cleanup
Protected local/cache/native storage is removed or cryptographically/logically unusable on sign-out according to policy. Acceptance proves User B cannot recover User A protected cached content after account replacement, tenant switching, offline restart, or sign-out.

### MOB-007 — Deep-link authorization
Specific-object deep links authorize tenant/object before rendering and do not leak object existence when unauthorized.

---

## 21. Scale requirements

Acceptance fixtures cover at minimum 5,000 members, 500 branches/units, 50,000 payment/financial rows, large Relief/Njangi histories, and broader-scope electorates.

Required direction: server pagination/filtering; server totals; no silent API row-cap truncation; no client full-table financial truth; no browser sequential mass-message fanout; set-based audiences; server-side election aggregates; bounded/server-generated large exports where needed; AI gets complete bounded authoritative observations, not silent truncation presented as full analysis.

---

## 22. Required security posture

### SEC-001 — Lifecycle/tenant matrix
Critical RLS/helper/command tests cover unauthenticated/anon, active, pending, suspended, exited, archived, privileged officer, dual-group user, and cross-tenant IDs.

### SEC-002 — SECURITY DEFINER posture
Pinned safe search path, explicit auth guard where needed, minimum EXECUTE grants, no default PUBLIC/anon execution unless independently justified.

### SEC-003 — Permissive-policy closure
Remove/replace legacy permissive policies whose OR-combination weakens newer controls.

### SEC-004 — Cross-group references
Use composite constraints, qualified triggers, or authoritative command validation so membership/account/fund/position/plan/object refs cannot cross tenant boundaries.

### SEC-005 — Server-authored audit
Ordinary members cannot forge consequential audit events.

### SEC-006 — Replay current authorization
Idempotent replay is not an authorization bypass. Command replay revalidates current actor authority and tenant relationship, including after lock wait.

---

## 23. Universal high-risk acceptance matrix

Every applicable consequential workflow must prove, through behavioral execution rather than source inspection alone:

1. Real database/RPC/API behavior on representative schema.
2. Tenant A/B isolation including foreign object IDs.
3. Membership lifecycle: active, pending, suspended, exited, archived.
4. Concurrent identical requests → one effect / deterministic replay.
5. Concurrent conflicting requests → explicit conflict/version behavior.
6. Lost response after commit, followed by retry from a **fresh tab/session/device** → no duplicate effect.
7. Replay-time current authorization; revoked actor cannot use stored result as authority to create/alter effects.
8. Tenant, actor, command type, source/economic occurrence, and canonical payload/fingerprint binding.
9. Same idempotency identity + changed material payload → conflict, never silent mutation.
10. Injected failure at every critical multi-write boundary → no partial success; required financial/audit/operational effects are atomic or qualified outbox-recoverable.
11. Rollback or deterministic forward-recovery proof preserving immutable accepted history.
12. Representative migration rehearsal against production-compatible extension/schema/baseline where applicable.
13. Mobile completion for user-facing workflow, including uncertain network result.
14. Explicit result vocabulary: accepted/rejected/conflict/uncertain/reconciled as appropriate; no false-success UI.

A high-risk requirement cannot reach production-ready status without its applicable matrix evidence.

---

## 24. Merge/release gates

For every production-bound slice:

1. Exact base/head SHA pinned.
2. Scope verified.
3. Behavioral tests pass; source-text tests are supplemental only.
4. TypeScript/build passes where applicable.
5. Security review passes.
6. Tenant isolation passes.
7. Data-integrity/concurrency/replay matrix passes where applicable.
8. EN/FR/mobile/accessibility passes where applicable.
9. Migration rehearsed in disposable/representative DB where applicable.
10. Recovery/rollback or forward-recovery evidence exists.
11. Production migration/deploy is separately founder-authorized.
12. Post-deploy read-only smoke and evidence capture complete.

No broad migration runner is authorized merely because a feature branch passes.

---

## 25. Post-build independent re-audit

When M0–M12 are believed complete, run two independent final defensive audits:

1. Kimi K3
2. Fable 5

Each receives frozen PRD, exact release/deployment manifest, evidence matrix, known limitations, and safe fixtures. They independently challenge claimed functionality, financial reconciliation, authorization, tenant separation, multi-group/multi-tab behavior, Relief/Njangi/Elections, notifications, dead controls, mobile/Capacitor readiness, production drift, recovery, and evidence quality.

Only evidence-backed P0/P1, legal/compliance, verified contradiction, critical platform incompatibility, or explicit founder change reopens architecture. Other findings become backlog.

Chief/Astra reconcile final evidence before founder-controlled production completion.

---

## 26. Definition of Done

Rebuild v1 is DONE only when:

1. S0 exit passes.
2. M2 foundation qualified.
3. F3-06/F3-07/FCG-1/F3-08/F3-09 complete and production-ready.
4. Hierarchy 2.0 qualified for standalone/direct/deep structures.
5. F4 dues integrates with canonical cash-basis ledger with no duplicate recognition.
6. F5 module commands/adapters cover committed modules.
7. Relief 2.0 passes workflow/accounting/hierarchy/privacy/rollup invariants.
8. Njangi 2.0 passes immutable receipt/payout/fine/round invariants and legacy reconciliation.
9. Elections 2.0 passes scope/identity/secrecy/lifecycle/electorate requirements.
10. Minutes/governing records/attendance/standing/retention pass M10.
11. Notification domains migrate in M11 sequence.
12. Announcements either complete atomic modernization or remain honestly dormant/limited by founder decision.
13. Tenant-switch/two-tab tests pass.
14. 320–430px EN/FR mobile acceptance passes.
15. Capacitor blockers closed or explicitly recorded as pre-wrapper gates.
16. Scale fixtures produce complete, non-truncated results.
17. No verified P0 remains open.
18. No verified P1 remains open without founder-approved compensating control/release block.
19. Kimi K3 final audit completes.
20. Fable 5 final audit completes.
21. Evidence-backed final findings reconciled.
22. Founder-controlled production completion is verified.

---

## 27. Immediate continuation point

After Daybreak final PASS and hard freeze, next work is **S0-A — Read-only production truth snapshot**.

Then:

1. S0-B recovery/PITR preservation + isolated restore proof.
2. S0-C migration baseline/replay hygiene.
3. classify audit claims CONFIRMED / NOT PRESENT / PARTIAL / CANNOT CONFIRM.
4. remediate only confirmed highest-blast-radius findings in bounded cuts.
5. requalify PR #70.
6. requalify F0/F3 deployability.
7. pass S0 exit.
8. continue M2 then M3 onward.

No remediation migration is written before S0-A resolves repository/production drift claims unless founder explicitly authorizes an emergency exception under Section 2.

---

## 28. Safety boundaries

Until explicitly changed by founder authorization:

- No real WhatsApp/email/SMS sends during QA.
- No reminder/receipt triggering during implementation tests.
- No production financial mutation without exact authorization.
- No broad migration apply.
- No Meta/WABA/provider/env changes without explicit authorization.
- Announcement Build 8 remains dormant until dedicated atomic cutover.
- Agentic execution remains inert unless separately activated.
- F3 migrations remain unapplied until their production release gate.

---

## 29. Master status board

| Stage | Status |
|---|---|
| M0 Independent Audit | COMPLETE |
| M1 Master PRD | SECURITY REVISION 2 — FINAL DAYBREAK REVIEW PENDING |
| S0 Production Stabilization | NEXT AFTER HARD FREEZE |
| M2 Notification Foundation | PARTIALLY BUILT / REQUALIFICATION REQUIRED |
| M3 F3 Completion | F3-01…05 FROZEN; F3-06 NOT STARTED |
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

## 30. Governing statement

**Build to this PRD and its bounded Security Revision 2 amendment, not around them.**

The rebuild is intended to finish VillageClaq into a coherent, secure, tenant-safe, financially reconcilable, mobile-ready, supportable mature SaaS product. Strong work is preserved. Weak boundaries are deliberately replaced. Every release is evidence-backed. Architecture stays stable unless Section 2 change control is met.
