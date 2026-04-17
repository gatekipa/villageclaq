-- 00081: Close the useMembers() phone cache leak
-- ---------------------------------------------------------------------------
-- The useMembers() hook used to embed profiles.phone in its Supabase
-- select. Every admin page that called the hook materialised phone
-- numbers into the React Query cache — visible to React Query DevTools
-- and to any script running in the page origin. The hook now drops
-- phone from its select; this migration gives the server the RPCs it
-- needs to keep dispatch flows working without putting phones on the
-- client at all.
--
-- Changes:
--
-- 1. Tighten get_member_phones(p_group_id) — was SECURITY DEFINER with
--    NO permission check. Any authenticated user of any group could
--    call it and read every phone number in a group they belong to.
--    Now gated on is_group_admin() — cron / admin-initiated dispatch
--    still works, but a regular member cannot exfiltrate the roster.
--
-- 2. Add get_membership_phones_for_dispatch(group, membership_ids[])
--    — admin-only, targeted phone lookup keyed by membership_id. Use
--    when a dispatcher has a concrete set of memberships it's about
--    to notify. Returns phone + preferred_locale for both real
--    members and proxies so the caller doesn't need to branch on
--    is_proxy.
--
-- 3. Add get_roster_with_contacts(p_group_id) — admin-only, returns the
--    full membership roster INCLUDING phone. Used by the Membership
--    Roster report server-side export. Members without this permission
--    get phones masked ("—") by the client export code.
--
-- Idempotent: all three are CREATE OR REPLACE.

-- ---------------------------------------------------------------------------
-- 1. Tighten get_member_phones — require admin
-- ---------------------------------------------------------------------------
-- Kept as LANGUAGE plpgsql because we need an IF-RAISE pre-check.
CREATE OR REPLACE FUNCTION public.get_member_phones(p_group_id uuid)
RETURNS TABLE(
  user_id uuid,
  phone text,
  display_name text,
  preferred_locale text,
  is_proxy boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
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
    AND p.phone <> ''

  UNION ALL

  SELECT
    NULL::uuid AS user_id,
    m.privacy_settings->>'proxy_phone' AS phone,
    m.display_name,
    'en' AS preferred_locale,
    true AS is_proxy
  FROM memberships m
  WHERE m.group_id = p_group_id
    AND m.is_proxy = true
    AND m.privacy_settings->>'proxy_phone' IS NOT NULL
    AND m.privacy_settings->>'proxy_phone' <> '';
END;
$$;

-- Cron routes and edge functions invoke this via the service role,
-- which bypasses the admin check (is_group_admin returns false for
-- service_role's NULL auth.uid(), but service_role also bypasses RLS
-- entirely — service_role callers use the raw table query instead of
-- this RPC, so we keep the admin gate strict here).
REVOKE EXECUTE ON FUNCTION public.get_member_phones(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_member_phones(uuid) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. Targeted dispatch lookup by membership_id
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_membership_phones_for_dispatch(
  p_group_id uuid,
  p_membership_ids uuid[]
)
RETURNS TABLE(
  membership_id uuid,
  user_id uuid,
  phone text,
  preferred_locale text,
  is_proxy boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  -- Real members (user_id set) — phone from profiles
  SELECT
    m.id AS membership_id,
    m.user_id,
    p.phone,
    COALESCE(p.preferred_locale, 'en') AS preferred_locale,
    false AS is_proxy
  FROM memberships m
  JOIN profiles p ON p.id = m.user_id
  WHERE m.group_id = p_group_id
    AND m.id = ANY(p_membership_ids)
    AND m.user_id IS NOT NULL
    AND m.is_proxy = false
    AND p.phone IS NOT NULL
    AND p.phone <> ''

  UNION ALL

  -- Proxies — phone from privacy_settings.proxy_phone
  SELECT
    m.id AS membership_id,
    NULL::uuid AS user_id,
    m.privacy_settings->>'proxy_phone' AS phone,
    'en' AS preferred_locale,
    true AS is_proxy
  FROM memberships m
  WHERE m.group_id = p_group_id
    AND m.id = ANY(p_membership_ids)
    AND m.is_proxy = true
    AND m.privacy_settings->>'proxy_phone' IS NOT NULL
    AND m.privacy_settings->>'proxy_phone' <> '';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_membership_phones_for_dispatch(uuid, uuid[])
  TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. Admin-only roster export (name + phone + joined_at + role + standing)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_roster_with_contacts(p_group_id uuid)
RETURNS TABLE(
  membership_id uuid,
  user_id uuid,
  is_proxy boolean,
  display_name text,
  full_name text,
  phone text,
  role text,
  standing text,
  joined_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id AS membership_id,
    m.user_id,
    COALESCE(m.is_proxy, false) AS is_proxy,
    m.display_name,
    p.full_name,
    CASE
      WHEN m.is_proxy = true
        THEN NULLIF(m.privacy_settings->>'proxy_phone', '')
      ELSE NULLIF(p.phone, '')
    END AS phone,
    m.role::text AS role,
    m.standing::text AS standing,
    m.joined_at
  FROM memberships m
  LEFT JOIN profiles p ON p.id = m.user_id
  WHERE m.group_id = p_group_id
  ORDER BY m.joined_at ASC NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_roster_with_contacts(uuid)
  TO authenticated, service_role;
