-- Migration: Proxy member profile claiming flow
-- Run manually in Supabase SQL Editor

-- 1. Add claimed_at column to memberships (tracks when a proxy was claimed)
ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Add claim_membership_id to invitations (links invite to a proxy membership)
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS claim_membership_id UUID DEFAULT NULL
    REFERENCES public.memberships(id) ON DELETE SET NULL;

-- 3. Create SECURITY DEFINER function to claim a proxy profile
--    This bypasses RLS to safely update the proxy membership.
CREATE OR REPLACE FUNCTION public.claim_proxy_membership(
  p_membership_id UUID,
  p_user_id UUID
) RETURNS VOID
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Verify the membership exists, is a proxy, and hasn't been claimed
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE id = p_membership_id AND is_proxy = true AND user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Membership is not a claimable proxy profile';
  END IF;

  -- Verify the user doesn't already have a membership in this group
  IF EXISTS (
    SELECT 1 FROM memberships m1
    JOIN memberships m2 ON m1.group_id = m2.group_id
    WHERE m1.id = p_membership_id AND m2.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'User already has a membership in this group';
  END IF;

  -- Claim the proxy membership — set user_id, clear proxy flag, record timestamp
  UPDATE memberships
  SET user_id = p_user_id,
      is_proxy = false,
      claimed_at = NOW(),
      updated_at = NOW()
  WHERE id = p_membership_id;
END;
$$ LANGUAGE plpgsql;
