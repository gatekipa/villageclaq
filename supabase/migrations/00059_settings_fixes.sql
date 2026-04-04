-- ================================================
-- MIGRATION 00059: Settings fixes — atomic ownership transfer,
-- RLS-safe groups update, owner demotion protection
-- Run manually in Supabase SQL Editor
-- ================================================

-- ── Part 1: SECURITY DEFINER function for group admin check ─────────────────
-- Avoids RLS recursion when groups UPDATE policy queries memberships
CREATE OR REPLACE FUNCTION public.is_group_admin_or_owner(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = p_group_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_group_admin_or_owner(UUID) TO authenticated;

-- ── Part 2: Update groups UPDATE RLS policy ─────────────────────────────────
DROP POLICY IF EXISTS "Group owners/admins can update" ON public.groups;
CREATE POLICY "Group owners/admins can update"
  ON public.groups FOR UPDATE
  TO authenticated
  USING (is_group_admin_or_owner(id))
  WITH CHECK (is_group_admin_or_owner(id));

-- ── Part 3: Atomic ownership transfer RPC ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.transfer_group_ownership(
  p_group_id UUID,
  p_new_owner_membership_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_membership_id UUID;
  v_new_owner_user_id UUID;
BEGIN
  -- Verify caller is the current owner
  SELECT id INTO v_caller_membership_id
  FROM public.memberships
  WHERE group_id = p_group_id
    AND user_id = auth.uid()
    AND role = 'owner';

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'error', 'code', 'not_owner');
  END IF;

  -- Verify target is a member of this group
  SELECT user_id INTO v_new_owner_user_id
  FROM public.memberships
  WHERE id = p_new_owner_membership_id
    AND group_id = p_group_id;

  IF NOT FOUND THEN
    RETURN json_build_object('status', 'error', 'code', 'target_not_found');
  END IF;

  -- Cannot transfer to self
  IF v_new_owner_user_id = auth.uid() THEN
    RETURN json_build_object('status', 'error', 'code', 'cannot_transfer_to_self');
  END IF;

  -- Set session variable to allow owner demotion in trigger
  PERFORM set_config('app.allow_owner_transfer', 'true', true); -- true = local to transaction

  -- Atomic: demote caller to admin, promote target to owner
  UPDATE public.memberships SET role = 'admin' WHERE id = v_caller_membership_id;
  UPDATE public.memberships SET role = 'owner' WHERE id = p_new_owner_membership_id;

  PERFORM set_config('app.allow_owner_transfer', 'false', true);

  RETURN json_build_object(
    'status', 'success',
    'new_owner_membership_id', p_new_owner_membership_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.transfer_group_ownership(UUID, UUID) TO authenticated;

-- ── Part 4: Prevent direct owner demotion via UPDATE ────────────────────────
-- Blocks any UPDATE that changes role FROM 'owner' TO something else
-- unless it's through the transfer_group_ownership RPC (which sets app.allow_owner_transfer)
CREATE OR REPLACE FUNCTION public.prevent_owner_demotion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'owner' AND NEW.role != 'owner' THEN
    IF NOT (current_setting('app.allow_owner_transfer', true) = 'true') THEN
      RAISE EXCEPTION 'Cannot change owner role directly. Use Transfer Ownership.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_owner_role_protection ON public.memberships;
CREATE TRIGGER enforce_owner_role_protection
  BEFORE UPDATE ON public.memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_owner_demotion();

-- ── Part 5: Reload PostgREST schema cache ───────────────────────────────────
NOTIFY pgrst, 'reload schema';
