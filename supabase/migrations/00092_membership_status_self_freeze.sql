-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║ SUPERSEDED (2026-06-13) — DO NOT APPLY THIS MIGRATION.                ║
-- ║ Replaced by 00098_membership_status_lifecycle.sql, which contains a   ║
-- ║ hardened version of this trigger (the membership_status freeze runs   ║
-- ║ BEFORE the admin bypass, closing this file's documented suspended-    ║
-- ║ admin residual) PLUS the CHECK-constraint widening this file's own    ║
-- ║ SEQUENCING note required. 00092 was held while 00093–00097 were       ║
-- ║ applied; applying it now would interleave history and ship only half  ║
-- ║ the fix. Decision record: docs/membership-status-vocabulary.md.       ║
-- ║ Retained, unapplied, for historical reference only.                   ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- Close a privilege-escalation gap in the membership self-edit guard
-- (defense-in-depth; latent on current prod — see SEQUENCING below).
--
-- prevent_membership_self_escalation() (migration 00075) froze role,
-- standing, group_id, user_id, is_proxy, and proxy_manager_id on non-admin
-- self-edits — but NOT membership_status. Because the memberships UPDATE
-- RLS policy permits `user_id = auth.uid()` self-updates (00001), an
-- `exited` former admin/owner (their role is never cleared on exit) could
-- run `UPDATE memberships SET membership_status = 'active'` on their own
-- row: is_group_admin() excludes `exited` rows (00061), so the trigger
-- treated them as a non-admin self-editor, and with membership_status
-- unfrozen the update would succeed — reinstating them as an active admin.
--
-- This migration re-emits the trigger (verbatim from 00075) with
-- membership_status added to the freeze list, carving out self-exit
-- (leave-group) — the only legitimate self status change. Admin/owner
-- edits to OTHER members' rows and the transfer/suspend/archive RPCs edit
-- other users' rows (self explicitly blocked), so they hit the existing
-- OLD.user_id <> caller early-return and are unaffected. It touches no
-- rows, so it cannot fail on existing data.
--
-- SEQUENCING (important): the live memberships CHECK constraint currently
-- permits only ('active','pending_approval') — 00061's widening to add
-- 'exited' was never applied to prod. So today no 'exited' row can exist
-- and the attack above is NOT reachable, and self-exit (NEW='exited') is
-- itself rejected by the constraint. Apply this together with widening the
-- constraint to the full lifecycle set so guard and attack surface appear
-- at the same time. See src/MEMBERSHIP_STATUS_FREEZE_AUDIT.md.
--
-- CAVEAT: unsuspend_platform_user (00085) has no self-block; once the
-- constraint allows 'suspended', a non-group-admin self-unsuspend would be
-- blocked by the new freeze. KNOWN RESIDUAL (out of scope): a `suspended`
-- member still holding role owner/admin bypasses this freeze via the
-- is_group_admin admin path (which only excludes `exited`).

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
  -- Admin updates to other members' rows are governed by the existing
  -- rls_membership_role_guard policy.
  IF OLD.user_id IS DISTINCT FROM v_caller THEN
    RETURN NEW;
  END IF;

  v_is_admin := is_group_admin(OLD.group_id);

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Non-admin self-edit: freeze every privilege-bearing column.
  IF NEW.role           IS DISTINCT FROM OLD.role           THEN RAISE EXCEPTION 'role_change_requires_admin'           USING ERRCODE = '42501'; END IF;
  IF NEW.standing       IS DISTINCT FROM OLD.standing       THEN RAISE EXCEPTION 'standing_change_requires_admin'       USING ERRCODE = '42501'; END IF;
  IF NEW.group_id       IS DISTINCT FROM OLD.group_id       THEN RAISE EXCEPTION 'group_id_change_not_allowed'           USING ERRCODE = '42501'; END IF;
  IF NEW.user_id        IS DISTINCT FROM OLD.user_id        THEN RAISE EXCEPTION 'user_id_change_not_allowed'            USING ERRCODE = '42501'; END IF;
  IF NEW.is_proxy       IS DISTINCT FROM OLD.is_proxy       THEN RAISE EXCEPTION 'is_proxy_change_requires_admin'       USING ERRCODE = '42501'; END IF;
  IF NEW.proxy_manager_id IS DISTINCT FROM OLD.proxy_manager_id THEN RAISE EXCEPTION 'proxy_manager_change_requires_admin' USING ERRCODE = '42501'; END IF;

  -- Self-exit (leave-group) is the only permitted self status change.
  -- Re-activation / re-entry of an exited, suspended, or archived row, or
  -- any other status mutation, requires admin.
  IF NEW.membership_status IS DISTINCT FROM OLD.membership_status
     AND NEW.membership_status <> 'exited' THEN
    RAISE EXCEPTION 'membership_status_change_requires_admin' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_membership_self_escalation ON memberships;
CREATE TRIGGER prevent_membership_self_escalation
  BEFORE UPDATE ON memberships
  FOR EACH ROW EXECUTE FUNCTION prevent_membership_self_escalation();

NOTIFY pgrst, 'reload schema';
