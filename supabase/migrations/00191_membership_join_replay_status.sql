-- S0-001: return the actor's existing membership state on join replay even
-- after a finite-use code reaches its cap. The first call still reserves one
-- use atomically; a second actor receives max_uses_reached.

BEGIN;
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
     AND COALESCE(v_code.use_count,0)>=v_code.max_uses
     AND NOT EXISTS (
       SELECT 1 FROM public.memberships m
       WHERE m.user_id=v_actor AND m.group_id=v_code.group_id
     ) THEN
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

COMMIT;
