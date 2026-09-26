-- supabase/migrations/00135_m14_01_community_cards.sql

ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS allow_public_cards BOOLEAN DEFAULT true;

CREATE TYPE public.community_card_type AS ENUM ('membership_card', 'election_success', 'milestone_achievement');

CREATE TABLE IF NOT EXISTS public.community_share_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    member_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
    card_type public.community_card_type NOT NULL,
    share_token TEXT UNIQUE NOT NULL,
    display_data JSONB NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ
);

ALTER TABLE public.community_share_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY community_share_cards_owner_select ON public.community_share_cards
  FOR SELECT TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.memberships 
      WHERE group_id = community_share_cards.group_id 
        AND user_id = auth.uid() 
        AND status = 'active'
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.community_share_cards FROM authenticated, anon, public;

CREATE OR REPLACE FUNCTION public.issue_member_share_card(
  p_group_id UUID,
  p_card_type TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_membership_id UUID;
  v_group_name TEXT;
  v_member_name TEXT;
  v_allow_public_cards BOOLEAN;
  v_token TEXT;
  v_display_data JSONB;
BEGIN
  -- Validate active member and get details
  SELECT m.id, p.full_name INTO v_membership_id, v_member_name
  FROM public.memberships m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.group_id = p_group_id
    AND m.user_id = auth.uid()
    AND m.status = 'active'
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Must be an active member.' USING ERRCODE = '42501';
  END IF;

  -- Validate group permits sharing
  SELECT name, COALESCE(allow_public_cards, true) INTO v_group_name, v_allow_public_cards
  FROM public.groups
  WHERE id = p_group_id;

  IF NOT v_allow_public_cards THEN
    RAISE EXCEPTION 'FORBIDDEN: Organization has disabled public sharing.' USING ERRCODE = '42501';
  END IF;

  v_token := encode(public.gen_random_bytes(16), 'hex');

  v_display_data := jsonb_build_object(
    'organization_name', v_group_name,
    'member_display_name', COALESCE(v_member_name, 'Member'),
    'issued_at', now(),
    'card_type', p_card_type
  );

  INSERT INTO public.community_share_cards (
    group_id,
    member_id,
    card_type,
    share_token,
    display_data
  ) VALUES (
    p_group_id,
    v_membership_id,
    p_card_type::public.community_card_type,
    v_token,
    v_display_data
  );

  RETURN jsonb_build_object(
    'token', v_token,
    'share_url', 'https://villageclaq.com/c/' || v_token,
    'display_data', v_display_data
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_public_share_token(
  p_token TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_card record;
BEGIN
  SELECT * INTO v_card
  FROM public.community_share_cards
  WHERE share_token = p_token;

  IF v_card IS NULL THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'not_found');
  END IF;

  IF v_card.revoked THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'revoked');
  END IF;

  IF v_card.expires_at IS NOT NULL AND v_card.expires_at < now() THEN
    RETURN jsonb_build_object('valid', false, 'reason', 'expired');
  END IF;

  RETURN jsonb_build_object(
    'valid', true,
    'organization_name', v_card.display_data->>'organization_name',
    'member_display_name', v_card.display_data->>'member_display_name',
    'issued_at', v_card.display_data->>'issued_at',
    'card_type', v_card.display_data->>'card_type'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_share_card(
  p_group_id UUID,
  p_card_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_card record;
  v_is_admin BOOLEAN;
  v_membership_id UUID;
BEGIN
  SELECT id INTO v_membership_id
  FROM public.memberships
  WHERE group_id = p_group_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  v_is_admin := public.has_group_permission(p_group_id, auth.uid(), 'members.manage');

  SELECT * INTO v_card
  FROM public.community_share_cards
  WHERE id = p_card_id AND group_id = p_group_id
  FOR UPDATE;

  IF v_card IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = '23505';
  END IF;

  IF v_card.member_id != v_membership_id AND NOT v_is_admin THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  UPDATE public.community_share_cards
  SET revoked = true
  WHERE id = p_card_id;
END;
$$;
