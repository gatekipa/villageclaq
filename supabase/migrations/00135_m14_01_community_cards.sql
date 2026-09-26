-- M14 membership-card public projection. Other summary types wait for a
-- separately qualified source and publication policy.
BEGIN;
ALTER TABLE public.groups ADD COLUMN allow_public_cards boolean NOT NULL DEFAULT false;
CREATE TYPE public.community_card_type AS ENUM
  ('membership_card','election_success','milestone_achievement');
CREATE TABLE public.community_share_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  member_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
  card_type public.community_card_type NOT NULL,
  share_token text NOT NULL UNIQUE,
  display_data jsonb NOT NULL,
  revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '90 days')
);
ALTER TABLE public.community_share_cards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_share_cards FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.community_share_cards TO authenticated;
CREATE POLICY community_share_cards_owner_select ON public.community_share_cards
 FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.id=community_share_cards.member_id AND m.group_id=community_share_cards.group_id
      AND m.user_id=auth.uid() AND m.membership_status='active')
 );
CREATE OR REPLACE FUNCTION public.assert_public_card_setting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.allow_public_cards IS DISTINCT FROM OLD.allow_public_cards
     AND auth.uid() IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.group_id=NEW.id
       AND m.user_id=auth.uid() AND m.membership_status='active'
       AND m.role IN ('owner','admin'))
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_assert_public_card_setting BEFORE UPDATE OF allow_public_cards
 ON public.groups FOR EACH ROW EXECUTE FUNCTION public.assert_public_card_setting();
CREATE OR REPLACE FUNCTION public.configure_public_card_sharing(
  p_group_id uuid,p_enabled boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.group_id=p_group_id
      AND m.user_id=auth.uid() AND m.membership_status='active'
      AND m.role IN ('owner','admin'))
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  UPDATE public.groups SET allow_public_cards=coalesce(p_enabled,false)
  WHERE id=p_group_id;
  RETURN pg_catalog.jsonb_build_object('enabled',coalesce(p_enabled,false));
END
$$;
CREATE OR REPLACE FUNCTION public.issue_member_share_card(
  p_group_id uuid,p_card_type text,p_include_name boolean,p_consent boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_member public.memberships%ROWTYPE; v_group public.groups%ROWTYPE;
  v_token text; v_display jsonb; v_id uuid;
BEGIN
  IF p_consent IS DISTINCT FROM true OR p_card_type<>'membership_card' THEN
    RAISE EXCEPTION 'PUBLICATION_CONSENT_OR_SOURCE_REQUIRED'; END IF;
  SELECT * INTO v_member FROM public.memberships m
    WHERE m.group_id=p_group_id AND m.user_id=auth.uid()
      AND m.membership_status='active' FOR SHARE;
  SELECT * INTO v_group FROM public.groups g WHERE g.id=p_group_id FOR SHARE;
  IF v_member.id IS NULL OR v_group.id IS NULL OR v_group.allow_public_cards IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  v_token:=pg_catalog.encode(extensions.gen_random_bytes(24),'hex');
  v_display:=pg_catalog.jsonb_build_object(
    'organization_name',v_group.name,'card_type','membership_card',
    'issued_at',pg_catalog.to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'));
  IF p_include_name THEN
    v_display:=v_display||pg_catalog.jsonb_build_object(
      'member_display_name',coalesce(nullif(v_member.display_name,''),'Member'));
  END IF;
  INSERT INTO public.community_share_cards
    (group_id,member_id,card_type,share_token,display_data)
  VALUES(p_group_id,v_member.id,'membership_card',v_token,v_display)
  RETURNING id INTO v_id;
  RETURN pg_catalog.jsonb_build_object('card_id',v_id,'token',v_token,
    'share_url','https://villageclaq.com/verify-card/'||v_token,
    'display_data',v_display);
END
$$;
CREATE OR REPLACE FUNCTION public.verify_public_share_token(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_card public.community_share_cards%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token !~ '^[0-9a-f]{48}$' THEN
    RETURN pg_catalog.jsonb_build_object('valid',false); END IF;
  SELECT c.* INTO v_card FROM public.community_share_cards c
    JOIN public.groups g ON g.id=c.group_id AND g.allow_public_cards=true
    JOIN public.memberships m ON m.id=c.member_id AND m.group_id=c.group_id
      AND m.membership_status='active'
    WHERE c.share_token=p_token AND NOT c.revoked AND c.expires_at>now();
  IF v_card.id IS NULL THEN RETURN pg_catalog.jsonb_build_object('valid',false); END IF;
  RETURN pg_catalog.jsonb_build_object('valid',true)
    ||v_card.display_data;
END
$$;
CREATE OR REPLACE FUNCTION public.revoke_share_card(p_group_id uuid,p_card_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_card public.community_share_cards%ROWTYPE;
BEGIN
  SELECT * INTO v_card FROM public.community_share_cards c
    WHERE c.id=p_card_id AND c.group_id=p_group_id FOR UPDATE;
  IF v_card.id IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.memberships m
      WHERE m.group_id=p_group_id AND m.user_id=auth.uid()
        AND m.membership_status='active'
        AND (m.id=v_card.member_id OR m.role IN ('owner','admin')))
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  UPDATE public.community_share_cards SET revoked=true WHERE id=p_card_id;
END
$$;
REVOKE ALL ON FUNCTION public.issue_member_share_card(uuid,text,boolean,boolean)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.configure_public_card_sharing(uuid,boolean)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.configure_public_card_sharing(uuid,boolean)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_member_share_card(uuid,text,boolean,boolean)
  TO authenticated;
REVOKE ALL ON FUNCTION public.verify_public_share_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_public_share_token(text) TO anon,authenticated;
REVOKE ALL ON FUNCTION public.revoke_share_card(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.revoke_share_card(uuid,uuid) TO authenticated;
COMMIT;
