-- M13: introduction attribution only. A token never grants membership or authority.
BEGIN;
DO $pre$
BEGIN
  IF to_regclass('public.groups') IS NULL OR to_regclass('public.memberships') IS NULL
     OR to_regclass('public.financial_events') IS NULL
  THEN RAISE EXCEPTION 'M13_ABORT: identity/core workflow prerequisites missing'; END IF;
END
$pre$;
CREATE TYPE public.referral_status AS ENUM ('issued','claimed','activated','revoked');
CREATE TABLE public.organization_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  referrer_member_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  target_organization_type text,
  status public.referral_status NOT NULL DEFAULT 'issued',
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '30 days'),
  claimed_group_id uuid UNIQUE REFERENCES public.groups(id) ON DELETE RESTRICT,
  claimed_by_user_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  claimed_at timestamptz,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.organization_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.organization_referrals FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.generate_group_referral_link(
  p_group_id uuid,p_target_org_type text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_member uuid; v_token text; v_id uuid;
BEGIN
  SELECT m.id INTO v_member FROM public.memberships m
  WHERE m.group_id=p_group_id AND m.user_id=auth.uid()
    AND m.membership_status='active' LIMIT 1;
  IF v_member IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_target_org_type IS NOT NULL AND p_target_org_type NOT IN
    ('association','alumni','njangi','cultural')
    THEN RAISE EXCEPTION 'INVALID_TARGET_TYPE'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('referral-issue'),pg_catalog.hashtext(v_member::text));
  IF (SELECT count(*) FROM public.organization_referrals r
      WHERE r.referrer_member_id=v_member AND r.status IN ('issued','claimed')
        AND r.expires_at>now())>=100
    THEN RAISE EXCEPTION 'REFERRAL_LIMIT'; END IF;
  v_token:=pg_catalog.encode(extensions.gen_random_bytes(24),'hex');
  INSERT INTO public.organization_referrals
    (referrer_group_id,referrer_member_id,token_hash,target_organization_type)
  VALUES(p_group_id,v_member,
    pg_catalog.encode(extensions.digest(v_token,'sha256'),'hex'),p_target_org_type)
  RETURNING id INTO v_id;
  RETURN pg_catalog.jsonb_build_object('id',v_id,'token',v_token,
    'share_url','https://villageclaq.com/onboard?ref='||v_token,
    'expires_in_days',30);
END
$$;
CREATE OR REPLACE FUNCTION public.claim_group_referral(
  p_token text,p_new_group_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ref public.organization_referrals%ROWTYPE; v_group public.groups%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_token IS NULL OR p_token !~ '^[0-9a-f]{48}$'
     OR p_new_group_id IS NULL THEN RAISE EXCEPTION 'INVALID_REFERRAL'; END IF;
  SELECT * INTO v_group FROM public.groups WHERE id=p_new_group_id FOR SHARE;
  IF v_group.id IS NULL OR v_group.created_by IS DISTINCT FROM auth.uid()
     OR v_group.status<>'active'
     OR NOT EXISTS (SELECT 1 FROM public.memberships m
       WHERE m.group_id=p_new_group_id AND m.user_id=auth.uid()
         AND m.role='owner' AND m.membership_status='active')
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_ref FROM public.organization_referrals
    WHERE token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
    FOR UPDATE;
  IF v_ref.id IS NULL OR v_ref.status='revoked' OR v_ref.expires_at<=now()
     OR v_group.created_at<v_ref.created_at
  THEN RAISE EXCEPTION 'INVALID_REFERRAL'; END IF;
  IF v_ref.status IN ('claimed','activated') THEN
    IF v_ref.claimed_group_id=p_new_group_id
       AND v_ref.claimed_by_user_id=auth.uid() THEN
      RETURN pg_catalog.jsonb_build_object('success',true,'status',v_ref.status);
    END IF;
    RAISE EXCEPTION 'INVALID_REFERRAL';
  END IF;
  IF EXISTS (SELECT 1 FROM public.organization_referrals r
             WHERE r.claimed_group_id=p_new_group_id) THEN
    RAISE EXCEPTION 'INVALID_REFERRAL'; END IF;
  UPDATE public.organization_referrals SET status='claimed',
    claimed_group_id=p_new_group_id,claimed_by_user_id=auth.uid(),claimed_at=now()
  WHERE id=v_ref.id;
  RETURN pg_catalog.jsonb_build_object('success',true,'status','claimed');
END
$$;
CREATE OR REPLACE FUNCTION public.revoke_group_referral(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ref public.organization_referrals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_token IS NULL OR p_token !~ '^[0-9a-f]{48}$'
  THEN RAISE EXCEPTION 'INVALID_REFERRAL'; END IF;
  SELECT * INTO v_ref FROM public.organization_referrals
  WHERE token_hash=pg_catalog.encode(extensions.digest(p_token,'sha256'),'hex')
  FOR UPDATE;
  IF v_ref.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.memberships m
      WHERE m.id=v_ref.referrer_member_id AND m.user_id=auth.uid()
        AND m.membership_status='active')
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF v_ref.status='activated' THEN RAISE EXCEPTION 'ALREADY_ACTIVATED'; END IF;
  UPDATE public.organization_referrals SET status='revoked' WHERE id=v_ref.id;
  RETURN pg_catalog.jsonb_build_object('revoked',true);
END
$$;
CREATE OR REPLACE FUNCTION public.list_own_group_referrals(p_group_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rows jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.memberships m
      WHERE m.group_id=p_group_id AND m.user_id=auth.uid()
        AND m.membership_status='active')
    THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,
    'status',r.status,'created_at',r.created_at,'expires_at',r.expires_at)
    ORDER BY r.created_at DESC),'[]'::jsonb) INTO v_rows
  FROM (SELECT r.id,r.status,r.created_at,r.expires_at
    FROM public.organization_referrals r JOIN public.memberships m
      ON m.id=r.referrer_member_id
    WHERE r.referrer_group_id=p_group_id AND m.user_id=auth.uid()
      AND r.status IN ('issued','claimed') AND r.expires_at>now()
    ORDER BY r.created_at DESC LIMIT 100) r;
  RETURN v_rows;
END
$$;
CREATE OR REPLACE FUNCTION public.revoke_group_referral_by_id(p_referral_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ref public.organization_referrals%ROWTYPE;
BEGIN
  SELECT * INTO v_ref FROM public.organization_referrals
    WHERE id=p_referral_id FOR UPDATE;
  IF v_ref.id IS NULL OR NOT EXISTS (SELECT 1 FROM public.memberships m
      WHERE m.id=v_ref.referrer_member_id AND m.user_id=auth.uid()
        AND m.membership_status='active')
    THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF v_ref.status='activated' THEN RAISE EXCEPTION 'ALREADY_ACTIVATED'; END IF;
  UPDATE public.organization_referrals SET status='revoked'
    WHERE id=v_ref.id;
  RETURN jsonb_build_object('revoked',true);
END
$$;
CREATE SCHEMA referral_core;
REVOKE ALL ON SCHEMA referral_core FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.record_group_activation(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF coalesce(auth.jwt()->>'role','')<>'service_role' THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  PERFORM referral_core.maybe_activate_group(p_group_id);
END
$$;
CREATE OR REPLACE FUNCTION referral_core.maybe_activate_group(p_group_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_ref public.organization_referrals%ROWTYPE; v_group public.groups%ROWTYPE;
BEGIN
  SELECT * INTO v_ref FROM public.organization_referrals
    WHERE claimed_group_id=p_group_id FOR UPDATE;
  IF v_ref.id IS NULL OR v_ref.status<>'claimed' THEN RETURN; END IF;
  SELECT * INTO v_group FROM public.groups WHERE id=p_group_id;
  IF v_group.id IS NULL OR v_group.status<>'active'
     OR coalesce(v_group.settings->>'is_test','false')='true'
     OR NOT EXISTS (SELECT 1 FROM public.memberships m
       WHERE m.group_id=p_group_id AND m.user_id<>v_ref.claimed_by_user_id
         AND m.role<>'owner' AND m.membership_status='active')
     OR NOT (
       EXISTS (SELECT 1 FROM public.financial_events e
         WHERE e.group_id=p_group_id AND e.status='posted')
       OR EXISTS (SELECT 1 FROM public.events e
         JOIN public.event_attendances a ON a.event_id=e.id
         WHERE e.group_id=p_group_id AND e.status='completed'
           AND a.status IN ('present','late'))
     )
  THEN RETURN; END IF;
  UPDATE public.organization_referrals SET status='activated',activated_at=now()
  WHERE id=v_ref.id;
END
$$;
CREATE OR REPLACE FUNCTION referral_core.activate_on_core_workflow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_group uuid;
BEGIN
  IF tg_table_name='financial_events' THEN
    IF new.status<>'posted' THEN RETURN new; END IF;
    v_group:=new.group_id;
  ELSIF tg_table_name='memberships' THEN
    IF new.membership_status<>'active' OR new.role='owner'
      THEN RETURN new; END IF;
    v_group:=new.group_id;
  ELSE
    IF new.status NOT IN ('present','late') THEN RETURN new; END IF;
    SELECT e.group_id INTO v_group FROM public.events e WHERE e.id=new.event_id;
  END IF;
  PERFORM referral_core.maybe_activate_group(v_group);
  RETURN new;
END
$$;
REVOKE ALL ON FUNCTION referral_core.maybe_activate_group(uuid),
  referral_core.activate_on_core_workflow()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER referral_activation_on_financial_event
  AFTER INSERT OR UPDATE OF status ON public.financial_events
  FOR EACH ROW EXECUTE FUNCTION referral_core.activate_on_core_workflow();
CREATE TRIGGER referral_activation_on_membership
  AFTER INSERT OR UPDATE OF membership_status ON public.memberships
  FOR EACH ROW EXECUTE FUNCTION referral_core.activate_on_core_workflow();
CREATE TRIGGER referral_activation_on_attendance
  AFTER INSERT OR UPDATE OF status ON public.event_attendances
  FOR EACH ROW EXECUTE FUNCTION referral_core.activate_on_core_workflow();

CREATE OR REPLACE FUNCTION public.get_referral_activation_report(
  p_cohort_start date,p_cohort_end date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_issued int; v_claimed int; v_activated int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.platform_staff s
      WHERE s.user_id=auth.uid() AND s.is_active
        AND s.role IN ('super_admin','admin','sales'))
    THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  IF p_cohort_start IS NULL OR p_cohort_end IS NULL
    OR p_cohort_end<p_cohort_start
    OR p_cohort_end>current_date
    OR p_cohort_end-p_cohort_start>366
    THEN RAISE EXCEPTION 'INVALID_COHORT'; END IF;
  SELECT count(*) INTO v_issued FROM public.organization_referrals r
    WHERE r.created_at::date BETWEEN p_cohort_start AND p_cohort_end;
  SELECT count(*),count(*) FILTER (WHERE r.activated_at IS NOT NULL)
    INTO v_claimed,v_activated FROM public.organization_referrals r
    WHERE r.claimed_at::date BETWEEN p_cohort_start AND p_cohort_end;
  RETURN jsonb_build_object('cohort_start',p_cohort_start,
    'cohort_end',p_cohort_end,'cohort_basis','claimed_at',
    'issued',v_issued,'claimed',v_claimed,
    'unique_activated_organizations',v_activated,
    'activation_rate_pct',CASE WHEN v_claimed=0 THEN 0
      ELSE round(100.0*v_activated/v_claimed,2) END);
END
$$;
REVOKE ALL ON FUNCTION public.get_referral_activation_report(date,date)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_referral_activation_report(date,date)
  TO authenticated;
REVOKE ALL ON FUNCTION public.generate_group_referral_link(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.claim_group_referral(text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.revoke_group_referral(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_own_group_referrals(uuid),
  public.revoke_group_referral_by_id(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.record_group_activation(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.generate_group_referral_link(uuid,text),
  public.claim_group_referral(text,uuid),public.revoke_group_referral(text),
  public.list_own_group_referrals(uuid),
  public.revoke_group_referral_by_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_group_activation(uuid) TO service_role;
COMMIT;
