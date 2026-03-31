-- Migration: Add DELETE policy for memberships table
-- Root cause: No DELETE policy existed, so RLS silently blocked all membership deletions
-- (Supabase returns 204 with 0 rows affected when RLS blocks DELETE)

-- Allow group owners/admins to delete memberships (remove members)
-- Also allow members to delete their own membership (leave group)
CREATE POLICY "Members can leave or admins can remove members"
  ON public.memberships FOR DELETE
  TO authenticated
  USING (
    -- Members can delete their own membership (leave group)
    user_id = auth.uid()
    OR
    -- Group owners/admins can delete other memberships
    EXISTS (
      SELECT 1 FROM public.memberships admin_m
      WHERE admin_m.group_id = memberships.group_id
      AND admin_m.user_id = auth.uid()
      AND admin_m.role IN ('owner', 'admin')
    )
  );
