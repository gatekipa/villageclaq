-- ============================================================================
-- Migration 00071: Proxy Claim Tokens
-- ============================================================================
-- Adds a secure token-based system for proxy members to claim their
-- membership and create their own account.
--
-- 1. Create proxy_claim_tokens table
-- 2. Create verify_claim_token() SECURITY DEFINER function
-- 3. Create claim_membership_with_token() SECURITY DEFINER function
-- 4. Grant permissions
--
-- Run manually in Supabase SQL Editor
-- ============================================================================

-- --- 1. proxy_claim_tokens table ---
CREATE TABLE IF NOT EXISTS public.proxy_claim_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ,
  claimed_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_proxy_claim_tokens_token ON public.proxy_claim_tokens(token);
CREATE INDEX IF NOT EXISTS idx_proxy_claim_tokens_membership ON public.proxy_claim_tokens(membership_id);

ALTER TABLE public.proxy_claim_tokens ENABLE ROW LEVEL SECURITY;

-- Group admins can manage claim tokens for memberships in their groups
CREATE POLICY "Group admins can manage claim tokens"
ON public.proxy_claim_tokens FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.id = proxy_claim_tokens.membership_id
    AND m.group_id IN (SELECT public.get_user_group_ids())
  )
);

GRANT ALL ON public.proxy_claim_tokens TO authenticated;
GRANT SELECT ON public.proxy_claim_tokens TO anon;

-- --- 2. verify_claim_token() — public lookup for claim page ---
CREATE OR REPLACE FUNCTION public.verify_claim_token(p_token TEXT)
RETURNS JSON
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_result JSON;
BEGIN
  SELECT json_build_object(
    'valid', true,
    'membership_id', t.membership_id,
    'member_name', m.display_name,
    'group_name', g.name,
    'group_id', g.id,
    'expires_at', t.expires_at
  ) INTO v_result
  FROM proxy_claim_tokens t
  JOIN memberships m ON m.id = t.membership_id
  JOIN groups g ON g.id = m.group_id
  WHERE t.token = p_token
    AND t.claimed_at IS NULL
    AND t.expires_at > NOW()
    AND m.user_id IS NULL
    AND m.is_proxy = true;

  IF v_result IS NULL THEN
    RETURN json_build_object('valid', false);
  END IF;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Grant to anon so unauthenticated users can verify tokens on the claim page
GRANT EXECUTE ON FUNCTION public.verify_claim_token(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.verify_claim_token(TEXT) TO authenticated;

-- --- 3. claim_membership_with_token() — authenticated users claim a proxy membership ---
CREATE OR REPLACE FUNCTION public.claim_membership_with_token(p_token TEXT, p_user_id UUID)
RETURNS VOID
SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_membership_id UUID;
BEGIN
  -- Get and validate the token
  SELECT membership_id INTO v_membership_id
  FROM proxy_claim_tokens
  WHERE token = p_token
    AND claimed_at IS NULL
    AND expires_at > NOW();

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired claim token';
  END IF;

  -- Use existing claim function (handles proxy validation + duplicate check)
  PERFORM claim_proxy_membership(v_membership_id, p_user_id);

  -- Mark token as claimed
  UPDATE proxy_claim_tokens
  SET claimed_at = NOW(), claimed_by = p_user_id
  WHERE token = p_token;

  -- Also mark any matching invitation as accepted
  UPDATE invitations
  SET status = 'accepted', user_id = p_user_id
  WHERE claim_membership_id = v_membership_id
    AND status = 'pending';
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION public.claim_membership_with_token(TEXT, UUID) TO authenticated;
