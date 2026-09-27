-- Founder qualification FQ-07: preserve the approved Cut 1 proxy officer
-- gate while retaining 00202's active-self authorization check.

BEGIN;

CREATE OR REPLACE FUNCTION public.update_member_display_name(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_membership_id uuid;
  v_display_name text;
  v_title text;
  v_target public.memberships%ROWTYPE;
  v_caller public.memberships%ROWTYPE;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_command IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_command must be a JSON object';
  END IF;

  v_membership_id := NULLIF(trim(p_command->>'membership_id'), '')::uuid;
  v_display_name := NULLIF(trim(p_command->>'display_name'), '');
  v_title := NULLIF(trim(p_command->>'title'), '');

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_ID_REQUIRED';
  END IF;
  IF v_display_name IS NULL THEN
    RAISE EXCEPTION 'DISPLAY_NAME_REQUIRED';
  END IF;
  IF length(v_display_name) > 160 THEN
    RAISE EXCEPTION 'DISPLAY_NAME_TOO_LONG';
  END IF;
  IF v_title IS NOT NULL AND length(v_title) > 80 THEN
    RAISE EXCEPTION 'TITLE_TOO_LONG';
  END IF;

  SELECT * INTO v_target
  FROM public.memberships
  WHERE id = v_membership_id
  FOR UPDATE;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND';
  END IF;

  IF v_target.user_id IS NOT DISTINCT FROM v_caller_id THEN
    IF v_target.membership_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'ACTIVE_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT * INTO v_caller
    FROM public.memberships
    WHERE group_id = v_target.group_id
      AND user_id = v_caller_id
      AND membership_status = 'active';

    IF v_caller.id IS NULL THEN
      RAISE EXCEPTION 'ACTIVE_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
    END IF;
    IF NOT (
      v_caller.role = 'owner'
      OR public.has_group_permission(v_target.group_id, 'members.manage', v_caller_id)
    ) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: members.manage permission required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.memberships
  SET display_name = v_display_name,
      title = v_title,
      updated_at = now()
  WHERE id = v_membership_id;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', v_membership_id,
    'group_id', v_target.group_id,
    'display_name', v_display_name,
    'title', v_title
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_proxy_member_v2(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_group_id uuid;
  v_membership_id uuid := gen_random_uuid();
  v_display_name text;
  v_title text;
  v_phone text;
  v_role text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF p_command IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_command must be a JSON object';
  END IF;

  v_group_id := NULLIF(trim(p_command->>'group_id'), '')::uuid;
  v_display_name := NULLIF(trim(p_command->>'display_name'), '');
  v_title := NULLIF(trim(p_command->>'title'), '');
  v_phone := NULLIF(trim(p_command->>'phone'), '');
  v_role := COALESCE(NULLIF(trim(p_command->>'role'), ''), 'member');

  IF v_group_id IS NULL OR v_display_name IS NULL THEN
    RAISE EXCEPTION 'GROUP_AND_DISPLAY_NAME_REQUIRED';
  END IF;
  IF length(v_display_name) > 160 THEN
    RAISE EXCEPTION 'DISPLAY_NAME_TOO_LONG';
  END IF;
  IF v_title IS NOT NULL AND length(v_title) > 80 THEN
    RAISE EXCEPTION 'TITLE_TOO_LONG';
  END IF;
  IF v_role NOT IN ('member', 'moderator') THEN
    RAISE EXCEPTION 'invalid_proxy_role';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = v_group_id
      AND user_id = v_caller_id
      AND role IN ('owner', 'admin', 'moderator')
      AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Not authorized to create proxy members in this group'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.memberships (
    id, user_id, group_id, display_name, title, role, standing,
    is_proxy, proxy_manager_id, joined_at, privacy_settings
  ) VALUES (
    v_membership_id,
    NULL,
    v_group_id,
    v_display_name,
    v_title,
    v_role::public.membership_role,
    'good'::public.membership_standing,
    true,
    v_caller_id,
    now(),
    jsonb_build_object(
      'proxy_phone', COALESCE(v_phone, ''),
      'proxy_name', v_display_name,
      'show_phone', false,
      'show_email', false
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', v_membership_id,
    'group_id', v_group_id,
    'display_name', v_display_name,
    'title', v_title
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_member_display_name(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_proxy_member_v2(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_member_display_name(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_proxy_member_v2(jsonb) TO authenticated;

COMMIT;
