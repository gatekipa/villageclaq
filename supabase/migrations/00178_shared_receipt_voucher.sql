-- F4-007 / FCG-1: server-checked shared receipt voucher.
BEGIN;
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM financial_core.manual_financial_intents i
    WHERE i.command_type='money_in' AND i.posted_event_id IS NULL
      AND nullif(pg_catalog.btrim(
        i.command->'reference_metadata'->>'source_voucher'),'') IS NULL)
  THEN RAISE EXCEPTION 'PENDING_RECEIPT_VOUCHER_CUTOVER_REQUIRED'; END IF;
END
$preflight$;
CREATE OR REPLACE FUNCTION financial_core.f3_canonical(p_payload jsonb)
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
    WHERE NOT (x.key = ANY(v_keys) OR x.key='source_voucher')
      OR pg_catalog.jsonb_typeof(x.value) NOT IN ('string','null'))
  THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
  SELECT '{' || pg_catalog.string_agg(pg_catalog.to_json(x.key)::text || ':' || x.value::text,
    ',' ORDER BY x.key COLLATE "C") || '}' INTO v_result
  FROM pg_catalog.jsonb_each(p_payload) AS x(key,value);
  RETURN v_result;
END;
$$;
CREATE OR REPLACE FUNCTION financial_core.post_f3_command(p_command jsonb, p_opening jsonb DEFAULT NULL)
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
  v_metadata jsonb; v_source_voucher uuid; v_count integer; v_first public.financial_control_class;
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
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(v_metadata) k WHERE k NOT IN ('reference','evidence_ids','source_voucher'))
  THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
  IF COALESCE(v_metadata->'reference','null'::jsonb) <> 'null'::jsonb
    AND pg_catalog.jsonb_typeof(v_metadata->'reference') <> 'string'
  THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
  IF COALESCE(v_metadata->'source_voucher','null'::jsonb) <> 'null'::jsonb THEN
    IF pg_catalog.jsonb_typeof(v_metadata->'source_voucher') <> 'string'
    THEN RAISE EXCEPTION 'INVALID_RECEIPT_VOUCHER'; END IF;
    v_source_voucher := financial_core.f3_uuid(v_metadata->'source_voucher');
  END IF;
  IF v_action='money_in' AND v_module='manual_finance'
    AND v_existing.id IS NULL AND v_source_voucher IS NULL
  THEN RAISE EXCEPTION 'RECEIPT_VOUCHER_REQUIRED'; END IF;
  IF v_action<>'money_in' AND v_source_voucher IS NOT NULL
  THEN RAISE EXCEPTION 'FIELD_PROHIBITED'; END IF;
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
  IF v_source_voucher IS NOT NULL THEN
    v_payload := v_payload || pg_catalog.jsonb_build_object(
      'source_voucher',v_source_voucher);
  END IF;
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


CREATE OR REPLACE FUNCTION public.prepare_dues_record_intent(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_group uuid; v_actor uuid; v_request uuid;
  v_row financial_core.dues_record_intents%ROWTYPE;
BEGIN
  IF jsonb_typeof(p_command)<>'object' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  v_group:=(p_command->>'group_id')::uuid;
  v_actor:=financial_core.assert_finances_manage(v_group);
  v_request:=(p_command->>'request_id')::uuid;
  IF v_request IS NULL OR (p_command->>'cash_class') NOT IN
    ('non_refundable','refundable','conditional')
    OR (p_command->>'amount')::numeric<=0
    OR (p_command->>'amount')::numeric<>
      round((p_command->>'amount')::numeric,
        financial_core.currency_scale(p_command->>'currency'))
  THEN RAISE EXCEPTION 'INVALID_DUES_INTENT'; END IF;
  -- The recoverable request identity is also the source voucher for a
  -- newly recorded dues receipt. Older prepared intents keep their stored
  -- payment_id and continue to replay against that exact source.
  INSERT INTO financial_core.dues_record_intents
    (request_id,group_id,actor_id,payment_id,command)
  VALUES(v_request,v_group,v_actor,v_request,p_command)
  ON CONFLICT(request_id) DO NOTHING;
  SELECT * INTO v_row FROM financial_core.dues_record_intents
    WHERE request_id=v_request FOR UPDATE;
  IF v_row.group_id IS DISTINCT FROM v_group
    OR v_row.actor_id IS DISTINCT FROM v_actor
  THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.memberships m
    WHERE m.group_id=v_group AND m.user_id=v_actor FOR SHARE;
  PERFORM financial_core.assert_finances_manage(v_group);
  IF v_row.command IS DISTINCT FROM p_command THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  RETURN jsonb_build_object('request_id',v_request,
    'payment_id',v_row.payment_id,
    'status',CASE WHEN v_row.posted_at IS NULL THEN 'prepared' ELSE 'posted' END);
END
$$;

CREATE OR REPLACE FUNCTION public.prepare_loan_repayment(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_loan public.loans%ROWTYPE; v_account public.financial_accounts%ROWTYPE;
  v_existing public.loan_repayments%ROWTYPE; v_request uuid;
  v_amount numeric; v_method text; v_notes text; v_reference text;
BEGIN
  IF auth.uid() IS NULL OR p_command->>'loan_id' IS NULL
     OR p_command->>'account_id' IS NULL OR p_command->>'amount' IS NULL
  THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  v_request:=coalesce((p_command->>'request_id')::uuid,gen_random_uuid());
  v_amount:=(p_command->>'amount')::numeric;
  v_method:=coalesce(p_command->>'payment_method','cash');
  v_notes:=nullif(p_command->>'notes','');
  v_reference:=nullif(p_command->>'reference_number','');
  SELECT * INTO v_loan FROM public.loans WHERE id=(p_command->>'loan_id')::uuid FOR SHARE;
  IF v_loan.id IS NULL THEN RAISE EXCEPTION 'LOAN_NOT_FOUND'; END IF;
  PERFORM financial_core.assert_finances_manage(v_loan.group_id);
  SELECT * INTO v_existing FROM public.loan_repayments
    WHERE request_id=v_request FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.loan_id<>v_loan.id OR v_existing.account_id<>(p_command->>'account_id')::uuid
       OR v_existing.amount<>v_amount OR v_existing.payment_method<>v_method
       OR v_existing.notes IS DISTINCT FROM v_notes
       OR v_existing.reference_number IS DISTINCT FROM v_reference
    THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    RETURN jsonb_build_object('repayment_id',v_existing.id,'status',v_existing.posting_status);
  END IF;
  IF v_loan.status<>'repaying' OR v_amount<=0
     OR v_amount>v_loan.total_repayable-v_loan.total_repaid
  THEN RAISE EXCEPTION 'INVALID_REPAYMENT'; END IF;
  SELECT * INTO v_account FROM public.financial_accounts
    WHERE id=(p_command->>'account_id')::uuid FOR SHARE;
  IF v_account.id IS NULL OR v_account.group_id<>v_loan.group_id
     OR v_account.currency<>v_loan.currency OR v_account.status<>'active'
  THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND_OR_INACTIVE'; END IF;
  -- New repayment source identity is the durable request voucher. The
  -- existing-row branch above preserves older pending and posted IDs.
  INSERT INTO public.loan_repayments
    (id,loan_id,amount,payment_method,reference_number,notes,recorded_by,
     posting_status,request_id,account_id)
  VALUES(v_request,v_loan.id,v_amount,v_method,v_reference,v_notes,auth.uid(),
    'pending',v_request,v_account.id)
  RETURNING * INTO v_existing;
  RETURN jsonb_build_object('repayment_id',v_existing.id,'status','pending');
END
$$;


-- This checks every effective ledger writer at the immutable event boundary.
-- The voucher is a separate field from an optional provider reference.
CREATE OR REPLACE FUNCTION financial_core.guard_manual_module_source_overlap()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_source text; v_provider_reference text; v_lock_key text;
  v_scope uuid;
BEGIN
  SELECT coalesce(g.organization_id,g.id) INTO v_scope
  FROM public.groups g WHERE g.id=NEW.group_id FOR SHARE;
  IF v_scope IS NULL THEN RAISE EXCEPTION 'CROSS_GROUP_SOURCE'; END IF;
  IF NEW.source_module='manual_finance' THEN
    v_source:=nullif(pg_catalog.btrim(
      NEW.reference_metadata->>'source_voucher'),'');
    v_provider_reference:=nullif(pg_catalog.btrim(
      NEW.reference_metadata->>'reference'),'');
    IF NEW.event_class='money_in' THEN
      IF v_source IS NULL THEN RAISE EXCEPTION 'RECEIPT_VOUCHER_REQUIRED'; END IF;
      BEGIN v_source:=(v_source::uuid)::text;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION 'INVALID_RECEIPT_VOUCHER'; END;
    ELSE
      v_source:=v_provider_reference;
    END IF;
  ELSIF NEW.source_module<>'opening_finance' THEN
    v_source:=NEW.source_record_id;
  ELSE
    RETURN NEW;
  END IF;
  IF v_source IS NULL THEN RETURN NEW; END IF;

  FOR v_lock_key IN SELECT DISTINCT pg_catalog.lower(source.value)
    FROM pg_catalog.unnest(ARRAY[v_source,v_provider_reference]) AS source(value)
    WHERE source.value IS NOT NULL ORDER BY 1 LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      v_scope::text||'/economic-source/'||v_lock_key,0));
  END LOOP;
  IF NEW.source_module='manual_finance' THEN
    IF EXISTS (SELECT 1 FROM public.financial_events e
      JOIN public.groups g ON g.id=e.group_id
      WHERE coalesce(g.organization_id,g.id)=v_scope
        AND e.source_module='manual_finance'
        AND e.event_class='money_in'
        AND pg_catalog.lower(e.reference_metadata->>'source_voucher')=
          pg_catalog.lower(v_source))
    THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
    IF EXISTS (SELECT 1 FROM public.financial_events e
      JOIN public.groups g ON g.id=e.group_id
      WHERE coalesce(g.organization_id,g.id)=v_scope
        AND e.source_module NOT IN ('manual_finance','opening_finance')
        AND pg_catalog.lower(e.source_record_id)=pg_catalog.lower(v_source))
    THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
    -- Preserve the earlier declared-reference protection for older/manual
    -- commands without treating a provider reference as the new voucher.
    IF v_provider_reference IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.financial_events e
      JOIN public.groups g ON g.id=e.group_id
      WHERE coalesce(g.organization_id,g.id)=v_scope
        AND e.source_module NOT IN ('manual_finance','opening_finance')
        AND pg_catalog.lower(e.source_record_id)=
          pg_catalog.lower(v_provider_reference))
    THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
  ELSIF EXISTS (SELECT 1 FROM public.financial_events e
      JOIN public.groups g ON g.id=e.group_id
      WHERE coalesce(g.organization_id,g.id)=v_scope
        AND e.source_module='manual_finance'
        AND (pg_catalog.lower(e.reference_metadata->>'source_voucher')=
          pg_catalog.lower(v_source)
          OR pg_catalog.lower(e.reference_metadata->>'reference')=
          pg_catalog.lower(v_source)))
  THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION financial_core.guard_manual_module_source_overlap()
  FROM PUBLIC,anon,authenticated,service_role;

-- Uniqueness is also a database constraint, independent of the trigger path.
CREATE UNIQUE INDEX financial_events_manual_source_voucher_unique
  ON public.financial_events(group_id,
    pg_catalog.lower(reference_metadata->>'source_voucher'))
  WHERE source_module='manual_finance' AND event_class='money_in'
    AND reference_metadata ? 'source_voucher';
COMMIT;
