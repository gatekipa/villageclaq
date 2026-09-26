-- S0-001 / S0-002 / S0-004 / H-006: authoritative, tenant-scoped membership joining.
-- Removes legacy callable mutators, serializes join-code consumption, and binds
-- proxy claims to the current caller and an unexpired invitation or claim token.

BEGIN;

-- Proxy memberships intentionally have no user until claimed.  Hierarchy 2.0
-- must not try to materialize an organization person for a NULL user.
CREATE OR REPLACE FUNCTION public.hierarchy_after_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_org uuid;
  v_root uuid;
  v_root_group uuid;
  v_org_owner uuid;
BEGIN
  SELECT g.organization_id INTO v_org
  FROM public.groups g
  WHERE g.id = NEW.group_id;

  IF v_org IS NULL OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.organization_people(organization_id,user_id)
  VALUES(v_org,NEW.user_id)
  ON CONFLICT DO NOTHING;

  SELECT ou.id,ou.group_id INTO v_root,v_root_group
  FROM public.organization_units ou
  WHERE ou.organization_id=v_org AND ou.parent_id IS NULL;

  SELECT o.owner_id INTO v_org_owner
  FROM public.organizations o
  WHERE o.id=v_org;

  IF NEW.role='owner' AND NEW.membership_status='active'
     AND (NEW.user_id=v_org_owner OR NEW.group_id=v_root_group) THEN
    INSERT INTO public.organization_scoped_grants
      (organization_id,user_id,unit_id,capability,scope_mode,granted_by)
    SELECT v_org,NEW.user_id,v_root,c.capability,'organization',NEW.user_id
    FROM (VALUES ('hierarchy.manage'),('elections.manage'),('reports.view')) c(capability)
    ON CONFLICT DO NOTHING;
  ELSIF TG_OP='UPDATE' AND OLD.role='owner' THEN
    UPDATE public.organization_scoped_grants
    SET revoked_at=now()
    WHERE organization_id=v_org AND user_id=NEW.user_id
      AND granted_by=NEW.user_id AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.hierarchy_after_membership_change()
  FROM PUBLIC,anon,authenticated,service_role;

-- These legacy helpers mutate code state without creating a membership.  No
-- mounted caller needs them; keeping them callable lets anyone consume or
-- replace another group's code.
REVOKE ALL ON FUNCTION public.use_join_code(text)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.increment_join_code_use_count(text)
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.regenerate_join_code(
  p_group_id uuid,
  p_created_by uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_new_code text;
BEGIN
  IF v_actor IS NULL OR p_created_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE='42501';
  END IF;

  PERFORM 1
  FROM public.groups g
  WHERE g.id=p_group_id AND g.status='active' AND g.is_active IS TRUE
  FOR UPDATE;
  IF NOT FOUND OR NOT public.has_group_permission(p_group_id,'members.invite',v_actor) THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE='42501';
  END IF;

  UPDATE public.join_codes
  SET is_active=false
  WHERE group_id=p_group_id AND is_active IS TRUE;

  INSERT INTO public.join_codes(group_id,created_by,is_active,role)
  VALUES(p_group_id,v_actor,true,'member'::public.membership_role)
  RETURNING code INTO v_new_code;

  INSERT INTO public.group_audit_logs
    (group_id,actor_id,action,entity_type,description,details)
  VALUES(
    p_group_id,v_actor,'member.join_code_regenerated','join_code',
    'Join code regenerated',
    pg_catalog.jsonb_build_object('provenance','regenerate_join_code')
  );

  RETURN v_new_code;
END
$$;
REVOKE ALL ON FUNCTION public.regenerate_join_code(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.regenerate_join_code(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_group_via_code(
  p_code text,
  p_display_name text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_code public.join_codes%ROWTYPE;
  v_group public.groups%ROWTYPE;
  v_existing public.memberships%ROWTYPE;
  v_member_count bigint;
  v_max_members integer;
  v_tier text;
  v_membership_id uuid;
  v_status text;
  v_role public.membership_role;
BEGIN
  IF v_actor IS NULL THEN
    RETURN pg_catalog.json_build_object('status','error','code','not_authenticated');
  END IF;
  IF p_code IS NULL OR pg_catalog.length(pg_catalog.btrim(p_code)) NOT BETWEEN 1 AND 64 THEN
    RETURN pg_catalog.json_build_object('status','error','code','invalid_code');
  END IF;

  SELECT * INTO v_code
  FROM public.join_codes jc
  WHERE pg_catalog.upper(jc.code)=pg_catalog.upper(pg_catalog.btrim(p_code))
  FOR UPDATE;

  IF NOT FOUND OR v_code.is_active IS NOT TRUE THEN
    RETURN pg_catalog.json_build_object('status','error','code','invalid_code');
  END IF;
  IF v_code.expires_at IS NOT NULL AND v_code.expires_at <= now() THEN
    RETURN pg_catalog.json_build_object('status','error','code','expired_code');
  END IF;
  IF COALESCE(v_code.max_uses,0)>0
     AND COALESCE(v_code.use_count,0)>=v_code.max_uses THEN
    RETURN pg_catalog.json_build_object('status','error','code','max_uses_reached');
  END IF;

  SELECT * INTO v_group FROM public.groups g WHERE g.id=v_code.group_id;
  IF NOT FOUND OR v_group.status<>'active' OR v_group.is_active IS NOT TRUE THEN
    RETURN pg_catalog.json_build_object('status','error','code','group_unavailable');
  END IF;

  SELECT * INTO v_existing
  FROM public.memberships m
  WHERE m.user_id=v_actor AND m.group_id=v_code.group_id;
  IF FOUND THEN
    IF v_existing.standing='banned' THEN
      RETURN pg_catalog.json_build_object('status','error','code','banned');
    ELSIF v_existing.membership_status='pending_approval' THEN
      RETURN pg_catalog.json_build_object('status','error','code','already_pending');
    ELSE
      RETURN pg_catalog.json_build_object('status','error','code','already_member');
    END IF;
  END IF;

  SELECT COALESCE(gs.tier,'free') INTO v_tier
  FROM public.group_subscriptions gs
  WHERE gs.group_id=v_code.group_id;
  v_tier := COALESCE(v_tier,'free');
  v_max_members := CASE v_tier
    WHEN 'free' THEN 15
    WHEN 'starter' THEN 50
    WHEN 'pro' THEN 200
    WHEN 'professional' THEN 200
    WHEN 'enterprise' THEN -1
    ELSE 15
  END;
  IF v_max_members<>-1 THEN
    SELECT count(*) INTO v_member_count
    FROM public.memberships m
    WHERE m.group_id=v_code.group_id
      AND m.membership_status IN ('active','pending_approval');
    IF v_member_count>=v_max_members THEN
      RETURN pg_catalog.json_build_object('status','error','code','group_full');
    END IF;
  END IF;

  v_status := CASE WHEN COALESCE((v_group.settings->>'require_join_approval')::boolean,false)
                   THEN 'pending_approval' ELSE 'active' END;
  v_role := CASE WHEN v_code.role IN ('member','moderator')
                 THEN v_code.role ELSE 'member'::public.membership_role END;

  INSERT INTO public.memberships
    (user_id,group_id,role,standing,calculated_standing,is_proxy,display_name,membership_status)
  VALUES(
    v_actor,v_code.group_id,v_role,'good'::public.membership_standing,
    'good'::public.membership_standing,false,
    NULLIF(pg_catalog.left(pg_catalog.btrim(p_display_name),200),''),v_status
  )
  RETURNING id INTO v_membership_id;

  -- Reserve a finite-use code for both active and pending requests.  Replays
  -- return above and do not consume another use.
  UPDATE public.join_codes
  SET use_count=COALESCE(use_count,0)+1
  WHERE id=v_code.id;

  INSERT INTO public.group_audit_logs
    (group_id,actor_id,action,entity_type,entity_id,description,details)
  VALUES(
    v_code.group_id,v_actor,
    CASE WHEN v_status='active' THEN 'member.joined' ELSE 'member.join_requested' END,
    'membership',v_membership_id,
    CASE WHEN v_status='active' THEN 'Member joined by code' ELSE 'Member requested to join by code' END,
    pg_catalog.jsonb_build_object(
      'provenance','join_group_via_code','join_code_id',v_code.id,'membership_status',v_status
    )
  );

  RETURN pg_catalog.json_build_object(
    'status',CASE WHEN v_status='active' THEN 'success' ELSE 'pending_approval' END,
    'membership_id',v_membership_id,'group_id',v_code.group_id
  );
END
$$;
REVOKE ALL ON FUNCTION public.join_group_via_code(text,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.join_group_via_code(text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.claim_proxy_membership(
  p_membership_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_member public.memberships%ROWTYPE;
  v_authorized boolean := false;
BEGIN
  IF v_actor IS NULL OR p_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_member
  FROM public.memberships m
  WHERE m.id=p_membership_id
  FOR UPDATE;
  IF NOT FOUND OR v_member.is_proxy IS NOT TRUE OR v_member.user_id IS NOT NULL
     OR v_member.membership_status<>'active' THEN
    RAISE EXCEPTION 'Membership is not a claimable proxy profile';
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.invitations i
    WHERE i.claim_membership_id=p_membership_id
      AND i.status='pending'
      AND i.expires_at>now()
      AND public.caller_matches_invitation(i.email,i.phone,i.role::text)
  ) OR EXISTS(
    SELECT 1
    FROM public.proxy_claim_tokens t
    WHERE t.membership_id=p_membership_id
      AND t.claimed_at IS NULL
      AND t.expires_at>now()
      AND (
        (NULLIF(t.email,'') IS NOT NULL
          AND pg_catalog.lower(t.email)=pg_catalog.lower(NULLIF(auth.jwt()->>'email','')))
        OR
        (NULLIF(t.phone,'') IS NOT NULL
          AND public.get_my_phone_digits() IS NOT NULL
          AND NULLIF(pg_catalog.regexp_replace(t.phone,'\\D','','g'),'')=public.get_my_phone_digits())
      )
  ) INTO v_authorized;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE='42501';
  END IF;

  IF EXISTS(
    SELECT 1 FROM public.memberships m
    WHERE m.group_id=v_member.group_id AND m.user_id=v_actor
  ) THEN
    RAISE EXCEPTION 'User already has a membership in this group';
  END IF;

  UPDATE public.memberships
  SET user_id=v_actor,is_proxy=false,claimed_at=now(),updated_at=now()
  WHERE id=p_membership_id;

  UPDATE public.invitations
  SET status='accepted',accepted_at=now(),user_id=v_actor
  WHERE claim_membership_id=p_membership_id
    AND status='pending' AND expires_at>now()
    AND public.caller_matches_invitation(email,phone,role::text);

  UPDATE public.proxy_claim_tokens
  SET claimed_at=now(),claimed_by=v_actor
  WHERE membership_id=p_membership_id AND claimed_at IS NULL AND expires_at>now()
    AND (
      (NULLIF(email,'') IS NOT NULL
        AND pg_catalog.lower(email)=pg_catalog.lower(NULLIF(auth.jwt()->>'email','')))
      OR
      (NULLIF(phone,'') IS NOT NULL
        AND public.get_my_phone_digits() IS NOT NULL
        AND NULLIF(pg_catalog.regexp_replace(phone,'\\D','','g'),'')=public.get_my_phone_digits())
    );

  INSERT INTO public.group_audit_logs
    (group_id,actor_id,action,entity_type,entity_id,description,details)
  VALUES(
    v_member.group_id,v_actor,'member.proxy_claimed','membership',p_membership_id,
    'Proxy membership claimed',
    pg_catalog.jsonb_build_object('provenance','claim_proxy_membership')
  );
END
$$;
REVOKE ALL ON FUNCTION public.claim_proxy_membership(uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.claim_proxy_membership(uuid,uuid) TO authenticated;

-- Existing identity checks remain authoritative; remove default PUBLIC/anon
-- execution inherited from function creation.
REVOKE ALL ON FUNCTION public.lookup_join_code(text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.lookup_join_code(text) TO authenticated;
REVOKE ALL ON FUNCTION public.accept_invitation(uuid,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.claim_membership_with_token(text,uuid)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.claim_membership_with_token(text,uuid) TO authenticated;

COMMIT;
