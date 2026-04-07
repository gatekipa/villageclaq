-- ================================================
-- MIGRATION 00065: Missing RPC functions
-- Run in Supabase SQL Editor
-- ================================================

-- ─── get_user_email ─────────────────────────────────────────────────────────
-- Called by /api/email/send to resolve a user UUID to their email address.
-- SECURITY DEFINER to access auth.users (not exposed to regular clients).
-- Without this, ALL email sends that pass a user_id (instead of raw email) fail.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_email(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.email
  FROM auth.users a
  WHERE a.id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_email(UUID) TO service_role;
-- Do NOT grant to authenticated — only the server should resolve emails

-- ─── get_group_subscription_tier ────────────────────────────────────────────
-- Called during join flow to check member limit before allowing new members.
-- SECURITY DEFINER so non-members can read the group's tier during join.
-- Without this, the join page crashes for users not yet in the group.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_group_subscription_tier(p_group_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT s.plan_id
     FROM group_subscriptions s
     WHERE s.group_id = p_group_id
       AND s.status IN ('active', 'trialing')
     ORDER BY s.created_at DESC
     LIMIT 1),
    'free'
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_group_subscription_tier(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_subscription_tier(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
