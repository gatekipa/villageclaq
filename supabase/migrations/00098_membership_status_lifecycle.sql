-- ============================================================================
-- membership_status lifecycle: CHECK widening + hardened self-edit freeze
-- ============================================================================
-- SUPERSEDES 00092_membership_status_self_freeze.sql — DO NOT APPLY 00092
-- (alone or at all). This migration contains everything 00092 did, hardened,
-- PLUS the constraint widening 00092's own header said it must be paired
-- with. 00092 was held while 00093–00097 were applied; applying it now would
-- interleave history and still ship only half the fix. Decision record:
-- docs/membership-status-vocabulary.md.
--
-- WHAT THIS FIXES
--   The live CHECK constraint (00058) only allows
--   ('active','pending_approval'). 00061's widening to add 'exited' was
--   never applied to prod (and would no longer apply cleanly — it also
--   renames is_group_admin_or_owner's input parameter, which CREATE OR
--   REPLACE rejects with 42P13). Under the narrow constraint, three shipped
--   product flows FAIL at runtime today:
--     1. Leave-group (my-profile writes membership_status='exited')
--     2. Member transfers (00082 execute_member_transfer writes 'exited'
--        on the source row — every transfer completion errors)
--     3. Platform suspend/archive (00085 RPCs write 'suspended'/'archived';
--        unsuspend silently no-ops because no 'suspended' row can exist)
--
-- WHAT THIS PROTECTS
--   Widening the constraint also makes the 00075 trigger gap exploitable:
--   prevent_membership_self_escalation() freezes role/standing/group_id/
--   user_id/is_proxy/proxy_manager_id on non-admin self-edits but NOT
--   membership_status, and the memberships UPDATE RLS policy (00001)
--   permits user_id = auth.uid() self-updates. An 'exited' ex-admin (role
--   is never cleared on exit; is_group_admin excludes 'exited' rows) could
--   self-set 'active' and be reinstated. So the widening and the freeze
--   ship TOGETHER, atomically, in this one file.
--
--   HARDENING BEYOND 00092: the membership_status freeze here applies to
--   ALL self-edits — including callers who pass is_group_admin() — by
--   running BEFORE the admin bypass. 00092 placed it after, leaving its
--   documented residual: a 'suspended' member still holding owner/admin
--   role takes the admin bypass (is_group_admin only excludes 'exited')
--   and could self-reactivate. With the check hoisted, suspended/archived
--   owners cannot self-reactivate either, and the 00085
--   unsuspend_platform_user missing-self-block caveat is closed at the
--   trigger layer (a self-targeted unsuspend raises and rolls back; the
--   normal staff flow targets OTHER users' rows and early-returns).
--   The ONLY self status change permitted, for anyone, is -> 'exited'
--   (leave-group / pending withdraw / self-transfer-out source row).
--
-- OFFICIAL VOCABULARY (decision: docs/membership-status-vocabulary.md)
--   active           - participating member (default)
--   pending_approval - awaiting admin approval after join-by-code
--   exited           - left/transferred out (the only self-settable value)
--   suspended        - platform-staff suspension (00085, reversible)
--   archived         - platform-staff archival/anonymization (00085, terminal)
--
-- SAFETY
--   - Preflight aborts if any row holds a value outside the five-value set
--     (verified 0 on prod, 2026-06-13: 168 rows, all 'active').
--   - The CHECK swap touches no rows; the new set is a strict superset of
--     the old one, so existing rows cannot fail validation.
--   - The trigger function replacement touches no rows.
--   - Service-role / background writes (auth.uid() IS NULL) bypass the
--     trigger entirely — crons, producers, and webhooks are unaffected.
--
-- VERIFICATION (run after applying; see also the doc's test matrix)
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conname = 'memberships_membership_status_check';
--     -- expect all five values
--   SELECT prosrc LIKE '%membership_status%' FROM pg_proc
--     WHERE proname = 'prevent_membership_self_escalation';
--     -- expect t
--   -- As a non-admin member session: UPDATE own row SET
--   --   membership_status='active' (from 'exited' fixture) -> expect
--   --   SQLSTATE 42501 membership_status_change_requires_admin.
--   -- As a member session: leave-group (-> 'exited') -> expect success.
--   -- As an admin session: approve a pending member (-> 'active') on the
--   --   OTHER member's row -> expect success.
--
-- ROLLBACK
--   -- 1. Restore the narrow CHECK (ONLY safe while no row holds a new
--   --    value; check first):
--   --      SELECT count(*) FROM memberships
--   --        WHERE membership_status NOT IN ('active','pending_approval');
--   --      ALTER TABLE memberships
--   --        DROP CONSTRAINT memberships_membership_status_check;
--   --      ALTER TABLE memberships
--   --        ADD CONSTRAINT memberships_membership_status_check
--   --        CHECK (membership_status IN ('active','pending_approval'));
--   -- 2. Restore the 00075 trigger function (re-run 00075's CREATE OR
--   --    REPLACE FUNCTION block verbatim). The trigger object itself is
--   --    unchanged in name/timing, so no trigger DDL is needed.
--   -- Rolling back re-breaks leave-group/transfers/suspend and re-opens
--   -- nothing (the freeze is strictly additive protection).

-- ── Preflight: every existing row must already satisfy the new set ─────────
DO $$
DECLARE
  v_bad integer;
BEGIN
  SELECT count(*) INTO v_bad
  FROM public.memberships
  WHERE membership_status NOT IN
    ('active', 'pending_approval', 'exited', 'suspended', 'archived');
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'preflight failed: % membership rows hold a status outside the official vocabulary — resolve before applying',
      v_bad;
  END IF;
END;
$$;

-- ── 1. Widen the CHECK constraint to the official five-value vocabulary ────
-- 168 rows at authoring time; validation is instantaneous. The new set is a
-- strict superset of the old, so no existing row can fail.
ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_membership_status_check;

ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_membership_status_check
  CHECK (membership_status IN
    ('active', 'pending_approval', 'exited', 'suspended', 'archived'));

-- ── 2. Hardened self-edit freeze (supersedes 00092's version) ──────────────
-- Body is 00075's verbatim, with the membership_status clause added AND
-- hoisted ABOVE the admin bypass (the one deliberate difference from 00092
-- — see HARDENING note in the header).
CREATE OR REPLACE FUNCTION public.prevent_membership_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean;
BEGIN
  -- Skip entirely for service-role / background writes (auth.uid() is NULL).
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only intervene when the caller is editing their OWN membership row.
  -- Admin updates to other members' rows (approve, suspend RPCs, transfers)
  -- are governed by the existing rls_membership_role_guard policy and the
  -- RPCs' own self-blocks.
  IF OLD.user_id IS DISTINCT FROM v_caller THEN
    RETURN NEW;
  END IF;

  -- membership_status is frozen on ALL self-edits — admins included — with
  -- self-exit as the only carve-out. Runs BEFORE the admin bypass so a
  -- suspended/archived owner-admin cannot self-reactivate through
  -- is_group_admin() (which excludes only 'exited'), and a self-targeted
  -- unsuspend_platform_user call rolls back here.
  IF NEW.membership_status IS DISTINCT FROM OLD.membership_status
     AND NEW.membership_status <> 'exited' THEN
    RAISE EXCEPTION 'membership_status_change_requires_admin' USING ERRCODE = '42501';
  END IF;

  v_is_admin := is_group_admin(OLD.group_id);

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Non-admin self-edit: freeze every other privilege-bearing column.
  IF NEW.role           IS DISTINCT FROM OLD.role           THEN RAISE EXCEPTION 'role_change_requires_admin'           USING ERRCODE = '42501'; END IF;
  IF NEW.standing       IS DISTINCT FROM OLD.standing       THEN RAISE EXCEPTION 'standing_change_requires_admin'       USING ERRCODE = '42501'; END IF;
  IF NEW.group_id       IS DISTINCT FROM OLD.group_id       THEN RAISE EXCEPTION 'group_id_change_not_allowed'           USING ERRCODE = '42501'; END IF;
  IF NEW.user_id        IS DISTINCT FROM OLD.user_id        THEN RAISE EXCEPTION 'user_id_change_not_allowed'            USING ERRCODE = '42501'; END IF;
  IF NEW.is_proxy       IS DISTINCT FROM OLD.is_proxy       THEN RAISE EXCEPTION 'is_proxy_change_requires_admin'       USING ERRCODE = '42501'; END IF;
  IF NEW.proxy_manager_id IS DISTINCT FROM OLD.proxy_manager_id THEN RAISE EXCEPTION 'proxy_manager_change_requires_admin' USING ERRCODE = '42501'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_membership_self_escalation ON memberships;
CREATE TRIGGER prevent_membership_self_escalation
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION prevent_membership_self_escalation();

NOTIFY pgrst, 'reload schema';
