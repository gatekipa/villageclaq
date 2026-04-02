-- ============================================================================
-- 00042: Join codes — performance indexes + atomic max_uses enforcement
-- ============================================================================

-- Partial index for active code lookups (the hot path on every join page visit)
CREATE INDEX IF NOT EXISTS idx_join_codes_active_code
  ON public.join_codes(code)
  WHERE is_active = true;

-- Index on group_id for the invitations page query
CREATE INDEX IF NOT EXISTS idx_join_codes_group_id
  ON public.join_codes(group_id);

-- Index on (group_id, is_active) for the regeneration query
CREATE INDEX IF NOT EXISTS idx_join_codes_group_active
  ON public.join_codes(group_id)
  WHERE is_active = true;

-- ============================================================================
-- Atomic join-via-code RPC: validates code, increments use_count, and
-- prevents exceeding max_uses in a single atomic operation.
-- Returns the group_id if the code is valid, NULL otherwise.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.use_join_code(p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_id UUID;
BEGIN
  UPDATE public.join_codes
  SET use_count = COALESCE(use_count, 0) + 1
  WHERE upper(code) = upper(p_code)
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND (max_uses IS NULL OR max_uses = 0 OR use_count < max_uses)
  RETURNING group_id INTO v_group_id;

  RETURN v_group_id;
END;
$$;

-- ============================================================================
-- Atomic code regeneration RPC: deactivates old codes and creates new one
-- in a single transaction to prevent race conditions.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.regenerate_join_code(
  p_group_id UUID,
  p_created_by UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_code TEXT;
BEGIN
  -- Deactivate all existing codes for this group
  UPDATE public.join_codes
  SET is_active = false
  WHERE group_id = p_group_id AND is_active = true;

  -- Insert new code (uses the table DEFAULT for code generation)
  INSERT INTO public.join_codes (group_id, created_by, is_active)
  VALUES (p_group_id, p_created_by, true)
  RETURNING code INTO v_new_code;

  RETURN v_new_code;
END;
$$;
