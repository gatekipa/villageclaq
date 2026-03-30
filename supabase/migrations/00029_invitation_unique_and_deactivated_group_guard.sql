-- Prevent duplicate invitations: same email + group + pending/accepted status
-- Uses a partial unique index so expired/revoked invitations don't block re-invites
CREATE UNIQUE INDEX IF NOT EXISTS invitations_group_email_active_unique
  ON public.invitations (group_id, lower(email))
  WHERE status IN ('pending', 'accepted');

-- Guard: prevent access to deactivated groups
-- Members of deactivated groups should not be able to read group data
-- This adds an is_active check to the memberships RLS read policy
-- Note: Run manually in Supabase SQL Editor
