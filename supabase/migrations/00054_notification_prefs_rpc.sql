-- ============================================================
-- Migration 00054: SECURITY DEFINER RPC for notification preferences
--
-- ROOT CAUSE: getEnabledChannels() runs client-side with the
-- ADMIN's JWT but queries profiles for RECIPIENT users. The
-- profiles SELECT RLS policy is (auth.uid() = id), so every
-- query for a non-self user returns 0 rows (PGRST116 / 406).
-- The catch block returns fallback defaults — preferences are
-- NEVER actually read for other users.
--
-- FIX: A SECURITY DEFINER function that reads only the
-- notification_preferences column, bypassing RLS. It exposes
-- no other profile data (email, phone, name, etc.).
-- ============================================================

CREATE OR REPLACE FUNCTION get_notification_preferences(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT COALESCE(notification_preferences, '{}'::JSONB)
  FROM profiles
  WHERE id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_notification_preferences(UUID) TO authenticated;
