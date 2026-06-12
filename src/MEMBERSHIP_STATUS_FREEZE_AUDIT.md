# membership_status Self-Edit Freeze Audit

Date: 2026-06-11 · Migration: `supabase/migrations/00092_membership_status_self_freeze.sql`

> **OUTCOME (2026-06-13):** 00092 is **SUPERSEDED by
> `00098_membership_status_lifecycle.sql`** and must never be applied. 00098
> ships the CHECK widening this audit's "Recommended sequencing" required,
> together with a HARDENED version of the trigger: the `membership_status`
> freeze runs **before** the `is_group_admin` bypass, which closes both this
> audit's "Known residual" (a `suspended` owner/admin self-reactivating via
> the admin path) and the `unsuspend_platform_user` self-block caveat (a
> self-targeted unsuspend now raises 42501 and rolls back; staff unsuspends
> of OTHER users early-return unchanged). Full decision record, vocabulary,
> and authorization matrix: `docs/membership-status-vocabulary.md`. The
> analysis below remains accurate as of its date and is retained as the
> source record.

## TL;DR

`prevent_membership_self_escalation()` (migration `00075`) freezes privilege
columns on non-admin self-edits but **omits `membership_status`**. This migration
adds it (carving out self-exit). The gap is a real trigger-logic hole and the fix
is correct **defense-in-depth**, but it is **latent on current production**: the
live `membership_status` CHECK constraint only permits `active`/`pending_approval`
(verified — see below), so the headline attack (an `exited` ex-admin
self-reinstating) cannot occur until that constraint is widened to allow `exited`
(which migration `00061` intended but which was **never applied to prod**). This
migration should be sequenced with that constraint widening.

## The trigger gap

For **non-admin self-edits** (`OLD.user_id = auth.uid()` and the caller is not a
group admin), `prevent_membership_self_escalation()` freezes `role`, `standing`,
`group_id`, `user_id`, `is_proxy`, `proxy_manager_id`. **`membership_status` is
absent.** The memberships UPDATE RLS policy (`00001`) permits
`user_id = auth.uid()` self-updates, so the trigger is the only guard on the
post-update row.

## The attack (latent — see live-schema note)

A member's `role` is **not** cleared when they leave/are transferred out — only
`membership_status` becomes `'exited'`. `is_group_admin()` (`00061`) excludes
`exited` rows, so an exited former admin is treated by the trigger as a non-admin
self-editor. With `membership_status` unfrozen they could run
`UPDATE memberships SET membership_status='active' WHERE id=<own row>`, which would
pass RLS, fall through the freeze block (which never checked status), and reinstate
them as an active admin.

**Why it is latent today:** an `exited` row must exist first, and the live CHECK
constraint forbids `exited` (next section), so this is currently un-exploitable on
prod. It becomes live the moment the constraint is widened.

## Live-schema reality (verified read-only, 2026-06-11)

- `memberships_membership_status_check` on prod is:
  `CHECK (membership_status IN ('active','pending_approval'))` — **only two
  values; no `exited`/`suspended`/`archived`.** This is the `00058` constraint;
  `00061`'s intended widening to add `exited` was never applied to prod.
- 165 membership rows, all `active`.

Consequences of this state (all pre-existing, independent of this migration):
- The exited-admin attack is **not reachable** until the constraint is widened.
- **Leave-group is already broken on prod**: `my-profile/page.tsx` sets
  `membership_status='exited'`, which the live constraint rejects. The `00092`
  self-exit carve-out (`NEW.membership_status <> 'exited'`) is therefore inert
  until the constraint allows `exited`.
- The `00085` platform RPCs that write `'suspended'`/`'archived'` would also fail
  the live constraint — so platform suspend/archive is currently non-functional
  on prod too.

**Recommended sequencing:** widen the constraint to the full lifecycle set
(`active`, `pending_approval`, `exited`, `suspended`, `archived`) and apply `00092`
together, so the attack surface and the guard come into existence at the same time.
The constraint widening itself is intentionally **not** included here (it is a
separate, broader change outside this PR's stated scope).

## The fix

Re-emit the trigger (verbatim from `00075`, verified line-for-line against the live
function definition) with one added check, carving out self-exit:

```sql
IF NEW.membership_status IS DISTINCT FROM OLD.membership_status
   AND NEW.membership_status <> 'exited' THEN
  RAISE EXCEPTION 'membership_status_change_requires_admin' USING ERRCODE = '42501';
END IF;
```

`NEW <> 'exited'` keeps the only legitimate self status write (leave-group, and a
`pending_approval` member withdrawing) while blocking every re-entry/escalation
(`exited→active`, `suspended→active`, `archived→active`, `→pending_approval`). The
`active→exited→active` round-trip is closed: the second leg is `NEW='active' <>
'exited'` → blocked.

## Preserved flows

- **Self leave-group** (`active → exited`, `my-profile/page.tsx`): allowed by the
  carve-out (once the constraint permits `exited`).
- **Admin approve** (`members/page.tsx`) and **bulk auto-approve**
  (`settings/page.tsx`): edit OTHER members' rows → trigger early-returns.
- **SECURITY DEFINER RPCs** — `execute_member_transfer` (`00082`),
  `suspend_platform_user` / `archive_platform_user` (`00085`): edit OTHER users'
  rows and explicitly block self (`cannot_suspend_self` / `cannot_archive_self`),
  so `auth.uid()` (preserved inside `SECURITY DEFINER`) ≠ `OLD.user_id` →
  early-return.
- **Approval/join/owner-bootstrap**: `INSERT`s; the trigger is `BEFORE UPDATE`.

### Caveat: `unsuspend_platform_user` has NO self-block

Unlike suspend/archive, `unsuspend_platform_user` (`00085`) does **not** block the
caller from targeting their own row (verified on the live definition). If the
constraint is later widened to allow `suspended` AND a **non-group-admin** platform
staffer self-unsuspends (`suspended → active` on their own row), the new freeze
would `RAISE` and roll the RPC back. (A `suspended` member who still holds group
owner/admin takes the trigger's admin bypass — `is_group_admin` only excludes
`exited` — so they are unaffected.) Not reachable on current prod, but flag it: if
self-unsuspend is a desired flow, add a self-block to that RPC or exempt it.

## Known residual (out of scope — separate follow-up)

A `suspended` member still holding `role` owner/admin is treated as admin by
`is_group_admin()` (which only excludes `exited`), so they take the admin bypass
and this freeze does not apply — they could self-reactivate `suspended → active`.
Closing that requires `is_group_admin` / `_or_owner` / `is_group_owner` to also
exclude `suspended`/`archived`, a broad change touching every RLS policy.

## Manual verification (no automated SQL test harness exists)

After widening the constraint, in the SQL Editor as an `exited` ex-admin session:
1. `UPDATE memberships SET membership_status='active' WHERE id=<own>` → expect
   `membership_status_change_requires_admin` (SQLSTATE 42501).
2. Leave-group `active → exited` on own row → succeeds.
3. An admin approving a pending member (`→ active`) → succeeds.
