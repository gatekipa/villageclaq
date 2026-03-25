-- ============================================================
-- Fix invitations RLS policy that references auth.users
-- The client cannot access auth.users in RLS policies.
-- Replace with a group membership check instead.
-- ============================================================

-- Drop the broken policy
DROP POLICY IF EXISTS "Users can view their invitations" ON public.invitations;

-- Create a fixed policy: group members can view their group's invitations
-- Plus users can see invitations they sent
CREATE POLICY "Group members can view invitations"
  ON public.invitations FOR SELECT
  TO authenticated
  USING (
    -- User sent this invitation
    invited_by = auth.uid()
    -- OR user is a member of this group
    OR EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = invitations.group_id
      AND user_id = auth.uid()
    )
  );

-- Also add UPDATE policy so admins can revoke/update invitations
DROP POLICY IF EXISTS "Group admins can update invitations" ON public.invitations;
CREATE POLICY "Group admins can update invitations"
  ON public.invitations FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = invitations.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'moderator')
    )
  );

-- Add DELETE policy for admins
DROP POLICY IF EXISTS "Group admins can delete invitations" ON public.invitations;
CREATE POLICY "Group admins can delete invitations"
  ON public.invitations FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = invitations.group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'moderator')
    )
  );
