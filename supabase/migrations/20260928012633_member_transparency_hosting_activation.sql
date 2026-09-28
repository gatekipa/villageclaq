-- Focused founder qualification: G-001/G-002/G-009/G-011/G-012,
-- hosting roster authority, and optional account activation for offline members.

BEGIN;

-- -------------------------------------------------------------------------
-- Member transparency controls and observations
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_group_sharing_controls()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.sharing_controls IS DISTINCT FROM NEW.sharing_controls
     AND current_setting('app.member_transparency_command', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'MEMBER_TRANSPARENCY_COMMAND_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_group_sharing_controls() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_group_sharing_controls ON public.groups;
CREATE TRIGGER guard_group_sharing_controls
BEFORE UPDATE OF sharing_controls ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.guard_group_sharing_controls();

CREATE OR REPLACE FUNCTION public.set_group_sharing_controls(
  p_request_id uuid,
  p_group_id uuid,
  p_controls jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_group public.groups%ROWTYPE;
  v_bound public.governance_command_receipts;
  v_result jsonb;
  v_key text;
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL OR p_group_id IS NULL
     OR jsonb_typeof(p_controls) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'SHARING_CONTROLS_INVALID' USING ERRCODE='22023';
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_controls) LOOP
    IF v_key NOT IN ('member_count','member_roster','financial_summary','detailed_transactions',
                     'attendance','events','minutes','relief')
       OR jsonb_typeof(p_controls->v_key) IS DISTINCT FROM 'boolean' THEN
      RAISE EXCEPTION 'SHARING_CONTROLS_INVALID_KEY: %', v_key USING ERRCODE='22023';
    END IF;
  END LOOP;
  IF NOT public.has_group_permission(p_group_id,'settings.manage',v_actor) THEN
    RAISE EXCEPTION 'SHARING_CONTROLS_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  v_bound := public.bind_governance_command(
    p_request_id,p_group_id,'group.sharing_controls',
    jsonb_build_object('group_id',p_group_id,'controls',p_controls)
  );
  IF v_bound.result IS NOT NULL THEN
    IF NOT public.lock_and_check_group_permission(p_group_id,'settings.manage') THEN
      RAISE EXCEPTION 'SHARING_CONTROLS_NOT_AUTHORIZED' USING ERRCODE='42501';
    END IF;
    RETURN v_bound.result;
  END IF;
  SELECT * INTO v_group FROM public.groups WHERE id=p_group_id FOR UPDATE;
  IF v_group.id IS NULL OR NOT public.lock_and_check_group_permission(p_group_id,'settings.manage') THEN
    RAISE EXCEPTION 'SHARING_CONTROLS_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.member_transparency_command','on',true);
  UPDATE public.groups
     SET sharing_controls = coalesce(sharing_controls,'{}'::jsonb) || p_controls,
         updated_at = now()
   WHERE id=p_group_id
   RETURNING sharing_controls INTO p_controls;
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(p_group_id,v_actor,'group.sharing_controls_updated','group',p_group_id,
    jsonb_build_object('request_id',p_request_id,'before',v_group.sharing_controls,'after',p_controls));
  v_result := jsonb_build_object('request_id',p_request_id,'group_id',p_group_id,'controls',p_controls);
  UPDATE public.governance_command_receipts SET result=v_result,completed_at=now()
   WHERE request_id=p_request_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.set_group_sharing_controls(uuid,uuid,jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.set_group_sharing_controls(uuid,uuid,jsonb) TO authenticated;

DROP POLICY IF EXISTS mm_select ON public.meeting_minutes;
CREATE POLICY mm_select ON public.meeting_minutes FOR SELECT TO authenticated USING (
  public.is_active_group_member(group_id)
  AND (
    public.has_group_permission(group_id,'minutes.manage')
    OR (
      status IN ('published','provisional')
      AND EXISTS (
        SELECT 1 FROM public.groups g
        WHERE g.id=meeting_minutes.group_id
          AND coalesce((g.sharing_controls->>'minutes')::boolean,false)
      )
    )
  )
);

CREATE OR REPLACE FUNCTION public.get_member_financial_summary(
  p_group_id uuid,
  p_period_start timestamptz DEFAULT NULL,
  p_period_end timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_group public.groups%ROWTYPE;
  v_start timestamptz := coalesce(p_period_start,date_trunc('year',now()));
  v_end timestamptz := coalesce(p_period_end,now());
  v_finance_permission boolean;
  v_buckets jsonb;
  v_event_count bigint;
  v_latest timestamptz;
  v_topology bigint;
BEGIN
  IF v_actor IS NULL OR p_group_id IS NULL OR v_end < v_start
     OR NOT public.is_active_group_member(p_group_id) THEN
    RAISE EXCEPTION 'FINANCIAL_SUMMARY_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_group FROM public.groups WHERE id=p_group_id;
  v_finance_permission := public.has_group_permission(p_group_id,'finances.view',v_actor)
                          OR public.has_group_permission(p_group_id,'finances.manage',v_actor);
  IF NOT v_finance_permission
     AND NOT coalesce((v_group.sharing_controls->>'financial_summary')::boolean,false) THEN
    RAISE EXCEPTION 'FINANCIAL_SUMMARY_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT o.topology_version INTO v_topology FROM public.organizations o WHERE o.id=v_group.organization_id;
  SELECT count(*),max(e.posted_at) INTO v_event_count,v_latest
    FROM public.financial_events e
   WHERE e.group_id=p_group_id AND e.status='posted'
     AND e.occurred_at>=v_start AND e.occurred_at<=v_end;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'currency',s.currency,
      'total_assets',s.total_assets,
      'total_liabilities',s.total_liabilities,
      'total_revenue',s.total_revenue,
      'total_expenses',s.total_expenses,
      'net_result',s.total_revenue-s.total_expenses
    ) ORDER BY s.currency),'[]'::jsonb)
    INTO v_buckets
  FROM (
    SELECT l.currency,
      coalesce(sum(l.amount_signed) FILTER (WHERE l.account_class='asset'),0) total_assets,
      coalesce(sum(-l.amount_signed) FILTER (WHERE l.account_class='liability'),0) total_liabilities,
      coalesce(sum(-l.amount_signed) FILTER (WHERE l.account_class='revenue'),0) total_revenue,
      coalesce(sum(l.amount_signed) FILTER (WHERE l.account_class='expense'),0) total_expenses
    FROM public.v_f3_account_ledger l
    WHERE l.group_id=p_group_id AND l.event_status='posted'
      AND l.occurred_at>=v_start AND l.occurred_at<=v_end
    GROUP BY l.currency
  ) s;
  IF v_buckets='[]'::jsonb THEN
    v_buckets:=jsonb_build_array(jsonb_build_object(
      'currency',v_group.currency,'total_assets',0,'total_liabilities',0,
      'total_revenue',0,'total_expenses',0,'net_result',0));
  END IF;
  RETURN jsonb_build_object(
    'scope',jsonb_build_object('group_id',p_group_id,'group_name',v_group.name),
    'period',jsonb_build_object('start',v_start,'end',v_end),
    'currency_buckets',v_buckets,
    'posted_state','posted_confirmed',
    'updated_at',v_latest,
    'observed_at',now(),
    'topology_version',coalesce(v_topology,0),
    'permission_context',CASE WHEN v_finance_permission THEN 'finance_permission' ELSE 'member_transparency' END,
    'source_version',jsonb_build_object('posted_event_count',v_event_count,'latest_posted_at',v_latest)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_member_financial_summary(uuid,timestamptz,timestamptz)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_member_financial_summary(uuid,timestamptz,timestamptz) TO authenticated;

-- -------------------------------------------------------------------------
-- Hosting roster command boundary
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.execute_hosting_command(p_request_id uuid,p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid:=auth.uid();
  v_group uuid:=nullif(p_command->>'group_id','')::uuid;
  v_action text:=p_command->>'action';
  v_roster public.hosting_rosters%ROWTYPE;
  v_assignment public.hosting_assignments%ROWTYPE;
  v_bound public.governance_command_receipts;
  v_result jsonb;
  v_row jsonb;
  v_id uuid;
  v_ids jsonb:='[]'::jsonb;
  v_order integer;
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL OR jsonb_typeof(p_command)<>'object'
     OR v_group IS NULL OR v_action NOT IN
       ('create_roster','assign','set_status','update_roster','set_rules','add_exemption','remove_exemption')
     OR NOT public.has_group_permission(v_group,'hosting.manage',v_actor) THEN
    RAISE EXCEPTION 'HOSTING_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  v_bound:=public.bind_governance_command(p_request_id,v_group,'hosting.'||v_action,p_command);
  IF v_bound.result IS NOT NULL THEN
    IF NOT public.lock_and_check_group_permission(v_group,'hosting.manage') THEN
      RAISE EXCEPTION 'HOSTING_NOT_AUTHORIZED' USING ERRCODE='42501';
    END IF;
    RETURN v_bound.result;
  END IF;
  IF NOT public.lock_and_check_group_permission(v_group,'hosting.manage') THEN
    RAISE EXCEPTION 'HOSTING_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;

  IF v_action='create_roster' THEN
    IF nullif(btrim(p_command->>'name'),'') IS NULL
       OR p_command->>'rotation_type' NOT IN ('sequential','random','manual') THEN
      RAISE EXCEPTION 'HOSTING_ROSTER_INVALID' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.hosting_rosters(group_id,name,name_fr,rotation_type,is_active,created_by)
    VALUES(v_group,btrim(p_command->>'name'),nullif(btrim(p_command->>'name_fr'),''),
      (p_command->>'rotation_type')::public.rotation_type,true,v_actor)
    RETURNING * INTO v_roster;
  ELSE
    SELECT * INTO v_roster FROM public.hosting_rosters
     WHERE id=nullif(p_command->>'roster_id','')::uuid AND group_id=v_group FOR UPDATE;
    IF v_roster.id IS NULL THEN RAISE EXCEPTION 'HOSTING_ROSTER_NOT_FOUND' USING ERRCODE='P0002'; END IF;
  END IF;

  IF v_action IN ('create_roster','assign') AND jsonb_typeof(coalesce(p_command->'assignments','[]'::jsonb))='array' THEN
    SELECT coalesce(max(order_index),-1) INTO v_order FROM public.hosting_assignments WHERE roster_id=v_roster.id;
    FOR v_row IN SELECT value FROM jsonb_array_elements(coalesce(p_command->'assignments','[]'::jsonb)) LOOP
      IF NOT EXISTS(SELECT 1 FROM public.memberships m
        WHERE m.id=(v_row->>'membership_id')::uuid AND m.group_id=v_group
          AND m.membership_status='active' AND m.standing<>'banned') THEN
        RAISE EXCEPTION 'HOSTING_MEMBER_NOT_ELIGIBLE' USING ERRCODE='42501';
      END IF;
      v_order:=v_order+1;
      INSERT INTO public.hosting_assignments(roster_id,membership_id,assigned_date,status,order_index)
      VALUES(v_roster.id,(v_row->>'membership_id')::uuid,(v_row->>'assigned_date')::date,'upcoming',v_order)
      RETURNING id INTO v_id;
      v_ids:=v_ids||jsonb_build_array(v_id);
    END LOOP;
  ELSIF v_action='set_status' THEN
    SELECT a.* INTO v_assignment FROM public.hosting_assignments a
      WHERE a.id=(p_command->>'assignment_id')::uuid AND a.roster_id=v_roster.id FOR UPDATE;
    IF v_assignment.id IS NULL OR v_assignment.status NOT IN ('upcoming','completed','missed')
       OR p_command->>'status' NOT IN ('completed','missed') THEN
      RAISE EXCEPTION 'HOSTING_STATUS_INVALID' USING ERRCODE='22023';
    END IF;
    UPDATE public.hosting_assignments SET status=(p_command->>'status')::public.hosting_status,updated_at=now()
     WHERE id=v_assignment.id;
    v_ids:=jsonb_build_array(v_assignment.id);
  ELSIF v_action='update_roster' THEN
    IF nullif(btrim(p_command->>'name'),'') IS NULL THEN RAISE EXCEPTION 'HOSTING_ROSTER_INVALID'; END IF;
    UPDATE public.hosting_rosters SET
      name=btrim(p_command->>'name'),name_fr=nullif(btrim(p_command->>'name_fr'),''),
      rotation_type=CASE WHEN EXISTS(SELECT 1 FROM public.hosting_assignments WHERE roster_id=v_roster.id)
        THEN rotation_type ELSE (p_command->>'rotation_type')::public.rotation_type END,
      is_active=coalesce((p_command->>'is_active')::boolean,is_active),updated_at=now()
     WHERE id=v_roster.id;
  ELSIF v_action='set_rules' THEN
    UPDATE public.hosting_rosters SET compliance_rules=coalesce(p_command->'compliance_rules','{}'::jsonb),updated_at=now()
     WHERE id=v_roster.id;
  ELSIF v_action='add_exemption' THEN
    IF NOT EXISTS(SELECT 1 FROM public.memberships m WHERE m.id=(p_command->>'membership_id')::uuid
      AND m.group_id=v_group AND m.membership_status='active') OR nullif(btrim(p_command->>'reason'),'') IS NULL THEN
      RAISE EXCEPTION 'HOSTING_EXEMPTION_INVALID' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.hosting_assignments(roster_id,membership_id,assigned_date,status,exemption_reason,order_index)
    VALUES(v_roster.id,(p_command->>'membership_id')::uuid,(p_command->>'assigned_date')::date,
      'exempted',btrim(p_command->>'reason'),0) RETURNING id INTO v_id;
    v_ids:=jsonb_build_array(v_id);
  ELSIF v_action='remove_exemption' THEN
    DELETE FROM public.hosting_assignments a WHERE a.id=(p_command->>'assignment_id')::uuid
      AND a.roster_id=v_roster.id AND a.status='exempted' RETURNING a.id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'HOSTING_EXEMPTION_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    v_ids:=jsonb_build_array(v_id);
  END IF;
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(v_group,v_actor,'hosting.'||v_action,'hosting_roster',v_roster.id,
    jsonb_build_object('request_id',p_request_id,'assignment_ids',v_ids,'command',p_command));
  v_result:=jsonb_build_object('request_id',p_request_id,'roster_id',v_roster.id,'assignment_ids',v_ids,'action',v_action);
  UPDATE public.governance_command_receipts SET result=v_result,completed_at=now() WHERE request_id=p_request_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.execute_hosting_command(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.execute_hosting_command(uuid,jsonb) TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.hosting_rosters,public.hosting_assignments
  FROM PUBLIC,anon,authenticated;

-- -------------------------------------------------------------------------
-- Offline members and optional account activation
-- -------------------------------------------------------------------------

CREATE TABLE public.member_import_receipts(
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  source_key text NOT NULL,
  material_payload jsonb NOT NULL,
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(group_id,source_key)
);
ALTER TABLE public.member_import_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_import_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.create_offline_member(p_request_id uuid,p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid:=auth.uid(); v_group uuid:=nullif(p_command->>'group_id','')::uuid;
  v_name text:=nullif(btrim(p_command->>'display_name'),'');
  v_title text:=nullif(btrim(p_command->>'title'),'');
  v_email text:=nullif(lower(btrim(p_command->>'email')),'');
  v_phone text:=nullif(regexp_replace(coalesce(p_command->>'phone',''),'[[:space:]().-]','','g'),'');
  v_role text:=coalesce(nullif(p_command->>'role',''),'member');
  v_source text:=coalesce(nullif(p_command->>'source_kind',''),'manual');
  v_source_key text:=nullif(p_command->>'source_key','');
  v_allow_shared boolean:=coalesce((p_command->>'allow_shared_contact')::boolean,false);
  v_consent boolean:=coalesce((p_command->>'notification_consent')::boolean,false);
  v_existing public.memberships%ROWTYPE; v_id uuid:=gen_random_uuid();
  v_bound public.governance_command_receipts; v_result jsonb; v_material jsonb;
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL OR v_group IS NULL OR v_name IS NULL
     OR length(v_name)>160 OR v_role NOT IN ('member','moderator')
     OR v_source NOT IN ('manual','csv_import') THEN
    RAISE EXCEPTION 'OFFLINE_MEMBER_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'OFFLINE_MEMBER_PHONE_INVALID' USING ERRCODE='22023';
  END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'OFFLINE_MEMBER_EMAIL_INVALID' USING ERRCODE='22023';
  END IF;
  IF NOT public.has_group_permission(v_group,'members.manage',v_actor) THEN
    RAISE EXCEPTION 'OFFLINE_MEMBER_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  v_material:=jsonb_build_object('group_id',v_group,'display_name',v_name,'title',v_title,
    'email',v_email,'phone',v_phone,'role',v_role,'source_kind',v_source,'source_key',v_source_key,
    'allow_shared_contact',v_allow_shared,'notification_consent',v_consent);
  v_bound:=public.bind_governance_command(p_request_id,v_group,'member.offline_create',v_material);
  IF v_bound.result IS NOT NULL THEN
    IF NOT public.lock_and_check_group_permission(v_group,'members.manage') THEN
      RAISE EXCEPTION 'OFFLINE_MEMBER_NOT_AUTHORIZED' USING ERRCODE='42501';
    END IF;
    RETURN v_bound.result;
  END IF;
  IF NOT public.lock_and_check_group_permission(v_group,'members.manage') THEN
    RAISE EXCEPTION 'OFFLINE_MEMBER_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_source='csv_import' AND v_source_key IS NULL THEN RAISE EXCEPTION 'IMPORT_SOURCE_KEY_REQUIRED'; END IF;
  IF v_source_key IS NOT NULL THEN
    SELECT m.* INTO v_existing FROM public.member_import_receipts r JOIN public.memberships m ON m.id=r.membership_id
     WHERE r.group_id=v_group AND r.source_key=v_source_key;
    IF v_existing.id IS NOT NULL THEN
      IF (SELECT material_payload FROM public.member_import_receipts WHERE group_id=v_group AND source_key=v_source_key)
         IS DISTINCT FROM v_material THEN RAISE EXCEPTION 'IMPORT_SOURCE_CONFLICT' USING ERRCODE='23505'; END IF;
      v_result:=jsonb_build_object('ok',true,'outcome','skipped_existing','membership_id',v_existing.id,'group_id',v_group);
      UPDATE public.governance_command_receipts SET result=v_result,completed_at=now() WHERE request_id=p_request_id;
      RETURN v_result;
    END IF;
  END IF;
  SELECT * INTO v_existing FROM public.memberships m
   WHERE m.group_id=v_group AND m.is_proxy AND m.user_id IS NULL AND (
     (v_phone IS NOT NULL AND nullif(m.privacy_settings->>'proxy_phone','')=v_phone)
     OR (v_email IS NOT NULL AND lower(nullif(m.privacy_settings->>'proxy_email',''))=v_email)
   ) ORDER BY m.created_at LIMIT 1 FOR UPDATE;
  IF v_existing.id IS NOT NULL AND NOT v_allow_shared THEN
    IF lower(coalesce(v_existing.display_name,''))=lower(v_name) THEN
      v_result:=jsonb_build_object('ok',true,'outcome','skipped_existing','membership_id',v_existing.id,'group_id',v_group);
      UPDATE public.governance_command_receipts SET result=v_result,completed_at=now() WHERE request_id=p_request_id;
      RETURN v_result;
    END IF;
    RAISE EXCEPTION 'OFFLINE_MEMBER_CONTACT_AMBIGUOUS' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.memberships(id,user_id,group_id,display_name,title,role,standing,membership_status,
    is_proxy,proxy_manager_id,joined_at,privacy_settings)
  VALUES(v_id,NULL,v_group,v_name,v_title,v_role::public.membership_role,'good','active',true,v_actor,now(),
    jsonb_build_object('proxy_phone',coalesce(v_phone,''),'proxy_email',coalesce(v_email,''),
      'proxy_name',v_name,'proxy_contact_consent',v_consent,'phone_verified',false,'email_verified',false,
      'show_phone',false,'show_email',false));
  IF v_source_key IS NOT NULL THEN
    INSERT INTO public.member_import_receipts(group_id,source_key,material_payload,membership_id)
    VALUES(v_group,v_source_key,v_material,v_id);
  END IF;
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(v_group,v_actor,'member.offline_created','membership',v_id,
    jsonb_build_object('request_id',p_request_id,'source_kind',v_source,'has_phone',v_phone IS NOT NULL,
      'has_email',v_email IS NOT NULL,'notification_consent',v_consent));
  v_result:=jsonb_build_object('ok',true,'outcome','created','membership_id',v_id,'group_id',v_group,
    'account_status','not_activated');
  UPDATE public.governance_command_receipts SET result=v_result,completed_at=now() WHERE request_id=p_request_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.create_offline_member(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_offline_member(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_offline_member_contact(p_request_id uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE
  v_actor uuid:=auth.uid(); v_member public.memberships%ROWTYPE;
  v_id uuid:=nullif(p_command->>'membership_id','')::uuid;
  v_email text:=nullif(lower(btrim(p_command->>'email')),'');
  v_phone text:=nullif(regexp_replace(coalesce(p_command->>'phone',''),'[[:space:]().-]','','g'),'');
  v_consent boolean:=coalesce((p_command->>'notification_consent')::boolean,false);
  v_bound public.governance_command_receipts; v_result jsonb;
BEGIN
  SELECT * INTO v_member FROM public.memberships WHERE id=v_id FOR UPDATE;
  IF v_actor IS NULL OR v_member.id IS NULL OR NOT v_member.is_proxy OR v_member.user_id IS NOT NULL
     OR NOT public.has_group_permission(v_member.group_id,'members.manage',v_actor) THEN
    RAISE EXCEPTION 'OFFLINE_CONTACT_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_phone IS NOT NULL AND v_phone !~ '^\+[1-9][0-9]{7,14}$' THEN RAISE EXCEPTION 'OFFLINE_MEMBER_PHONE_INVALID'; END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN RAISE EXCEPTION 'OFFLINE_MEMBER_EMAIL_INVALID'; END IF;
  v_bound:=public.bind_governance_command(p_request_id,v_member.group_id,'member.offline_contact',p_command);
  IF v_bound.result IS NOT NULL THEN RETURN v_bound.result; END IF;
  IF NOT public.lock_and_check_group_permission(v_member.group_id,'members.manage') THEN
    RAISE EXCEPTION 'OFFLINE_CONTACT_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  UPDATE public.memberships SET privacy_settings=coalesce(privacy_settings,'{}'::jsonb)||jsonb_build_object(
    'proxy_phone',coalesce(v_phone,''),'proxy_email',coalesce(v_email,''),
    'proxy_contact_consent',v_consent,'phone_verified',false,'email_verified',false),updated_at=now()
   WHERE id=v_id;
  UPDATE public.proxy_claim_tokens SET expires_at=least(expires_at,now())
   WHERE membership_id=v_id AND claimed_at IS NULL AND expires_at>now();
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(v_member.group_id,v_actor,'member.offline_contact_updated','membership',v_id,
    jsonb_build_object('request_id',p_request_id,'has_phone',v_phone IS NOT NULL,'has_email',v_email IS NOT NULL,
      'notification_consent',v_consent,'pending_activation_tokens_revoked',true));
  v_result:=jsonb_build_object('ok',true,'membership_id',v_id,'activation_status','not_activated');
  UPDATE public.governance_command_receipts SET result=v_result,completed_at=now() WHERE request_id=p_request_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.update_offline_member_contact(uuid,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.update_offline_member_contact(uuid,jsonb) TO authenticated;

-- Retain the legacy signature for old clients, but route it through the same
-- authoritative duplicate/contact handling.
CREATE OR REPLACE FUNCTION public.create_proxy_member_v2(p_command jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $$ SELECT public.create_offline_member(gen_random_uuid(),p_command||jsonb_build_object('source_kind','manual')) $$;
REVOKE ALL ON FUNCTION public.create_proxy_member_v2(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.create_proxy_member_v2(jsonb) TO authenticated;

-- Officer-entered email is an activation identity hint, not verified contact
-- ownership. The trusted drain may resolve it, while channel policy remains
-- fail-closed for accountless SMS/email and provider delivery stays suppressed.
CREATE OR REPLACE FUNCTION public.cut2_internal_resolve_email(p_membership_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SET search_path=''
AS $$
DECLARE v_email text;
BEGIN
  IF p_membership_id IS NULL THEN RETURN NULL; END IF;
  SELECT coalesce(NULLIF(btrim(au.email),''),NULLIF(lower(btrim(m.privacy_settings->>'proxy_email')),''))
    INTO v_email FROM public.memberships m LEFT JOIN auth.users au ON au.id=m.user_id
   WHERE m.id=p_membership_id;
  RETURN v_email;
END;
$$;
REVOKE ALL ON FUNCTION public.cut2_internal_resolve_email(uuid) FROM PUBLIC,anon,authenticated,service_role;

-- Accountless members use the consent recorded on their membership instead
-- of an account preference row. The authoritative enqueue function below
-- enforces that consent before this helper permits a contact channel.
CREATE OR REPLACE FUNCTION public.cut2_internal_channel_pref_allows(
  p_user_id uuid,p_prefs_key text,p_channel text,p_group_id uuid,p_skip boolean
) RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=''
AS $$
DECLARE v_prefs jsonb; v_global boolean; v_type boolean; v_lookup_key text; v_muted boolean:=false;
BEGIN
  IF p_skip THEN RETURN true; END IF;
  IF p_user_id IS NULL THEN RETURN p_channel IN ('email','sms','whatsapp'); END IF;
  BEGIN SELECT p.notification_preferences INTO v_prefs FROM public.profiles p WHERE p.id=p_user_id;
  EXCEPTION WHEN OTHERS THEN RETURN false; END;
  v_prefs:=coalesce(v_prefs,'{}'::jsonb);
  IF p_group_id IS NOT NULL AND jsonb_typeof(v_prefs->'muted_groups')='array' THEN
    SELECT EXISTS(SELECT 1 FROM jsonb_array_elements_text(v_prefs->'muted_groups') g(val)
      WHERE g.val=p_group_id::text) INTO v_muted;
    IF v_muted THEN RETURN false; END IF;
  END IF;
  IF p_channel='push' THEN v_global:=coalesce((v_prefs->'channels'->>'push')::boolean,false);
  ELSE v_global:=coalesce((v_prefs->'channels'->>p_channel)::boolean,true); END IF;
  v_lookup_key:=CASE WHEN p_prefs_key='meeting_minutes' THEN 'minutes_published' ELSE p_prefs_key END;
  v_type:=CASE
    WHEN v_lookup_key='new_member' THEN false
    WHEN v_lookup_key='subscription_updates' AND p_channel IN ('sms','whatsapp') THEN false
    WHEN v_lookup_key='transfer_updates' AND p_channel IN ('sms','whatsapp') THEN false
    WHEN p_channel='push' THEN false ELSE true END;
  IF v_prefs->'types'->v_lookup_key ? p_channel THEN
    v_type:=coalesce((v_prefs->'types'->v_lookup_key->>p_channel)::boolean,v_type);
  ELSIF p_prefs_key='meeting_minutes' AND v_prefs->'types'->'meeting_minutes' ? p_channel THEN
    v_type:=coalesce((v_prefs->'types'->'meeting_minutes'->>p_channel)::boolean,v_type);
  ELSIF p_prefs_key='elections' AND v_prefs->'types'->'elections' ? p_channel THEN
    v_type:=coalesce((v_prefs->'types'->'elections'->>p_channel)::boolean,v_type);
  END IF;
  RETURN v_global AND v_type;
END;
$$;
REVOKE ALL ON FUNCTION public.cut2_internal_channel_pref_allows(uuid,text,text,uuid,boolean)
  FROM PUBLIC,anon,authenticated,service_role;

DO $do$
DECLARE v_sql text; v_before text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_sql FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='enqueue_outbound_notification'
     AND pg_get_function_identity_arguments(p.oid)='p_notification_type text, p_domain_object_id uuid, p_channel notification_channel, p_recipient_membership_id uuid, p_locale text';
  IF v_sql IS NULL THEN RAISE EXCEPTION 'ENQUEUE_OUTBOUND_NOTIFICATION_NOT_FOUND'; END IF;
  v_before:=v_sql;
  v_sql:=replace(v_sql,
$$    IF COALESCE(v_membership.is_proxy, false) OR v_membership.user_id IS NULL THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;$$,
$$    IF v_membership.user_id IS NULL AND NOT COALESCE(v_membership.is_proxy, false) THEN
      queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
    END IF;$$);
  v_sql:=replace(v_sql,
$$    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'payment_reminders';
    v_key := v_obligation.id::text || ':' || v_utc_date;$$,
$$    v_recipient_user_id := v_membership.user_id;
    v_is_proxy := COALESCE(v_membership.is_proxy, false);
    v_prefs_key := 'payment_reminders';
    v_key := v_obligation.id::text || ':' || v_utc_date;$$);
  v_sql:=replace(v_sql,
$$    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');

  ELSIF p_notification_type = 'welcome' THEN$$,
$$    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, CASE WHEN v_is_proxy THEN 'proxy' ELSE 'standard' END);

  ELSIF p_notification_type = 'welcome' THEN$$);
  v_sql:=replace(v_sql,
$$  IF p_notification_type <> 'member_invitation' THEN
    v_email := public.cut2_internal_resolve_email(v_recipient_membership_id);
  END IF;$$,
$$  IF v_recipient_user_id IS NULL AND v_recipient_membership_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.memberships cm
        WHERE cm.id=v_recipient_membership_id AND cm.group_id=v_group_id
          AND cm.user_id IS NULL AND coalesce(cm.is_proxy,false)
          AND coalesce(cm.membership_status,'active')='active'
          AND coalesce((cm.privacy_settings->>'proxy_contact_consent')::boolean,false)
     ) THEN
    queue_id := NULL; result := 'denied'; RETURN NEXT; RETURN;
  END IF;
  IF p_notification_type <> 'member_invitation' THEN
    v_email := public.cut2_internal_resolve_email(v_recipient_membership_id);
  END IF;$$);
  IF v_sql=v_before OR position('proxy_contact_consent' in v_sql)=0 THEN
    RAISE EXCEPTION 'ENQUEUE_OUTBOUND_NOTIFICATION_CONTRACT_MISMATCH';
  END IF;
  EXECUTE v_sql;
END;
$do$;

COMMIT;
