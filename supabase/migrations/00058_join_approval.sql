-- ============================================================================
-- Migration 00058: Join approval workflow
-- ============================================================================
-- Adds membership_status column to memberships table.
-- Pending members have membership_status = 'pending_approval' and cannot
-- access the dashboard until an admin approves them.
-- Updates lookup_join_code and join_group_via_code RPCs to:
--   1. Count only 'active' members for subscription limit checks
--   2. Respect groups.settings->>'require_join_approval'
--   3. Return 'pending_approval' status when approval is required
--
-- Run manually in Supabase SQL Editor.
-- ============================================================================

-- ── 1. Add membership_status column ────────────────────────────────────────

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS membership_status TEXT NOT NULL DEFAULT 'active'
  CHECK (membership_status IN ('active', 'pending_approval'));

-- Index for fast admin queries (pending approvals per group)
CREATE INDEX IF NOT EXISTS idx_memberships_status_group
  ON public.memberships(group_id, membership_status);


-- ── 2. Replace lookup_join_code ─────────────────────────────────────────────
-- Same as 00056 but counts only active members (excludes pending_approval).

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

  -- Count only ACTIVE members (pending_approval don't count toward the visible member count)
  SELECT count(*)
  INTO v_member_count
  FROM public.memberships
  WHERE group_id = v_group.id
    AND membership_status = 'active';

  RETURN json_build_object(
    'group_id', v_group.id,
    'name', v_group.name,
    'description', v_group.description,
    'group_type', v_group.group_type,
    'member_count', v_member_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_join_code(TEXT) TO authenticated;


-- ── 3. Replace join_group_via_code ──────────────────────────────────────────
-- Adds:
--   - require_join_approval support (creates with membership_status = 'pending_approval')
--   - already_pending check (user already has a pending row for this group)
--   - subscription limit counts only active members

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
  v_group_settings JSONB;
  v_require_approval BOOLEAN;
  v_existing RECORD;
  v_member_count BIGINT;
  v_max_members INT;
  v_tier TEXT;
  v_membership_id UUID;
  v_membership_status TEXT;
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

  -- Check if already a member or pending (including banned)
  SELECT id, standing, membership_status
  INTO v_existing
  FROM public.memberships
  WHERE user_id = v_user_id
    AND group_id = v_group_id;

  IF FOUND THEN
    IF v_existing.standing = 'banned' THEN
      RETURN json_build_object('status', 'error', 'code', 'banned');
    ELSIF v_existing.membership_status = 'pending_approval' THEN
      RETURN json_build_object('status', 'error', 'code', 'already_pending');
    ELSE
      RETURN json_build_object('status', 'error', 'code', 'already_member');
    END IF;
  END IF;

  -- Check subscription member limit (count only ACTIVE members)
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
    WHERE group_id = v_group_id
      AND membership_status = 'active';

    IF v_member_count >= v_max_members THEN
      RETURN json_build_object('status', 'error', 'code', 'group_full');
    END IF;
  END IF;

  -- Check if join approval is required
  SELECT settings
  INTO v_group_settings
  FROM public.groups
  WHERE id = v_group_id;

  v_require_approval := COALESCE(
    (v_group_settings->>'require_join_approval')::BOOLEAN,
    false
  );

  -- Determine membership_status for the new row
  v_membership_status := CASE
    WHEN v_require_approval THEN 'pending_approval'
    ELSE 'active'
  END;

  -- Create membership
  INSERT INTO public.memberships (user_id, group_id, role, standing, is_proxy, display_name, membership_status)
  VALUES (v_user_id, v_group_id, 'member', 'good', false, p_display_name, v_membership_status)
  RETURNING id INTO v_membership_id;

  -- Only increment join code use count for active joins
  -- (Pending approvals count against use_count upon approval, not at request time)
  IF v_membership_status = 'active' THEN
    UPDATE public.join_codes
    SET use_count = COALESCE(use_count, 0) + 1
    WHERE id = v_join_code.id;
  END IF;

  IF v_membership_status = 'pending_approval' THEN
    RETURN json_build_object(
      'status', 'pending_approval',
      'membership_id', v_membership_id,
      'group_id', v_group_id
    );
  ELSE
    RETURN json_build_object(
      'status', 'success',
      'membership_id', v_membership_id,
      'group_id', v_group_id
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_group_via_code(TEXT, TEXT) TO authenticated;
