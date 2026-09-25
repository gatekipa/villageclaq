-- M5 Slice 1: Membership, Identity & RBAC Rebuild Foundation
-- Canonical RPCs for Invitations, Role Management, Ownership Transfer, and Lifecycle Status.
-- Governed by PRD Section 10 & 11, Section 26, and docs/membership-status-vocabulary.md.
--
-- INVARIANTS ENFORCED:
-- 1. Destructive Hard Delete Prohibited: Deleting memberships destroys financial ledger audit
--    trails and posting lineage. Memberships must transition via set_membership_lifecycle_status.
-- 2. Sole Active Owner Invariant: A group must have exactly one active owner at all times.
--    No transaction can demote, deactivate, suspend, exit, or delete the group's sole owner.
-- 3. Atomic Ownership Transfer: Changing the group owner requires atomic swap via
--    transfer_group_ownership, strictly executable only by the currently active owner.
-- 4. Invitation Privilege Cap: Invitations can never grant 'owner' role. Non-owners cannot
--    invite someone with a role higher than or equal to themselves without explicit roles.manage.
-- 5. Tenant Display Name Isolation: Display name updates are strictly scoped to
--    memberships.display_name without cross-tenant profile mutation.

DO $m5_pre$
DECLARE
  v_hgp_count int;
  v_hgp_ident text;
  v_hgp_result text;
  v_hgp_owner text;
  v_hgp_definer boolean;
  v_hgp_cfg text[];
  v_hgp_def_md5 text;
  v_hgp_src_md5 text;
  v_multi_owner_count int;
BEGIN
  -- 1. Verify has_group_permission pin
  SELECT count(*) INTO v_hgp_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'M5_ABORT: has_group_permission overload count=% (expected 1)', v_hgp_count;
  END IF;

  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid),
         pg_get_userbyid(p.proowner),
         p.prosecdef,
         p.proconfig,
         md5(pg_get_functiondef(p.oid)),
         md5(p.prosrc)
    INTO v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
         v_hgp_def_md5, v_hgp_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';

  IF v_hgp_ident IS DISTINCT FROM 'gid uuid, perm_key text, uid uuid'
     OR v_hgp_result IS DISTINCT FROM 'boolean'
     OR v_hgp_owner IS DISTINCT FROM 'postgres'
     OR v_hgp_definer IS NOT TRUE
     OR v_hgp_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR v_hgp_def_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
     OR v_hgp_src_md5 IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff' THEN
    RAISE EXCEPTION
      'M5_ABORT: has_group_permission pin mismatch ident=% result=% owner=% definer=% cfg=% def_md5=% src_md5=%',
      v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
      v_hgp_def_md5, v_hgp_src_md5;
  END IF;

  -- 2. Verify prerequisite M4 bridge is in place
  IF to_regprocedure('public.post_dues_payment_confirmation(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'M5_ABORT: post_dues_payment_confirmation missing — apply 00124 first';
  END IF;

  -- 3. Verify 00125 not already applied
  IF to_regprocedure('public.create_group_invitation(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'M5_ABORT: create_group_invitation(jsonb) already present';
  END IF;

  -- 4. Check for existing multi-owner violations
  SELECT count(*) INTO v_multi_owner_count
  FROM (
    SELECT group_id FROM public.memberships
    WHERE role = 'owner' AND membership_status = 'active'
    GROUP BY group_id HAVING count(*) > 1
  ) sub;
  IF v_multi_owner_count > 0 THEN
    RAISE EXCEPTION 'M5_ABORT: Found % groups with multiple active owners. Resolve data before applying.', v_multi_owner_count;
  END IF;
END
$m5_pre$;

BEGIN;

-- ============================================================================
-- 1. Sole Active Owner Invariant (Partial Unique Index)
-- ============================================================================
-- Guarantees mathematically that no group can have more than one active owner.
CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_unique_active_owner
  ON public.memberships(group_id)
  WHERE role = 'owner'::membership_role AND membership_status = 'active';

-- ============================================================================
-- 2. Invitations and Join Codes Schema Invariants (Owner Role Prohibition)
-- ============================================================================
-- Invitations and join codes can NEVER grant 'owner' role. Ownership is transferable
-- solely via explicit atomic transfer_group_ownership RPC.
ALTER TABLE public.invitations
  DROP CONSTRAINT IF EXISTS invitations_role_not_owner;
ALTER TABLE public.invitations
  ADD CONSTRAINT invitations_role_not_owner
  CHECK (role IS NULL OR role <> 'owner'::membership_role);

ALTER TABLE public.join_codes
  DROP CONSTRAINT IF EXISTS join_codes_role_not_owner;
ALTER TABLE public.join_codes
  ADD CONSTRAINT join_codes_role_not_owner
  CHECK (role IS NULL OR role <> 'owner'::membership_role);

-- ============================================================================
-- 3. Destructive Hard Delete Prohibition on Memberships
-- ============================================================================
-- Drop obsolete permissive delete policy
DROP POLICY IF EXISTS "Members can leave or admins can remove members" ON public.memberships;

CREATE OR REPLACE FUNCTION public.prevent_membership_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'MEMBERSHIP_HARD_DELETE_PROHIBITED: Memberships cannot be deleted to preserve financial audit trail and double-entry lineage. Transition membership_status to exited or archived instead.'
    USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_membership_hard_delete ON public.memberships;
CREATE TRIGGER trg_prevent_membership_hard_delete
  BEFORE DELETE ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_membership_hard_delete();

-- ============================================================================
-- 4. Owner Role Protection Trigger (Prevent Demotion, Promotion & Inactivation)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_owner_demotion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allow_transfer text;
BEGIN
  v_allow_transfer := pg_catalog.current_setting('app.allow_owner_transfer', true);

  -- 1. Block demoting owner role directly
  IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
    IF v_allow_transfer IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'SOLE_OWNER_DEMOTION_PROHIBITED: Cannot demote group owner directly. Use transfer_group_ownership.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 2. Block promoting to owner role directly
  IF OLD.role != 'owner' AND NEW.role = 'owner' THEN
    IF v_allow_transfer IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION 'CANNOT_ASSIGN_OWNER_DIRECTLY: Group ownership can only be granted via transfer_group_ownership.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- 3. Block setting active owner to inactive/suspended/exited/archived
  IF OLD.role = 'owner' AND NEW.membership_status != 'active' THEN
    RAISE EXCEPTION 'SOLE_OWNER_STATUS_LOCK: Group owner cannot be deactivated, suspended, or exited. Transfer ownership first.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_owner_role_protection ON public.memberships;
CREATE TRIGGER enforce_owner_role_protection
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_demotion();

-- ============================================================================
-- 5. Tighten Invitations INSERT RLS Policy
-- ============================================================================
DROP POLICY IF EXISTS "Group admins can create invitations" ON public.invitations;
CREATE POLICY "Group admins can create invitations" ON public.invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_group_permission(invitations.group_id, 'members.invite')
    AND (role IS NULL OR role <> 'owner'::membership_role)
  );

-- ============================================================================
-- 6. Canonical RPC: create_group_invitation
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_group_invitation(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_group_id uuid;
  v_email text;
  v_phone text;
  v_role text;
  v_expires_in_days integer;
  v_caller_membership public.memberships%ROWTYPE;
  v_tier text;
  v_max_members integer;
  v_member_count integer;
  v_existing_inv RECORD;
  v_inv_id uuid;
  v_token text;
  v_expires_at timestamptz;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_command IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_command must be a JSON object';
  END IF;

  v_group_id := NULLIF(trim(p_command->>'group_id'), '')::uuid;
  v_email    := NULLIF(trim(p_command->>'email'), '');
  v_phone    := NULLIF(trim(p_command->>'phone'), '');
  v_role     := COALESCE(NULLIF(trim(p_command->>'role'), ''), 'member');
  v_expires_in_days := COALESCE((p_command->>'expires_in_days')::integer, 7);

  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'GROUP_ID_REQUIRED';
  END IF;

  IF v_email IS NULL AND v_phone IS NULL THEN
    RAISE EXCEPTION 'CONTACT_INFO_REQUIRED: Email or phone is required';
  END IF;

  IF v_role = 'owner' THEN
    RAISE EXCEPTION 'CANNOT_INVITE_AS_OWNER: Group ownership cannot be granted via invitation'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (v_role = ANY(ARRAY['admin', 'moderator', 'member'])) THEN
    RAISE EXCEPTION 'INVALID_ROLE: Role must be admin, moderator, or member';
  END IF;

  IF v_expires_in_days < 1 OR v_expires_in_days > 90 THEN
    v_expires_in_days := 7;
  END IF;

  -- Verify active caller membership
  SELECT * INTO v_caller_membership
  FROM public.memberships
  WHERE group_id = v_group_id AND user_id = v_caller_id AND membership_status = 'active';

  IF v_caller_membership.id IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Verify caller has members.invite permission
  IF NOT (v_caller_membership.role = 'owner' OR public.has_group_permission(v_group_id, 'members.invite', v_caller_id)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: members.invite permission required' USING ERRCODE = '42501';
  END IF;

  -- Enforce privilege caps
  IF v_caller_membership.role = 'moderator' AND v_role != 'member' THEN
    RAISE EXCEPTION 'PRIVILEGE_ELEVATION_DENIED: Moderators can only invite regular members' USING ERRCODE = '42501';
  END IF;

  IF v_caller_membership.role = 'admin' AND v_role = 'admin' THEN
    IF NOT (v_caller_membership.role = 'owner' OR public.has_group_permission(v_group_id, 'roles.manage', v_caller_id)) THEN
      RAISE EXCEPTION 'PRIVILEGE_ELEVATION_DENIED: Only owners or members with roles.manage can invite administrators' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Check tier capacity
  SELECT COALESCE(tier, 'free') INTO v_tier
  FROM public.group_subscriptions WHERE group_id = v_group_id;
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
    WHERE group_id = v_group_id
      AND membership_status IN ('active', 'pending_approval');
    IF v_member_count >= v_max_members THEN
      RAISE EXCEPTION 'GROUP_FULL: Member limit reached for subscription tier %', v_tier;
    END IF;
  END IF;

  -- Re-use unexpired pending invitation if already sent
  SELECT id, token, expires_at INTO v_existing_inv
  FROM public.invitations
  WHERE group_id = v_group_id
    AND status = 'pending'
    AND (
      (v_email IS NOT NULL AND email = v_email)
      OR (v_phone IS NOT NULL AND phone = v_phone)
    )
    AND (expires_at IS NULL OR expires_at > now())
  LIMIT 1;

  IF v_existing_inv.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'invitation_id', v_existing_inv.id,
      'token', v_existing_inv.token,
      'group_id', v_group_id,
      'role', v_role,
      'is_existing', true,
      'expires_at', v_existing_inv.expires_at
    );
  END IF;

  v_expires_at := now() + (v_expires_in_days || ' days')::interval;

  INSERT INTO public.invitations (
    group_id, invited_by, email, phone, role, status, expires_at
  ) VALUES (
    v_group_id, v_caller_id, v_email, v_phone, v_role::public.membership_role, 'pending', v_expires_at
  )
  RETURNING id, token INTO v_inv_id, v_token;

  RETURN jsonb_build_object(
    'ok', true,
    'invitation_id', v_inv_id,
    'token', v_token,
    'group_id', v_group_id,
    'role', v_role,
    'is_existing', false,
    'expires_at', v_expires_at
  );
END;
$$;

-- ============================================================================
-- 7. Canonical RPC: update_membership_role
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_membership_role(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_membership_id uuid;
  v_new_role text;
  v_target public.memberships%ROWTYPE;
  v_caller public.memberships%ROWTYPE;
  v_old_role text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_command IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_command must be a JSON object';
  END IF;

  v_membership_id := NULLIF(trim(p_command->>'membership_id'), '')::uuid;
  v_new_role      := trim(COALESCE(p_command->>'new_role', ''));

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_ID_REQUIRED';
  END IF;

  IF v_new_role = 'owner' THEN
    RAISE EXCEPTION 'CANNOT_ASSIGN_OWNER_DIRECTLY: Group ownership can only be granted via transfer_group_ownership.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (v_new_role = ANY(ARRAY['admin', 'moderator', 'member'])) THEN
    RAISE EXCEPTION 'INVALID_ROLE: Role must be admin, moderator, or member';
  END IF;

  -- Lock target row
  SELECT * INTO v_target
  FROM public.memberships
  WHERE id = v_membership_id
  FOR UPDATE;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND';
  END IF;

  -- Sole owner protection: target cannot be demoted if currently owner
  IF v_target.role = 'owner' THEN
    RAISE EXCEPTION 'SOLE_OWNER_DEMOTION_PROHIBITED: Cannot demote the group owner. Transfer ownership first.'
      USING ERRCODE = '23514';
  END IF;

  -- Check caller permissions in this group
  SELECT * INTO v_caller
  FROM public.memberships
  WHERE group_id = v_target.group_id AND user_id = v_caller_id AND membership_status = 'active';

  IF v_caller.id IS NULL THEN
    RAISE EXCEPTION 'ACTIVE_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF v_caller.id = v_target.id THEN
    RAISE EXCEPTION 'SELF_ROLE_CHANGE_PROHIBITED: Members cannot change their own role'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (v_caller.role = 'owner' OR public.has_group_permission(v_target.group_id, 'roles.manage', v_caller_id)) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: roles.manage permission required'
      USING ERRCODE = '42501';
  END IF;

  v_old_role := v_target.role::text;

  UPDATE public.memberships
  SET role = v_new_role::public.membership_role, updated_at = now()
  WHERE id = v_membership_id;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', v_membership_id,
    'group_id', v_target.group_id,
    'old_role', v_old_role,
    'new_role', v_new_role
  );
END;
$$;

-- ============================================================================
-- 8. Canonical RPC: transfer_group_ownership (JSONB Command)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.transfer_group_ownership(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_group_id uuid;
  v_new_owner_membership_id uuid;
  v_caller_membership public.memberships%ROWTYPE;
  v_target_membership public.memberships%ROWTYPE;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_command IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_command must be a JSON object';
  END IF;

  v_group_id := NULLIF(trim(p_command->>'group_id'), '')::uuid;
  v_new_owner_membership_id := NULLIF(trim(p_command->>'new_owner_membership_id'), '')::uuid;

  IF v_group_id IS NULL OR v_new_owner_membership_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGUMENTS: group_id and new_owner_membership_id are required';
  END IF;

  -- Advisory lock on group to serialize transfers
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array('group-ownership-transfer', v_group_id)::text, 0
    )
  );

  -- Verify caller is currently the active owner
  SELECT * INTO v_caller_membership
  FROM public.memberships
  WHERE group_id = v_group_id AND user_id = v_caller_id AND membership_status = 'active'
  FOR UPDATE;

  IF v_caller_membership.id IS NULL OR v_caller_membership.role != 'owner' THEN
    RAISE EXCEPTION 'ONLY_OWNER_CAN_TRANSFER: Only the current active group owner can transfer ownership'
      USING ERRCODE = '42501';
  END IF;

  -- Verify target member
  SELECT * INTO v_target_membership
  FROM public.memberships
  WHERE id = v_new_owner_membership_id AND group_id = v_group_id
  FOR UPDATE;

  IF v_target_membership.id IS NULL THEN
    RAISE EXCEPTION 'TARGET_MEMBERSHIP_NOT_FOUND';
  END IF;

  IF v_target_membership.id = v_caller_membership.id THEN
    RAISE EXCEPTION 'CANNOT_TRANSFER_TO_SELF';
  END IF;

  IF v_target_membership.membership_status != 'active' THEN
    RAISE EXCEPTION 'TARGET_MUST_BE_ACTIVE: Target member must be an active member to receive ownership';
  END IF;

  -- Enable owner role demotion/promotion within this transaction
  PERFORM pg_catalog.set_config('app.allow_owner_transfer', 'true', true);

  -- Atomic swap: demote caller to admin FIRST (satisfying unique active owner index)
  UPDATE public.memberships
  SET role = 'admin'::public.membership_role, updated_at = now()
  WHERE id = v_caller_membership.id;

  -- Promote target to owner
  UPDATE public.memberships
  SET role = 'owner'::public.membership_role, updated_at = now()
  WHERE id = v_target_membership.id;

  -- Sync group created_by to new owner
  UPDATE public.groups
  SET created_by = v_target_membership.user_id, updated_at = now()
  WHERE id = v_group_id;

  PERFORM pg_catalog.set_config('app.allow_owner_transfer', 'false', true);

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'success',
    'group_id', v_group_id,
    'previous_owner_membership_id', v_caller_membership.id,
    'new_owner_membership_id', v_target_membership.id,
    'previous_owner_user_id', v_caller_membership.user_id,
    'new_owner_user_id', v_target_membership.user_id
  );
END;
$$;

-- Backward-compatibility 2-argument wrapper for legacy UI callers
CREATE OR REPLACE FUNCTION public.transfer_group_ownership(
  p_group_id uuid,
  p_new_owner_membership_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_res jsonb;
BEGIN
  v_res := public.transfer_group_ownership(
    pg_catalog.jsonb_build_object(
      'group_id', p_group_id,
      'new_owner_membership_id', p_new_owner_membership_id
    )
  );
  RETURN v_res::json;
END;
$$;

-- ============================================================================
-- 9. Canonical RPC: set_membership_lifecycle_status
-- ============================================================================
CREATE OR REPLACE FUNCTION public.set_membership_lifecycle_status(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_membership_id uuid;
  v_new_status text;
  v_reason text;
  v_target public.memberships%ROWTYPE;
  v_caller public.memberships%ROWTYPE;
  v_old_status text;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF p_command IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_INPUT: p_command must be a JSON object';
  END IF;

  v_membership_id := NULLIF(trim(p_command->>'membership_id'), '')::uuid;
  v_new_status    := trim(COALESCE(p_command->>'new_status', ''));
  v_reason        := NULLIF(trim(p_command->>'reason'), '');

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_ID_REQUIRED';
  END IF;

  IF NOT (v_new_status = ANY(ARRAY['active', 'suspended', 'exited', 'archived'])) THEN
    RAISE EXCEPTION 'INVALID_STATUS: Status must be active, suspended, exited, or archived';
  END IF;

  -- Lock target row
  SELECT * INTO v_target
  FROM public.memberships
  WHERE id = v_membership_id
  FOR UPDATE;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND';
  END IF;

  IF v_target.membership_status = v_new_status THEN
    RETURN jsonb_build_object(
      'ok', true,
      'membership_id', v_membership_id,
      'group_id', v_target.group_id,
      'old_status', v_new_status,
      'new_status', v_new_status,
      'unchanged', true
    );
  END IF;

  -- Sole owner protection: owner cannot be deactivated, exited, suspended, or archived
  IF v_target.role = 'owner' AND v_new_status != 'active' THEN
    RAISE EXCEPTION 'SOLE_OWNER_STATUS_LOCK: Group owner cannot be deactivated, suspended, or exited. Transfer ownership first.'
      USING ERRCODE = '23514';
  END IF;

  -- Authorization
  IF v_target.user_id = v_caller_id AND v_new_status = 'exited' THEN
    -- Legitimate self-exit carveout (guaranteed not sole owner by check above)
    NULL;
  ELSE
    -- Admin managed transition
    SELECT * INTO v_caller
    FROM public.memberships
    WHERE group_id = v_target.group_id AND user_id = v_caller_id AND membership_status = 'active';

    IF v_caller.id IS NULL THEN
      RAISE EXCEPTION 'ACTIVE_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT (v_caller.role = 'owner' OR public.has_group_permission(v_target.group_id, 'members.manage', v_caller_id)) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: members.manage permission required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_old_status := v_target.membership_status;

  UPDATE public.memberships
  SET membership_status = v_new_status, updated_at = now()
  WHERE id = v_membership_id;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', v_membership_id,
    'group_id', v_target.group_id,
    'old_status', v_old_status,
    'new_status', v_new_status,
    'reason', v_reason
  );
END;
$$;

-- ============================================================================
-- 10. Canonical RPC: update_member_display_name
-- ============================================================================
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
  v_display_name  := NULLIF(trim(p_command->>'display_name'), '');

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_ID_REQUIRED';
  END IF;

  IF v_display_name IS NULL THEN
    RAISE EXCEPTION 'DISPLAY_NAME_REQUIRED';
  END IF;

  -- Lock target row
  SELECT * INTO v_target
  FROM public.memberships
  WHERE id = v_membership_id
  FOR UPDATE;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'MEMBERSHIP_NOT_FOUND';
  END IF;

  -- Authorization
  IF v_target.user_id = v_caller_id THEN
    -- Member updating own display name within this group
    NULL;
  ELSE
    -- Admin updating member display name
    SELECT * INTO v_caller
    FROM public.memberships
    WHERE group_id = v_target.group_id AND user_id = v_caller_id AND membership_status = 'active';

    IF v_caller.id IS NULL THEN
      RAISE EXCEPTION 'ACTIVE_MEMBERSHIP_REQUIRED' USING ERRCODE = '42501';
    END IF;

    IF NOT (v_caller.role = 'owner' OR public.has_group_permission(v_target.group_id, 'members.manage', v_caller_id)) THEN
      RAISE EXCEPTION 'PERMISSION_DENIED: members.manage permission required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.memberships
  SET display_name = v_display_name, updated_at = now()
  WHERE id = v_membership_id;

  RETURN jsonb_build_object(
    'ok', true,
    'membership_id', v_membership_id,
    'group_id', v_target.group_id,
    'display_name', v_display_name
  );
END;
$$;

-- ============================================================================
-- 11. Security Grants
-- ============================================================================
GRANT EXECUTE ON FUNCTION public.create_group_invitation(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_membership_role(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_group_ownership(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_group_ownership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_membership_lifecycle_status(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_member_display_name(jsonb) TO authenticated;

COMMIT;
