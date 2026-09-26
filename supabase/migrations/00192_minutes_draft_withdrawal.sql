-- G-001 / G-002: the mounted delete action is a retained withdrawal.
-- Drafts may enter the same immutable withdrawn state as shared or published
-- minutes; no row or attachment history is deleted.

BEGIN;
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
  IF v_bound.result IS NOT NULL THEN RETURN v_bound.result; END IF;
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
REVOKE ALL ON FUNCTION public.execute_minutes_command(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_minutes_command(uuid,jsonb) TO authenticated;

COMMIT;
