-- 00082: Enterprise member transfer workflow — state transitions as RPCs
-- ---------------------------------------------------------------------------
-- Migration 00078 added execute_member_transfer() but the RPC checks
-- `status = 'approved'`, while the enum only had 'requested',
-- 'source_approved', 'dest_approved', 'completed', 'rejected'. No path
-- in the client ever set status to 'approved', so the RPC always
-- returned 'transfer_not_approved' and no transfer ever completed.
--
-- This migration aligns the enum + RPCs + RLS with the PRD workflow:
--
--   requested → approved → completed
--        │
--        ├── rejected      (destination admin declined)
--        └── cancelled     (source admin / member pulled the request)
--
-- Changes:
--   1. Add 'approved' and 'cancelled' enum values.
--   2. Add columns: carry_over_standing (bool, default true),
--      denial_reason (text), cancelled_at (timestamptz).
--   3. Rewrite execute_member_transfer to honour carry_over_standing
--      (copy source standing when true, else default to 'good').
--   4. New RPCs gated via is_group_admin() / member self-request:
--      request_member_transfer, approve_member_transfer,
--      deny_member_transfer, cancel_member_transfer.
--   5. Tighten RLS: SELECT still visible to source/dest admin + the
--      transferring member; INSERT now allows self-request too;
--      UPDATE restricted (RPCs bypass RLS via SECURITY DEFINER).
--
-- Table is empty as of apply time (verified via COUNT); no data
-- migration needed.

-- ---------------------------------------------------------------------------
-- 1. Enum additions
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'transfer_status'::regtype
      AND enumlabel = 'approved'
  ) THEN
    ALTER TYPE transfer_status ADD VALUE 'approved';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'transfer_status'::regtype
      AND enumlabel = 'cancelled'
  ) THEN
    ALTER TYPE transfer_status ADD VALUE 'cancelled';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Columns
-- ---------------------------------------------------------------------------
ALTER TABLE public.member_transfers
  ADD COLUMN IF NOT EXISTS carry_over_standing boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS denial_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- ---------------------------------------------------------------------------
-- 3. Rewrite execute_member_transfer
--    - Accept status = 'approved' only.
--    - Honour carry_over_standing: when true, copy standing from source
--      membership to dest; when false, default to 'good'.
--    - Preserve the existing transfer_summary_json populated by the
--      client pre-approval.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.execute_member_transfer(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_transfer RECORD;
  v_source_membership_id uuid;
  v_new_membership_id uuid;
  v_display_name text;
  v_source_standing membership_standing;
  v_dest_standing membership_standing;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT id, source_group_id, dest_group_id, member_id,
         status::text AS status, completed_at, carry_over_standing
    INTO v_transfer
  FROM public.member_transfers
  WHERE id = p_transfer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_found');
  END IF;

  IF v_transfer.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_approved');
  END IF;

  IF v_transfer.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_completed');
  END IF;

  IF NOT (is_group_admin(v_transfer.source_group_id)
       OR is_group_admin(v_transfer.dest_group_id)
       OR is_platform_staff()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  SELECT id, display_name, standing
    INTO v_source_membership_id, v_display_name, v_source_standing
  FROM public.memberships
  WHERE group_id = v_transfer.source_group_id
    AND user_id = v_transfer.member_id
    AND membership_status = 'active'
  LIMIT 1;

  IF v_source_membership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_membership_missing');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = v_transfer.dest_group_id
      AND user_id = v_transfer.member_id
      AND membership_status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_in_destination');
  END IF;

  -- Standing carry-over: copy source standing unless the admin opted
  -- out at request time. A fresh start defaults to 'good'.
  IF v_transfer.carry_over_standing = true THEN
    v_dest_standing := v_source_standing;
  ELSE
    v_dest_standing := 'good'::membership_standing;
  END IF;

  UPDATE public.memberships
     SET standing = 'transferred'::membership_standing,
         membership_status = 'exited',
         updated_at = now()
   WHERE id = v_source_membership_id;

  INSERT INTO public.memberships (
    user_id, group_id, role, standing, is_proxy, display_name,
    membership_status, joined_at
  )
  VALUES (
    v_transfer.member_id, v_transfer.dest_group_id, 'member'::membership_role,
    v_dest_standing, false, v_display_name, 'active', now()
  )
  RETURNING id INTO v_new_membership_id;

  UPDATE public.member_transfers
     SET status = 'completed',
         completed_at = now(),
         updated_at = now()
   WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'ok', true,
    'new_membership_id', v_new_membership_id,
    'source_membership_id', v_source_membership_id,
    'dest_standing', v_dest_standing::text
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. State transition RPCs
-- ---------------------------------------------------------------------------

-- request_member_transfer: source admin OR the member themselves.
CREATE OR REPLACE FUNCTION public.request_member_transfer(
  p_member_id uuid,
  p_source_group_id uuid,
  p_dest_group_id uuid,
  p_reason text DEFAULT NULL,
  p_carry_over_standing boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_transfer_id uuid;
  v_is_self boolean;
  v_is_source_admin boolean;
  v_dest_active boolean;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  IF p_source_group_id = p_dest_group_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'same_group');
  END IF;

  v_is_self := (v_caller = p_member_id);
  v_is_source_admin := is_group_admin(p_source_group_id);

  IF NOT (v_is_self OR v_is_source_admin OR is_platform_staff()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- Source membership must exist and be active.
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE user_id = p_member_id
      AND group_id = p_source_group_id
      AND membership_status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_membership_missing');
  END IF;

  -- No duplicate open transfer.
  IF EXISTS (
    SELECT 1 FROM public.member_transfers
    WHERE member_id = p_member_id
      AND source_group_id = p_source_group_id
      AND dest_group_id = p_dest_group_id
      AND status IN ('requested', 'approved')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'duplicate_open_transfer');
  END IF;

  -- Destination group must be active.
  SELECT is_active INTO v_dest_active FROM public.groups WHERE id = p_dest_group_id;
  IF v_dest_active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dest_group_inactive');
  END IF;

  INSERT INTO public.member_transfers (
    member_id, source_group_id, dest_group_id, reason,
    carry_over_standing, requested_by, status
  )
  VALUES (
    p_member_id, p_source_group_id, p_dest_group_id,
    NULLIF(btrim(p_reason), ''),
    COALESCE(p_carry_over_standing, true),
    v_caller, 'requested'
  )
  RETURNING id INTO v_transfer_id;

  RETURN jsonb_build_object('ok', true, 'transfer_id', v_transfer_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_member_transfer(uuid, uuid, uuid, text, boolean)
  TO authenticated, service_role;


-- approve_member_transfer: destination admin confirms they'll take the
-- member. Moves requested → approved.
CREATE OR REPLACE FUNCTION public.approve_member_transfer(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_transfer RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT id, dest_group_id, status::text AS status
    INTO v_transfer
  FROM public.member_transfers
  WHERE id = p_transfer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_found');
  END IF;

  IF v_transfer.status <> 'requested' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state');
  END IF;

  IF NOT (is_group_admin(v_transfer.dest_group_id) OR is_platform_staff()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  UPDATE public.member_transfers
     SET status = 'approved',
         approved_by_dest = v_caller,
         updated_at = now()
   WHERE id = p_transfer_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_member_transfer(uuid)
  TO authenticated, service_role;


-- deny_member_transfer: destination admin declines; reason required.
CREATE OR REPLACE FUNCTION public.deny_member_transfer(
  p_transfer_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_transfer RECORD;
  v_reason text := NULLIF(btrim(p_reason), '');
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  IF v_reason IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_required');
  END IF;

  SELECT id, dest_group_id, status::text AS status
    INTO v_transfer
  FROM public.member_transfers
  WHERE id = p_transfer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_found');
  END IF;

  IF v_transfer.status <> 'requested' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state');
  END IF;

  IF NOT (is_group_admin(v_transfer.dest_group_id) OR is_platform_staff()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  UPDATE public.member_transfers
     SET status = 'rejected',
         denial_reason = v_reason,
         updated_at = now()
   WHERE id = p_transfer_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.deny_member_transfer(uuid, text)
  TO authenticated, service_role;


-- cancel_member_transfer: source admin or the requesting member pulls
-- the request while it's still pending. Only valid in 'requested' state
-- — once approved, execution is owed to the destination.
CREATE OR REPLACE FUNCTION public.cancel_member_transfer(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_transfer RECORD;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT id, source_group_id, requested_by, member_id, status::text AS status
    INTO v_transfer
  FROM public.member_transfers
  WHERE id = p_transfer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_found');
  END IF;

  IF v_transfer.status <> 'requested' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state');
  END IF;

  IF NOT (
    is_group_admin(v_transfer.source_group_id)
    OR v_caller = v_transfer.requested_by
    OR v_caller = v_transfer.member_id
    OR is_platform_staff()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  UPDATE public.member_transfers
     SET status = 'cancelled',
         cancelled_at = now(),
         updated_at = now()
   WHERE id = p_transfer_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_member_transfer(uuid)
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 5. RLS — widen SELECT to include the transferring member, tighten
--    direct INSERT/UPDATE (RPCs bypass RLS via SECURITY DEFINER).
-- ---------------------------------------------------------------------------

-- Drop + recreate SELECT with the transferring member included.
DROP POLICY IF EXISTS "Admins of source or dest can view transfers" ON public.member_transfers;
CREATE POLICY "transfers_select"
  ON public.member_transfers FOR SELECT
  TO authenticated
  USING (
    -- Transferring member can see their own transfers
    auth.uid() = member_id
    OR
    -- Source or dest admin (owner/admin role) can see
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND (m.group_id = member_transfers.source_group_id
             OR m.group_id = member_transfers.dest_group_id)
    )
    OR is_platform_staff()
  );

-- INSERT: block direct client writes; force the request_member_transfer RPC.
DROP POLICY IF EXISTS "Admins can create transfers" ON public.member_transfers;
CREATE POLICY "transfers_insert_blocked"
  ON public.member_transfers FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- UPDATE: block direct client writes; force the state-transition RPCs.
DROP POLICY IF EXISTS "Admins can update transfers" ON public.member_transfers;
CREATE POLICY "transfers_update_blocked"
  ON public.member_transfers FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- DELETE: source admin may purge pending/rejected/cancelled rows.
DROP POLICY IF EXISTS "transfers_delete" ON public.member_transfers;
CREATE POLICY "transfers_delete"
  ON public.member_transfers FOR DELETE
  TO authenticated
  USING (
    status IN ('requested', 'rejected', 'cancelled')
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.group_id = member_transfers.source_group_id
    )
  );
