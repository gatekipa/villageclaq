-- ============================================================
-- Function: create_proxy_member
-- Safely creates a proxy member (profile + membership) bypassing RLS.
-- Verifies the caller is a member of the target group.
-- ============================================================

CREATE OR REPLACE FUNCTION create_proxy_member(
  p_group_id UUID,
  p_display_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'member'
) RETURNS UUID AS $$
DECLARE
  proxy_id UUID;
  caller_id UUID;
BEGIN
  -- Get the calling user's ID
  caller_id := auth.uid();

  -- Verify caller is a member of the target group
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE group_id = p_group_id AND user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  -- Generate a UUID for the proxy member
  proxy_id := gen_random_uuid();

  -- Create a profile record for the proxy member
  INSERT INTO profiles (id, full_name, display_name, phone)
  VALUES (proxy_id, p_display_name, p_display_name, p_phone);

  -- Create the membership record
  INSERT INTO memberships (user_id, group_id, display_name, role, standing, is_proxy, proxy_manager_id, joined_at)
  VALUES (
    proxy_id,
    p_group_id,
    p_display_name,
    p_role::membership_role,
    'good'::membership_standing,
    true,
    caller_id,
    now()
  );

  RETURN proxy_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION create_proxy_member TO authenticated;
