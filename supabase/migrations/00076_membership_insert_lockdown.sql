-- V7 — Membership INSERT lockdown
--
-- Pre-fix: memberships_insert_own allowed any authenticated user to run
--     INSERT INTO memberships (group_id, user_id, role)
--     VALUES (<any-known-group-uuid>, auth.uid(), 'owner');
-- and seize ownership of an existing group as long as the target was not
-- at its tier member cap. UUIDs leak through invitation emails, join
-- links, and QR codes, so this was a live group-takeover vector.
--
-- Fix strategy:
--   1. Drop the broad memberships_insert_own policy.
--   2. Replace with a pending-approval safety-net policy — direct-client
--      inserts can only create role='member', membership_status='pending
--      _approval', is_proxy=false rows. Admin approval is still required
--      before the row affects the group.
--   3. Route the legitimate self-insert flows through SECURITY DEFINER
--      RPCs that enforce the exact business rules of each flow.
--        * create_owner_membership — group-creation bootstrap, requires
--          the group to have been created by auth.uid() and to have zero
--          existing memberships.
--        * accept_invitation — matches the invitation to auth.uid()'s
--          verified email, tier-limit checks, marks the invitation
--          accepted in the same transaction.
--   4. Existing join_group_via_code RPC already covered join-code flow.
--   5. Existing claim_proxy_membership RPC already covered proxy claim.

-- =============================================================================
-- 1. Tighten RLS: pending-approval-only safety net
-- =============================================================================

DROP POLICY IF EXISTS "memberships_insert_own" ON memberships;
DROP POLICY IF EXISTS "memberships_insert_pending" ON memberships;

-- Direct-client inserts can only create a pending-approval member row.
-- Role-escalation, group-takeover, and banned-member re-entry are all
-- impossible through this policy. The row needs admin approval before
-- it has any effect.
CREATE POLICY "memberships_insert_pending" ON memberships FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = 'member'::membership_role
    AND COALESCE(membership_status, 'pending_approval') = 'pending_approval'
    AND is_proxy = false
    AND proxy_manager_id IS NULL
  );

-- =============================================================================
-- 2. create_owner_membership — group-creation bootstrap
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_owner_membership(
  p_group_id uuid,
  p_display_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_created_by uuid;
  v_existing_count integer;
  v_membership_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  -- Group must exist and must have been created by the caller.
  SELECT created_by INTO v_created_by FROM public.groups WHERE id = p_group_id;
  IF v_created_by IS NULL THEN
    RAISE EXCEPTION 'group_not_found' USING ERRCODE = '42704';
  END IF;
  IF v_created_by <> v_user_id THEN
    RAISE EXCEPTION 'not_group_creator' USING ERRCODE = '42501';
  END IF;

  -- The group must have zero existing memberships — this is the
  -- one-shot bootstrap. If anyone has joined, the "owner bootstrap"
  -- window is closed; ownership transfer is a separate flow.
  SELECT COUNT(*) INTO v_existing_count FROM public.memberships WHERE group_id = p_group_id;
  IF v_existing_count > 0 THEN
    RAISE EXCEPTION 'owner_already_exists' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.memberships (user_id, group_id, role, standing, is_proxy, display_name, membership_status)
  VALUES (v_user_id, p_group_id, 'owner'::membership_role, 'good'::membership_standing, false, p_display_name, 'active')
  RETURNING id INTO v_membership_id;

  RETURN v_membership_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_owner_membership(uuid, text) TO authenticated;

-- =============================================================================
-- 3. accept_invitation — invitation acceptance
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_invitation_id uuid,
  p_display_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_user_email text := auth.jwt() ->> 'email';
  v_invitation RECORD;
  v_existing_id uuid;
  v_tier text;
  v_max_members integer;
  v_member_count integer;
  v_membership_id uuid;
  v_display text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT id, group_id, email, role, status, expires_at, claim_membership_id
    INTO v_invitation
  FROM public.invitations
  WHERE id = p_invitation_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_found');
  END IF;

  -- Invitation email must match the caller's verified JWT email
  -- (Supabase Auth only populates the email claim after verification).
  IF v_invitation.email IS NULL OR lower(v_invitation.email) <> lower(COALESCE(v_user_email, '')) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  IF v_invitation.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_not_pending');
  END IF;

  IF v_invitation.expires_at IS NOT NULL AND v_invitation.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invitation_expired');
  END IF;

  -- Proxy claim invitations are handled by claim_proxy_membership().
  IF v_invitation.claim_membership_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'use_claim_rpc');
  END IF;

  -- Short-circuit if the user is already a member of this group.
  SELECT id INTO v_existing_id
  FROM public.memberships
  WHERE group_id = v_invitation.group_id AND user_id = v_user_id
  LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    UPDATE public.invitations
    SET status = 'accepted', accepted_at = now(), user_id = v_user_id
    WHERE id = p_invitation_id;
    RETURN jsonb_build_object('ok', true, 'membership_id', v_existing_id, 'already_member', true);
  END IF;

  -- Tier limit check — mirrors check_member_limit().
  SELECT COALESCE(tier, 'free') INTO v_tier
  FROM public.group_subscriptions WHERE group_id = v_invitation.group_id;
  v_tier := COALESCE(v_tier, 'free');

  IF v_tier <> 'enterprise' THEN
    v_max_members := CASE v_tier
      WHEN 'free' THEN 15
      WHEN 'starter' THEN 50
      WHEN 'pro' THEN 200
      ELSE 15
    END;
    SELECT COUNT(*) INTO v_member_count
    FROM public.memberships
    WHERE group_id = v_invitation.group_id
      AND membership_status IN ('active', 'pending_approval');
    IF v_member_count >= v_max_members THEN
      RETURN jsonb_build_object('ok', false, 'error', 'group_full');
    END IF;
  END IF;

  -- Derive display_name with a safe fallback from the caller's profile.
  v_display := COALESCE(
    NULLIF(trim(p_display_name), ''),
    (SELECT full_name FROM public.profiles WHERE id = v_user_id),
    split_part(COALESCE(v_user_email, 'Member'), '@', 1)
  );

  -- Insert — we use a role enum cast from the invitation row. Valid
  -- values were written by the inviting admin under their RLS policy;
  -- invitations doesn't allow members to insert, so the role here is
  -- trustworthy.
  INSERT INTO public.memberships (user_id, group_id, role, standing, is_proxy, display_name, membership_status)
  VALUES (
    v_user_id,
    v_invitation.group_id,
    COALESCE(v_invitation.role, 'member')::membership_role,
    'good'::membership_standing,
    false,
    v_display,
    'active'
  )
  RETURNING id INTO v_membership_id;

  UPDATE public.invitations
  SET status = 'accepted', accepted_at = now(), user_id = v_user_id
  WHERE id = p_invitation_id;

  RETURN jsonb_build_object('ok', true, 'membership_id', v_membership_id, 'group_id', v_invitation.group_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid, text) TO authenticated;
