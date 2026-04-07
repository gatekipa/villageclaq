-- ================================================
-- MIGRATION 00064: Batch B fixes
-- Run in Supabase SQL Editor
-- ================================================

-- ─── get_member_emails RPC ──────────────────────────────────────────────────
-- The event-reminders cron calls this function to resolve email addresses
-- for all non-proxy members in a group. Without it, no reminder emails are sent.
-- Mirrors the pattern of get_member_phones (migration 00024).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_member_emails(p_group_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  display_name TEXT,
  preferred_locale TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.user_id,
    a.email,
    COALESCE(m.display_name, p.full_name) AS display_name,
    COALESCE(p.preferred_locale, 'en') AS preferred_locale
  FROM memberships m
  JOIN profiles p ON p.id = m.user_id
  JOIN auth.users a ON a.id = m.user_id
  WHERE m.group_id = p_group_id
    AND m.user_id IS NOT NULL
    AND m.is_proxy = false
    AND a.email IS NOT NULL
    AND a.email != '';
$$;

GRANT EXECUTE ON FUNCTION public.get_member_emails(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_emails(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
