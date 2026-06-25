-- ============================================================================
-- 00110_fix_archive_platform_user_profile_fields.sql
-- Backend Audit Batch B — fix the broken archive_platform_user RPC.
--
-- BUG: archive_platform_user (defined in 00085) anonymises the profile with
--   UPDATE profiles SET full_name='[deleted]', display_name='[deleted]',
--     phone=NULL, email=NULL, avatar_url=NULL, updated_at=now() WHERE id=...
-- but public.profiles has NO `email` column (email lives in auth.users). Postgres
-- aborts the whole UPDATE with `column "email" does not exist`, so the function
-- raises and the admin archive route (POST /api/admin/users/archive) 500s on
-- EVERY call — platform user archival / GDPR anonymisation is fully broken.
--
-- FIX: redefine the function identically EXCEPT remove the `email = NULL`
-- assignment. Only columns that actually exist on public.profiles are touched
-- (full_name, display_name, phone, avatar_url, updated_at). Everything else —
-- the super-admin authorization, the self-archive block, the active-owner guard,
-- the memberships -> 'archived' soft-delete, and the platform_audit_logs entry —
-- is byte-for-byte preserved.
--
-- SCOPE / WHAT THIS DOES NOT DO:
--   * No data rows are touched by THIS migration — it only CREATE OR REPLACEs the
--     function definition. Existing profiles/memberships/payments are untouched.
--   * Financial + audit history is preserved: memberships flip to 'archived'
--     (not deleted); payments / contribution_obligations / platform_audit_logs
--     are never deleted or modified by this function.
--   * auth.users.email retention is intentionally UNCHANGED. The prior
--     `email = NULL` targeted a non-existent profiles column and was always a
--     no-op-that-errored, so removing it changes no real behaviour. The archive
--     route additionally terminates the user's sessions. Scrubbing the auth.users
--     email is a separate retention decision, out of scope for this bug fix.
--   * search_path stays pinned to 'public' (the original, already-safe posture —
--     this function is NOT among the function_search_path_mutable advisor set,
--     which flags functions with NO search_path). Hardening every SECURITY
--     DEFINER helper to `search_path = ''` is the separate deferred advisor batch.
--
-- SECURITY DEFINER: preserved. Authorization is unchanged — caller must be an
--   active platform_staff row AND is_platform_super_admin(); self-archive blocked;
--   archiving a user who still owns an active group is blocked.
--
-- ROLLBACK: re-running 00085's definition restores the BROKEN behaviour (the
--   email reference) and is NOT recommended. There is no data to roll back — this
--   migration changes only the function body. To revert the function body only,
--   CREATE OR REPLACE it with the 00085 definition (lines ~431-440 of
--   00085_platform_impersonation_and_user_lifecycle.sql).
--
-- POST-APPLY VERIFICATION (run read-only after applying):
--   -- (1) the function body no longer references a profiles email column:
--   SELECT pg_get_functiondef('public.archive_platform_user(uuid,text)'::regprocedure)
--          NOT LIKE '%email%' AS email_reference_removed;            -- expect: t
--   -- (2) premise holds — profiles has no email column:
--   SELECT count(*) = 0 AS profiles_has_no_email FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='profiles' AND column_name='email';
--   -- (3) SECURITY DEFINER + pinned search_path preserved:
--   SELECT p.prosecdef, p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='archive_platform_user';  -- prosecdef=t, proconfig={search_path=public}
--   -- (4) functional (in a ROLLBACK-only tx, as a super_admin): a valid archive
--   -- returns {"ok": true} and anonymises profiles without raising. DO NOT run
--   -- against a real user outside a rolled-back transaction.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.archive_platform_user(p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  SELECT id INTO v_staff_id FROM platform_staff WHERE user_id = v_caller AND is_active = true LIMIT 1;
  IF v_staff_id IS NULL OR NOT is_platform_super_admin(v_caller) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT COUNT(*) INTO v_owned_groups FROM memberships
  WHERE user_id = p_user_id AND role = 'owner' AND membership_status = 'active';
  IF v_owned_groups > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_owns_groups', 'owned_groups', v_owned_groups);
  END IF;

  UPDATE memberships SET membership_status = 'archived', display_name = NULL, updated_at = now()
  WHERE user_id = p_user_id;

  -- Anonymise the profile. Only columns that exist on public.profiles —
  -- `email` is intentionally absent (it lives in auth.users; the prior
  -- `email = NULL` referenced a non-existent column and aborted the statement).
  UPDATE profiles SET full_name = '[deleted]', display_name = '[deleted]',
    phone = NULL, avatar_url = NULL, updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO platform_audit_logs (staff_id, action, target_type, target_id, details)
  VALUES (v_staff_id, 'user.archive', 'auth.users', p_user_id, jsonb_build_object('reason', v_reason));

  RETURN jsonb_build_object('ok', true);
END;
$function$;
