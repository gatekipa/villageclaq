-- ============================================================
-- Fix invitations RLS so invited users (with 0 memberships)
-- can see and act on invitations addressed to their email.
--
-- ROOT CAUSE: The SELECT policy from 00015 only allows:
--   invited_by = auth.uid() OR EXISTS(membership in group)
-- New users who just signed up have neither condition true,
-- so they see 0 invitations even when rows exist for their email.
--
-- FIX:
-- a) Add user_id column to invitations (stamped on accept/decline)
-- b) Add SELECT policy matching email from the JWT claim
-- c) Add UPDATE policy so invitees can accept/decline
-- ============================================================

-- 0. Add user_id column — tracks which user accepted/declined
--    NULL for pending invitations (recipient may not have account yet)
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS user_id UUID DEFAULT NULL
  REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Index for fast lookups by user_id
CREATE INDEX IF NOT EXISTS idx_invitations_user_id ON public.invitations(user_id);

-- 1. Add SELECT policy: user can see invitations addressed to their email
CREATE POLICY "Invitees can view their invitations"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (
    email = (auth.jwt()->>'email')
  );

-- 2. Add SELECT policy: user can see invitations they already acted on (user_id stamped)
CREATE POLICY "Users can view their stamped invitations"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
  );

-- 3. Add UPDATE policy: invitees can accept/decline their own invitations
--    (The existing UPDATE policy only allows group admins)
CREATE POLICY "Invitees can update their invitations"
  ON public.invitations FOR UPDATE
  TO authenticated
  USING (
    email = (auth.jwt()->>'email')
  )
  WITH CHECK (
    email = (auth.jwt()->>'email')
  );
