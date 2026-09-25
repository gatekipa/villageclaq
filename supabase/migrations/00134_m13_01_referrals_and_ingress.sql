-- supabase/migrations/00134_m13_01_referrals_and_ingress.sql

CREATE TYPE public.referral_status AS ENUM ('issued', 'claimed', 'activated', 'revoked');

CREATE TABLE IF NOT EXISTS public.organization_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    referrer_member_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    target_organization_type TEXT,
    status public.referral_status NOT NULL DEFAULT 'issued',
    activated_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at TIMESTAMPTZ
);

ALTER TABLE public.organization_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY organization_referrals_select ON public.organization_referrals
  FOR SELECT TO authenticated
  USING (referrer_member_id IN (
    SELECT id FROM public.memberships 
    WHERE group_id = organization_referrals.referrer_group_id 
      AND user_id = auth.uid() 
      AND status = 'active'
  ));

REVOKE INSERT, UPDATE, DELETE ON public.organization_referrals FROM authenticated, anon, public;

CREATE OR REPLACE FUNCTION public.generate_group_referral_link(
  p_group_id UUID,
  p_target_org_type TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_membership_id UUID;
  v_token TEXT;
BEGIN
  -- Validate caller is active member
  SELECT id INTO v_membership_id
  FROM public.memberships
  WHERE group_id = p_group_id
    AND user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: Must be an active member to generate referrals.' USING ERRCODE = '42501';
  END IF;

  v_token := encode(public.gen_random_bytes(16), 'hex');

  INSERT INTO public.organization_referrals (
    referrer_group_id,
    referrer_member_id,
    token,
    target_organization_type
  ) VALUES (
    p_group_id,
    v_membership_id,
    v_token,
    p_target_org_type
  );

  RETURN jsonb_build_object(
    'token', v_token,
    'share_url', 'https://villageclaq.com/onboard?ref=' || v_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_group_referral(
  p_token TEXT,
  p_new_group_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referral record;
BEGIN
  SELECT * INTO v_referral
  FROM public.organization_referrals
  WHERE token = p_token
  FOR UPDATE;

  IF v_referral IS NULL THEN
    RAISE EXCEPTION 'INVALID_TOKEN: Referral token does not exist.' USING ERRCODE = '23505';
  END IF;

  IF v_referral.status != 'issued' THEN
    IF v_referral.status = 'claimed' AND v_referral.activated_group_id = p_new_group_id THEN
      RETURN jsonb_build_object('success', true, 'status', 'claimed');
    END IF;
    RAISE EXCEPTION 'INVALID_STATUS: Referral token cannot be claimed.' USING ERRCODE = '23505';
  END IF;

  UPDATE public.organization_referrals
  SET status = 'claimed',
      activated_group_id = p_new_group_id
  WHERE id = v_referral.id;

  INSERT INTO public.notifications_queue (
    group_id,
    membership_id,
    idempotency_key,
    payload
  ) VALUES (
    v_referral.referrer_group_id,
    v_referral.referrer_member_id,
    'ref_claim_' || p_token,
    jsonb_build_object('type', 'referral_claimed')
  );

  RETURN jsonb_build_object('success', true, 'status', 'claimed');
END;
$$;

CREATE OR REPLACE FUNCTION public.record_group_activation(
  p_group_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_referral record;
BEGIN
  FOR v_referral IN 
    SELECT * FROM public.organization_referrals
    WHERE activated_group_id = p_group_id AND status = 'claimed'
  LOOP
    UPDATE public.organization_referrals
    SET status = 'activated',
        activated_at = now()
    WHERE id = v_referral.id;

    INSERT INTO public.notifications_queue (
      group_id,
      membership_id,
      idempotency_key,
      payload
    ) VALUES (
      v_referral.referrer_group_id,
      v_referral.referrer_member_id,
      'ref_activate_' || v_referral.token,
      jsonb_build_object('type', 'referral_activated')
    );
  END LOOP;
END;
$$;
