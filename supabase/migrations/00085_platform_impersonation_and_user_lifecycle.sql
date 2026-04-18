-- 00085: Platform-admin impersonation + user lifecycle + last-super-admin guard
-- ---------------------------------------------------------------------------
-- Closes the P0/P1 gaps from commit 266b1e9's platform-admin audit:
--   P0 impersonation — dead buttons, no route, no audit trail.
--   P0 user suspend/delete — dropdown actions were onClick={() => {}}.
--   P1 session termination on staff suspension — JWT stayed valid ~1h.
--   P1 last-super-admin guard — lone super admin could lock themselves out.
--
-- Changes in this migration:
--   1. platform_impersonation_sessions table + RLS + partial index.
--   2. SECURITY DEFINER RPCs:
--        - start_impersonation(p_target_user_id, p_reason, p_ticket_id)
--        - end_impersonation(p_session_id)
--        - expire_stale_impersonations() — called by /api/cron/*
--        - suspend_platform_user / unsuspend_platform_user / archive_platform_user
--   3. Trigger on platform_staff preventing DELETE or DEMOTE of the last
--      active super_admin.
--
-- INTENTIONAL EXCEPTION — platform_audit_logs has a NOT NULL staff_id
-- column. Every audit insert from these RPCs resolves the caller's
-- platform_staff.id first; if the caller isn't a staff member (which
-- shouldn't happen because the API routes are gated), the RPC
-- returns 'not_authorized' before the insert.

-- ---------------------------------------------------------------------------
-- 1. platform_impersonation_sessions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_impersonation_sessions (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  impersonator_id      uuid NOT NULL REFERENCES auth.users(id),
  impersonated_user_id uuid NOT NULL REFERENCES auth.users(id),
  support_ticket_id    uuid REFERENCES public.contact_enquiries(id),
  started_at           timestamptz NOT NULL DEFAULT now(),
  ended_at             timestamptz,
  reason               text NOT NULL,
  ended_reason         text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Super admins see every session. Support agents see only their own.
DROP POLICY IF EXISTS "super_admins_see_all" ON public.platform_impersonation_sessions;
CREATE POLICY "super_admins_see_all"
  ON public.platform_impersonation_sessions FOR SELECT
  TO authenticated
  USING (is_platform_super_admin(auth.uid()));

DROP POLICY IF EXISTS "support_sees_own" ON public.platform_impersonation_sessions;
CREATE POLICY "support_sees_own"
  ON public.platform_impersonation_sessions FOR SELECT
  TO authenticated
  USING (
    impersonator_id = auth.uid()
    AND platform_role_has('support', auth.uid())
  );

-- All writes via SECURITY DEFINER RPCs — direct INSERT/UPDATE/DELETE blocked.
DROP POLICY IF EXISTS "impersonation_no_direct_writes" ON public.platform_impersonation_sessions;
CREATE POLICY "impersonation_no_direct_writes"
  ON public.platform_impersonation_sessions FOR ALL
  TO authenticated
  USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_impersonation_active
  ON public.platform_impersonation_sessions(impersonator_id)
  WHERE ended_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Impersonation RPCs
-- ---------------------------------------------------------------------------

-- start_impersonation: super_admin or support. Support must link an
-- open ticket assigned to them. Enforces max 1 active session per
-- impersonator. Logs to platform_audit_logs.
CREATE OR REPLACE FUNCTION public.start_impersonation(
  p_target_user_id uuid,
  p_reason text,
  p_ticket_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_role text;
  v_staff_id uuid;
  v_session_id uuid;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_ticket RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF v_caller = p_target_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_impersonate_self');
  END IF;

  SELECT ps.id, ps.role::text INTO v_staff_id, v_role
  FROM platform_staff ps
  WHERE ps.user_id = v_caller AND ps.is_active = true
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF v_role NOT IN ('super_admin', 'support') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'role_not_permitted');
  END IF;

  -- Support must supply an open ticket they own.
  IF v_role = 'support' THEN
    IF p_ticket_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ticket_required');
    END IF;
    SELECT id, status, assigned_to INTO v_ticket
    FROM contact_enquiries
    WHERE id = p_ticket_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_found');
    END IF;
    IF v_ticket.assigned_to IS DISTINCT FROM v_caller THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_assigned_to_caller');
    END IF;
    IF v_ticket.status IS DISTINCT FROM 'open' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_open');
    END IF;
  END IF;

  -- Max one active session per impersonator.
  IF EXISTS (
    SELECT 1 FROM platform_impersonation_sessions
    WHERE impersonator_id = v_caller AND ended_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'session_already_active');
  END IF;

  INSERT INTO platform_impersonation_sessions
    (impersonator_id, impersonated_user_id, support_ticket_id, reason)
  VALUES (v_caller, p_target_user_id, p_ticket_id, v_reason)
  RETURNING id INTO v_session_id;

  INSERT INTO platform_audit_logs (staff_id, action, target_type, target_id, details)
  VALUES (
    v_staff_id,
    'impersonation.start',
    'auth.users',
    p_target_user_id,
    jsonb_build_object(
      'session_id', v_session_id,
      'reason', v_reason,
      'support_ticket_id', p_ticket_id,
      'role', v_role
    )
  );

  RETURN jsonb_build_object('ok', true, 'session_id', v_session_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_impersonation(uuid, text, uuid)
  TO authenticated, service_role;

-- end_impersonation: called by the impersonator OR a super_admin.
CREATE OR REPLACE FUNCTION public.end_impersonation(p_session_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_staff_id uuid;
  v_session RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT id INTO v_staff_id FROM platform_staff
  WHERE user_id = v_caller AND is_active = true LIMIT 1;
  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- Resolve the target session: explicit id, else the caller's active one.
  IF p_session_id IS NULL THEN
    SELECT * INTO v_session FROM platform_impersonation_sessions
    WHERE impersonator_id = v_caller AND ended_at IS NULL
    ORDER BY started_at DESC LIMIT 1;
  ELSE
    SELECT * INTO v_session FROM platform_impersonation_sessions
    WHERE id = p_session_id;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_active_session');
  END IF;

  IF v_session.ended_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_ended');
  END IF;

  -- Only the impersonator or a super_admin may end a session.
  IF v_session.impersonator_id <> v_caller AND NOT is_platform_super_admin(v_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  UPDATE platform_impersonation_sessions
     SET ended_at = now(),
         ended_reason = COALESCE(ended_reason, 'manual')
   WHERE id = v_session.id;

  INSERT INTO platform_audit_logs (staff_id, action, target_type, target_id, details)
  VALUES (
    v_staff_id,
    'impersonation.end',
    'auth.users',
    v_session.impersonated_user_id,
    jsonb_build_object('session_id', v_session.id, 'ended_reason', 'manual')
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.end_impersonation(uuid)
  TO authenticated, service_role;

-- expire_stale_impersonations: cron-friendly. Closes any session older
-- than 2 hours. Logs each closure.
CREATE OR REPLACE FUNCTION public.expire_stale_impersonations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_count int := 0;
  v_staff_id uuid;
BEGIN
  FOR r IN
    SELECT id, impersonator_id, impersonated_user_id
    FROM platform_impersonation_sessions
    WHERE ended_at IS NULL
      AND started_at < now() - interval '2 hours'
  LOOP
    UPDATE platform_impersonation_sessions
       SET ended_at = now(),
           ended_reason = 'timeout'
     WHERE id = r.id;

    SELECT ps.id INTO v_staff_id FROM platform_staff ps
    WHERE ps.user_id = r.impersonator_id AND ps.is_active = true LIMIT 1;
    IF v_staff_id IS NOT NULL THEN
      INSERT INTO platform_audit_logs (staff_id, action, target_type, target_id, details)
      VALUES (
        v_staff_id,
        'impersonation.timeout',
        'auth.users',
        r.impersonated_user_id,
        jsonb_build_object('session_id', r.id, 'ended_reason', 'timeout')
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_stale_impersonations() TO service_role;

-- ---------------------------------------------------------------------------
-- 3. User lifecycle RPCs
-- ---------------------------------------------------------------------------

-- suspend_platform_user: super_admin or platform admin.
CREATE OR REPLACE FUNCTION public.suspend_platform_user(p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_staff_id uuid;
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF v_caller = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_suspend_self');
  END IF;

  SELECT id INTO v_staff_id FROM platform_staff
  WHERE user_id = v_caller AND is_active = true LIMIT 1;
  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF NOT (is_platform_super_admin(v_caller) OR platform_role_has('admin', v_caller)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- Bulk-suspend memberships across every group the user belongs to.
  UPDATE memberships
     SET membership_status = 'suspended', updated_at = now()
   WHERE user_id = p_user_id;

  INSERT INTO platform_audit_logs (staff_id, action, target_type, target_id, details)
  VALUES (
    v_staff_id, 'user.suspend', 'auth.users', p_user_id,
    jsonb_build_object('reason', v_reason)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.suspend_platform_user(uuid, text)
  TO authenticated, service_role;

-- unsuspend_platform_user: restores memberships suspended via suspend_platform_user.
CREATE OR REPLACE FUNCTION public.unsuspend_platform_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_staff_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT id INTO v_staff_id FROM platform_staff
  WHERE user_id = v_caller AND is_active = true LIMIT 1;
  IF v_staff_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF NOT (is_platform_super_admin(v_caller) OR platform_role_has('admin', v_caller)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  UPDATE memberships
     SET membership_status = 'active', updated_at = now()
   WHERE user_id = p_user_id AND membership_status = 'suspended';

  INSERT INTO platform_audit_logs (staff_id, action, target_type, target_id, details)
  VALUES (
    v_staff_id, 'user.unsuspend', 'auth.users', p_user_id, '{}'::jsonb
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unsuspend_platform_user(uuid)
  TO authenticated, service_role;

-- archive_platform_user: super_admin only. Soft delete — never hard-
-- deletes auth.users (preserves audit integrity). Flips every membership
-- to membership_status='archived', anonymises display_name, flags the
-- profile with an archived marker in privacy_settings-style column (or
-- full_name='[deleted]').
CREATE OR REPLACE FUNCTION public.archive_platform_user(p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_staff_id uuid;
  v_reason text := NULLIF(btrim(p_reason), '');
  v_owned_groups int;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;
  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;
  IF v_caller = p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_archive_self');
  END IF;

  SELECT id INTO v_staff_id FROM platform_staff
  WHERE user_id = v_caller AND is_active = true LIMIT 1;
  IF v_staff_id IS NULL OR NOT is_platform_super_admin(v_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- Block archival if the user owns any active group — ownership
  -- must be transferred first to avoid orphaning the group.
  SELECT COUNT(*) INTO v_owned_groups
  FROM memberships
  WHERE user_id = p_user_id
    AND role = 'owner'
    AND membership_status = 'active';
  IF v_owned_groups > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'user_owns_groups',
      'owned_groups', v_owned_groups
    );
  END IF;

  UPDATE memberships
     SET membership_status = 'archived',
         display_name = NULL,
         updated_at = now()
   WHERE user_id = p_user_id;

  UPDATE profiles
     SET full_name = '[deleted]',
         display_name = '[deleted]',
         phone = NULL,
         email = NULL,
         avatar_url = NULL,
         updated_at = now()
   WHERE id = p_user_id;

  INSERT INTO platform_audit_logs (staff_id, action, target_type, target_id, details)
  VALUES (
    v_staff_id, 'user.archive', 'auth.users', p_user_id,
    jsonb_build_object('reason', v_reason)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_platform_user(uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Last-super-admin guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_last_super_admin_lockout()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_active_supers int;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.role::text = 'super_admin' AND OLD.is_active = true THEN
      SELECT COUNT(*) INTO v_active_supers FROM platform_staff
      WHERE role::text = 'super_admin' AND is_active = true AND id != OLD.id;
      IF v_active_supers < 1 THEN
        RAISE EXCEPTION 'cannot_remove_last_super_admin' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Demotion: super_admin -> any other role, while previously active.
    IF OLD.role::text = 'super_admin'
       AND NEW.role::text <> 'super_admin'
       AND OLD.is_active = true THEN
      SELECT COUNT(*) INTO v_active_supers FROM platform_staff
      WHERE role::text = 'super_admin' AND is_active = true AND id != OLD.id;
      IF v_active_supers < 1 THEN
        RAISE EXCEPTION 'cannot_demote_last_super_admin' USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Deactivation of active super_admin.
    IF OLD.role::text = 'super_admin'
       AND OLD.is_active = true
       AND NEW.is_active = false THEN
      SELECT COUNT(*) INTO v_active_supers FROM platform_staff
      WHERE role::text = 'super_admin' AND is_active = true AND id != OLD.id;
      IF v_active_supers < 1 THEN
        RAISE EXCEPTION 'cannot_suspend_last_super_admin' USING ERRCODE = '42501';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_last_super_admin ON public.platform_staff;
CREATE TRIGGER prevent_last_super_admin
  BEFORE UPDATE OR DELETE ON public.platform_staff
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_super_admin_lockout();
