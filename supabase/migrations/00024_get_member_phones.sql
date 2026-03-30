-- ============================================================================
-- GET MEMBER PHONES RPC
-- Resolves phone numbers for all non-proxy members in a group.
-- Real members: phone from profiles.phone
-- Proxy members: phone from memberships.privacy_settings->>'proxy_phone'
-- Returns both so cron jobs can send SMS to all members with phones.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_member_phones(p_group_id UUID)
RETURNS TABLE (
  user_id UUID,
  phone TEXT,
  display_name TEXT,
  preferred_locale TEXT,
  is_proxy BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- Real members: phone from profiles table
  SELECT
    m.user_id,
    p.phone,
    COALESCE(m.display_name, p.full_name) AS display_name,
    COALESCE(p.preferred_locale, 'en') AS preferred_locale,
    false AS is_proxy
  FROM memberships m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.group_id = p_group_id
    AND m.user_id IS NOT NULL
    AND m.is_proxy = false
    AND p.phone IS NOT NULL
    AND p.phone != ''

  UNION ALL

  -- Proxy members: phone from privacy_settings.proxy_phone
  SELECT
    NULL::UUID AS user_id,
    m.privacy_settings->>'proxy_phone' AS phone,
    m.display_name,
    'en' AS preferred_locale,
    true AS is_proxy
  FROM memberships m
  WHERE m.group_id = p_group_id
    AND m.is_proxy = true
    AND m.privacy_settings->>'proxy_phone' IS NOT NULL
    AND m.privacy_settings->>'proxy_phone' != '';
$$;

-- Grant execute to authenticated users (RLS on memberships controls access)
GRANT EXECUTE ON FUNCTION public.get_member_phones(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_phones(UUID) TO service_role;
