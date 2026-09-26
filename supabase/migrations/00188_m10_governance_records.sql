-- 00188: M10 official-record command boundary (G-001..G-005, G-009)
-- Keeps historical rows, introduces stable record/document identity, durable
-- attachment keys, replay-safe server commands, and atomic server audit.

CREATE TABLE public.governance_command_receipts (
  request_id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id),
  actor_id uuid NOT NULL,
  command_type text NOT NULL,
  material_payload jsonb NOT NULL,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.governance_command_receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY governance_receipts_own_select ON public.governance_command_receipts
  FOR SELECT TO authenticated USING (actor_id = auth.uid());
REVOKE ALL ON public.governance_command_receipts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.governance_command_receipts TO authenticated;

CREATE OR REPLACE FUNCTION public.bind_governance_command(
  p_request_id uuid, p_group_id uuid, p_command_type text, p_payload jsonb
) RETURNS public.governance_command_receipts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := auth.uid(); v_row public.governance_command_receipts;
BEGIN
  IF v_actor IS NULL OR p_request_id IS NULL OR p_group_id IS NULL
     OR nullif(btrim(p_command_type),'') IS NULL OR p_payload IS NULL THEN
    RAISE EXCEPTION 'GOVERNANCE_COMMAND_INVALID' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.governance_command_receipts
    (request_id,group_id,actor_id,command_type,material_payload)
  VALUES (p_request_id,p_group_id,v_actor,p_command_type,p_payload)
  ON CONFLICT (request_id) DO NOTHING;
  SELECT * INTO v_row FROM public.governance_command_receipts
   WHERE request_id=p_request_id FOR UPDATE;
  IF v_row.group_id IS DISTINCT FROM p_group_id
     OR v_row.actor_id IS DISTINCT FROM v_actor
     OR v_row.command_type IS DISTINCT FROM p_command_type
     OR v_row.material_payload IS DISTINCT FROM p_payload THEN
    RAISE EXCEPTION 'GOVERNANCE_COMMAND_CONFLICT' USING ERRCODE='23505';
  END IF;
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.bind_governance_command(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_governance_command(uuid,uuid,text,jsonb) TO service_role;

-- Minutes: one stable record may have many immutable official revisions.
-- Drop the read policy before converting the enum-backed status column.
DROP POLICY IF EXISTS mm_select ON public.meeting_minutes;
-- Minutes: one stable record may have many immutable official revisions.
ALTER TABLE public.meeting_minutes ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.meeting_minutes ALTER COLUMN status TYPE text USING status::text;
ALTER TABLE public.meeting_minutes ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE public.meeting_minutes ADD COLUMN record_id uuid;
ALTER TABLE public.meeting_minutes ADD COLUMN revision_number integer;
ALTER TABLE public.meeting_minutes ADD COLUMN parent_revision_id uuid REFERENCES public.meeting_minutes(id) ON DELETE RESTRICT;
ALTER TABLE public.meeting_minutes ADD COLUMN attachment_bucket text;
ALTER TABLE public.meeting_minutes ADD COLUMN attachment_object_key text;
ALTER TABLE public.meeting_minutes ADD COLUMN withdrawn_at timestamptz;
ALTER TABLE public.meeting_minutes ADD COLUMN withdrawn_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT;
UPDATE public.meeting_minutes SET record_id=id WHERE record_id IS NULL;
UPDATE public.meeting_minutes SET revision_number=1 WHERE revision_number IS NULL;
ALTER TABLE public.meeting_minutes ALTER COLUMN record_id SET NOT NULL;
ALTER TABLE public.meeting_minutes ALTER COLUMN revision_number SET NOT NULL;
ALTER TABLE public.meeting_minutes ADD CONSTRAINT meeting_minutes_status_v2_check
  CHECK (status IN ('draft','provisional','published','superseded','withdrawn'));
ALTER TABLE public.meeting_minutes ADD CONSTRAINT meeting_minutes_record_revision_unique
  UNIQUE(record_id,revision_number);
ALTER TABLE public.meeting_minutes DROP CONSTRAINT IF EXISTS meeting_minutes_event_id_key;
ALTER TABLE public.meeting_minutes DROP CONSTRAINT IF EXISTS meeting_minutes_event_id_fkey;
ALTER TABLE public.meeting_minutes ADD CONSTRAINT meeting_minutes_event_id_fkey
  FOREIGN KEY(event_id) REFERENCES public.events(id) ON DELETE SET NULL;
CREATE INDEX meeting_minutes_record_latest_idx
  ON public.meeting_minutes(record_id,revision_number DESC);
CREATE UNIQUE INDEX meeting_minutes_one_mutable_revision
  ON public.meeting_minutes(record_id) WHERE status IN ('draft','provisional');
CREATE UNIQUE INDEX meeting_minutes_one_published_revision
  ON public.meeting_minutes(record_id) WHERE status='published';

-- Governing documents: document_id is stable; id remains revision identity.
ALTER TABLE public.group_constitutions ADD COLUMN document_id uuid;
ALTER TABLE public.group_constitutions ADD COLUMN parent_revision_id uuid REFERENCES public.group_constitutions(id) ON DELETE RESTRICT;
ALTER TABLE public.group_constitutions ADD COLUMN attachment_bucket text;
ALTER TABLE public.group_constitutions ADD COLUMN attachment_object_key text;
ALTER TABLE public.group_constitutions ADD COLUMN withdrawn_at timestamptz;
ALTER TABLE public.group_constitutions ADD COLUMN withdrawn_by uuid REFERENCES public.memberships(id) ON DELETE RESTRICT;
UPDATE public.group_constitutions gc SET document_id=(
  SELECT first_gc.id FROM public.group_constitutions first_gc
   WHERE first_gc.group_id=gc.group_id
     AND lower(coalesce(first_gc.document_type,first_gc.title))=lower(coalesce(gc.document_type,gc.title))
   ORDER BY first_gc.version_number,first_gc.created_at,first_gc.id LIMIT 1
) WHERE document_id IS NULL;
ALTER TABLE public.group_constitutions ALTER COLUMN document_id SET NOT NULL;
ALTER TABLE public.group_constitutions DROP CONSTRAINT IF EXISTS group_constitutions_group_id_version_number_key;
ALTER TABLE public.group_constitutions DROP CONSTRAINT IF EXISTS group_constitutions_status_check;
ALTER TABLE public.group_constitutions ADD CONSTRAINT group_constitutions_status_v2_check
  CHECK(status IN ('draft','published','superseded','withdrawn','archived'));
ALTER TABLE public.group_constitutions ADD CONSTRAINT governing_document_revision_unique
  UNIQUE(document_id,version_number);
DROP INDEX IF EXISTS public.group_constitutions_draft_unique;
CREATE UNIQUE INDEX governing_document_one_draft
  ON public.group_constitutions(document_id) WHERE status='draft';
CREATE UNIQUE INDEX governing_document_one_published
  ON public.group_constitutions(document_id) WHERE status='published';

CREATE OR REPLACE FUNCTION public.guard_governance_direct_write() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_setting('app.governance_command',true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'GOVERNANCE_COMMAND_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW,OLD);
END; $$;
REVOKE ALL ON FUNCTION public.guard_governance_direct_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_minutes_direct_write ON public.meeting_minutes;
CREATE TRIGGER guard_minutes_direct_write BEFORE INSERT OR UPDATE OR DELETE ON public.meeting_minutes
 FOR EACH ROW EXECUTE FUNCTION public.guard_governance_direct_write();
DROP TRIGGER IF EXISTS guard_constitution_direct_write ON public.group_constitutions;
CREATE TRIGGER guard_constitution_direct_write BEFORE INSERT OR UPDATE OR DELETE ON public.group_constitutions
 FOR EACH ROW EXECUTE FUNCTION public.guard_governance_direct_write();
DROP TRIGGER IF EXISTS guard_amendment_direct_write ON public.constitution_amendments;
CREATE TRIGGER guard_amendment_direct_write BEFORE INSERT OR UPDATE OR DELETE ON public.constitution_amendments
 FOR EACH ROW EXECUTE FUNCTION public.guard_governance_direct_write();
DROP TRIGGER IF EXISTS guard_ack_direct_write ON public.constitution_acknowledgments;
CREATE TRIGGER guard_ack_direct_write BEFORE INSERT OR UPDATE OR DELETE ON public.constitution_acknowledgments
 FOR EACH ROW EXECUTE FUNCTION public.guard_governance_direct_write();

-- Remove effective ordinary write routes; keep the existing read policies.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT policyname,tablename FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('meeting_minutes','group_constitutions','constitution_amendments','constitution_acknowledgments')
      AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
  LOOP EXECUTE format('DROP POLICY %I ON public.%I',r.policyname,r.tablename); END LOOP;
END $$;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.meeting_minutes FROM PUBLIC, anon, authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.group_constitutions FROM PUBLIC, anon, authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.constitution_amendments FROM PUBLIC, anon, authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.constitution_acknowledgments FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS mm_select ON public.meeting_minutes;
CREATE POLICY mm_select ON public.meeting_minutes FOR SELECT TO authenticated USING (
  public.is_active_group_member(group_id)
  AND (status IN ('published','provisional') OR public.has_group_permission(group_id,'minutes.manage'))
);

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
    IF v_row.id IS NULL OR v_row.status NOT IN ('published','provisional') THEN RAISE EXCEPTION 'MINUTES_NOT_WITHDRAWABLE' USING ERRCODE='55000'; END IF;
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
  IF v_bound.result IS NOT NULL THEN RETURN v_bound.result; END IF;
  PERFORM set_config('app.governance_command','on',true);

  IF v_action IN ('acknowledge','propose_amendment') THEN
    SELECT * INTO v_row FROM public.group_constitutions d WHERE d.id=v_revision_id AND d.group_id=v_group FOR UPDATE;
    IF v_row.id IS NULL OR v_row.status<>'published' THEN RAISE EXCEPTION 'DOCUMENT_REVISION_NOT_PUBLISHED' USING ERRCODE='55000'; END IF;
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
      IF v_amend.status<>'proposed' OR p_command->>'decision' NOT IN ('approved','rejected') THEN RAISE EXCEPTION 'AMENDMENT_DECISION_INVALID' USING ERRCODE='55000'; END IF;
      UPDATE public.constitution_amendments SET status=p_command->>'decision',approved_at=now(),approved_by=v_membership WHERE id=v_amend.id;
      v_new_id:=v_amend.id; v_version:=NULL;
    ELSE
      IF v_amend.status<>'approved' THEN RAISE EXCEPTION 'AMENDMENT_NOT_APPROVED' USING ERRCODE='55000'; END IF;
      SELECT * INTO v_row FROM public.group_constitutions d WHERE d.id=v_amend.constitution_id AND d.group_id=v_group AND d.status='published' FOR UPDATE;
      IF v_row.id IS NULL OR v_expected IS NULL OR v_row.version_number<>v_expected THEN RAISE EXCEPTION 'DOCUMENT_STALE_REVISION' USING ERRCODE='40001'; END IF;
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
REVOKE ALL ON FUNCTION public.execute_governing_document_command(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.execute_governing_document_command(uuid,jsonb) TO authenticated;

COMMENT ON COLUMN public.meeting_minutes.attachment_object_key IS 'Durable private Storage object key; signed URLs are generated only at read time.';
COMMENT ON COLUMN public.group_constitutions.attachment_object_key IS 'Durable private Storage object key; signed URLs are generated only at read time.';