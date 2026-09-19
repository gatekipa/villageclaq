-- F3-05 Stage B: secure manual opening cash command and immutable provenance.
-- Opening economics remain owned by financial_core.post_f3_command (F3-02).
BEGIN;

CREATE TABLE financial_core.opening_provenances (
  id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  source_description text NOT NULL,
  source_at timestamptz,
  reference_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT opening_provenances_id_group UNIQUE (id, group_id),
  CONSTRAINT opening_provenances_reference_object
    CHECK (pg_catalog.jsonb_typeof(reference_metadata) = 'object')
);

ALTER TABLE financial_core.opening_provenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_core.opening_provenances FORCE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.opening_provenances FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION financial_core.guard_f3_opening_provenance()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'OPENING_PROVENANCE_IMMUTABLE';
END;
$$;

CREATE TRIGGER opening_provenances_immutable
BEFORE UPDATE OR DELETE ON financial_core.opening_provenances
FOR EACH ROW EXECUTE FUNCTION financial_core.guard_f3_opening_provenance();

CREATE FUNCTION financial_core.f3_opening_safe_text(
  p_value text, p_max integer, p_required boolean DEFAULT true
) RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_i integer;
  v_code integer;
  v_spaces text := E' \t\n\r\f\v' || pg_catalog.chr(133) || pg_catalog.chr(160)
    || pg_catalog.chr(5760) || pg_catalog.chr(8192) || pg_catalog.chr(8193)
    || pg_catalog.chr(8194) || pg_catalog.chr(8195) || pg_catalog.chr(8196)
    || pg_catalog.chr(8197) || pg_catalog.chr(8198) || pg_catalog.chr(8199)
    || pg_catalog.chr(8200) || pg_catalog.chr(8201) || pg_catalog.chr(8202)
    || pg_catalog.chr(8232) || pg_catalog.chr(8233) || pg_catalog.chr(8239)
    || pg_catalog.chr(8287) || pg_catalog.chr(12288);
BEGIN
  IF p_value IS NULL THEN
    IF p_required THEN RAISE EXCEPTION 'INVALID_PROVENANCE'; END IF;
    RETURN NULL;
  END IF;
  IF pg_catalog.length(p_value) > p_max
    OR pg_catalog.length(pg_catalog.btrim(p_value, v_spaces)) = 0
  THEN RAISE EXCEPTION 'INVALID_PROVENANCE'; END IF;
  FOR v_i IN 1..pg_catalog.length(p_value) LOOP
    v_code := pg_catalog.ascii(pg_catalog.substr(p_value, v_i, 1));
    IF v_code BETWEEN 0 AND 31 OR v_code BETWEEN 127 AND 159
    THEN RAISE EXCEPTION 'INVALID_PROVENANCE'; END IF;
  END LOOP;
  RETURN p_value;
END;
$$;

CREATE FUNCTION financial_core.post_f3_opening_cash(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid;
  v_group uuid;
  v_occurrence uuid;
  v_provenance_id uuid;
  v_account_id uuid;
  v_fund_id uuid;
  v_provenance jsonb;
  v_metadata jsonb;
  v_description text;
  v_reference text;
  v_source_at timestamptz;
  v_evidence jsonb := '[]'::jsonb;
  v_item jsonb;
  v_key text;
  v_existing_event uuid;
  v_existing_provenance uuid;
  v_manual_event uuid;
  v_saved financial_core.opening_provenances%ROWTYPE;
  v_account public.financial_accounts%ROWTYPE;
  v_fund public.financial_funds%ROWTYPE;
  v_epoch_count integer;
  v_epoch public.financial_ledger_epochs%ROWTYPE;
  v_inner jsonb;
BEGIN
  -- Initial authorization precedes history, conflict, target and provenance lookup.
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'DENY' USING ERRCODE = '42501'; END IF;
  IF pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  v_group := financial_core.f3_uuid(p_command->'group_id');
  BEGIN
    v_actor := financial_core.assert_finances_manage(v_group);
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE = '42501';
  END;

  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_command) LOOP
    IF NOT (v_key = ANY(ARRAY['group_id','opening_occurrence_id','opening_provenance_id',
      'account_id','fund_id','amount','occurred_at','currency','provenance']))
    THEN RAISE EXCEPTION 'UNSUPPORTED_FIELD'; END IF;
  END LOOP;
  IF p_command->'group_id' IS NULL OR p_command->'opening_occurrence_id' IS NULL
    OR p_command->'opening_provenance_id' IS NULL OR p_command->'account_id' IS NULL
    OR p_command->'fund_id' IS NULL OR p_command->'amount' IS NULL
    OR p_command->'occurred_at' IS NULL OR p_command->'provenance' IS NULL
    OR COALESCE(p_command->'currency','"ok"'::jsonb) = 'null'::jsonb
  THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;

  v_occurrence := financial_core.f3_uuid(p_command->'opening_occurrence_id');
  v_provenance_id := financial_core.f3_uuid(p_command->'opening_provenance_id');
  v_account_id := financial_core.f3_uuid(p_command->'account_id');
  v_fund_id := financial_core.f3_uuid(p_command->'fund_id');
  v_provenance := p_command->'provenance';
  IF pg_catalog.jsonb_typeof(v_provenance) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(v_provenance) LOOP
    IF v_key NOT IN ('source_description','source_at','reference_metadata')
    THEN RAISE EXCEPTION 'UNSUPPORTED_FIELD'; END IF;
  END LOOP;
  IF pg_catalog.jsonb_typeof(v_provenance->'source_description') IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION 'INVALID_PROVENANCE'; END IF;
  v_description := financial_core.f3_opening_safe_text(v_provenance->>'source_description',1000,true);
  IF COALESCE(v_provenance->'source_at','null'::jsonb) <> 'null'::jsonb THEN
    v_source_at := financial_core.f3_timestamp(v_provenance->'source_at');
  END IF;
  v_metadata := COALESCE(NULLIF(v_provenance->'reference_metadata','null'::jsonb),'{}'::jsonb);
  IF pg_catalog.jsonb_typeof(v_metadata) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'INVALID_PROVENANCE'; END IF;
  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(v_metadata) LOOP
    IF v_key NOT IN ('reference','evidence_ids') THEN RAISE EXCEPTION 'UNSUPPORTED_FIELD'; END IF;
  END LOOP;
  IF COALESCE(v_metadata->'reference','null'::jsonb) <> 'null'::jsonb THEN
    IF pg_catalog.jsonb_typeof(v_metadata->'reference') IS DISTINCT FROM 'string'
    THEN RAISE EXCEPTION 'INVALID_PROVENANCE'; END IF;
    v_reference := financial_core.f3_opening_safe_text(v_metadata->>'reference',500,false);
  END IF;
  IF COALESCE(v_metadata->'evidence_ids','null'::jsonb) <> 'null'::jsonb THEN
    IF pg_catalog.jsonb_typeof(v_metadata->'evidence_ids') IS DISTINCT FROM 'array'
      OR pg_catalog.jsonb_array_length(v_metadata->'evidence_ids') > 20
    THEN RAISE EXCEPTION 'INVALID_PROVENANCE'; END IF;
    FOR v_item IN SELECT pg_catalog.jsonb_array_elements(v_metadata->'evidence_ids') LOOP
      v_evidence := v_evidence || pg_catalog.jsonb_build_array(financial_core.f3_uuid(v_item));
    END LOOP;
  END IF;
  v_metadata := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'reference',v_reference,'evidence_ids',CASE
      WHEN v_metadata ? 'evidence_ids' AND v_metadata->'evidence_ids' <> 'null'::jsonb THEN v_evidence
      ELSE NULL END));

  -- Global order: immutable F3 source occurrence, then provenance identity.
  PERFORM financial_core.lock_f3_identity(v_group,NULL,'opening_finance',v_occurrence::text,'opening_custody');
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array('f3-opening-provenance',v_provenance_id)::text,0));

  -- Hold and recheck current authorization after every advisory-lock wait.
  PERFORM 1 FROM public.memberships m
    WHERE m.group_id=v_group AND m.user_id=v_actor FOR SHARE;
  BEGIN
    PERFORM financial_core.assert_finances_manage(v_group);
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE = '42501';
  END;

  SELECT e.id INTO v_existing_event FROM public.financial_events e
    WHERE e.group_id=v_group AND e.source_module='opening_finance'
      AND e.source_record_id=v_occurrence::text AND e.effect_kind='opening_custody';
  IF v_existing_event IS NOT NULL THEN
    SELECT (c.canonical_payload->>'opening_provenance_id')::uuid
      INTO v_existing_provenance
      FROM financial_core.posting_command_payloads c
      WHERE c.event_id=v_existing_event;
    IF v_existing_provenance IS NULL THEN RAISE EXCEPTION 'PROVENANCE_INTEGRITY'; END IF;
  END IF;
  SELECT e.id INTO v_manual_event FROM public.financial_events e
    WHERE e.group_id=v_group AND e.request_id=v_occurrence;
  IF v_manual_event IS NOT NULL THEN RAISE EXCEPTION 'REQUEST_ID_REUSED'; END IF;

  SELECT p.* INTO v_saved FROM financial_core.opening_provenances p
    WHERE p.id=v_provenance_id;
  IF v_saved.id IS NOT NULL AND v_saved.group_id<>v_group
  THEN RAISE EXCEPTION 'DENY' USING ERRCODE = '42501'; END IF;

  v_inner := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'action','opening','group_id',v_group,'occurred_at',p_command->'occurred_at',
    'amount',p_command->'amount','currency',p_command->'currency',
    'account_id',v_account_id,'fund_id',v_fund_id,
    'description',CASE WHEN v_saved.id IS NULL THEN v_description ELSE v_saved.source_description END,
    'reference_metadata',CASE WHEN v_saved.id IS NULL THEN v_metadata ELSE v_saved.reference_metadata END));

  -- Existing occurrence replay/conflict uses frozen F3-02 payload before current catalog checks.
  IF v_existing_event IS NOT NULL THEN
    IF v_existing_provenance=v_provenance_id AND v_saved.id IS NULL
    THEN RAISE EXCEPTION 'PROVENANCE_INTEGRITY'; END IF;
    RETURN financial_core.post_f3_command(v_inner,pg_catalog.jsonb_build_object(
      'group_id',v_group,'occurrence_id',v_occurrence,
      'provenance',pg_catalog.jsonb_build_object('id',v_provenance_id,'group_id',v_group)));
  END IF;

  IF v_saved.id IS NULL THEN
    INSERT INTO financial_core.opening_provenances(
      id,group_id,source_description,source_at,reference_metadata,recorded_by)
    VALUES(v_provenance_id,v_group,v_description,v_source_at,v_metadata,v_actor)
    RETURNING * INTO v_saved;
  END IF;

  -- Lock configuration rows before the private engine resolves them again.
  SELECT a.* INTO v_account FROM public.financial_accounts a
    WHERE a.id=v_account_id AND a.group_id=v_group FOR SHARE;
  IF v_account.id IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
  IF v_account.kind NOT IN ('bank','cash') THEN RAISE EXCEPTION 'ACCOUNT_KIND_NOT_ALLOWED'; END IF;
  IF v_account.status<>'active' OR v_account.closed_at IS NOT NULL
  THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;

  SELECT f.* INTO v_fund FROM public.financial_funds f
    WHERE f.id=v_fund_id AND f.group_id=v_group FOR SHARE;
  IF v_fund.id IS NULL THEN RAISE EXCEPTION 'FUND_NOT_FOUND'; END IF;
  IF v_fund.status<>'active' THEN RAISE EXCEPTION 'FUND_INACTIVE'; END IF;

  SELECT pg_catalog.count(*) INTO v_epoch_count FROM public.financial_ledger_epochs e
    WHERE e.group_id=v_group
      AND financial_core.f3_timestamp(p_command->'occurred_at')>=e.effective_from
      AND (e.effective_to IS NULL OR financial_core.f3_timestamp(p_command->'occurred_at')<e.effective_to);
  IF v_epoch_count<>1 THEN
    RAISE EXCEPTION '%',CASE WHEN v_epoch_count=0 THEN 'EPOCH_NOT_FOUND' ELSE 'EPOCH_AMBIGUOUS' END;
  END IF;
  SELECT e.* INTO v_epoch FROM public.financial_ledger_epochs e
    WHERE e.group_id=v_group
      AND financial_core.f3_timestamp(p_command->'occurred_at')>=e.effective_from
      AND (e.effective_to IS NULL OR financial_core.f3_timestamp(p_command->'occurred_at')<e.effective_to)
    FOR SHARE;

  -- Use only the committed provenance snapshot for the event narrative.
  v_inner := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'action','opening','group_id',v_group,'occurred_at',p_command->'occurred_at',
    'amount',p_command->'amount','currency',p_command->'currency',
    'account_id',v_account_id,'fund_id',v_fund_id,
    'description',v_saved.source_description,'reference_metadata',v_saved.reference_metadata));
  RETURN financial_core.post_f3_command(v_inner,pg_catalog.jsonb_build_object(
    'group_id',v_group,'occurrence_id',v_occurrence,
    'provenance',pg_catalog.jsonb_build_object('id',v_provenance_id,'group_id',v_group)));
END;
$$;

CREATE FUNCTION public.post_financial_opening_cash(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RETURN financial_core.post_f3_opening_cash(p_command);
END;
$$;

REVOKE ALL ON FUNCTION financial_core.guard_f3_opening_provenance(),
  financial_core.f3_opening_safe_text(text,integer,boolean),
  financial_core.post_f3_opening_cash(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.post_financial_opening_cash(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_financial_opening_cash(jsonb) TO authenticated;

COMMIT;
