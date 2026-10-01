-- Complete live-standing consumers while the scheduler is suppressed.

CREATE OR REPLACE FUNCTION public.execute_hosting_command(p_request_id uuid, p_command jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
          AND m.membership_status='active' AND public.effective_standing_for_authority(m.id,now()) NOT IN ('banned','suspended')) THEN
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
$function$;

CREATE OR REPLACE FUNCTION public.get_roster_with_contacts(p_group_id uuid)
 RETURNS TABLE(membership_id uuid, user_id uuid, is_proxy boolean, display_name text, full_name text, phone text, role text, standing text, joined_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    m.id AS membership_id,
    m.user_id,
    COALESCE(m.is_proxy, false) AS is_proxy,
    m.display_name,
    p.full_name,
    CASE
      WHEN m.is_proxy = true
        THEN NULLIF(m.privacy_settings->>'proxy_phone', '')
      ELSE NULLIF(p.phone, '')
    END AS phone,
    m.role::text AS role,
    public.effective_standing_for_authority(m.id,now())::text AS standing,
    m.joined_at
  FROM memberships m
  LEFT JOIN profiles p ON p.id = m.user_id
  WHERE m.group_id = p_group_id
  ORDER BY m.joined_at ASC NULLS LAST;
END;
$function$;

CREATE OR REPLACE FUNCTION public.swap_hosting_assignment(p_original_assignment_id uuid, p_replacement_membership_id uuid, p_replacement_date date DEFAULT NULL::date, p_swapped_by uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_original RECORD;
  v_new_id UUID;
  v_group_id UUID;
BEGIN
  -- 1. Lock and fetch original assignment + roster info
  SELECT ha.id, ha.roster_id, ha.membership_id, ha.assigned_date,
         ha.status, ha.order_index, hr.group_id
  INTO v_original
  FROM hosting_assignments ha
  JOIN hosting_rosters hr ON hr.id = ha.roster_id
  WHERE ha.id = p_original_assignment_id
  FOR UPDATE OF ha;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original assignment not found';
  END IF;

  v_group_id := v_original.group_id;

  IF v_original.status NOT IN ('upcoming') THEN
    RAISE EXCEPTION 'Assignment cannot be swapped — status is %', v_original.status;
  END IF;

  -- 2. Verify swapper is admin/owner of this group (if provided)
  IF p_swapped_by IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM memberships m
      WHERE user_id = p_swapped_by
      AND group_id = v_group_id
      AND role IN ('admin', 'owner')
      AND public.effective_standing_for_authority(m.id,now()) NOT IN ('banned', 'suspended')
    ) THEN
      RAISE EXCEPTION 'Only admins can swap assignments';
    END IF;
  END IF;

  -- 3. Verify replacement member is active in the same group
  IF NOT EXISTS (
    SELECT 1 FROM memberships m
    WHERE id = p_replacement_membership_id
    AND group_id = v_group_id
    AND public.effective_standing_for_authority(m.id,now()) NOT IN ('banned', 'suspended')
  ) THEN
    RAISE EXCEPTION 'Replacement member not found or inactive in this group';
  END IF;

  -- 4. Create new assignment for replacement host
  INSERT INTO hosting_assignments (
    roster_id, membership_id, assigned_date, status, order_index,
    created_at, updated_at
  ) VALUES (
    v_original.roster_id,
    p_replacement_membership_id,
    COALESCE(p_replacement_date, v_original.assigned_date),
    'upcoming',
    v_original.order_index,
    NOW(),
    NOW()
  ) RETURNING id INTO v_new_id;

  -- 5. Mark original as swapped, link to new assignment
  UPDATE hosting_assignments
  SET status = 'swapped',
      swapped_with = v_new_id,
      updated_at = NOW()
  WHERE id = p_original_assignment_id;

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_membership(p_membership_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'member_name', COALESCE(m.display_name, p.display_name, p.full_name, 'Member'),
    'group_name', g.name,
    'standing', public.effective_standing_for_authority(m.id,now()),
    'joined_at', m.joined_at,
    'role', m.role,
    'verified_at', now()
  ) INTO result
  FROM memberships m
  LEFT JOIN profiles p ON m.user_id = p.id
  JOIN groups g ON m.group_id = g.id
  WHERE m.id = p_membership_id;

  RETURN result;
END;
$function$;
