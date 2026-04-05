-- ================================================
-- MIGRATION 00062: Batch 3 follow-up fixes
-- Item 1: Tighten election_votes INSERT RLS — enforce election.status = 'open'
-- Item 2: Rebuild claim_proxy_membership — add membership_status = 'active' guard,
--          exclude exited memberships from duplicate-join check, ensure GRANT exists
-- Run in Supabase SQL Editor
-- ================================================


-- ── 1. election_votes INSERT RLS ─────────────────────────────────────────────
-- Previous policy (00026) only checked is_group_member — a member could INSERT
-- a vote via the API even when the election was closed, draft, or cancelled.
-- New policy adds: election must be in status 'open'.

DROP POLICY IF EXISTS "rls_evote_insert" ON public.election_votes;

CREATE POLICY "rls_evote_insert" ON public.election_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.elections e
      WHERE e.id = election_votes.election_id
        AND e.status = 'open'
        AND is_group_member(e.group_id)
    )
  );


-- ── 2. claim_proxy_membership — rebuild with full validation ─────────────────
-- Root cause of Bug #350: migration 00020 created the function but omitted
-- GRANT EXECUTE. Migration 00061 added the GRANT but could not verify whether
-- 00020 was actually run on this instance.
--
-- This migration uses DROP + CREATE (not CREATE OR REPLACE) so that the function
-- is guaranteed to exist with the current definition regardless of prior state.
-- Parameter names are preserved from the 00020 signature so existing callers
-- (my-invitations/page.tsx: rpc("claim_proxy_membership", { p_membership_id, p_user_id }))
-- continue to work without changes.
--
-- Improvements over 00020:
--   • Added: membership_status = 'active' guard (cannot claim exited/pending proxy)
--   • Added: excludes exited memberships from the duplicate-join check so a user
--     who previously left a group can re-enter via a proxy claim
--   • GRANT EXECUTE included inline

DROP FUNCTION IF EXISTS public.claim_proxy_membership(UUID, UUID);

CREATE FUNCTION public.claim_proxy_membership(
  p_membership_id UUID,
  p_user_id       UUID DEFAULT auth.uid()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Verify the target membership is a claimable proxy:
  --    it must be a proxy row (user_id IS NULL, is_proxy = true)
  --    AND must be in active status (not exited, not pending_approval)
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE id                = p_membership_id
      AND is_proxy          = true
      AND user_id           IS NULL
      AND membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'Membership is not a claimable proxy profile';
  END IF;

  -- 2. Prevent duplicate membership: user must not already have a non-exited
  --    membership in the same group.
  IF EXISTS (
    SELECT 1
    FROM   public.memberships m1
    JOIN   public.memberships m2 ON m1.group_id = m2.group_id
    WHERE  m1.id                = p_membership_id
      AND  m2.user_id           = p_user_id
      AND  m2.membership_status != 'exited'
  ) THEN
    RAISE EXCEPTION 'User already has a membership in this group';
  END IF;

  -- 3. Claim: bind the real user to this membership row
  UPDATE public.memberships
  SET user_id           = p_user_id,
      is_proxy          = false,
      claimed_at        = NOW(),
      updated_at        = NOW()
  WHERE id = p_membership_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_proxy_membership(UUID, UUID) TO authenticated;


-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
