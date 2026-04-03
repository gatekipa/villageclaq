-- ============================================================
-- Migration 00052: Hosting Swap Atomicity RPC + Self-Service Schema
--
-- FIX 2: Atomic swap_hosting_assignment() RPC function
-- FIX 3: Extend hosting_swap_requests for member self-service
-- ============================================================

-- ── FIX 3A: Extend hosting_swap_requests schema ──────────────────────────

-- Make to_assignment_id nullable (won't exist until admin approves)
ALTER TABLE hosting_swap_requests
  ALTER COLUMN to_assignment_id DROP NOT NULL;

-- Add new columns for member self-service workflow
ALTER TABLE hosting_swap_requests
  ADD COLUMN IF NOT EXISTS proposed_membership_id UUID REFERENCES memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS review_notes TEXT;

-- Add 'cancelled' to the swap_request_status enum
ALTER TYPE swap_request_status ADD VALUE IF NOT EXISTS 'cancelled';

-- Index for faster lookups by assignment + status
CREATE INDEX IF NOT EXISTS idx_swap_requests_assignment
  ON hosting_swap_requests(from_assignment_id, status);

-- ── FIX 3B: Update RLS — allow members to INSERT their own swap requests ──

-- Drop the admin-only INSERT policy
DROP POLICY IF EXISTS "rls_hsr_insert" ON hosting_swap_requests;

-- New INSERT: any authenticated member who owns the assignment can request a swap
CREATE POLICY "rls_hsr_insert" ON hosting_swap_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    -- The requester must be the current user
    requested_by = auth.uid()
    AND
    -- The assignment must belong to a group the user is in
    from_assignment_id IN (
      SELECT ha.id FROM hosting_assignments ha
      JOIN hosting_rosters hr ON hr.id = ha.roster_id
      WHERE hr.group_id IN (SELECT get_user_group_ids())
    )
  );

-- Update UPDATE policy: admins can approve/reject, members can cancel their own
DROP POLICY IF EXISTS "rls_hsr_update" ON hosting_swap_requests;

CREATE POLICY "rls_hsr_update" ON hosting_swap_requests
  FOR UPDATE TO authenticated
  USING (
    -- Admin of the group
    from_assignment_id IN (
      SELECT ha.id FROM hosting_assignments ha
      JOIN hosting_rosters hr ON hr.id = ha.roster_id
      WHERE is_group_admin(hr.group_id)
    )
    OR
    -- Requester can cancel their own pending request
    (requested_by = auth.uid() AND status = 'pending')
  );

-- ── FIX 2: Atomic swap RPC function ─────────────────────────────────────

CREATE OR REPLACE FUNCTION swap_hosting_assignment(
  p_original_assignment_id UUID,
  p_replacement_membership_id UUID,
  p_replacement_date DATE DEFAULT NULL,
  p_swapped_by UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original RECORD;
  v_new_id UUID;
  v_group_id UUID;
BEGIN
  -- 1. Lock and fetch original assignment + roster info
  SELECT ha.id, ha.roster_id, ha.membership_id, ha.assigned_date,
         ha.status, ha.order_index, hr.group_id
  INTO v_original
  FROM hosting_assignments ha
  JOIN hosting_rosters hr ON hr.id = ha.roster_id
  WHERE ha.id = p_original_assignment_id
  FOR UPDATE OF ha;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original assignment not found';
  END IF;

  v_group_id := v_original.group_id;

  IF v_original.status NOT IN ('upcoming') THEN
    RAISE EXCEPTION 'Assignment cannot be swapped — status is %', v_original.status;
  END IF;

  -- 2. Verify swapper is admin/owner of this group (if provided)
  IF p_swapped_by IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM memberships
      WHERE user_id = p_swapped_by
      AND group_id = v_group_id
      AND role IN ('admin', 'owner')
      AND standing NOT IN ('banned', 'suspended')
    ) THEN
      RAISE EXCEPTION 'Only admins can swap assignments';
    END IF;
  END IF;

  -- 3. Verify replacement member is active in the same group
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE id = p_replacement_membership_id
    AND group_id = v_group_id
    AND standing NOT IN ('banned', 'suspended')
  ) THEN
    RAISE EXCEPTION 'Replacement member not found or inactive in this group';
  END IF;

  -- 4. Create new assignment for replacement host
  INSERT INTO hosting_assignments (
    roster_id, membership_id, assigned_date, status, order_index,
    created_at, updated_at
  ) VALUES (
    v_original.roster_id,
    p_replacement_membership_id,
    COALESCE(p_replacement_date, v_original.assigned_date),
    'upcoming',
    v_original.order_index,
    NOW(),
    NOW()
  ) RETURNING id INTO v_new_id;

  -- 5. Mark original as swapped, link to new assignment
  UPDATE hosting_assignments
  SET status = 'swapped',
      swapped_with = v_new_id,
      updated_at = NOW()
  WHERE id = p_original_assignment_id;

  RETURN v_new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION swap_hosting_assignment TO authenticated;
GRANT EXECUTE ON FUNCTION swap_hosting_assignment TO service_role;
