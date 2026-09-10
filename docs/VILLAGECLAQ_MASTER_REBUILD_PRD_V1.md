# VillageClaq Master Rebuild PRD v1.0

**Status:** HARD-FREEZE CANDIDATE — implementation authority after security review and founder acceptance  
**Date:** 2026-09-10  
**Production main at freeze input:** `0559b758bc53df3ec8081e361ffd022c1f19be43`  
**F0 financial track:** `99e17e2b4f4dc16753843f1e115312e70a8ae8ca`  
**F3 integration:** `c7b4cd535d7125737eab2ec0fad27cae9432e8c3`  
**Notification policy foundation:** PR #69 / `a8cdeaa98e6bb9e3a6cccaf815aa4ae4441b59a7`  
**Notification policy schema/adapter draft:** PR #70 / CREATE-NOT-APPLY, must be requalified before merge  

---

## 1. Purpose

VillageClaq will be rebuilt into one coherent, mature multi-tenant SaaS product rather than a set of individually useful but inconsistently governed modules.

This PRD is the controlling plan for the rebuild. It combines the independent architecture, defensive, live-production, UI/UX, mobile, tenant-isolation, finance, Relief, Njangi, elections, records, attendance, standing, reporting, and notification audits completed before this document.

The rebuild must preserve strong work, especially the F0/F3 financial command and ledger architecture, while replacing weak legacy boundaries where direct browser writes, permissive policies, stale tenant context, destructive cascades, false-success UI, or inconsistent financial truth make the product unsafe or misleading.

This is **not** a wholesale rewrite. Every subsystem is classified as KEEP, HARDEN, EXTEND, REBUILD, MIGRATE, DEPRECATE, or RETIRE.

---

## 2. Change-control rule

After this PRD is security-reviewed and hard-frozen, the architecture and build sequence remain fixed until completion.

The plan may be changed only for one of these reasons:

1. Verified P0/P1 security or data-integrity defect.
2. Verified architectural contradiction.
3. Legal/compliance requirement.
4. Critical platform/mobile incompatibility.
5. Unavoidable external dependency/platform change.
6. Explicit founder-approved product change.

A reviewer suggestion, preference, refactor idea, or P2/P3 improvement alone does not reopen the architecture. It becomes backlog unless it blocks a frozen acceptance requirement.

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

These states are never treated as synonyms.

---

## 4. Non-negotiable product principles

### P-001 — Operational tenant boundary
`group_id` remains the operational ownership and financial boundary for an operational group.

### P-002 — Organization hierarchy is separate from operational ownership
National/global topology is modeled by organization units around operational groups; aggregate hierarchy nodes need not be transactional groups.

### P-003 — One financial truth
Every economic occurrence has exactly one canonical economic owner and one canonical financial effect. Specialized domain records may project into the ledger but cannot create parallel financial truths.

### P-004 — Local ledger, higher-level projection
Every operational group has its own canonical ledger. Regional, national, subtree, and global views are authorized projections, not duplicate ancestor ledgers.

### P-005 — Native currency is authoritative
USD, XAF, GBP, EUR, and other currencies remain separate authoritative buckets. Converted management views are derived, reproducible, labeled, and never replace native truth.

### P-006 — Active status matters
Authorization for active work must require an active subject/membership unless a frozen workflow explicitly permits another status.

### P-007 — Tenant relationship does not imply PII access
Hierarchy, HQ status, or belonging to multiple groups never automatically grants unrestricted member-level PII.

### P-008 — Server-authoritative consequential commands
Money, approvals, voting, attendance finalization, standing overrides, publication, payouts, remittances, and privilege changes must not depend on unchecked direct browser writes.

### P-009 — Idempotency for uncertain results
Every consequential command must survive “server committed but response was lost” without duplicate effects.

### P-010 — Correct instead of destructively delete
Financial, governance, election, attendance, standing, and official-document history must use correction, reversal, archival, withdrawal, or supersession rather than ordinary destructive deletion.

### P-011 — Mature-SaaS UX
Success means the user can find, understand, complete, recover, and verify the task—not merely that a page or button exists.

### P-012 — Mobile is a first-class acceptance target
Critical workflows must be usable at 320–430px, EN/FR, light/dark, with software keyboard open, and be architecturally compatible with a future Capacitor wrapper.

### P-013 — No phantom notification success
Queued, sent-to-provider, delivered, read, failed, blocked, unavailable, and skipped are distinct states.

### P-014 — No hidden offline replay of high-risk commands
Votes, money movements, approvals, payouts, destructive actions, and privilege changes are online-authoritative and may not be blindly queued.

### P-015 — Report is a projection, not truth
Financial and operational reports consume canonical observations; a report itself is never the underlying source of truth.

---

## 5. Frozen founder product decisions

The following defaults are adopted for v1 unless later changed through the change-control rule.

### D-001 — Relief beneficial ownership
Each Relief plan names **one operational financial owner**. Participating branches may collect or pay as authorized agents. Ownership and agency are explicit and effective-dated.

### D-002 — Dues recognition
VillageClaq v1 uses **enforceable-assessment accrual recognition for canonical financial statements**: enforceable dues assessments may create receivable/income; confirmed receipts settle receivables. Refundable or unapplied credits are liabilities, not income. Existing Contributions & Dues collection reports remain available as specialized cash/collection views.

This avoids mixing cash-collected operational reports with canonical Statement-of-Activity recognition.

### D-003 — Reporting perimeter
The initial hierarchy/global product provides **management reporting**, not statutory/legal consolidation. Any future statutory consolidation product is separately scoped.

### D-004 — Election secrecy promise
VillageClaq v1 guarantees **application-level secret ballot separation with metadata minimization**, not cryptographic secrecy against database operators. Marketing/UI must not claim a stronger guarantee unless a stronger protocol is later built and qualified.

### D-005 — Njangi scope
Njangi/Savings Circle is branch/local by default. Regional or national circles are explicit hosted circles with explicit participants, owner, currency, and permissions.

### D-006 — Offline policy
Published read-only content may be cached under explicit tenant/user rules. High-risk business commands remain online-authoritative. Existing generic offline business queues remain dormant until a separately qualified contract exists.

### D-007 — F3 opening cash correction
F3-05 opening cash is not exposed to end users until a bounded correction/reversal/remediation path is defined and qualified. F3-06 may proceed on settings work, but F3-07 must not expose opening-entry creation without this closure.

---

## 6. Current-state classification

| Subsystem | Current disposition | Production today | Target |
|---|---|---:|---|
| Contributions & Dues | KEEP/HARDEN/MIGRATE | Yes | Specialized dues subledger feeding canonical ledger |
| F0 financial hardening | KEEP | Partially staged / production prerequisites unresolved | Required production prerequisite for F3 lineage |
| F3-01 Ledger foundation | KEEP/FROZEN | No | Canonical ledger foundation |
| F3-02 Money In/Out/Transfer | KEEP/FROZEN | No | General manual financial command |
| F3-03 projections | KEEP/FROZEN | No | Canonical financial reporting backend |
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
Inputs: Astra multi-audit, Kimi K3 defensive audit, live-production/Claude audit, Product Consistency audits, qualified F0/F3 evidence.

### M1 — Master PRD + security freeze — CURRENT
Create this PRD, run security review, reconcile only evidence-backed blockers, hard-freeze plan.

### S0 — Production Stabilization & Recovery Gate
Mandatory before broad new production feature work.

### M2 — Notification Policy Foundation
Requalify and complete policy/schema contract. No live domain rewires until this stage passes.

### M3 — Complete F3
F3-06 → F3-07 → F3-08 → F3-09.

### M4 — Organization Hierarchy 2.0
Arbitrary hierarchy, scoped grants, route-authoritative tenant identity, multi-group/multi-tab safety.

### M5 — F4 Contributions & Dues integration
Canonical dues posting and reconciliation.

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
Payment → Hosting → Events → Relief → Njangi → Elections → Announcement modernization.

### M12 — Mature-SaaS System Acceptance & Controlled Cutover
Whole-system qualification, migration rehearsal, mobile/accessibility/scale/security/recovery proof, founder-controlled production gates.

No stage is skipped because a downstream feature is visually ready.

---

## 8. S0 — Production Stabilization & Recovery Gate

### S0 objective
Stop known security/data-integrity exposure, establish actual live-state truth, and make future migrations reproducible before continuing broad implementation.

### S0-001 — Live schema manifest
Produce read-only production manifest of applied migrations, RLS policies, function definitions, function grants, table grants, storage policies, critical constraints/indexes/triggers, PostgREST API row limit, and current deployment SHA. Compare to repository. Differences become explicit remediation, not assumptions.

### S0-002 — Recovery/PITR preservation
Immediately establish available PITR/backup window and recovery evidence for historically destructive deletes. Do not claim historical recovery unless tested/recoverable evidence exists.

### S0-003 — Membership creation/authorization hardening
Verify and close any production path allowing unauthorized membership self-insert, self-approval, suspended/exited privileges, or status-agnostic helper behavior.

### S0-004 — Active-subject helper baseline
Create one qualified active-membership authorization primitive and migrate critical helpers/policies to it without weakening F3.

### S0-005 — Position/group integrity
`position_assignments.membership_id`, position group, target group, and permission evaluation must be tenant-consistent. No cross-tenant position-based privilege injection.

### S0-006 — Join-code / proxy-claim hardening
Any anonymous/authenticated helper capable of membership or identity mutation must have explicit authorization, pinned search path, minimum grants, rate/attempt handling where applicable, and token binding for proxy claims.

### S0-007 — Sensitive function grants
Review every SECURITY DEFINER function. `PUBLIC`/`anon` execute is denied by default unless explicitly required and independently safe.

### S0-008 — Notification outbound lockdown
No ordinary authenticated user may enqueue arbitrary provider-bound outbound content. Email/SMS/WhatsApp recipient guards must not be bypassable via literal recipient or unverified self-assigned phone state.

### S0-009 — Fine/loan/attendance immediate authorization hardening
Until domain commands are rebuilt, legacy direct-write RLS must prevent self-waiver, forged loan state, attendance-for-another-member, and cross-tenant foreign references.

### S0-010 — Storage truth
Verify production storage remains private/group-scoped. Fix any write/delete parser NULL-fallback or signed-URL persistence defects without regressing currently-correct read privacy.

### S0-011 — Service-worker tenant/cache safety
Authenticated API/dashboard/Supabase responses may not live in a global cross-user cache without user/tenant partitioning, expiry, revocation behavior, and sign-out purge. Simplest acceptable v1 default: do not cache authenticated business responses in the service worker.

### S0-012 — Destructive-delete stop
Membership, event, election, Relief, Njangi, minutes, financial, and governing-record workflows must not destroy consequential evidence through normal hard delete. Introduce soft-exit/archive protections and migration-safe compatibility.

### S0-013 — PR #70 requalification
Correct the invalid database timezone-check mechanism, prove active-membership enforcement, compile/type-check the exact branch, execute the migration in disposable PostgreSQL, and run active/pending/suspended/exited/archived access cases.

### S0-014 — F3 deployability requalification
Verify every F0/F3 migration against the production extension/schema layout. Any function-name/schema mismatch must be corrected in a bounded compatibility migration or qualified migration revision before production application.

### S0 exit gate
No verified P0 remains open. Every verified P1 either is remediated or has a founder-approved compensating control and dated release block. Production/live manifest is preserved as evidence.

---

## 9. M2 — Notification Policy Foundation

### M2-001 — Preserve qualified pure policy semantics
Keep anchor-qualified occurrence identity, multiple relative triggers, repeat cadence with bounded occurrence count, stop-after, stop-when-resolved, invalid-policy fail closed, IANA timezone validation, quiet-hours `DEFER_UNTIL`, reschedule supersession, and member channel opt-out intersection.

### M2-002 — Precedence
Initial v1 precedence remains `system legacy-compatible default → group/domain policy → object override`.

Hierarchy initially provides organization templates that groups/units explicitly adopt. Do not introduce automatic deep hierarchy inheritance until real use requires it.

### M2-003 — Persisted policy configuration
Use normalized/constraint-backed policy and trigger records. Configuration is separate from occurrence/delivery evidence.

### M2-004 — Occurrence persistence
Occurrence identity includes group, domain, object, canonical anchor/generation, trigger offset, and occurrence index. Old unsent occurrences become superseded after reschedule; sent history is immutable.

### M2-005 — Legacy parity
No saved policy must preserve current behavior: Payment legacy overdue-daily behavior, Hosting one 7-day notice, Events one 48-hour notice. No surprise fan-out.

### M2-006 — No live wiring yet
M2 completion does not itself activate payment/hosting/event producers. Domain migration remains M11.

---

## 10. M3 — Complete F3 Financial Operating System

### F3-06 — Financial configuration UI
Build Accounts, Funds, and Categories management.

Requirements: finances.manage server authorization; explicit currency/class lifecycle rules; archive, not delete, referenced dimensions; default fund rules; account close preflight; EN/FR; mobile acceptance; tenant-bound route/context; no stale tenant form submission; audit evidence.

### F3-07 — Record Transaction UX
Treasurer-facing commands: Money In, Money Out, Transfer.

Requirements: exact decimal strings; stable request identity persisted across uncertain response/retry; account/fund/category validation; same-group refs only; no JS float as accounting authority; success only after authoritative commit/result; lost-response recovery; mobile-safe forms; no module event masquerading as generic manual finance.

Opening cash entry remains hidden until D-007 is implemented.

### F3-08 — True Financial Reports UI
Expose canonical projections: Financial Overview / Health, Account Balances, Fund Cash, Fund Net Position, Statement of Activity, Cash Movement, Cashbook/Register.

Every report displays scope, period/as-of time, native currency, currency bucket behavior, source/observation state, correction treatment, and opening-position treatment.

Dashboard, Board Packet, Meeting Pack, exports, and AI must not use contribution-only shorthand as organization-wide financial truth after their migration phase.

### F3-09 — Acceptance
Prove authorization, concurrency, idempotency/replay, correction chains, historical epochs, account/fund archival, opening cash, reporting reconciliation, 5,000-member scale path where applicable, mobile completion, exports, no cross-tenant references, and disposable migration rehearsal.

---

## 11. M4 — Organization Hierarchy 2.0

### H-001 — Data model
Create `organization_units`, effective-dated parent history, current closure projection, scoped organization grants, and organization-person identity foundation. A unit may reference one operational `group_id` or be aggregate-only.

### H-002 — Invariants
One root per organization; one current parent per non-root unit; same-organization edges only; no cycles; bounded depth initially 32; audited/authorized subtree moves; archive preserves history.

### H-003 — Supported topologies
Standalone Group; National HQ → Branches; Global Organization → Country → Region → Chapter → Branch. No mandatory geographic ladder.

### H-004 — Scope modes
Permissions/reporting use this unit, this unit + descendants, or entire organization. Capability is explicit; ancestor title alone grants nothing.

### H-005 — Aggregate-only units
Aggregate nodes may own reporting/governance scope but may not transact unless an operational financial owner is named.

### H-006 — Multi-group identity
One login can belong to multiple independent groups/organizations. Those memberships remain independent entitlements.

### H-007 — Route-authoritative tenant context
Business-operation routes must carry authoritative tenant/unit scope. localStorage stores only a default preference for unscoped entry. Tab A and Tab B may safely remain on different groups.

### H-008 — Tenant-generation guard
Forms and async results bind to the tenant generation/scope they were opened under. Switching group invalidates or safely discards tenant-bound drafts and prevents stale submission.

### H-009 — Hierarchy UX
Persistent UI must tell the user organization, current operational unit, current viewing scope, and action scope.

Examples: “Douala Branch · This unit”, “Cameroon · Entire subtree”, “Global Organization · Aggregate view”.

---

## 12. M5 — F4 Contributions & Dues → Canonical Ledger

### F4-001 — Preserve operational dues model
Keep contribution types, obligations, payments, payment applications, confirmed-basis logic, waivers, and member statements.

### F4-002 — Economic events
One authoritative dues workflow commits/derives assessment recognition, receivable, confirmed cash settlement, waiver/reversal, refund/credit, and allocation/reconciliation.

### F4-003 — Pending is not confirmed
Pending/rejected member submissions create no confirmed custody effect.

### F4-004 — Overpayment
Unapplied refundable amount is a liability/member credit until explicitly recognized/refunded.

### F4-005 — Idempotency across sessions
Do not rely on sessionStorage/memory for durable economic request identity. Server-side occurrence/request identity must prevent second economic effect across tabs/sessions.

### F4-006 — No double posting
A Relief-tagged or other module-owned payment routes to the owning domain adapter and is not also ordinary dues income.

---

## 13. M6 — F5 Module Financial Commands & Adapters

Every module adapter resolves `source occurrence → economic owner → group/epoch/currency → canonical postings → correction lineage`.

Do not expose arbitrary caller-defined postings.

Required modules: Relief, Njangi, Loans, Fines, Projects, Reimbursements, Bank fees, Inter-unit settlements.

Minimum authoritative commands are part of M6 where today's module browser writes are not safe enough to feed the canonical ledger.

Inter-unit transfers/remittances never become fake income/expense solely because money moved between units.

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
Submitted/reviewing/approved/denied/withdrawn/paid or equivalent lifecycle must have authoritative transitions, actor roles, version checks, and immutable decision history.

### R-006 — Payout command
One idempotent payout command validates claim state, approved amount, owner/custody/fund, and writes operational + financial result atomically or via transactional outbox. No duplicate payout per economic occurrence.

### R-007 — Remittance maker/checker
Submission and confirmation/dispute authorities are distinct. Sender cannot self-confirm merely by being a branch admin.

### R-008 — Correct branch rollup
Pre-aggregate enrollments, payments, and remittances at their own grain before joining. Never repair fanout with `SUM(DISTINCT amount)`.

### R-009 — Relief accounting
For branch-as-agent collection: collecting branch records custody + liability to owner; owner records receivable from collector + restricted contribution recognition under D-002/D-001; remittance settles reciprocal balances; consolidation eliminates reciprocal internal balances.

### R-010 — Sensitive detail
Hierarchy/global visibility defaults to aggregate financial/participation reporting. Claim details require separate permission.

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
Sequential remains supported. Random draw must be authoritative/persisted/audited. Auction stays unavailable unless a complete qualified auction workflow is explicitly built.

### N-009 — Scope
Local by default. Cross-branch circles require explicit person identity, participation, custody owner, currency, and scoped permissions.

---

## 16. M9 — Elections 2.0

### E-001 — Preserve ballot split
Keep separate voter participation receipt and anonymous ballot choice stores.

### E-002 — Active eligibility
Voting requires an eligible active person/membership under the frozen election rules.

### E-003 — Frozen electorate
At election opening: resolve participating hierarchy units using topology version; select eligible active memberships; deduplicate by verified organization-person identity; snapshot eligibility evidence and constituency; freeze candidates/options/timing/rule version.

One person receives one electorate entry even with multiple memberships.

### E-004 — Transfers after opening
Branch transfer after opening does not grant another vote or silently alter the frozen electorate.

### E-005 — Candidate/position integrity
Candidate, qualifying membership/person, position, and election scope must be same authorized organization/unit scope.

### E-006 — Lifecycle
Draft/open/closed/cancelled/reopen/finalize transitions are server-authoritative and audited. Candidate/option mutation after opening is prohibited except through an explicitly governed correction/cancellation process.

### E-007 — Anonymity metadata
Do not store accessible precise ballot/receipt metadata that trivially correlates voter identity to ballot choice. Marketing/UI claims match D-004.

### E-008 — Result visibility
No unauthorized live tally. Cancelled elections do not automatically expose partial vote detail. Results are published through explicit authorized transition.

### E-009 — Evidence retention
Closing/deleting an election may not destroy ballot and participation evidence required for audit/history.

### E-010 — Hierarchy
Support branch, regional, national, and global elections by explicit election scope/electorate snapshot—not by automatically querying all descendant memberships at vote time.

---

## 17. M10 — Records, Governance & Reporting

### G-001 — Minutes lifecycle
Support Private Draft, Shared Provisional/Working Minutes (optional read-only member visibility), Published/Approved Minutes, and Amendment/Supersession/Withdrawal history. Published official content is not silently overwritten in place.

### G-002 — Minutes retention
Archiving/removing a calendar event does not cascade-delete official minutes.

### G-003 — Governing documents
Stable document identity + revision identity. Constitution v1 and Bylaws v1 never conflict merely because both are version 1. Publication must be atomic: failure leaves the previous official revision available.

### G-004 — Acknowledgment
Acknowledgment binds person/membership, exact document revision, tenant, actor/device context as appropriate, and timestamp. Receipt acknowledgment is distinct from approval voting.

### G-005 — Attachments
Store durable object keys, not short-lived signed URLs as permanent record truth. Authorize parent record before signing at read time.

### G-006 — Attendance commands
Separate self check-in, officer mark/correction, bulk correction, and finalization. Enforce same-group membership, active status, cancellation state, server time, and event window.

### G-007 — Attendance evidence
Preserve original check-in evidence and subsequent corrections. “Not recorded” and “absent” are distinct. Stale bulk screens cannot silently overwrite later QR/self check-ins.

### G-008 — Standing model
Maintain calculated standing, manual standing decision/override, and effective standing. Manual decision contains actor, reason, effective time, expiry/indefinite rule, and revocation history. Automatic recalculation respects active override and may not silently unban/overwrite it. Use one authoritative standing engine/rule version.

### G-009 — Retention schedule
Define explicit product retention classes for official minutes/governing records, financial/correction history, attendance/standing decisions, elections, Relief/Njangi operational evidence, profiles/personal data, attachments, notifications/logs, and offline copies. No product promise of a fixed legal retention period is made until separately approved.

### G-010 — Member transparency
Independent group settings may enable continuous read-only member access to published/provisional minutes according to state and authorized current financial summaries. Financial transparency shows posted/confirmed state, currency, scope, period, updated-at, and keeps another member's private obligations/loans/claims/payment evidence private.

### G-011 — Authoritative report observation
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

Each domain must prove current-default parity, configurable schedules, stable occurrence identity, no duplicate delivery, resolution/stop conditions, reschedule supersession, member preferences, quiet-hour defer, tenant-safe audience resolution, delivery evidence, and no false sent/delivered language.

Announcement Build 8 remains dormant until its entire atomic cutover is qualified, including queue producer, drain, webhook reconciliation, direct-dispatch retirement, evidence rollup, batching, provider-policy behavior, and rollback.

---

## 19. Cross-cutting UI/UX requirements

### UX-001 — No dead controls
Every visible actionable control must be functional, explicitly disabled with reason, or intentionally preview-only and labeled. No dead button, placeholder action, silent handler, or phantom feature is accepted.

### UX-002 — Correct success semantics
Do not close dialogs, show success, send notification, or write audit success until authoritative persistence succeeds.

### UX-003 — Failure experience
Every consequential operation shows a user-actionable error and a support-safe reference/code where useful.

### UX-004 — Tenant/scope visibility
Operational screens show current group/unit/scope when ambiguity is possible.

### UX-005 — Navigation coherence
The product should read as one system, with consistent terminology and information architecture across Finance, Contributions, Relief, Njangi, Elections, Meetings, Documents, Membership, and Enterprise.

### UX-006 — Loading/empty/error distinction
Query errors must not be silently converted into empty state for critical data.

### UX-007 — Destructive action
Destructive/corrective operations require clear scope, consequence, authorization, and recovery model.

### UX-008 — EN/FR parity
Every critical workflow has key parity and user-reviewed natural language in EN/FR.

### UX-009 — Accessibility
Critical flows support keyboard, visible focus, correct modal focus return, labeled controls/errors, status beyond color, appropriate touch target, zoom/text growth, and both themes.

---

## 20. Mobile / Capacitor readiness

### MOB-001 — Required viewport matrix
Critical workflows must complete at 320px, 360px, 375px, 390px, 430px, tablet, and desktop in EN/FR and light/dark.

### MOB-002 — Software keyboard
Primary submit/action controls remain accessible with keyboard open.

### MOB-003 — Platform adapter boundary
Before Capacitor packaging, isolate platform-specific behavior for OAuth/system browser, deep links/app links/universal links, file download/share, clipboard, camera/file picker, connectivity, app lifecycle, push, and secure token/session handling.

### MOB-004 — Resume sequence
On app resume: validate session; preserve route tenant; refresh membership/permission authority; refresh critical balances/status/deadlines; reconnect realtime/subscriptions where used; resolve uncertain commands by idempotency identity.

### MOB-005 — Offline classifications
**MUST REQUIRE ONLINE:** voting, financial posting, payment confirmation, Relief approval/payout, Njangi payout/round transition, privilege changes, publication/standing override.

**SAFE CACHED READ:** explicitly authorized published minutes/documents/report snapshots with scope/staleness labels and retention controls.

**SAFE LOCAL DRAFT:** selected forms with clear “saved on this device” state and tenant binding.

**MUST NEVER BLINDLY QUEUE:** money, approvals, votes, roles, delete/correction commands.

### MOB-006 — Sign-out cleanup
Protected local/cache/native storage is removed or rendered unusable on sign-out according to policy.

### MOB-007 — Deep link authorization
A deep link may open specific payment, event, Relief claim, Njangi round, election, minutes, or announcement only after tenant/object authorization. Unauthorized response does not leak object existence.

---

## 21. Scale requirements

Acceptance fixtures must cover at minimum 5,000 members, 500 branches/units, 50,000 payments/financial rows, large Relief/Njangi histories, and national/global electorate scenarios.

Required design direction: server pagination/filtering; explicit server totals; no silent PostgREST row-cap truncation; no client full-table financial truth; no browser sequential fan-out for mass messaging; set-based audience resolution; server-side election tallies/aggregates; bounded/server-generated large exports where browser memory would mislead/fail; AI receives complete bounded authoritative observations, not silent truncation presented as full analysis.

Exact latency budgets are established per implementation slice and measured; this PRD does not invent achieved benchmarks.

---

## 22. Required security posture

### SEC-001
All critical RLS/helper authorization tests cover anon, unauthenticated, ordinary active member, pending member, suspended member, exited member, archived member, group officer/admin, dual-group user, and cross-tenant IDs.

### SEC-002
SECURITY DEFINER functions use pinned safe search path and explicit minimum grants.

### SEC-003
Legacy permissive policies are removed/replaced where their OR-combination weakens a newer policy.

### SEC-004
Cross-group foreign references use composite constraints, trigger validation, or authoritative commands so membership/account/fund/position/plan/object references cannot cross tenant boundaries.

### SEC-005
Audit logs for consequential security/governance actions are server-authored and cannot be forged by ordinary members.

---

## 23. Acceptance evidence model

Every PRD requirement implemented after freeze must have an evidence row with Requirement ID, exact implementation SHA/path, behavior invariant, test name/type, expected result, actual result, security evidence where relevant, tenant A/B evidence where relevant, data-integrity/concurrency evidence where relevant, mobile evidence for critical user workflows, production-readiness evidence for production changes, and status from CLAIMED / CODE / TESTED / INTEGRATED / DEPLOYED / PROD ENABLED / END-USER VERIFIED.

Source-text grep tests may be useful guardrails but cannot be the sole proof of behavioral/security claims.

---

## 24. Merge/release gates

For every production-bound slice:

1. Exact base/head SHA pinned.
2. Scope verified.
3. Required tests execute behavior, not only source strings.
4. TypeScript/build passes where applicable.
5. Security review passes.
6. Tenant isolation passes.
7. Data-integrity/concurrency tests pass where applicable.
8. EN/FR and mobile acceptance passes where applicable.
9. Migration rehearsed in disposable/representative database where applicable.
10. Production migration/deploy is separately founder-authorized.
11. Post-deploy read-only smoke and evidence capture complete.

No broad migration runner is authorized merely because a feature branch passes.

---

## 25. Post-build independent re-audit

When M0–M12 are believed complete, do not declare VillageClaq mature/finished from internal status reports alone.

Run two independent final defensive audits:

1. Kimi K3
2. Fable 5

Each receives the frozen PRD, exact release/deployment manifest, evidence matrix, known limitations, and safe test fixtures.

They must independently try to prove that claimed features do not work, financial results do not reconcile, controls are bypassable, tenant contamination exists, multi-group/multi-tab behavior fails, Relief/Njangi/Elections violate frozen rules, notifications misbehave, dead controls remain, mobile/Capacitor readiness is overstated, or production state differs from evidence.

Only evidence-backed P0/P1, legal/compliance, verified contradiction, critical platform incompatibility, or explicit founder change may reopen the frozen architecture. Other findings become backlog.

After both audits, Chief/Astra perform final acceptance reconciliation before founder-controlled production completion.

---

## 26. Definition of Done for VillageClaq Rebuild v1

VillageClaq Rebuild v1 is DONE only when all of the following are true:

1. S0 production stabilization exit gate passes.
2. M2 notification foundation is qualified.
3. F3-06 through F3-09 are complete and production-ready.
4. Organization Hierarchy 2.0 is qualified for standalone/direct-branch/deep hierarchy.
5. F4 Contributions & Dues feeds canonical financial truth without double counting.
6. F5 domain adapters/commands cover the committed module list.
7. Relief 2.0 meets workflow, accounting, hierarchy, privacy, and rollup invariants.
8. Njangi 2.0 meets immutable money/round/payout/fine invariants.
9. Elections 2.0 meets scope, eligibility, anonymity-promise, lifecycle, and electorate invariants.
10. Minutes/governing records/attendance/standing/retention meet M10 invariants.
11. Payment/Hosting/Event/Relief/Njangi/Elections notifications use the shared policy system.
12. Announcements either complete the qualified queue-backed cutover or remain honestly limited/dormant per founder release decision.
13. Critical workflows pass tenant-switch/two-tab tests.
14. Critical workflows pass 320–430px mobile EN/FR acceptance.
15. Capacitor readiness blockers are closed or explicitly documented as pre-wrapper gates.
16. Scale fixtures produce complete, non-truncated results.
17. No verified P0 remains open.
18. No verified P1 remains open without explicit founder-approved compensating control.
19. Kimi K3 final audit completes.
20. Fable 5 final audit completes.
21. Evidence-backed audit findings are reconciled.
22. Final production deployment/cutover is founder-authorized and verified.

---

## 27. Immediate continuation point

After this PRD is reviewed/frozen, the next implementation work is **S0 Production Stabilization & Recovery**, not F3-06 and not live notification rewiring.

The first tiny step is:

**S0-A — Read-only production truth snapshot + PITR/recovery-status verification.**

No remediation migration should be written until the live-state snapshot resolves the current repository/production drift claims.

After S0-A:

1. classify each claimed P0/P1 as CONFIRMED / NOT PRESENT / PARTIAL / CANNOT CONFIRM
2. implement only confirmed highest-blast-radius fixes in bounded cuts
3. requalify PR #70
4. requalify F3 migration deployability
5. pass S0 exit gate
6. continue M2 then M3 onward in this document

---

## 28. Safety boundaries retained

Until explicitly changed by founder approval:

- No real WhatsApp/email/SMS sends during QA.
- No reminder/receipt triggering during implementation tests.
- No production financial mutation without exact authorization.
- No broad migration apply.
- No Meta/WABA/provider/env changes without explicit authorization.
- Announcement Build 8 remains dormant until its dedicated atomic cutover.
- Agentic execution remains inert unless separately activated.
- F3 migrations remain unapplied until their production release gate.

---

## 29. Master status board

| Stage | Status |
|---|---|
| M0 Independent Audit | COMPLETE |
| M1 Master PRD | THIS DOCUMENT — FREEZE CANDIDATE |
| S0 Production Stabilization | NEXT |
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

**Build to this PRD, not around it.**

The rebuild is intended to finish VillageClaq into a coherent, secure, tenant-safe, financially reconcilable, mobile-ready, supportable mature SaaS product. Strong existing work is preserved. Weak boundaries are replaced deliberately. Every release is evidence-backed. The architecture stays stable unless the change-control rule is met.
