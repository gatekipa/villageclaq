-- ============================================================================
-- Migration 00056: Fix join flow — groups RLS blocks non-members
-- ============================================================================
-- ROOT CAUSE: The groups table RLS policy "Groups visible to members" only
-- allows SELECT for existing group members. When a non-member visits the
-- join page, the join_codes query succeeds (RLS allows is_active=true for
-- any authenticated user), but the subsequent groups query returns NULL
-- because the user is not yet a member. This causes "Invalid or Expired Link"
-- for ALL join methods (link, QR, 6-digit code).
--
-- FIX: SECURITY DEFINER RPC that validates a join code and returns group info
-- in a single atomic call, bypassing groups RLS safely.
--
-- Run manually in Supabase SQL Editor.
-- ============================================================================

-- ── 1. lookup_join_code: validate code + return group info ──────────────────
-- Called by the join page to display group info before the user clicks "Join".
-- Returns NULL if code is invalid/expired/exhausted.

CREATE OR REPLACE FUNCTION public.lookup_join_code(p_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_join_code RECORD;
  v_group RECORD;
  v_member_count BIGINT;
BEGIN
  -- Find active join code (case-insensitive)
  SELECT id, group_id, code, is_active, max_uses, use_count, expires_at
  INTO v_join_code
  FROM public.join_codes
  WHERE upper(code) = upper(p_code)
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Check expiry
  IF v_join_code.expires_at IS NOT NULL AND v_join_code.expires_at < now() THEN
    RETURN NULL;
  END IF;

  -- Check max uses (0 or NULL = unlimited)
  IF v_join_code.max_uses IS NOT NULL
     AND v_join_code.max_uses > 0
     AND v_join_code.use_count >= v_join_code.max_uses THEN
    RETURN NULL;
  END IF;

  -- Get group info (bypasses groups RLS via SECURITY DEFINER)
  SELECT id, name, description, group_type
  INTO v_group
  FROM public.groups
  WHERE id = v_join_code.group_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Get accurate member count (bypasses memberships RLS)
  SELECT count(*)
  INTO v_member_count
  FROM public.memberships
  WHERE group_id = v_group.id;

  RETURN json_build_object(
    'group_id', v_group.id,
    'name', v_group.name,
    'description', v_group.description,
    'group_type', v_group.group_type,
    'member_count', v_member_count
  );
END;
$$;

-- Grant execute to authenticated users (needed for join page)
GRANT EXECUTE ON FUNCTION public.lookup_join_code(TEXT) TO authenticated;


-- ── 2. join_group_via_code: atomic join with all validations ────────────────
-- Handles the full join flow: validates code, checks subscription limits,
-- checks existing membership, creates membership, increments use count.
-- Returns a JSON result with status and details.

CREATE OR REPLACE FUNCTION public.join_group_via_code(
  p_code TEXT,
  p_display_name TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_join_code RECORD;
  v_group_id UUID;
  v_existing RECORD;
  v_member_count BIGINT;
  v_max_members INT;
  v_tier TEXT;
  v_membership_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN json_build_object('status', 'error', 'code', 'not_authenticated');
  END IF;

  -- Find and validate join code
  SELECT id, group_id, code, is_active, max_uses, use_count, expires_at
  INTO v_join_code
  FROM public.join_codes
  WHERE upper(code) = upper(p_code)
    AND is_active = true;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'error', 'code', 'invalid_code');
  END IF;

  IF v_join_code.expires_at IS NOT NULL AND v_join_code.expires_at < now() THEN
    RETURN json_build_object('status', 'error', 'code', 'expired_code');
  END IF;

  IF v_join_code.max_uses IS NOT NULL
     AND v_join_code.max_uses > 0
     AND v_join_code.use_count >= v_join_code.max_uses THEN
    RETURN json_build_object('status', 'error', 'code', 'max_uses_reached');
  END IF;

  v_group_id := v_join_code.group_id;

  -- Check if already a member (including banned)
  SELECT id, standing
  INTO v_existing
  FROM public.memberships
  WHERE user_id = v_user_id
    AND group_id = v_group_id;

  IF FOUND THEN
    IF v_existing.standing = 'banned' THEN
      RETURN json_build_object('status', 'error', 'code', 'banned');
    ELSE
      RETURN json_build_object('status', 'error', 'code', 'already_member');
    END IF;
  END IF;

  -- Check subscription member limit
  SELECT COALESCE(tier, 'free')
  INTO v_tier
  FROM public.group_subscriptions
  WHERE group_id = v_group_id;

  IF v_tier IS NULL THEN
    v_tier := 'free';
  END IF;

  -- Map tier to max members (must match src/lib/subscription-tiers.ts)
  v_max_members := CASE v_tier
    WHEN 'free' THEN 15
    WHEN 'starter' THEN 50
    WHEN 'professional' THEN 200
    WHEN 'enterprise' THEN -1
    ELSE 15
  END;

  IF v_max_members != -1 THEN
    SELECT count(*)
    INTO v_member_count
    FROM public.memberships
    WHERE group_id = v_group_id;

    IF v_member_count >= v_max_members THEN
      RETURN json_build_object('status', 'error', 'code', 'group_full');
    END IF;
  END IF;

  -- Create membership
  INSERT INTO public.memberships (user_id, group_id, role, standing, is_proxy, display_name)
  VALUES (v_user_id, v_group_id, 'member', 'good', false, p_display_name)
  RETURNING id INTO v_membership_id;

  -- Increment join code use count
  UPDATE public.join_codes
  SET use_count = COALESCE(use_count, 0) + 1
  WHERE id = v_join_code.id;

  RETURN json_build_object(
    'status', 'success',
    'membership_id', v_membership_id,
    'group_id', v_group_id
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.join_group_via_code(TEXT, TEXT) TO authenticated;
