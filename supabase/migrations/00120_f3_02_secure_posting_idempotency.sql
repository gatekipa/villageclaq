-- M3 forward rematerialization of F3-02 onto post-S0 / post-M2 main (after 00117).
-- DO NOT APPLY TO PRODUCTION from the M3 draft PR.
-- DO NOT MERGE as a production financial write path.
-- Oracle (REFERENCE ONLY, not applied): 20260908215831_f3_secure_posting_idempotency.sql on c7b4cd535d7125737eab2ec0fad27cae9432e8c3
-- Planning: PR #83 tip a178068384290b37ec6c17b02428b399d52ddd10
-- CALL public.has_group_permission(gid, perm_key, uid) only. NEVER CREATE OR REPLACE it.
-- NEVER add a 2-arg overload. NEVER touch Cut 3 storage / Cut 2 queue / M2 policy tables.
-- No F3-06 UI, no F3-07 Record Transaction, no FCG-1 close, no F3-08/09, no M4.
-- No notifications_queue / enqueue / producer wiring.
-- No opening-cash product UX (command only; UI remains hidden).

DO $f3_pre$
DECLARE
  v_hgp_count int;
  v_hgp_ident text;
  v_hgp_result text;
  v_hgp_owner text;
  v_hgp_definer boolean;
  v_hgp_cfg text[];
  v_hgp_def_md5 text;
  v_hgp_src_md5 text;
BEGIN
  SELECT count(*) INTO v_hgp_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'F3_ABORT: has_group_permission overload count=% (expected 1; do not add 2-arg)', v_hgp_count;
  END IF;
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid),
         pg_get_userbyid(p.proowner),
         p.prosecdef,
         p.proconfig,
         md5(pg_get_functiondef(p.oid)),
         md5(p.prosrc)
    INTO v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
         v_hgp_def_md5, v_hgp_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_ident IS DISTINCT FROM 'gid uuid, perm_key text, uid uuid'
     OR v_hgp_result IS DISTINCT FROM 'boolean'
     OR v_hgp_owner IS DISTINCT FROM 'postgres'
     OR v_hgp_definer IS NOT TRUE
     OR v_hgp_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR v_hgp_def_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
     OR v_hgp_src_md5 IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff' THEN
    RAISE EXCEPTION
      'F3_ABORT: has_group_permission pin mismatch ident=% result=% owner=% definer=% cfg=% def_md5=% src_md5=%',
      v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
      v_hgp_def_md5, v_hgp_src_md5;
  END IF;

  IF to_regclass('public.financial_events') IS NULL
     OR to_regclass('public.financial_postings') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: F3-01 tables missing — apply 00119 first';
  END IF;
  IF to_regprocedure('public.post_financial_command(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: post_financial_command already present';
  END IF;
END
$f3_pre$;

-- F3-02 Stage B. Frozen semantics: 00cbf90e253f72840688d9a3825d745e2064869b.
-- No production apply. This migration and Stage A form one shippable unit.
BEGIN;

-- Validate text before PostgreSQL's permissive casts or numeric typmod rounding.
CREATE FUNCTION financial_core.f3_uuid(p_value jsonb, p_optional boolean DEFAULT false)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_text text;
BEGIN
  IF p_optional AND (p_value IS NULL OR p_value = 'null'::jsonb) THEN RETURN NULL; END IF;
  v_text := p_value #>> '{}';
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'string'
    OR pg_catalog.length(v_text) <> 36
    OR v_text !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN RAISE EXCEPTION 'INVALID_UUID'; END IF;
  RETURN v_text::uuid;
END;
$$;

CREATE FUNCTION financial_core.f3_currency(p_value jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_text text := p_value #>> '{}';
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'string'
    OR pg_catalog.length(v_text) <> 3 OR v_text !~ '^[a-zA-Z]{3}$'
    OR financial_core.currency_scale(v_text) IS NULL
  THEN RAISE EXCEPTION 'UNSUPPORTED_CURRENCY'; END IF;
  RETURN pg_catalog.upper(v_text);
END;
$$;

CREATE FUNCTION financial_core.f3_amount(p_value jsonb, p_currency text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE
  v_text text := p_value #>> '{}'; v_scale integer; v_whole text; v_fraction text;
BEGIN
  v_scale := financial_core.currency_scale(p_currency);
  IF v_scale IS NULL THEN RAISE EXCEPTION 'UNSUPPORTED_CURRENCY'; END IF;
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'string'
    OR pg_catalog.length(v_text) > 64
    OR v_text !~ '^-?[0-9]+([.][0-9]+)?$' OR v_text ~ '[^0-9.-]'
  THEN RAISE EXCEPTION 'INVALID_AMOUNT'; END IF;
  IF pg_catalog.left(v_text, 1) = '-' THEN RAISE EXCEPTION 'AMOUNT_NOT_POSITIVE'; END IF;
  v_whole := COALESCE(NULLIF(pg_catalog.ltrim(pg_catalog.split_part(v_text, '.', 1), '0'), ''), '0');
  v_fraction := pg_catalog.split_part(v_text, '.', 2);
  IF pg_catalog.length(v_fraction) > v_scale THEN RAISE EXCEPTION 'AMOUNT_PRECISION'; END IF;
  IF pg_catalog.length(v_whole) > 22 THEN RAISE EXCEPTION 'AMOUNT_RANGE'; END IF;
  IF v_text::numeric <= 0 THEN RAISE EXCEPTION 'AMOUNT_NOT_POSITIVE'; END IF;
  RETURN v_whole || CASE WHEN v_scale = 0 THEN '' ELSE '.' || pg_catalog.rpad(v_fraction, v_scale, '0') END;
END;
$$;

CREATE FUNCTION financial_core.f3_timestamp(p_value jsonb)
RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_text text := p_value #>> '{}'; v_parts text[]; v_time timestamptz; v_zone text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'string' OR v_text ~ '[^0-9TZ:+.-]'
  THEN RAISE EXCEPTION 'INVALID_OCCURRED_AT'; END IF;
  v_parts := pg_catalog.regexp_match(v_text,
    '^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})([.][0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$');
  IF v_parts IS NULL THEN RAISE EXCEPTION 'INVALID_OCCURRED_AT'; END IF;
  v_zone := v_parts[8];
  IF v_parts[1]::integer < 1 OR v_parts[4]::integer > 23
    OR v_parts[5]::integer > 59 OR v_parts[6]::integer > 59 OR v_zone = '-00:00'
  THEN RAISE EXCEPTION 'INVALID_OCCURRED_AT'; END IF;
  IF v_zone <> 'Z' AND (
    pg_catalog.substr(v_zone,2,2)::integer > 14 OR pg_catalog.substr(v_zone,5,2)::integer > 59
    OR (pg_catalog.substr(v_zone,2,2) = '14' AND pg_catalog.substr(v_zone,5,2) <> '00')
  ) THEN RAISE EXCEPTION 'INVALID_OCCURRED_AT'; END IF;
  BEGIN
    v_time := v_text::timestamptz;
  EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
    RAISE EXCEPTION 'INVALID_OCCURRED_AT';
  END;
  IF EXTRACT(YEAR FROM v_time AT TIME ZONE 'UTC') NOT BETWEEN 1 AND 9999
  THEN RAISE EXCEPTION 'INVALID_OCCURRED_AT'; END IF;
  RETURN v_time;
END;
$$;

-- ECMAScript TrimString whitespace, matching the frozen expense-description rule.
CREATE FUNCTION financial_core.f3_trim(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.btrim(p_text,
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;

CREATE FUNCTION financial_core.f3_canonical(p_payload jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v_result text; v_keys constant text[] := ARRAY[
  'contract_version','group_id','ledger_epoch_id','event_class','effect_kind','currency',
  'amount','occurred_at','source_module','source_record_id','request_id','account_id',
  'destination_account_id','fund_id','category_id','member_id','project_id','opening_provenance_id'];
BEGIN
  IF pg_catalog.jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
    OR NOT (p_payload ?& v_keys)
  THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_each(p_payload) AS x(key,value)
    WHERE NOT (x.key = ANY(v_keys)) OR pg_catalog.jsonb_typeof(x.value) NOT IN ('string','null'))
  THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
  -- Each value is a normalized ASCII scalar. No jsonb object-text hashing.
  SELECT '{' || pg_catalog.string_agg(pg_catalog.to_json(x.key)::text || ':' || x.value::text,
    ',' ORDER BY x.key COLLATE "C") || '}' INTO v_result
  FROM pg_catalog.jsonb_each(p_payload) AS x(key,value);
  RETURN v_result;
END;
$$;

CREATE FUNCTION financial_core.f3_fingerprint(p_payload jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT pg_catalog.encode(pg_catalog.sha256(
    pg_catalog.convert_to(financial_core.f3_canonical(p_payload), 'UTF8')), 'hex');
$$;

-- Extra cross-epoch guard; the frozen epoch-bound natural key is retained.
CREATE UNIQUE INDEX financial_events_occurrence_across_epochs
  ON public.financial_events(group_id, source_module, source_record_id, effect_kind);

-- Comparison metadata only. Financial truth remains events + postings.
CREATE TABLE financial_core.posting_command_payloads (
  event_id uuid PRIMARY KEY REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  canonical_payload jsonb NOT NULL CHECK (
    pg_catalog.jsonb_typeof(canonical_payload) = 'object'
    AND canonical_payload->>'contract_version' = 'f3-posting-v1'
  )
);
ALTER TABLE financial_core.posting_command_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_core.posting_command_payloads FORCE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.posting_command_payloads FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION financial_core.guard_f3_payload()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'POSTING_COMMAND_PAYLOAD_IMMUTABLE'; END;
$$;
CREATE TRIGGER posting_command_payloads_immutable
BEFORE UPDATE OR DELETE ON financial_core.posting_command_payloads
FOR EACH ROW EXECUTE FUNCTION financial_core.guard_f3_payload();

CREATE FUNCTION financial_core.guard_f3_posting_closure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  -- Serializes a privileged late append against completion of the posting command.
  PERFORM 1 FROM public.financial_events e WHERE e.id = NEW.event_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM financial_core.posting_command_payloads c WHERE c.event_id = NEW.event_id)
  THEN RAISE EXCEPTION 'POSTING_SET_CLOSED'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER financial_postings_f3_closure
BEFORE INSERT ON public.financial_postings
FOR EACH ROW EXECUTE FUNCTION financial_core.guard_f3_posting_closure();

CREATE FUNCTION financial_core.check_f3_posting_closure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM public.financial_postings p WHERE p.event_id = NEW.event_id) <> 2
    OR NOT EXISTS (SELECT 1 FROM public.financial_events e WHERE e.id = NEW.event_id
      AND e.economic_payload_fingerprint = financial_core.f3_fingerprint(NEW.canonical_payload))
  THEN RAISE EXCEPTION 'POSTING_SET_INCOMPLETE'; END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER posting_command_payloads_complete
AFTER INSERT ON financial_core.posting_command_payloads DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION financial_core.check_f3_posting_closure();

CREATE FUNCTION financial_core.lock_f3_identity(
  p_group uuid, p_request uuid, p_module text, p_source text, p_effect text
) RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF p_group IS NULL OR p_module IS NULL OR p_source IS NULL OR p_effect IS NULL
  THEN RAISE EXCEPTION 'FINANCIAL_OCCURRENCE_LOCK_KEY_REQUIRED'; END IF;
  -- Fixed order: manual request, then immutable source. Neither contains epoch.
  IF p_request IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      pg_catalog.jsonb_build_array('f3-request',p_group,p_request)::text,0));
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    pg_catalog.jsonb_build_array('f3-source',p_group,p_module,p_source,p_effect)::text,0));
END;
$$;

-- Private implementation; p_opening is a trusted, server-resolved F3-05 envelope.
-- No authenticated/anon/service_role EXECUTE grant. No opening workflow is exposed.
CREATE FUNCTION financial_core.post_f3_command(p_command jsonb, p_opening jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid; v_group uuid; v_request uuid; v_action text; v_effect text; v_class public.financial_event_class;
  v_module text; v_source text; v_provenance uuid; v_account uuid; v_destination uuid;
  v_fund uuid; v_category uuid; v_member uuid; v_project uuid; v_occurred timestamptz;
  v_code text; v_amount text; v_numeric numeric; v_epoch public.financial_ledger_epochs%ROWTYPE;
  v_acc public.financial_accounts%ROWTYPE; v_dest public.financial_accounts%ROWTYPE;
  v_fund_row public.financial_funds%ROWTYPE; v_cat public.financial_categories%ROWTYPE;
  v_existing public.financial_events%ROWTYPE; v_existing_payload jsonb; v_payload jsonb;
  v_request_event uuid; v_source_event uuid; v_event uuid; v_hash text; v_key text; v_item jsonb;
  v_metadata jsonb; v_count integer; v_first public.financial_control_class;
  v_second public.financial_control_class; v_first_amount numeric; v_second_amount numeric;
  v_first_account uuid; v_second_account uuid; v_first_category uuid; v_second_category uuid;
BEGIN
  -- Authorization precedes all historical/conflict/target disclosure.
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'DENY' USING ERRCODE = '42501'; END IF;
  v_group := financial_core.f3_uuid(p_command->'group_id');
  BEGIN
    v_actor := financial_core.assert_finances_manage(v_group);
  EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'DENY' USING ERRCODE = '42501';
  END;
  IF pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_command) LOOP
    IF NOT (v_key = ANY(ARRAY['action','group_id','request_id','occurred_at','amount','currency',
      'account_id','destination_account_id','fund_id','category_id','member_id','project_id',
      'description','reference_metadata']))
    THEN RAISE EXCEPTION 'UNSUPPORTED_FIELD'; END IF;
  END LOOP;
  v_action := p_command->>'action';
  IF pg_catalog.jsonb_typeof(p_command->'action') IS DISTINCT FROM 'string'
    OR v_action NOT IN ('money_in','money_out','transfer','opening')
  THEN RAISE EXCEPTION 'EFFECT_NOT_ALLOWED'; END IF;
  v_class := CASE v_action WHEN 'opening' THEN 'opening_adjustment' ELSE v_action END;
  v_effect := CASE v_action WHEN 'money_in' THEN 'manual_income' WHEN 'money_out' THEN 'manual_expense'
    WHEN 'transfer' THEN 'account_transfer' ELSE 'opening_custody' END;
  IF v_action = 'opening' THEN
    IF p_opening IS NULL THEN RAISE EXCEPTION 'PRIVATE_EFFECT'; END IF;
    IF COALESCE(p_command->'request_id','null'::jsonb) <> 'null'::jsonb THEN RAISE EXCEPTION 'FIELD_PROHIBITED'; END IF;
    IF COALESCE(p_opening->'provenance','null'::jsonb) = 'null'::jsonb
    THEN RAISE EXCEPTION 'OPENING_PROVENANCE_REQUIRED'; END IF;
    IF financial_core.f3_uuid(p_opening->'group_id') <> v_group
      OR financial_core.f3_uuid(p_opening->'provenance'->'group_id') <> v_group
    THEN RAISE EXCEPTION 'CROSS_GROUP_SOURCE'; END IF;
    v_source := financial_core.f3_uuid(p_opening->'occurrence_id')::text;
    v_provenance := financial_core.f3_uuid(p_opening->'provenance'->'id');
    v_module := 'opening_finance';
  ELSE
    IF p_opening IS NOT NULL THEN RAISE EXCEPTION 'SOURCE_NOT_ALLOWED'; END IF;
    IF COALESCE(p_command->'request_id','null'::jsonb) = 'null'::jsonb THEN RAISE EXCEPTION 'REQUEST_ID_REQUIRED'; END IF;
    v_request := financial_core.f3_uuid(p_command->'request_id');
    v_source := v_request::text; v_module := 'manual_finance';
  END IF;
  PERFORM financial_core.lock_f3_identity(v_group,v_request,v_module,v_source,v_effect);
  -- Recheck after waits. Hold the membership row through transaction completion.
  PERFORM 1 FROM public.memberships m WHERE m.group_id=v_group AND m.user_id=v_actor FOR SHARE;
  BEGIN
    PERFORM financial_core.assert_finances_manage(v_group);
  EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'DENY' USING ERRCODE = '42501';
  END;
  SELECT e.id INTO v_request_event FROM public.financial_events e
    WHERE e.group_id=v_group AND e.request_id=v_request;
  SELECT e.id INTO v_source_event FROM public.financial_events e
    WHERE e.group_id=v_group AND e.source_module=v_module AND e.source_record_id=v_source AND e.effect_kind=v_effect;
  IF v_request_event IS NOT NULL AND v_source_event IS NOT NULL AND v_request_event<>v_source_event
  THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
  SELECT e.* INTO v_existing FROM public.financial_events e WHERE e.id=COALESCE(v_request_event,v_source_event);

  IF COALESCE(p_command->'description','null'::jsonb) <> 'null'::jsonb
    AND pg_catalog.jsonb_typeof(p_command->'description') <> 'string'
  THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
  v_metadata := COALESCE(NULLIF(p_command->'reference_metadata','null'::jsonb),'{}'::jsonb);
  IF pg_catalog.jsonb_typeof(v_metadata) <> 'object' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(v_metadata) k WHERE k NOT IN ('reference','evidence_ids'))
  THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
  IF COALESCE(v_metadata->'reference','null'::jsonb) <> 'null'::jsonb
    AND pg_catalog.jsonb_typeof(v_metadata->'reference') <> 'string'
  THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
  IF COALESCE(v_metadata->'evidence_ids','null'::jsonb) <> 'null'::jsonb THEN
    IF pg_catalog.jsonb_typeof(v_metadata->'evidence_ids') <> 'array' THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
    FOR v_item IN SELECT pg_catalog.jsonb_array_elements(v_metadata->'evidence_ids') LOOP
      PERFORM financial_core.f3_uuid(v_item);
    END LOOP;
  END IF;
  v_account := financial_core.f3_uuid(p_command->'account_id');
  v_occurred := financial_core.f3_timestamp(p_command->'occurred_at');
  v_destination := financial_core.f3_uuid(p_command->'destination_account_id',true);
  v_fund := financial_core.f3_uuid(p_command->'fund_id',true);
  v_category := financial_core.f3_uuid(p_command->'category_id',true);
  v_member := financial_core.f3_uuid(p_command->'member_id',true);
  v_project := financial_core.f3_uuid(p_command->'project_id',true);
  IF v_action='transfer' THEN
    IF v_destination IS NULL THEN RAISE EXCEPTION 'DESTINATION_REQUIRED'; END IF;
    IF v_account=v_destination THEN RAISE EXCEPTION 'SAME_ACCOUNT'; END IF;
  ELSIF v_destination IS NOT NULL THEN RAISE EXCEPTION 'FIELD_PROHIBITED';
  END IF;
  IF v_action IN ('money_in','money_out') THEN
    IF v_category IS NULL THEN RAISE EXCEPTION 'CATEGORY_REQUIRED'; END IF;
  ELSE
    IF v_category IS NOT NULL THEN RAISE EXCEPTION 'CATEGORY_PROHIBITED'; END IF;
    IF v_member IS NOT NULL OR v_project IS NOT NULL THEN RAISE EXCEPTION 'ATTRIBUTION_PROHIBITED'; END IF;
    IF v_fund IS NULL THEN RAISE EXCEPTION 'FUND_REQUIRED'; END IF;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    SELECT c.canonical_payload INTO v_existing_payload
      FROM financial_core.posting_command_payloads c WHERE c.event_id=v_existing.id;
    IF v_existing_payload IS NULL OR v_existing_payload->>'contract_version' <> 'f3-posting-v1'
      OR financial_core.f3_fingerprint(v_existing_payload) <> v_existing.economic_payload_fingerprint
    THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
    v_epoch.id := v_existing.ledger_epoch_id;
    v_code := CASE WHEN COALESCE(p_command->'currency','null'::jsonb) = 'null'::jsonb
      THEN v_existing.currency ELSE financial_core.f3_currency(p_command->'currency') END;
    v_fund := COALESCE(v_fund,(v_existing_payload->>'fund_id')::uuid);
  ELSE
    -- Group lock is shared with the existing currency-transition boundary.
    PERFORM 1 FROM public.groups g WHERE g.id=v_group FOR SHARE;
    -- Stable UUID ordering for both custody accounts.
    PERFORM 1 FROM public.financial_accounts a WHERE a.id IN (v_account,v_destination) ORDER BY a.id FOR SHARE;
    SELECT a.* INTO v_acc FROM public.financial_accounts a WHERE a.id=v_account;
    IF v_acc.id IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
    IF v_acc.group_id<>v_group THEN RAISE EXCEPTION 'CROSS_GROUP_DIMENSION'; END IF;
    IF v_acc.status<>'active' THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
    v_code := v_acc.currency;
    IF COALESCE(p_command->'currency','null'::jsonb) <> 'null'::jsonb
      AND financial_core.f3_currency(p_command->'currency')<>v_code THEN RAISE EXCEPTION 'CURRENCY_MISMATCH'; END IF;
    SELECT pg_catalog.count(*) INTO v_count FROM public.financial_ledger_epochs e
      WHERE e.group_id=v_group AND e.effective_from<=v_occurred AND (e.effective_to IS NULL OR v_occurred<e.effective_to);
    IF v_count=0 THEN RAISE EXCEPTION 'EPOCH_NOT_FOUND'; END IF;
    IF v_count<>1 THEN RAISE EXCEPTION 'EPOCH_AMBIGUOUS'; END IF;
    SELECT e.* INTO v_epoch FROM public.financial_ledger_epochs e
      WHERE e.group_id=v_group AND e.effective_from<=v_occurred AND (e.effective_to IS NULL OR v_occurred<e.effective_to) FOR SHARE;
    IF v_epoch.id IS NULL THEN RAISE EXCEPTION 'EPOCH_NOT_FOUND'; END IF;
    IF v_epoch.currency<>v_code THEN RAISE EXCEPTION 'EPOCH_CURRENCY_MISMATCH'; END IF;
    IF v_acc.opened_at>v_occurred OR NOT EXISTS (
      SELECT 1 FROM public.financial_ledger_epochs e WHERE e.id=v_acc.opened_ledger_epoch_id
        AND e.group_id=v_group AND e.currency=v_code AND e.effective_from<=v_occurred
    ) THEN RAISE EXCEPTION 'ACCOUNT_EPOCH_INCOMPATIBLE'; END IF;
    IF v_destination IS NOT NULL THEN
      SELECT a.* INTO v_dest FROM public.financial_accounts a WHERE a.id=v_destination;
      IF v_dest.id IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
      IF v_dest.group_id<>v_group THEN RAISE EXCEPTION 'CROSS_GROUP_DIMENSION'; END IF;
      IF v_dest.status<>'active' THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
      IF v_dest.currency<>v_code THEN RAISE EXCEPTION 'CROSS_CURRENCY_TRANSFER'; END IF;
      IF v_dest.opened_at>v_occurred OR NOT EXISTS (
        SELECT 1 FROM public.financial_ledger_epochs e WHERE e.id=v_dest.opened_ledger_epoch_id
          AND e.group_id=v_group AND e.currency=v_code AND e.effective_from<=v_occurred
      ) THEN RAISE EXCEPTION 'ACCOUNT_EPOCH_INCOMPATIBLE'; END IF;
    END IF;
    IF v_fund IS NULL THEN
      SELECT f.* INTO v_fund_row FROM public.financial_funds f
        WHERE f.group_id=v_group AND f.is_default AND f.status='active' AND NOT f.is_restricted FOR SHARE;
      IF v_fund_row.id IS NULL THEN RAISE EXCEPTION 'DEFAULT_FUND_UNRESOLVED'; END IF;
      v_fund := v_fund_row.id;
    ELSE
      SELECT f.* INTO v_fund_row FROM public.financial_funds f WHERE f.id=v_fund FOR SHARE;
      IF v_fund_row.id IS NULL THEN RAISE EXCEPTION 'FUND_NOT_FOUND'; END IF;
      IF v_fund_row.group_id<>v_group THEN RAISE EXCEPTION 'CROSS_GROUP_DIMENSION'; END IF;
      IF v_fund_row.status<>'active' THEN RAISE EXCEPTION 'FUND_INACTIVE'; END IF;
    END IF;
    IF v_category IS NOT NULL THEN
      SELECT c.* INTO v_cat FROM public.financial_categories c WHERE c.id=v_category FOR SHARE;
      IF v_cat.id IS NULL THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND'; END IF;
      IF v_cat.group_id<>v_group THEN RAISE EXCEPTION 'CROSS_GROUP_DIMENSION'; END IF;
      IF v_cat.status<>'active' THEN RAISE EXCEPTION 'CATEGORY_INACTIVE'; END IF;
      IF v_cat.category_class::text <> (CASE v_action WHEN 'money_in' THEN 'income' ELSE 'expense' END)
      THEN RAISE EXCEPTION 'CATEGORY_CLASS_MISMATCH'; END IF;
    END IF;
    IF v_member IS NOT NULL THEN
      PERFORM 1 FROM public.memberships m WHERE m.id=v_member FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.id=v_member AND m.group_id=v_group)
      THEN RAISE EXCEPTION 'CROSS_GROUP_DIMENSION'; END IF;
    END IF;
    IF v_project IS NOT NULL THEN
      PERFORM 1 FROM public.projects p WHERE p.id=v_project FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.projects p WHERE p.id=v_project AND p.group_id=v_group)
      THEN RAISE EXCEPTION 'CROSS_GROUP_DIMENSION'; END IF;
    END IF;
    IF v_action='money_out' AND COALESCE(financial_core.f3_trim(p_command->>'description'),'')=''
    THEN RAISE EXCEPTION 'DESCRIPTION_REQUIRED'; END IF;
  END IF;
  v_amount := financial_core.f3_amount(p_command->'amount',v_code);
  v_payload := pg_catalog.jsonb_build_object(
    'contract_version','f3-posting-v1','group_id',v_group,'ledger_epoch_id',v_epoch.id,
    'event_class',v_class,'effect_kind',v_effect,'currency',v_code,'amount',v_amount,
    'occurred_at',pg_catalog.to_char(v_occurred AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'source_module',v_module,'source_record_id',v_source,'request_id',v_request,'account_id',v_account,
    'destination_account_id',v_destination,'fund_id',v_fund,'category_id',v_category,
    'member_id',v_member,'project_id',v_project,'opening_provenance_id',v_provenance);
  v_hash := financial_core.f3_fingerprint(v_payload);
  IF v_existing.id IS NOT NULL THEN
    IF financial_core.f3_canonical(v_payload) <> financial_core.f3_canonical(v_existing_payload)
    THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    RETURN pg_catalog.jsonb_build_object('decision','IDEMPOTENT_RETURN_EXISTING','event_id',v_existing.id,
      'ledger_epoch_id',v_existing.ledger_epoch_id,'fingerprint',v_existing.economic_payload_fingerprint,
      'new_event_count',0,'new_posting_count',0);
  END IF;
  -- Revalidate after target/configuration lock waits as well.
  BEGIN
    PERFORM financial_core.assert_finances_manage(v_group);
  EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'DENY' USING ERRCODE = '42501';
  END;
  v_numeric := v_amount::numeric;
  CASE v_action
    WHEN 'money_in' THEN
      v_first:='custody'; v_first_amount:=v_numeric; v_first_account:=v_account;
      v_second:='income'; v_second_amount:=-v_numeric; v_second_category:=v_category;
    WHEN 'money_out' THEN
      v_first:='expense'; v_first_amount:=v_numeric; v_first_category:=v_category;
      v_second:='custody'; v_second_amount:=-v_numeric; v_second_account:=v_account;
    WHEN 'transfer' THEN
      v_first:='custody'; v_first_amount:=-v_numeric; v_first_account:=v_account;
      v_second:='custody'; v_second_amount:=v_numeric; v_second_account:=v_destination;
    WHEN 'opening' THEN
      v_first:='custody'; v_first_amount:=v_numeric; v_first_account:=v_account;
      v_second:='opening_position'; v_second_amount:=-v_numeric;
  END CASE;
  INSERT INTO public.financial_events(group_id,ledger_epoch_id,currency,event_class,source_module,
    source_record_id,effect_kind,request_id,economic_payload_fingerprint,occurred_at,created_by,description,reference_metadata,status)
  VALUES(v_group,v_epoch.id,v_code,v_class,v_module,v_source,v_effect,v_request,v_hash,v_occurred,v_actor,
    p_command->>'description',v_metadata,'posted') RETURNING id INTO v_event;
  INSERT INTO public.financial_postings(event_id,group_id,ledger_epoch_id,currency,occurred_at,
    amount_signed,control_class,account_id,fund_id,category_id,category_class,member_id,project_id)
  SELECT v_event,v_group,v_epoch.id,v_code,v_occurred,x.amount,x.control,x.account,v_fund,x.category,
    CASE WHEN x.category IS NOT NULL THEN x.control::text::public.financial_category_class END,v_member,v_project
  FROM (VALUES (v_first_amount,v_first,v_first_account,v_first_category),
    (v_second_amount,v_second,v_second_account,v_second_category)) AS x(amount,control,account,category);
  INSERT INTO financial_core.posting_command_payloads(event_id,canonical_payload) VALUES(v_event,v_payload);
  RETURN pg_catalog.jsonb_build_object('decision','POSTED','event_id',v_event,'ledger_epoch_id',v_epoch.id,
    'fingerprint',v_hash,'new_event_count',1,'new_posting_count',2);
END;
$$;

CREATE FUNCTION public.post_financial_command(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN RETURN financial_core.post_f3_command(p_command, NULL); END;
$$;

-- Explicit minimal ACLs, including every newly created private helper.
REVOKE ALL ON FUNCTION financial_core.f3_uuid(jsonb,boolean),
  financial_core.f3_currency(jsonb), financial_core.f3_amount(jsonb,text),
  financial_core.f3_timestamp(jsonb), financial_core.f3_trim(text),
  financial_core.f3_canonical(jsonb), financial_core.f3_fingerprint(jsonb),
  financial_core.guard_f3_payload(), financial_core.guard_f3_posting_closure(),
  financial_core.check_f3_posting_closure(), financial_core.lock_f3_identity(uuid,uuid,text,text,text),
  financial_core.post_f3_command(jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.post_financial_command(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_financial_command(jsonb) TO authenticated;
-- Raw truth grants and all F3-01 RLS policies remain unchanged.
COMMIT;


DO $f3_hgp_post$
DECLARE
  v_hgp_def_md5 text;
  v_hgp_src_md5 text;
  v_hgp_count int;
BEGIN
  SELECT count(*) INTO v_hgp_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'F3_ABORT: has_group_permission overload count changed to %', v_hgp_count;
  END IF;
  SELECT md5(pg_get_functiondef(p.oid)), md5(p.prosrc)
    INTO v_hgp_def_md5, v_hgp_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_def_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
     OR v_hgp_src_md5 IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff' THEN
    RAISE EXCEPTION 'F3_ABORT: has_group_permission fingerprint changed by F3 migration';
  END IF;
END
$f3_hgp_post$;
