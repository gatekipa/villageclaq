# membership_status — Official Vocabulary, Authorization, and Migration Decision

Date: 2026-06-13 · Status: **DECISION RECORD** (audit/test-enforced)
Pairs with: `supabase/migrations/00098_membership_status_lifecycle.sql`
(committed, NOT applied) · Supersedes the held
`00092_membership_status_self_freeze.sql` (never apply standalone).

## TL;DR

The live `memberships_membership_status_check` allows only
`('active','pending_approval')` (the 00058 constraint; 00061's widening was
never applied). That narrow set silently breaks three shipped flows —
leave-group, member-transfer completion, and platform suspend/archive — and
is the only thing making the 00075 trigger's `membership_status` freeze gap
unexploitable. The decision: widen the CHECK to the five-value vocabulary
the product already encodes, and ship the (hardened) self-edit freeze in the
SAME migration so the attack surface and its guard appear atomically.
`00092` is **superseded**, not applied and not rewritten.

## Official vocabulary (all five already encoded in product behavior — none invented)

| Value | Meaning | Set by | Evidence in code |
| --- | --- | --- | --- |
| `active` | Participating member; the default | System inserts (`accept_invitation` 00076/00095, `create_owner_membership`, `join_group_via_code` when no approval required, transfer destination 00082, `unsuspend_platform_user` 00085); admin approve (members page) and bulk auto-approve (settings page) | column default (00058) |
| `pending_approval` | Awaiting admin approval after join-by-code | System insert only (`join_group_via_code` when the group requires approval; self-insert RLS `memberships_insert_pending` 00076 pins exactly this value) | dashboard interstitial blocks these members |
| `exited` | Left the group or transferred out | **Member self** (leave-group, my-profile — the ONLY legitimate self status write) and `execute_member_transfer` (00082) on the source row | excluded from group switcher, auth-callback counts, `is_group_admin` (00061), cron contacts |
| `suspended` | Platform-staff suspension (reversible) | `suspend_platform_user` (00085) only — self-blocked (`cannot_suspend_self`) | written by 00085; producers skip non-active |
| `archived` | Platform-staff archival + anonymization (terminal) | `archive_platform_user` (00085) only — self-blocked (`cannot_archive_self`) | written by 00085 |

`"pending"` (seen in two test mocks) is NOT a status — it is a fixture
artifact standing in for "any non-active value"; the DB value is
`pending_approval`.

## What each value affects (inventory, 2026-06-13)

- **Reminders/notifications**: 10 of 12 WhatsApp producers skip
  non-`active` memberships (`membership_not_active`); the event /
  subscription / remittance producers resolve recipients with
  `.eq("membership_status","active")` at the DB. (Observations, pre-existing
  and out of scope here: the payment-receipt and standing-change producers
  do not gate on status; `fetchMemberDispatchContacts` — used by the cron
  email/SMS legs — excludes only `exited`, so `pending_approval` /
  `suspended` members can still receive cron email/SMS.)
- **Obligations/standing**: standing recalc (00079/00080) only processes
  `('active','pending_approval')` rows; auto-enroll happens on approve.
- **Rosters/visibility**: group switcher and both auth callbacks exclude
  `exited`; the dashboard hard-blocks `pending_approval` behind the
  approval interstitial; the members page excludes `pending_approval` from
  the main roster (other non-active statuses remain visible to admins).
- **Access/privileges**: `is_group_admin` / `is_group_member` (00061)
  exclude only `exited`. Tier seat counting (`use-subscription`, RPCs) uses
  `('active','pending_approval')`.

## What members can and cannot do to their own status

| Transition (own row) | Allowed? | Enforced by |
| --- | --- | --- |
| anything → `exited` (leave group / withdraw / self-transfer source) | YES — the single carve-out | 00098 trigger carve-out |
| `exited` → `active` (self-reinstatement) | NO | 00098 freeze (the 00075 gap this closes) |
| `suspended`/`archived` → anything (incl. by a still-role-admin member) | NO | 00098 freeze hoisted BEFORE the admin bypass |
| `pending_approval` → `active` (self-approval) | NO | 00098 freeze |
| Any status write by service role / crons / producers (`auth.uid()` NULL) | YES (unchanged) | trigger early-exit |
| Admin/staff status changes on OTHER members' rows (approve, suspend/archive/unsuspend RPCs, transfers) | YES (unchanged) | trigger early-exit on `OLD.user_id <> auth.uid()` + each RPC's own self-block |

**Why self-status manipulation is blocked**: `membership_status` gates
reminder eligibility, dues/standing enforcement, seat counting, and (via
`is_group_admin`'s `exited` exclusion) admin privileges. The memberships
UPDATE RLS policy (00001) permits `user_id = auth.uid()` self-updates, so
without the trigger freeze a member could self-set status to dodge dues
reminders/enforcement — and an `exited` ex-admin (role is never cleared)
could self-reinstate as an active admin.

## Interaction with RLS

- The memberships UPDATE self-edit policy stays as-is; the trigger is the
  guard on the post-image (same architecture as 00075).
- `memberships_insert_pending` (00076) — the only policy referencing
  `membership_status` — is untouched and unaffected (INSERT path; trigger is
  BEFORE UPDATE).
- Known residuals, documented NOT fixed here (each needs its own decision):
  `get_user_group_ids()` (00014) has no status filter, so non-active
  members retain RLS visibility into their groups; `is_group_admin`
  excludes only `exited`, so a `suspended` owner/admin can still administer
  OTHER members (their own status is now frozen). Widening those helper
  exclusions touches every RLS policy and is a separate follow-up.

## The 00092 decision (explicit)

**SUPERSEDED — Option C.** Not applied as-is (it ships only the guard, and
its own header says it must pair with the widening); not amended in place
(00092 was held while 00093–00097 were applied — re-editing a numbered,
already-merged migration to carry new semantics invites apply-order
confusion, and the repo convention is append-only numbered files); not
retired silently (the analysis it contains is correct and referenced).
Instead `00098_membership_status_lifecycle.sql` carries the widening AND a
hardened trigger; 00092 carries a DO-NOT-APPLY banner. The hardening delta
vs 00092: the status freeze runs **before** the `is_group_admin` bypass,
closing 00092's documented suspended-admin residual and the
`unsuspend_platform_user` missing-self-block caveat at the trigger layer.
(Also decisive for Option C: 00061 can no longer apply cleanly anyway — it
renames `is_group_admin_or_owner`'s input parameter, which
`CREATE OR REPLACE FUNCTION` rejects with 42P13.)

## Production migration sequence

1. Merge this PR (no runtime behavior depends on the migration).
2. Apply **only** `00098_membership_status_lifecycle.sql` in the Supabase
   SQL Editor (preflight aborts if any row is outside the five-value set;
   verified 0 on 2026-06-13 — 168 rows, all `active`).
3. Run the verification queries in the migration header, then the manual
   matrix: non-admin self status change → 42501; leave-group → succeeds;
   admin approve of a pending member → succeeds.
4. Never apply 00092.

Rollback notes live in the 00098 header (narrow-CHECK restore guarded by a
row check + 00075 function re-emit).

## Guardrails (tests)

`scripts/test-membership-status.mjs` (run via
`npm run test:membership-status`) enforces: the official vocabulary is the
only set of status literals referenced under `src/`; 00098 contains the
preflight, all five CHECK values, the hoisted freeze, and the carve-out;
00092 carries its SUPERSEDED banner; the leave-group flow writes only
`exited`; the approve flows write only `active`; and the client TS union
matches the vocabulary.
