-- ============================================================
-- Fix proxy member support
-- 1. Make user_id nullable on memberships for proxy members
-- 2. Drop the UNIQUE(user_id, group_id) constraint (replace with partial)
-- 3. Create SECURITY DEFINER function for proxy member creation
-- ============================================================

-- Step 1: Make user_id nullable
ALTER TABLE public.memberships ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Drop the old unique constraint and create a partial one
-- (only enforce uniqueness for non-proxy members who have a user_id)
ALTER TABLE public.memberships DROP CONSTRAINT IF EXISTS memberships_user_id_group_id_key;
CREATE UNIQUE INDEX memberships_user_group_unique
  ON public.memberships (user_id, group_id)
  WHERE user_id IS NOT NULL;

-- Step 3: Create the proxy member function
CREATE OR REPLACE FUNCTION create_proxy_member(
  p_group_id UUID,
  p_display_name TEXT,
  p_phone TEXT DEFAULT NULL,
  p_role TEXT DEFAULT 'member'
) RETURNS UUID AS $$
DECLARE
  new_membership_id UUID;
  caller_id UUID;
BEGIN
  caller_id := auth.uid();

  -- Verify caller is a member of the target group
  IF NOT EXISTS (
    SELECT 1 FROM memberships
    WHERE group_id = p_group_id AND user_id = caller_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this group';
  END IF;

  new_membership_id := gen_random_uuid();

  -- Create membership with user_id = NULL for proxy members
  -- All proxy info stored in display_name + privacy_settings JSONB
  INSERT INTO memberships (
    id, user_id, group_id, display_name, role, standing,
    is_proxy, proxy_manager_id, joined_at, privacy_settings
  ) VALUES (
    new_membership_id,
    NULL,  -- No real user account
    p_group_id,
    p_display_name,
    p_role::membership_role,
    'good'::membership_standing,
    true,
    caller_id,
    now(),
    jsonb_build_object(
      'proxy_phone', COALESCE(p_phone, ''),
      'proxy_name', p_display_name,
      'show_phone', false,
      'show_email', false
    )
  );

  RETURN new_membership_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION create_proxy_member TO authenticated;
