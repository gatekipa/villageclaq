-- P-009 / F3-07 / SEC-005: recoverable manual-finance intent and trusted audit cutover.
-- F24-qualified 00118–00123 are intentionally unchanged.
BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure('financial_core.post_f3_command(jsonb,jsonb)') IS NULL
     OR to_regclass('public.financial_events') IS NULL
     OR to_regclass('public.group_audit_logs') IS NULL THEN
    RAISE EXCEPTION 'M15_REPAIR_ABORT: missing financial or audit prerequisite';
  END IF;
END
$preflight$;

CREATE TABLE financial_core.manual_financial_intents (
  request_id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  command_type text NOT NULL CHECK (command_type IN ('money_in','money_out','transfer')),
  command jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(command) = 'object'),
  posted_event_id uuid,
  audit_id uuid REFERENCES public.group_audit_logs(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  posted_at timestamptz,
  CONSTRAINT manual_intent_event_scope FOREIGN KEY (posted_event_id,group_id)
    REFERENCES public.financial_events(id,group_id) ON DELETE RESTRICT,
  CONSTRAINT manual_intent_completion CHECK (
    (posted_event_id IS NULL AND audit_id IS NULL AND posted_at IS NULL)
    OR (posted_event_id IS NOT NULL AND audit_id IS NOT NULL AND posted_at IS NOT NULL)
  )
);
CREATE INDEX manual_financial_intents_recovery
  ON financial_core.manual_financial_intents(group_id,actor_id,created_at DESC,request_id DESC);
ALTER TABLE financial_core.manual_financial_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.manual_financial_intents FROM PUBLIC, anon, authenticated, service_role;

-- Every new F3 event, including dues, relief, loans, opening cash, and
-- corrections, gets one server-authored audit row in its posting transaction.
-- The private link distinguishes this row from pre-cutover client claims.
CREATE TABLE financial_core.financial_event_audit_links (
  event_id uuid PRIMARY KEY REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  audit_id uuid NOT NULL UNIQUE REFERENCES public.group_audit_logs(id) ON DELETE RESTRICT
);
ALTER TABLE financial_core.financial_event_audit_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.financial_event_audit_links FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION financial_core.audit_financial_event_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_audit uuid;
BEGIN
  INSERT INTO public.group_audit_logs
    (group_id,actor_id,action,entity_type,entity_id,description,details)
  VALUES (
    NEW.group_id,NEW.created_by,'financial_event.posted','financial_event',NEW.id,
    'Financial event posted',
    pg_catalog.jsonb_build_object(
      'provenance','financial_event_trigger','source_module',NEW.source_module,
      'source_record_id',NEW.source_record_id,'effect_kind',NEW.effect_kind,
      'event_class',NEW.event_class,
      'request_id',NEW.request_id,'fingerprint',NEW.economic_payload_fingerprint
    )
  ) RETURNING id INTO v_audit;
  INSERT INTO financial_core.financial_event_audit_links(event_id,audit_id)
    VALUES (NEW.id,v_audit);
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_event_atomic_audit
  AFTER INSERT ON public.financial_events FOR EACH ROW
  EXECUTE FUNCTION financial_core.audit_financial_event_insert();
REVOKE ALL ON FUNCTION financial_core.audit_financial_event_insert()
  FROM PUBLIC,anon,authenticated,service_role;

-- The client can report activity, but cannot choose the authoritative action,
-- actor, entity, or provenance of an audit event. Existing best-effort callers
-- continue to produce visibly unverified client-activity records.
CREATE FUNCTION public.record_client_activity(
  p_group_id uuid, p_reported_action text, p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL, p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL OR p_group_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.group_id=p_group_id AND m.user_id=v_actor AND m.membership_status='active'
  ) THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  IF p_reported_action IS NULL OR length(p_reported_action) NOT BETWEEN 1 AND 120
     OR p_metadata IS NULL OR pg_catalog.jsonb_typeof(p_metadata) <> 'object'
  THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  INSERT INTO public.group_audit_logs
    (group_id,actor_id,action,entity_type,entity_id,description,details)
  VALUES (
    p_group_id,v_actor,'client_activity','client_report',NULL,
    'Client-reported activity (unverified)',
    pg_catalog.jsonb_build_object(
      'reported_action',p_reported_action,'reported_entity_type',p_entity_type,
      'reported_entity_id',p_entity_id,'reported_description',p_description,
      'reported_metadata',p_metadata
    )
  );
END;
$$;

CREATE FUNCTION public.prepare_manual_financial_intent(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_group uuid; v_actor uuid; v_request uuid; v_action text;
  v_row financial_core.manual_financial_intents%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  v_group := financial_core.f3_uuid(p_command->'group_id');
  v_actor := financial_core.assert_finances_manage(v_group);
  v_request := financial_core.f3_uuid(p_command->'request_id');
  v_action := p_command->>'action';
  IF pg_catalog.jsonb_typeof(p_command->'action') IS DISTINCT FROM 'string'
     OR v_action NOT IN ('money_in','money_out','transfer')
  THEN RAISE EXCEPTION 'EFFECT_NOT_ALLOWED'; END IF;
  INSERT INTO financial_core.manual_financial_intents
    (request_id,group_id,actor_id,command_type,command)
  VALUES (v_request,v_group,v_actor,v_action,p_command)
  ON CONFLICT (request_id) DO NOTHING;
  SELECT * INTO v_row FROM financial_core.manual_financial_intents
    WHERE request_id=v_request FOR UPDATE;
  IF v_row.group_id IS DISTINCT FROM v_group OR v_row.actor_id IS DISTINCT FROM v_actor
  THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  -- Hold and recheck the membership after any uniqueness/row lock wait.
  PERFORM 1 FROM public.memberships m
    WHERE m.group_id=v_group AND m.user_id=v_actor FOR SHARE;
  PERFORM financial_core.assert_finances_manage(v_group);
  IF v_row.command IS DISTINCT FROM p_command OR v_row.command_type IS DISTINCT FROM v_action
  THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  RETURN pg_catalog.jsonb_build_object(
    'request_id',v_request,'status',CASE WHEN v_row.posted_event_id IS NULL THEN 'prepared' ELSE 'posted' END,
    'event_id',v_row.posted_event_id
  );
END;
$$;

CREATE FUNCTION public.list_manual_financial_intents(p_group_id uuid,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_actor uuid; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  v_actor := financial_core.assert_finances_manage(p_group_id);
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 1000000
  THEN RAISE EXCEPTION 'INVALID_OFFSET'; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(x.row_data ORDER BY x.created_at DESC,x.request_id DESC),'[]'::jsonb)
    INTO v_result
  FROM (
    SELECT i.created_at,i.request_id,
      pg_catalog.jsonb_build_object(
        'request_id',i.request_id,'command',i.command,
        'status',CASE WHEN i.posted_event_id IS NULL THEN 'prepared' ELSE 'posted' END,
        'event_id',i.posted_event_id,'created_at',i.created_at,'posted_at',i.posted_at
      ) AS row_data
    FROM financial_core.manual_financial_intents i
    WHERE i.group_id=p_group_id AND i.actor_id=v_actor
    ORDER BY i.created_at DESC,i.request_id DESC LIMIT 25 OFFSET p_offset
  ) x;
  -- Do not return a stored result if authority was revoked while reading.
  PERFORM financial_core.assert_finances_manage(p_group_id);
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.post_manual_financial_intent(p_request_id uuid,p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_group uuid; v_actor uuid; v_row financial_core.manual_financial_intents%ROWTYPE;
  v_result jsonb; v_event uuid; v_audit uuid;
BEGIN
  IF auth.uid() IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  v_group := financial_core.f3_uuid(p_command->'group_id');
  v_actor := financial_core.assert_finances_manage(v_group);
  IF p_request_id IS NULL OR financial_core.f3_uuid(p_command->'request_id')<>p_request_id
  THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  SELECT * INTO v_row FROM financial_core.manual_financial_intents
    WHERE request_id=p_request_id AND group_id=v_group FOR UPDATE;
  IF NOT FOUND OR v_row.actor_id IS DISTINCT FROM v_actor
  THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.memberships m
    WHERE m.group_id=v_group AND m.user_id=v_actor FOR SHARE;
  PERFORM financial_core.assert_finances_manage(v_group);
  IF v_row.command IS DISTINCT FROM p_command OR v_row.command_type IS DISTINCT FROM p_command->>'action'
  THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  v_result := financial_core.post_f3_command(p_command,NULL);
  v_event := (v_result->>'event_id')::uuid;
  IF v_result->>'decision'='POSTED' THEN
    IF v_row.posted_event_id IS NOT NULL THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
    SELECT l.audit_id INTO v_audit
      FROM financial_core.financial_event_audit_links l
      JOIN public.group_audit_logs a ON a.id=l.audit_id
      WHERE l.event_id=v_event AND a.group_id=v_group AND a.actor_id=v_actor
        AND a.entity_type='financial_event' AND a.entity_id=v_event
        AND a.action='financial_event.posted';
    IF v_audit IS NULL THEN RAISE EXCEPTION 'AUDIT_INTEGRITY'; END IF;
    UPDATE financial_core.manual_financial_intents
      SET posted_event_id=v_event,audit_id=v_audit,posted_at=now()
      WHERE request_id=p_request_id;
  ELSIF v_result->>'decision'='IDEMPOTENT_RETURN_EXISTING' THEN
    IF v_row.posted_event_id IS DISTINCT FROM v_event OR v_row.audit_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM financial_core.financial_event_audit_links l
         JOIN public.group_audit_logs a ON a.id=l.audit_id
         WHERE l.event_id=v_event AND l.audit_id=v_row.audit_id
           AND a.group_id=v_group AND a.actor_id=v_actor
           AND a.entity_type='financial_event' AND a.entity_id=v_event
           AND a.action='financial_event.posted'
       )
    THEN RAISE EXCEPTION 'AUDIT_INTEGRITY'; END IF;
  ELSE RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
  RETURN v_result;
END;
$$;

-- No authenticated path may impersonate an authoritative consequential audit.
DROP POLICY IF EXISTS "member_insert_audit_logs" ON public.group_audit_logs;
DROP POLICY IF EXISTS "System insert audit" ON public.group_audit_logs;
DROP POLICY IF EXISTS "rls_gal_insert" ON public.group_audit_logs;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.group_audit_logs FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.post_financial_command(jsonb) FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.record_client_activity(uuid,text,text,uuid,text,jsonb),
  public.prepare_manual_financial_intent(jsonb),
  public.list_manual_financial_intents(uuid,integer),
  public.post_manual_financial_intent(uuid,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.record_client_activity(uuid,text,text,uuid,text,jsonb),
  public.prepare_manual_financial_intent(jsonb),
  public.list_manual_financial_intents(uuid,integer),
  public.post_manual_financial_intent(uuid,jsonb)
  TO authenticated;

COMMIT;
