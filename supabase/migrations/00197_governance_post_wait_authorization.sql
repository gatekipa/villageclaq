-- 00197: acquire command locks in receipt -> domain row -> authorization order,
-- then hold current authorization through mutation. This avoids stale grants
-- after a domain-row wait without introducing the reverse lock-order deadlock.
CREATE OR REPLACE FUNCTION public.execute_minutes_command(p_request_id uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid:=auth.uid(); v_group uuid; v_action text; v_record uuid; v_event uuid;
  v_expected integer; v_row public.meeting_minutes; v_bound public.governance_command_receipts;
  v_new_id uuid; v_revision integer; v_status text; v_result jsonb;
BEGIN
  IF jsonb_typeof(p_command)<>'object' THEN RAISE EXCEPTION 'MINUTES_COMMAND_INVALID' USING ERRCODE='22023'; END IF;
  v_group:=(p_command->>'group_id')::uuid; v_action:=p_command->>'action';
  v_record:=nullif(p_command->>'record_id','')::uuid; v_event:=nullif(p_command->>'event_id','')::uuid;
  v_expected:=nullif(p_command->>'expected_revision','')::integer;
  IF v_actor IS NULL OR v_action NOT IN ('save_draft','share_provisional','publish','withdraw','attach')
     OR NOT public.has_group_permission(v_group,'minutes.manage') THEN
    RAISE EXCEPTION 'MINUTES_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_event IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.events e WHERE e.id=v_event AND e.group_id=v_group) THEN
    RAISE EXCEPTION 'MINUTES_EVENT_SCOPE_MISMATCH' USING ERRCODE='23503';
  END IF;
  v_bound:=public.bind_governance_command(p_request_id,v_group,'minutes.'||v_action,p_command);
  IF v_bound.result IS NOT NULL THEN
    IF NOT public.lock_and_check_group_permission(v_group,'minutes.manage') THEN
      RAISE EXCEPTION 'MINUTES_NOT_AUTHORIZED' USING ERRCODE='42501';
    END IF;
    RETURN v_bound.result;
  END IF;
  PERFORM set_config('app.governance_command','on',true);
  IF v_record IS NOT NULL THEN
    SELECT * INTO v_row FROM public.meeting_minutes m
     WHERE m.record_id=v_record AND m.group_id=v_group
     ORDER BY m.revision_number DESC LIMIT 1 FOR UPDATE;
    IF v_row.id IS NULL THEN RAISE EXCEPTION 'MINUTES_RECORD_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF v_expected IS NULL OR v_row.revision_number<>v_expected THEN
      RAISE EXCEPTION 'MINUTES_STALE_REVISION' USING ERRCODE='40001';
    END IF;
  END IF;
  IF NOT public.lock_and_check_group_permission(v_group,'minutes.manage') THEN
    RAISE EXCEPTION 'MINUTES_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_action IN ('save_draft','share_provisional') THEN
    v_status:=CASE WHEN v_action='share_provisional' THEN 'provisional' ELSE 'draft' END;
    IF v_row.id IS NULL THEN
      v_record:=coalesce(v_record,gen_random_uuid()); v_new_id:=gen_random_uuid(); v_revision:=1;
      INSERT INTO public.meeting_minutes(id,record_id,revision_number,event_id,group_id,title,title_fr,
        content_json,decisions_json,action_items_json,attendees_json,status,created_by,
        attachment_bucket,attachment_object_key,file_url)
      VALUES(v_new_id,v_record,v_revision,v_event,v_group,nullif(p_command->>'title',''),nullif(p_command->>'title_fr',''),
        coalesce(p_command->'content_json','{}'::jsonb),coalesce(p_command->'decisions_json','[]'::jsonb),
        coalesce(p_command->'action_items_json','[]'::jsonb),coalesce(p_command->'attendees_json','[]'::jsonb),
        v_status,v_actor,nullif(p_command->>'attachment_bucket',''),nullif(p_command->>'attachment_object_key',''),NULL);
    ELSIF v_row.status IN ('draft','provisional') THEN
      UPDATE public.meeting_minutes SET event_id=coalesce(v_event,event_id),title=nullif(p_command->>'title',''),
        title_fr=nullif(p_command->>'title_fr',''),content_json=coalesce(p_command->'content_json',content_json),
        decisions_json=coalesce(p_command->'decisions_json',decisions_json),
        action_items_json=coalesce(p_command->'action_items_json',action_items_json),
        attendees_json=coalesce(p_command->'attendees_json',attendees_json),status=v_status,
        attachment_bucket=coalesce(nullif(p_command->>'attachment_bucket',''),attachment_bucket),
        attachment_object_key=coalesce(nullif(p_command->>'attachment_object_key',''),attachment_object_key),file_url=NULL,
        updated_at=now() WHERE id=v_row.id;
      v_new_id:=v_row.id; v_revision:=v_row.revision_number;
    ELSE
      v_new_id:=gen_random_uuid(); v_revision:=v_row.revision_number+1;
      INSERT INTO public.meeting_minutes(id,record_id,revision_number,parent_revision_id,event_id,group_id,title,title_fr,
        content_json,decisions_json,action_items_json,attendees_json,status,created_by,attachment_bucket,attachment_object_key)
      VALUES(v_new_id,v_record,v_revision,v_row.id,coalesce(v_event,v_row.event_id),v_group,
        coalesce(nullif(p_command->>'title',''),v_row.title),coalesce(nullif(p_command->>'title_fr',''),v_row.title_fr),
        coalesce(p_command->'content_json',v_row.content_json),coalesce(p_command->'decisions_json',v_row.decisions_json),
        coalesce(p_command->'action_items_json',v_row.action_items_json),coalesce(p_command->'attendees_json',v_row.attendees_json),
        v_status,v_actor,coalesce(nullif(p_command->>'attachment_bucket',''),v_row.attachment_bucket),
        coalesce(nullif(p_command->>'attachment_object_key',''),v_row.attachment_object_key));
    END IF;
  ELSIF v_action='attach' THEN
    IF v_row.id IS NULL OR v_row.status NOT IN ('draft','provisional')
       OR nullif(p_command->>'attachment_bucket','') IS NULL OR nullif(p_command->>'attachment_object_key','') IS NULL THEN
      RAISE EXCEPTION 'MINUTES_ATTACHMENT_INVALID' USING ERRCODE='22023';
    END IF;
    IF p_command->>'attachment_bucket'<>'group-documents'
       OR p_command->>'attachment_object_key' NOT LIKE 'minutes/'||v_group::text||'/'||v_record::text||'/%' THEN
      RAISE EXCEPTION 'MINUTES_ATTACHMENT_SCOPE_MISMATCH' USING ERRCODE='42501';
    END IF;
    UPDATE public.meeting_minutes SET attachment_bucket=p_command->>'attachment_bucket',
      attachment_object_key=p_command->>'attachment_object_key',file_url=NULL,updated_at=now() WHERE id=v_row.id;
    v_new_id:=v_row.id; v_revision:=v_row.revision_number; v_status:=v_row.status;
  ELSIF v_action='publish' THEN
    IF v_row.id IS NULL OR v_row.status NOT IN ('draft','provisional') THEN RAISE EXCEPTION 'MINUTES_NOT_PUBLISHABLE' USING ERRCODE='55000'; END IF;
    UPDATE public.meeting_minutes SET status='superseded',updated_at=now()
      WHERE record_id=v_record AND status='published' AND id<>v_row.id;
    UPDATE public.meeting_minutes SET status='published',published_at=now(),published_by=v_actor,updated_at=now() WHERE id=v_row.id;
    v_new_id:=v_row.id; v_revision:=v_row.revision_number; v_status:='published';
  ELSE
    IF v_row.id IS NULL OR v_row.status NOT IN ('draft','published','provisional') THEN RAISE EXCEPTION 'MINUTES_NOT_WITHDRAWABLE' USING ERRCODE='55000'; END IF;
    UPDATE public.meeting_minutes SET status='withdrawn',withdrawn_at=now(),withdrawn_by=v_actor,updated_at=now() WHERE id=v_row.id;
    v_new_id:=v_row.id; v_revision:=v_row.revision_number; v_status:='withdrawn';
  END IF;
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(v_group,v_actor,'minutes.'||v_action,'meeting_minutes',v_new_id,
    jsonb_build_object('request_id',p_request_id,'record_id',v_record,'revision_number',v_revision,'status',v_status));
  v_result:=jsonb_build_object('request_id',p_request_id,'id',v_new_id,'record_id',v_record,'revision_number',v_revision,'status',v_status);
  UPDATE public.governance_command_receipts SET result=v_result,completed_at=now() WHERE request_id=p_request_id;
  RETURN v_result;
END; $$;


CREATE OR REPLACE FUNCTION public.execute_governing_document_command(p_request_id uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid:=auth.uid(); v_group uuid; v_action text; v_document uuid; v_revision_id uuid;
  v_expected integer; v_row public.group_constitutions; v_bound public.governance_command_receipts;
  v_membership uuid; v_new_id uuid; v_version integer; v_result jsonb; v_amend public.constitution_amendments;
BEGIN
  IF jsonb_typeof(p_command)<>'object' THEN RAISE EXCEPTION 'DOCUMENT_COMMAND_INVALID' USING ERRCODE='22023'; END IF;
  v_group:=(p_command->>'group_id')::uuid; v_action:=p_command->>'action';
  v_document:=nullif(p_command->>'document_id','')::uuid; v_revision_id:=nullif(p_command->>'revision_id','')::uuid;
  v_expected:=nullif(p_command->>'expected_version','')::integer;
  SELECT m.id INTO v_membership FROM public.memberships m WHERE m.group_id=v_group AND m.user_id=v_actor AND m.membership_status='active' LIMIT 1;
  IF v_actor IS NULL OR v_membership IS NULL OR v_action NOT IN
    ('save_draft','attach_draft','publish','withdraw','acknowledge','propose_amendment','decide_amendment','apply_amendment') THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_action<>'acknowledge' AND v_action<>'propose_amendment'
     AND NOT (public.has_group_permission(v_group,'documents.manage') OR public.has_group_permission(v_group,'governance.manage')) THEN
    RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  v_bound:=public.bind_governance_command(p_request_id,v_group,'document.'||v_action,p_command);
  IF v_bound.result IS NOT NULL THEN
    v_membership:=public.lock_active_group_membership(v_group);
    IF v_membership IS NULL OR (
      v_action NOT IN ('acknowledge','propose_amendment')
      AND NOT (public.lock_and_check_group_permission(v_group,'documents.manage')
        OR public.lock_and_check_group_permission(v_group,'governance.manage'))
    ) THEN RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
    RETURN v_bound.result;
  END IF;
  PERFORM set_config('app.governance_command','on',true);

  IF v_action IN ('acknowledge','propose_amendment') THEN
    SELECT * INTO v_row FROM public.group_constitutions d WHERE d.id=v_revision_id AND d.group_id=v_group FOR UPDATE;
    IF v_row.id IS NULL OR v_row.status<>'published' THEN RAISE EXCEPTION 'DOCUMENT_REVISION_NOT_PUBLISHED' USING ERRCODE='55000'; END IF;
    v_membership:=public.lock_active_group_membership(v_group);
    IF v_membership IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
    IF v_action='acknowledge' THEN
      INSERT INTO public.constitution_acknowledgments(constitution_id,membership_id,version_number)
      VALUES(v_row.id,v_membership,v_row.version_number) ON CONFLICT DO NOTHING;
      v_new_id:=v_row.id; v_version:=v_row.version_number;
    ELSE
      INSERT INTO public.constitution_amendments(constitution_id,group_id,amendment_number,title,section_affected,old_text,new_text,reason,proposed_by,status)
      VALUES(v_row.id,v_group,(SELECT coalesce(max(a.amendment_number),0)+1 FROM public.constitution_amendments a WHERE a.group_id=v_group),
        nullif(p_command->>'title',''),nullif(p_command->>'section_affected',''),nullif(p_command->>'old_text',''),
        nullif(p_command->>'new_text',''),nullif(p_command->>'reason',''),v_membership,'proposed') RETURNING id INTO v_new_id;
      v_version:=v_row.version_number;
    END IF;
  ELSIF v_action IN ('decide_amendment','apply_amendment') THEN
    SELECT * INTO v_amend FROM public.constitution_amendments a WHERE a.id=(p_command->>'amendment_id')::uuid AND a.group_id=v_group FOR UPDATE;
    IF v_amend.id IS NULL THEN RAISE EXCEPTION 'AMENDMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
    IF v_action='decide_amendment' THEN
      v_membership:=public.lock_active_group_membership(v_group);
      IF v_membership IS NULL OR NOT (
        public.lock_and_check_group_permission(v_group,'documents.manage')
        OR public.lock_and_check_group_permission(v_group,'governance.manage')
      ) THEN RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
      IF v_amend.status<>'proposed' OR p_command->>'decision' NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'AMENDMENT_DECISION_INVALID' USING ERRCODE='55000'; END IF;
      UPDATE public.constitution_amendments SET status=p_command->>'decision',approved_at=now(),approved_by=v_membership WHERE id=v_amend.id;
      v_new_id:=v_amend.id; v_version:=NULL;
    ELSE
      IF v_amend.status<>'approved' THEN RAISE EXCEPTION 'AMENDMENT_NOT_APPROVED' USING ERRCODE='55000'; END IF;
      SELECT * INTO v_row FROM public.group_constitutions d WHERE d.id=v_amend.constitution_id AND d.group_id=v_group AND d.status='published' FOR UPDATE;
      IF v_row.id IS NULL OR v_expected IS NULL OR v_row.version_number<>v_expected THEN RAISE EXCEPTION 'DOCUMENT_STALE_REVISION' USING ERRCODE='40001'; END IF;
      v_membership:=public.lock_active_group_membership(v_group);
      IF v_membership IS NULL OR NOT (
        public.lock_and_check_group_permission(v_group,'documents.manage')
        OR public.lock_and_check_group_permission(v_group,'governance.manage')
      ) THEN RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
      UPDATE public.group_constitutions SET status='superseded',updated_at=now() WHERE id=v_row.id;
      v_new_id:=gen_random_uuid(); v_version:=v_row.version_number+1;
      INSERT INTO public.group_constitutions(id,document_id,parent_revision_id,group_id,title,content,file_url,version_number,status,published_at,published_by,document_type,attachment_bucket,attachment_object_key)
      VALUES(v_new_id,v_row.document_id,v_row.id,v_group,v_row.title,
        CASE WHEN nullif(v_amend.old_text,'') IS NOT NULL THEN replace(coalesce(v_row.content,''),v_amend.old_text,coalesce(v_amend.new_text,'')) ELSE coalesce(v_row.content,'')||E'\n\n'||coalesce(v_amend.new_text,'') END,
        NULL,v_version,'published',now(),v_membership,v_row.document_type,v_row.attachment_bucket,v_row.attachment_object_key);
      UPDATE public.constitution_amendments SET status='applied' WHERE id=v_amend.id;
      v_document:=v_row.document_id;
    END IF;
  ELSE
    IF v_document IS NOT NULL THEN
      SELECT * INTO v_row FROM public.group_constitutions d WHERE d.document_id=v_document AND d.group_id=v_group ORDER BY d.version_number DESC LIMIT 1 FOR UPDATE;
      IF v_row.id IS NULL THEN RAISE EXCEPTION 'DOCUMENT_NOT_FOUND' USING ERRCODE='P0002'; END IF;
      IF v_expected IS NULL OR v_row.version_number<>v_expected THEN RAISE EXCEPTION 'DOCUMENT_STALE_REVISION' USING ERRCODE='40001'; END IF;
    END IF;
    v_membership:=public.lock_active_group_membership(v_group);
    IF v_membership IS NULL OR NOT (
      public.lock_and_check_group_permission(v_group,'documents.manage')
      OR public.lock_and_check_group_permission(v_group,'governance.manage')
    ) THEN RAISE EXCEPTION 'DOCUMENT_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
    IF v_action='save_draft' THEN
      IF v_row.id IS NULL THEN
        v_document:=coalesce(v_document,gen_random_uuid()); v_new_id:=gen_random_uuid(); v_version:=1;
        INSERT INTO public.group_constitutions(id,document_id,group_id,document_type,title,content,version_number,status)
        VALUES(v_new_id,v_document,v_group,coalesce(nullif(p_command->>'document_type',''),'Constitution'),
          coalesce(nullif(p_command->>'title',''),'Constitution'),coalesce(p_command->>'content',''),v_version,'draft');
      ELSIF v_row.status='draft' THEN
        UPDATE public.group_constitutions SET title=coalesce(nullif(p_command->>'title',''),title),content=coalesce(p_command->>'content',content),updated_at=now() WHERE id=v_row.id;
        v_new_id:=v_row.id; v_version:=v_row.version_number;
      ELSE
        v_new_id:=gen_random_uuid(); v_version:=v_row.version_number+1;
        INSERT INTO public.group_constitutions(id,document_id,parent_revision_id,group_id,document_type,title,content,version_number,status,attachment_bucket,attachment_object_key)
        VALUES(v_new_id,v_document,v_row.id,v_group,v_row.document_type,coalesce(nullif(p_command->>'title',''),v_row.title),
          coalesce(p_command->>'content',v_row.content),v_version,'draft',v_row.attachment_bucket,v_row.attachment_object_key);
      END IF;
    ELSIF v_action='attach_draft' THEN
      IF v_row.id IS NULL OR v_row.status<>'draft' OR p_command->>'attachment_bucket'<>'group-documents'
         OR p_command->>'attachment_object_key' NOT LIKE 'constitutions/'||v_group::text||'/'||v_document::text||'/%' THEN
        RAISE EXCEPTION 'DOCUMENT_ATTACHMENT_INVALID' USING ERRCODE='42501';
      END IF;
      UPDATE public.group_constitutions SET attachment_bucket=p_command->>'attachment_bucket',attachment_object_key=p_command->>'attachment_object_key',file_url=NULL,updated_at=now() WHERE id=v_row.id;
      v_new_id:=v_row.id; v_version:=v_row.version_number;
    ELSIF v_action='publish' THEN
      IF v_row.id IS NULL OR v_row.status<>'draft' THEN RAISE EXCEPTION 'DOCUMENT_NOT_PUBLISHABLE' USING ERRCODE='55000'; END IF;
      UPDATE public.group_constitutions SET status='superseded',updated_at=now() WHERE document_id=v_document AND status='published';
      UPDATE public.group_constitutions SET status='published',published_at=now(),published_by=v_membership,updated_at=now() WHERE id=v_row.id;
      v_new_id:=v_row.id; v_version:=v_row.version_number;
    ELSE
      IF v_row.id IS NULL OR v_row.status<>'published' THEN RAISE EXCEPTION 'DOCUMENT_NOT_WITHDRAWABLE' USING ERRCODE='55000'; END IF;
      UPDATE public.group_constitutions SET status='withdrawn',withdrawn_at=now(),withdrawn_by=v_membership,updated_at=now() WHERE id=v_row.id;
      v_new_id:=v_row.id; v_version:=v_row.version_number;
    END IF;
  END IF;
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(v_group,v_actor,'document.'||v_action,
    CASE WHEN v_action LIKE '%amendment' THEN 'constitution_amendment' ELSE 'governing_document' END,v_new_id,
    jsonb_build_object('request_id',p_request_id,'document_id',v_document,'version_number',v_version));
  v_result:=jsonb_build_object('request_id',p_request_id,'id',v_new_id,'document_id',v_document,'version_number',v_version,'action',v_action);
  UPDATE public.governance_command_receipts SET result=v_result,completed_at=now() WHERE request_id=p_request_id;
  RETURN v_result;
END; $$;


CREATE OR REPLACE FUNCTION public.execute_standing_decision(p_request_id uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_actor uuid:=auth.uid(); v_group uuid; v_member uuid; v_action text; v_reason text;
  v_effective timestamptz; v_expires timestamptz; v_value public.membership_standing;
  v_revoke uuid; v_active public.standing_decisions; v_bound public.governance_command_receipts;
  v_id uuid; v_result jsonb;
BEGIN
  IF jsonb_typeof(p_command)<>'object' THEN RAISE EXCEPTION 'STANDING_COMMAND_INVALID' USING ERRCODE='22023'; END IF;
  v_group:=(p_command->>'group_id')::uuid; v_member:=(p_command->>'membership_id')::uuid;
  v_action:=p_command->>'action'; v_reason:=nullif(btrim(p_command->>'reason'),'');
  v_effective:=coalesce(nullif(p_command->>'effective_at','')::timestamptz,now());
  v_expires:=nullif(p_command->>'expires_at','')::timestamptz;
  v_revoke:=nullif(p_command->>'decision_id','')::uuid;
  IF v_actor IS NULL OR v_action NOT IN ('override','revoke') OR v_reason IS NULL
     OR NOT public.has_group_permission(v_group,'members.manage')
     OR NOT EXISTS(SELECT 1 FROM public.memberships m WHERE m.id=v_member AND m.group_id=v_group) THEN
    RAISE EXCEPTION 'STANDING_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_action='override' THEN
    v_value:=(p_command->>'standing')::public.membership_standing;
    IF v_value::text NOT IN ('good','warning','suspended','banned') OR (v_expires IS NOT NULL AND v_expires<=v_effective) THEN
      RAISE EXCEPTION 'STANDING_OVERRIDE_INVALID' USING ERRCODE='22023';
    END IF;
  END IF;
  v_bound:=public.bind_governance_command(p_request_id,v_group,'standing.'||v_action,p_command);
  IF v_bound.result IS NOT NULL THEN
    IF NOT public.lock_and_check_group_permission(v_group,'members.manage') THEN
      RAISE EXCEPTION 'STANDING_NOT_AUTHORIZED' USING ERRCODE='42501';
    END IF;
    RETURN v_bound.result;
  END IF;
  PERFORM m.id FROM public.memberships m
    WHERE m.id=v_member AND m.group_id=v_group FOR UPDATE OF m;
  IF NOT FOUND THEN RAISE EXCEPTION 'STANDING_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  IF v_action='revoke' THEN
    SELECT * INTO v_active FROM public.standing_decisions d
     WHERE d.id=v_revoke AND d.group_id=v_group AND d.membership_id=v_member AND d.decision_type='override'
       AND NOT EXISTS(SELECT 1 FROM public.standing_decisions r WHERE r.revoked_decision_id=d.id)
     FOR UPDATE;
    IF v_active.id IS NULL THEN RAISE EXCEPTION 'STANDING_OVERRIDE_NOT_ACTIVE' USING ERRCODE='55000'; END IF;
  END IF;
  IF NOT public.lock_and_check_group_permission(v_group,'members.manage') THEN
    RAISE EXCEPTION 'STANDING_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  PERFORM set_config('app.standing_command','on',true);
  INSERT INTO public.standing_decisions(group_id,membership_id,actor_id,decision_type,override_standing,
    reason,effective_at,expires_at,revoked_decision_id,request_id,material_payload)
  VALUES(v_group,v_member,v_actor,v_action,v_value,v_reason,v_effective,v_expires,v_revoke,p_request_id,p_command)
  RETURNING id INTO v_id;
  PERFORM public.recalculate_membership_standing(v_member);
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(v_group,v_actor,'member.standing_'||v_action,'standing_decision',v_id,
    jsonb_build_object('request_id',p_request_id,'membership_id',v_member,'standing',v_value,
      'effective_at',v_effective,'expires_at',v_expires,'revoked_decision_id',v_revoke,'reason',v_reason));
  v_result:=jsonb_build_object('request_id',p_request_id,'decision_id',v_id,'membership_id',v_member,
    'calculated_standing',(SELECT calculated_standing FROM public.memberships WHERE id=v_member),
    'effective_standing',(SELECT standing FROM public.memberships WHERE id=v_member));
  UPDATE public.governance_command_receipts SET result=v_result,completed_at=now() WHERE request_id=p_request_id;
  RETURN v_result;
END; $$;


CREATE OR REPLACE FUNCTION public.recalculate_standing_command(
  p_request_id uuid,
  p_group_id uuid,
  p_membership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_member public.memberships;
  v_bound public.governance_command_receipts;
  v_payload jsonb;
  v_before_calculated public.membership_standing;
  v_before_effective public.membership_standing;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL OR p_group_id IS NULL OR p_membership_id IS NULL THEN
    RAISE EXCEPTION 'STANDING_RECALC_INVALID' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    public.has_group_permission(p_group_id, 'members.manage')
    OR public.has_group_permission(p_group_id, 'finances.manage')
  ) THEN
    RAISE EXCEPTION 'STANDING_RECALC_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;

  v_payload := jsonb_build_object(
    'group_id', p_group_id,
    'membership_id', p_membership_id
  );
  v_bound := public.bind_governance_command(
    p_request_id,
    p_group_id,
    'standing.recalculate',
    v_payload
  );
  IF v_bound.result IS NOT NULL THEN
    IF NOT (
      public.lock_and_check_group_permission(p_group_id,'members.manage')
      OR public.lock_and_check_group_permission(p_group_id,'finances.manage')
    ) THEN RAISE EXCEPTION 'STANDING_RECALC_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
    RETURN v_bound.result;
  END IF;

  SELECT * INTO v_member
  FROM public.memberships
  WHERE id = p_membership_id AND group_id = p_group_id
  FOR UPDATE;
  IF v_member.id IS NULL THEN
    RAISE EXCEPTION 'STANDING_MEMBER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (
    public.lock_and_check_group_permission(p_group_id,'members.manage')
    OR public.lock_and_check_group_permission(p_group_id,'finances.manage')
  ) THEN RAISE EXCEPTION 'STANDING_RECALC_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;

  v_before_calculated := v_member.calculated_standing;
  v_before_effective := v_member.standing;
  PERFORM public.recalculate_membership_standing(p_membership_id);

  SELECT jsonb_build_object(
    'request_id', p_request_id,
    'membership_id', m.id,
    'calculated_standing', m.calculated_standing,
    'effective_standing', m.standing,
    'changed', (
      m.calculated_standing IS DISTINCT FROM v_before_calculated
      OR m.standing IS DISTINCT FROM v_before_effective
    )
  ) INTO v_result
  FROM public.memberships m
  WHERE m.id = p_membership_id AND m.group_id = p_group_id;

  UPDATE public.governance_command_receipts
  SET result = v_result, completed_at = now()
  WHERE request_id = p_request_id;
  RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.execute_minutes_command(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_minutes_command(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.execute_governing_document_command(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_governing_document_command(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.execute_standing_decision(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.execute_standing_decision(uuid,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.recalculate_standing_command(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.recalculate_standing_command(uuid,uuid,uuid) TO authenticated;
