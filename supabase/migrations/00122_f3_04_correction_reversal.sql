-- M3 forward rematerialization of F3-04 onto post-S0 / post-M2 main (after 00117).
-- DO NOT APPLY TO PRODUCTION from the M3 draft PR.
-- DO NOT MERGE as a production financial write path.
-- Oracle (REFERENCE ONLY, not applied): 20260909054500_f3_correction_reversal.sql on c7b4cd535d7125737eab2ec0fad27cae9432e8c3
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

  IF to_regprocedure('public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: projection RPCs missing — apply 00121 first';
  END IF;
  IF to_regprocedure('public.correct_financial_event(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: correct_financial_event already present';
  END IF;
END
$f3_pre$;

-- F3-04 Stage B. Frozen contract: 0a642a2a1f768e21fd1f61f9398418ebdd3cd7ce.
-- Local qualification only: this migration is intentionally unapplied.
BEGIN;

ALTER TABLE public.financial_events
  ADD CONSTRAINT financial_events_correction_reason_required
  CHECK (status = 'posted' OR correction_reason IS NOT NULL);
CREATE UNIQUE INDEX financial_events_one_replacement_parent
  ON public.financial_events(group_id,replacement_event_id)
  WHERE replacement_event_id IS NOT NULL;

CREATE TABLE financial_core.correction_command_payloads (
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  correction_request_id uuid NOT NULL,
  target_event_id uuid NOT NULL,
  canonical_payload jsonb NOT NULL,
  root_fingerprint text NOT NULL CHECK (root_fingerprint ~ '^[0-9a-f]{64}$'),
  target_snapshot jsonb NOT NULL,
  reversal_event_id uuid NOT NULL,
  replacement_event_id uuid,
  reversal_result jsonb NOT NULL,
  replacement_result jsonb,
  correction_actor uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  correction_reason text NOT NULL,
  corrected_at timestamptz NOT NULL,
  completed_result jsonb NOT NULL,
  PRIMARY KEY(group_id,correction_request_id),
  UNIQUE(reversal_event_id), UNIQUE(replacement_event_id),
  FOREIGN KEY(target_event_id,group_id) REFERENCES public.financial_events(id,group_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(reversal_event_id,group_id) REFERENCES public.financial_events(id,group_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(replacement_event_id,group_id) REFERENCES public.financial_events(id,group_id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  CHECK (canonical_payload->>'contract_version'='f3-correction-v1'),
  CHECK ((replacement_event_id IS NULL)=(replacement_result IS NULL))
);
ALTER TABLE financial_core.correction_command_payloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_core.correction_command_payloads FORCE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.correction_command_payloads FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION financial_core.guard_f3_correction_payload()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'CORRECTION_COMMAND_PAYLOAD_IMMUTABLE' USING ERRCODE='55000'; END;
$$;
CREATE TRIGGER correction_command_payloads_immutable BEFORE UPDATE OR DELETE
ON financial_core.correction_command_payloads FOR EACH ROW
EXECUTE FUNCTION financial_core.guard_f3_correction_payload();

CREATE FUNCTION financial_core.f3_correction_canonical(p jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r text;
BEGIN
  CASE pg_catalog.jsonb_typeof(p)
    WHEN 'object' THEN
      SELECT '{'||COALESCE(pg_catalog.string_agg(pg_catalog.to_json(x.key)::text||':'||
        financial_core.f3_correction_canonical(x.value),',' ORDER BY x.key COLLATE "C"),'')||'}'
      INTO r FROM pg_catalog.jsonb_each(p) x;
    WHEN 'array' THEN
      SELECT '['||COALESCE(pg_catalog.string_agg(financial_core.f3_correction_canonical(x.value),
        ',' ORDER BY x.ordinality),'')||']' INTO r
      FROM pg_catalog.jsonb_array_elements(p) WITH ORDINALITY x(value,ordinality);
    ELSE r:=p::text;
  END CASE;
  RETURN r;
END; $$;
CREATE FUNCTION financial_core.f3_correction_fingerprint(p jsonb)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
   financial_core.f3_correction_canonical(p),'UTF8')),'hex'); $$;
CREATE FUNCTION financial_core.f3_correction_timestamp(p timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT pg_catalog.to_char(p AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'); $$;
CREATE FUNCTION financial_core.f3_correction_signed_amount(p numeric,c text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE s int:=financial_core.currency_scale(c); t text:=p::text; w text; f text;
BEGIN
 IF s IS NULL THEN RAISE EXCEPTION 'UNSUPPORTED_CURRENCY'; END IF;
 w:=pg_catalog.split_part(t,'.',1); f:=pg_catalog.split_part(t,'.',2);
 RETURN w||CASE WHEN s=0 THEN '' ELSE '.'||pg_catalog.rpad(pg_catalog.left(f,s),s,'0') END;
END; $$;
CREATE FUNCTION financial_core.f3_correction_reason(p jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE r text;
BEGIN
 IF p IS NULL OR pg_catalog.jsonb_typeof(p) IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 r:=pg_catalog.normalize(p#>>'{}','NFC');
 r:=pg_catalog.regexp_replace(r,U&'[\0009-\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000]+',' ','g');
 r:=pg_catalog.btrim(r,' ');
 IF r~U&'[\0001-\001F\007F-\009F\200B\FEFF]' THEN RAISE EXCEPTION 'INVALID_REASON'; END IF;
 IF pg_catalog.char_length(r) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'REASON_LENGTH'; END IF;
 RETURN r;
END; $$;
CREATE FUNCTION financial_core.f3_correction_child_id(g uuid,r uuid,role text)
RETURNS uuid LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT public.uuid_generate_v5('6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid,
  'villageclaq/f3-correction-v1/'||g::text||'/'||r::text||'/'||role); $$;
CREATE FUNCTION financial_core.f3_correction_posting_json(
 id uuid,event_id uuid,g uuid,epoch uuid,c text,occurred timestamptz,amount numeric,
 control public.financial_control_class,account uuid,fund uuid,category uuid,
 cat_class public.financial_category_class,member uuid,project uuid)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT pg_catalog.jsonb_build_object('id',id,'event_id',event_id,'group_id',g,
 'ledger_epoch_id',epoch,'currency',c,'occurred_at',financial_core.f3_correction_timestamp(occurred),
 'amount_signed',financial_core.f3_correction_signed_amount(amount,c),'control_class',control,
 'account_id',account,'fund_id',fund,'category_id',category,'category_class',cat_class,
 'member_id',member,'project_id',project); $$;

CREATE FUNCTION financial_core.resolve_f3_correction_replacement(
 d jsonb,target jsonb,replay boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e jsonb:=target->'economic'; k text; action text; code text; amount text; occurred timestamptz;
 g uuid:=(target->>'group_id')::uuid; target_epoch uuid:=(target->>'ledger_epoch_id')::uuid;
 epoch uuid; n int; account uuid; destination uuid; fund uuid; category uuid; member uuid; project uuid;
 a public.financial_accounts%ROWTYPE; f public.financial_funds%ROWTYPE;
 cat public.financial_categories%ROWTYPE; original jsonb:=target->'economic';
BEGIN
 IF pg_catalog.jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'REPLACEMENT_REQUIRED'; END IF;
 FOR k IN SELECT pg_catalog.jsonb_object_keys(d) LOOP
  IF NOT(k=ANY(ARRAY['action','amount','occurred_at','currency','account_id','destination_account_id',
   'fund_id','category_id','member_id','project_id','description','reference_metadata']))
  THEN RAISE EXCEPTION 'UNSUPPORTED_FIELD'; END IF;
 END LOOP;
 IF d?'description' AND d->'description'<>'null'::jsonb
   AND pg_catalog.jsonb_typeof(d->'description')<>'string' THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
 IF d?'reference_metadata' AND d->'reference_metadata'<>'null'::jsonb THEN
  IF pg_catalog.jsonb_typeof(d->'reference_metadata')<>'object' THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
  FOR k IN SELECT pg_catalog.jsonb_object_keys(d->'reference_metadata') LOOP
   IF k NOT IN('reference','evidence_ids') THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
  END LOOP;
  IF d->'reference_metadata'?'reference' AND d->'reference_metadata'->'reference'<>'null'::jsonb
   AND pg_catalog.jsonb_typeof(d->'reference_metadata'->'reference')<>'string'
   THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
  IF d->'reference_metadata'?'evidence_ids' AND d->'reference_metadata'->'evidence_ids'<>'null'::jsonb THEN
   IF pg_catalog.jsonb_typeof(d->'reference_metadata'->'evidence_ids')<>'array'
   THEN RAISE EXCEPTION 'INVALID_METADATA'; END IF;
   PERFORM financial_core.f3_uuid(x.value)
    FROM pg_catalog.jsonb_array_elements(d->'reference_metadata'->'evidence_ids') x;
  END IF;
 END IF;
 FOR k IN SELECT pg_catalog.unnest(ARRAY['action','amount','occurred_at','currency','account_id',
  'destination_account_id','fund_id','category_id','member_id','project_id']) LOOP
  IF d?k THEN e:=pg_catalog.jsonb_set(e,ARRAY[k],d->k); END IF;
 END LOOP;
 IF pg_catalog.jsonb_typeof(e->'action')<>'string' THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 action:=e->>'action';
 IF action NOT IN('money_in','money_out','transfer') THEN RAISE EXCEPTION 'INVALID_ACTION'; END IF;
 IF NOT replay AND action<>original->>'action' THEN RAISE EXCEPTION 'ACTION_CHANGE_PROHIBITED'; END IF;
 code:=financial_core.f3_currency(e->'currency');
 IF NOT replay AND code<>target->>'currency' THEN RAISE EXCEPTION 'CROSS_CURRENCY_REPLACEMENT'; END IF;
 amount:=financial_core.f3_amount(e->'amount',code); occurred:=financial_core.f3_timestamp(e->'occurred_at');
 account:=financial_core.f3_uuid(e->'account_id',true);
 destination:=financial_core.f3_uuid(e->'destination_account_id',true);
 fund:=financial_core.f3_uuid(e->'fund_id',true); category:=financial_core.f3_uuid(e->'category_id',true);
 member:=financial_core.f3_uuid(e->'member_id',true); project:=financial_core.f3_uuid(e->'project_id',true);
 IF account IS NULL THEN RAISE EXCEPTION 'ACCOUNT_REQUIRED'; END IF;
 IF fund IS NULL THEN RAISE EXCEPTION 'FUND_REQUIRED'; END IF;
 IF action='transfer' THEN
  IF destination IS NULL THEN RAISE EXCEPTION 'DESTINATION_REQUIRED'; END IF;
  IF destination=account THEN RAISE EXCEPTION 'SAME_ACCOUNT'; END IF;
  IF category IS NOT NULL THEN RAISE EXCEPTION 'CATEGORY_PROHIBITED'; END IF;
  IF member IS NOT NULL OR project IS NOT NULL THEN RAISE EXCEPTION 'ATTRIBUTION_PROHIBITED'; END IF;
 ELSE
  IF destination IS NOT NULL THEN RAISE EXCEPTION 'FIELD_PROHIBITED'; END IF;
  IF category IS NULL THEN RAISE EXCEPTION 'CATEGORY_REQUIRED'; END IF;
 END IF;
 IF NOT replay THEN
  SELECT pg_catalog.count(*) INTO n FROM public.financial_ledger_epochs x
   WHERE x.group_id=g AND x.effective_from<=occurred AND(x.effective_to IS NULL OR occurred<x.effective_to);
  IF n=0 THEN RAISE EXCEPTION 'EPOCH_NOT_FOUND'; END IF;
  IF n<>1 THEN RAISE EXCEPTION 'EPOCH_AMBIGUOUS'; END IF;
  SELECT x.id INTO epoch FROM public.financial_ledger_epochs x
   WHERE x.group_id=g AND x.effective_from<=occurred AND(x.effective_to IS NULL OR occurred<x.effective_to) FOR SHARE;
  IF epoch<>target_epoch THEN RAISE EXCEPTION 'CROSS_EPOCH_REPLACEMENT'; END IF;
  PERFORM 1 FROM public.financial_accounts x WHERE x.id IN(account,destination) ORDER BY x.id FOR SHARE;
  FOR k IN SELECT pg_catalog.unnest(ARRAY['account_id','destination_account_id']) LOOP
   IF (CASE k WHEN 'account_id' THEN account ELSE destination END) IS NULL THEN CONTINUE; END IF;
   SELECT x.* INTO a FROM public.financial_accounts x WHERE x.id=(CASE k WHEN 'account_id' THEN account ELSE destination END);
   IF a.id IS NULL THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND'; END IF;
   IF a.group_id<>g THEN RAISE EXCEPTION 'CROSS_GROUP_DIMENSION'; END IF;
   IF a.currency<>target->>'currency' THEN RAISE EXCEPTION 'CROSS_CURRENCY_REPLACEMENT'; END IF;
   IF a.opened_at>occurred OR NOT EXISTS(SELECT 1 FROM public.financial_ledger_epochs oe
    WHERE oe.id=a.opened_ledger_epoch_id AND oe.group_id=g AND oe.currency=a.currency AND oe.effective_from<=occurred)
   THEN RAISE EXCEPTION 'ACCOUNT_EPOCH_INCOMPATIBLE'; END IF;
   IF a.status<>'active' AND (original->>k)::uuid IS DISTINCT FROM a.id THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  END LOOP;
  SELECT x.* INTO f FROM public.financial_funds x WHERE x.id=fund FOR SHARE;
  IF f.id IS NULL THEN RAISE EXCEPTION 'FUND_NOT_FOUND'; END IF;
  IF f.group_id<>g THEN RAISE EXCEPTION 'CROSS_GROUP_DIMENSION'; END IF;
  IF f.status<>'active' AND (original->>'fund_id')::uuid IS DISTINCT FROM fund THEN RAISE EXCEPTION 'FUND_INACTIVE'; END IF;
  IF category IS NOT NULL THEN
   SELECT x.* INTO cat FROM public.financial_categories x WHERE x.id=category FOR SHARE;
   IF cat.id IS NULL THEN RAISE EXCEPTION 'CATEGORY_NOT_FOUND'; END IF;
   IF cat.group_id<>g THEN RAISE EXCEPTION 'CROSS_GROUP_DIMENSION'; END IF;
   IF cat.category_class::text<>(CASE action WHEN 'money_in' THEN 'income' ELSE 'expense' END)
   THEN RAISE EXCEPTION 'CATEGORY_CLASS_MISMATCH'; END IF;
   IF cat.status<>'active' AND (original->>'category_id')::uuid IS DISTINCT FROM category
   THEN RAISE EXCEPTION 'CATEGORY_INACTIVE'; END IF;
  END IF;
  IF member IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.memberships x WHERE x.id=member AND x.group_id=g)
   THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;
  IF project IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.projects x WHERE x.id=project AND x.group_id=g)
   THEN RAISE EXCEPTION 'PROJECT_NOT_FOUND'; END IF;
 END IF;
 RETURN pg_catalog.jsonb_build_object('action',action,'amount',amount,
  'occurred_at',financial_core.f3_correction_timestamp(occurred),'currency',code,
  'account_id',account,'destination_account_id',destination,'fund_id',fund,'category_id',category,
  'member_id',member,'project_id',project);
END; $$;

CREATE FUNCTION financial_core.assert_f3_correction_postings(event uuid,expected jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n int;
BEGIN
 IF pg_catalog.jsonb_typeof(expected) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'TARGET_NOT_MANUAL'; END IF;
 n:=pg_catalog.jsonb_array_length(expected);
 IF n=0 OR (SELECT pg_catalog.count(*) FROM public.financial_postings p WHERE p.event_id=event)<>n
 OR EXISTS(
  SELECT 1 FROM pg_catalog.jsonb_array_elements(expected) x
  WHERE NOT EXISTS(
   SELECT 1 FROM public.financial_postings p WHERE p.event_id=event
    AND (NOT(x.value?'id') OR x.value->'id'='null'::jsonb OR p.id=(x.value->>'id')::uuid)
    AND p.event_id=(x.value->>'event_id')::uuid AND p.group_id=(x.value->>'group_id')::uuid
    AND p.ledger_epoch_id=(x.value->>'ledger_epoch_id')::uuid AND p.currency=x.value->>'currency'
    AND financial_core.f3_correction_timestamp(p.occurred_at)=x.value->>'occurred_at'
    AND financial_core.f3_correction_signed_amount(p.amount_signed,p.currency)=x.value->>'amount_signed'
    AND p.control_class::text=x.value->>'control_class'
    AND p.account_id IS NOT DISTINCT FROM (x.value->>'account_id')::uuid
    AND p.fund_id=(x.value->>'fund_id')::uuid
    AND p.category_id IS NOT DISTINCT FROM (x.value->>'category_id')::uuid
    AND p.category_class IS NOT DISTINCT FROM (x.value->>'category_class')::public.financial_category_class
    AND p.member_id IS NOT DISTINCT FROM (x.value->>'member_id')::uuid
    AND p.project_id IS NOT DISTINCT FROM (x.value->>'project_id')::uuid))
 THEN RAISE EXCEPTION 'TARGET_NOT_MANUAL'; END IF;
END; $$;

CREATE FUNCTION financial_core.guard_f3_correction_lineage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.financial_events%ROWTYPE; c public.financial_events%ROWTYPE;
BEGIN
 IF NEW.reversal_of_event_id IS NOT NULL THEN
  SELECT x.* INTO p FROM public.financial_events x WHERE x.id=NEW.reversal_of_event_id AND x.group_id=NEW.group_id;
  IF p.id IS NULL OR p.id=NEW.id OR p.reversal_of_event_id IS NOT NULL OR p.status<>'posted'
   OR NEW.status<>'posted' OR NEW.replacement_event_id IS NOT NULL THEN RAISE EXCEPTION 'LINEAGE_INTEGRITY'; END IF;
 END IF;
 IF NEW.replacement_event_id IS NOT NULL THEN
  SELECT x.* INTO c FROM public.financial_events x WHERE x.id=NEW.replacement_event_id AND x.group_id=NEW.group_id;
  IF c.id IS NULL OR c.id=NEW.id OR c.reversal_of_event_id IS NOT NULL OR c.status<>'posted'
   OR c.source_module<>'manual_finance_correction' OR c.effect_kind<>'correction_replacement'
  THEN RAISE EXCEPTION 'LINEAGE_INTEGRITY'; END IF;
 END IF;
 IF NEW.status IN('corrected','reversed') AND NOT EXISTS(
  SELECT 1 FROM public.financial_events r WHERE r.group_id=NEW.group_id AND r.reversal_of_event_id=NEW.id)
 THEN RAISE EXCEPTION 'LINEAGE_INTEGRITY'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER financial_events_f3_correction_lineage BEFORE INSERT OR UPDATE
ON public.financial_events FOR EACH ROW EXECUTE FUNCTION financial_core.guard_f3_correction_lineage();

CREATE OR REPLACE FUNCTION financial_core.guard_f3_posting_closure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM public.financial_events e WHERE e.id=NEW.event_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM financial_core.posting_command_payloads c WHERE c.event_id=NEW.event_id)
 OR EXISTS(SELECT 1 FROM financial_core.correction_command_payloads c
  WHERE c.reversal_event_id=NEW.event_id OR c.replacement_event_id=NEW.event_id)
 THEN RAISE EXCEPTION 'POSTING_SET_CLOSED'; END IF;
 RETURN NEW;
END; $$;
CREATE FUNCTION financial_core.check_f3_correction_closure()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n int;
BEGIN
 n:=pg_catalog.jsonb_array_length(NEW.reversal_result->'economic_payload'->'postings');
 IF (SELECT pg_catalog.count(*) FROM public.financial_postings p WHERE p.event_id=NEW.reversal_event_id)<>n
 OR NOT EXISTS(SELECT 1 FROM public.financial_events e WHERE e.id=NEW.reversal_event_id
  AND e.economic_payload_fingerprint=financial_core.f3_correction_fingerprint(NEW.reversal_result->'economic_payload'))
 THEN RAISE EXCEPTION 'CORRECTION_POSTING_SET_INCOMPLETE'; END IF;
 IF NEW.replacement_event_id IS NOT NULL THEN
  n:=pg_catalog.jsonb_array_length(NEW.replacement_result->'economic_payload'->'postings');
  IF (SELECT pg_catalog.count(*) FROM public.financial_postings p WHERE p.event_id=NEW.replacement_event_id)<>n
  OR NOT EXISTS(SELECT 1 FROM public.financial_events e WHERE e.id=NEW.replacement_event_id
   AND e.economic_payload_fingerprint=financial_core.f3_correction_fingerprint(NEW.replacement_result->'economic_payload'))
  THEN RAISE EXCEPTION 'CORRECTION_POSTING_SET_INCOMPLETE'; END IF;
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER correction_command_payloads_complete AFTER INSERT
ON financial_core.correction_command_payloads DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION financial_core.check_f3_correction_closure();

CREATE FUNCTION financial_core.correct_f3_command(cmd jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; g uuid; request uuid; target_id uuid; intent text; reason text; k text; now_at timestamptz;
 target public.financial_events%ROWTYPE; bound financial_core.correction_command_payloads%ROWTYPE;
 posting_payload jsonb; economic jsonb; target_postings jsonb; expected_postings jsonb; snapshot jsonb; replacement jsonb;
 root_payload jsonb; root_hash text; amount numeric; reversal_id uuid; replacement_id uuid;
 reversal_postings jsonb; replacement_postings jsonb; reversal_event jsonb; replacement_event jsonb;
 reversal_payload jsonb; replacement_payload jsonb; reversal_hash text; replacement_hash text;
 reversal_result jsonb; replacement_result jsonb; description text; metadata jsonb; result jsonb;
 n int; effect text; first_control public.financial_control_class; second_control public.financial_control_class;
 first_amount numeric; second_amount numeric; first_account uuid; second_account uuid;
 first_category uuid; second_category uuid; cc public.financial_category_class;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
 IF pg_catalog.jsonb_typeof(cmd)<>'object' THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 g:=financial_core.f3_uuid(cmd->'group_id');
 BEGIN actor:=financial_core.assert_finances_manage(g);
 EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END;
 FOR k IN SELECT pg_catalog.jsonb_object_keys(cmd) LOOP
  IF NOT(k=ANY(ARRAY['group_id','correction_request_id','target_event_id','intent','correction_reason','replacement']))
  THEN RAISE EXCEPTION 'UNSUPPORTED_FIELD'; END IF;
 END LOOP;
 request:=financial_core.f3_uuid(cmd->'correction_request_id');
 target_id:=financial_core.f3_uuid(cmd->'target_event_id');
 IF pg_catalog.jsonb_typeof(cmd->'intent')<>'string' THEN RAISE EXCEPTION 'INVALID_INTENT'; END IF;
 intent:=cmd->>'intent'; IF intent NOT IN('CORRECT','REVERSE') THEN RAISE EXCEPTION 'INVALID_INTENT'; END IF;
 reason:=financial_core.f3_correction_reason(cmd->'correction_reason');
 IF intent='CORRECT' AND pg_catalog.jsonb_typeof(cmd->'replacement')<>'object'
 THEN RAISE EXCEPTION 'REPLACEMENT_REQUIRED'; END IF;
 IF intent='REVERSE' AND cmd?'replacement' AND cmd->'replacement'<>'null'::jsonb
 THEN RAISE EXCEPTION 'REPLACEMENT_PROHIBITED'; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  pg_catalog.jsonb_build_array('f3-correction-request',g,request)::text,0));
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
  pg_catalog.jsonb_build_array('f3-correction-target',g,target_id)::text,0));
 PERFORM 1 FROM public.memberships m WHERE m.group_id=g AND m.user_id=actor FOR SHARE;
 BEGIN PERFORM financial_core.assert_finances_manage(g);
 EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END;
 IF EXISTS(SELECT 1 FROM public.financial_events e WHERE e.group_id=g AND e.request_id=request)
 THEN RAISE EXCEPTION 'REQUEST_ID_REUSED'; END IF;
 SELECT c.* INTO bound FROM financial_core.correction_command_payloads c
  WHERE c.group_id=g AND c.correction_request_id=request;
 IF bound.correction_request_id IS NOT NULL THEN
  IF bound.target_event_id<>target_id OR bound.canonical_payload->>'intent'<>intent THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  snapshot:=bound.target_snapshot;
  IF financial_core.f3_correction_fingerprint(bound.canonical_payload)<>bound.root_fingerprint
   OR snapshot->>'id'<>target_id::text OR snapshot->>'group_id'<>g::text
   OR snapshot->>'economic_payload_fingerprint'<>bound.canonical_payload->>'target_economic_fingerprint'
   OR financial_core.f3_correction_fingerprint(bound.reversal_result->'economic_payload')
      <>bound.reversal_result->>'economic_payload_fingerprint'
  THEN RAISE EXCEPTION 'REPLAY_INTEGRITY'; END IF;
  replacement:=CASE WHEN intent='CORRECT' THEN
   financial_core.resolve_f3_correction_replacement(cmd->'replacement',snapshot,true) ELSE NULL END;
  root_payload:=pg_catalog.jsonb_build_object('contract_version','f3-correction-v1','group_id',g,
   'correction_request_id',request,'target_event_id',target_id,
   'target_economic_fingerprint',snapshot->>'economic_payload_fingerprint','intent',intent,
   'correction_reason',reason,'replacement',CASE WHEN replacement IS NULL THEN 'null'::jsonb
    ELSE replacement||pg_catalog.jsonb_build_object('ledger_epoch_id',snapshot->'ledger_epoch_id') END);
  IF financial_core.f3_correction_canonical(root_payload)<>financial_core.f3_correction_canonical(bound.canonical_payload)
  THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  RETURN pg_catalog.jsonb_build_object('decision','IDEMPOTENT_RETURN_EXISTING','result',bound.completed_result,
   'fingerprint',bound.root_fingerprint,'new_event_count',0,'new_posting_count',0);
 END IF;
 SELECT e.* INTO target FROM public.financial_events e WHERE e.id=target_id AND e.group_id=g FOR UPDATE;
 IF target.id IS NULL THEN RAISE EXCEPTION 'TARGET_NOT_FOUND'; END IF;
 IF target.reversal_of_event_id IS NOT NULL OR target.effect_kind='correction_reversal'
 THEN RAISE EXCEPTION 'REVERSAL_TARGET_PROHIBITED'; END IF;
 IF target.status<>'posted' THEN RAISE EXCEPTION 'TARGET_ALREADY_CORRECTED'; END IF;
 IF target.event_class NOT IN('money_in','money_out','transfer') THEN RAISE EXCEPTION 'TARGET_NOT_MANUAL'; END IF;
 IF target.source_module='manual_finance' THEN
  SELECT c.canonical_payload INTO posting_payload FROM financial_core.posting_command_payloads c WHERE c.event_id=target.id;
  effect:=CASE target.event_class WHEN 'money_in' THEN 'manual_income' WHEN 'money_out' THEN 'manual_expense' ELSE 'account_transfer' END;
  IF posting_payload IS NULL OR posting_payload->>'contract_version'<>'f3-posting-v1'
   OR financial_core.f3_fingerprint(posting_payload)<>target.economic_payload_fingerprint
   OR posting_payload->>'group_id'<>g::text OR posting_payload->>'ledger_epoch_id'<>target.ledger_epoch_id::text
   OR posting_payload->>'currency'<>target.currency OR posting_payload->>'occurred_at'<>financial_core.f3_correction_timestamp(target.occurred_at)
   OR posting_payload->>'event_class'<>target.event_class::text OR posting_payload->>'effect_kind'<>effect
   OR target.effect_kind<>effect OR posting_payload->>'source_module'<>'manual_finance'
   OR posting_payload->>'source_record_id'<>target.source_record_id OR posting_payload->>'request_id'<>target.request_id::text
   OR target.source_record_id<>target.request_id::text THEN RAISE EXCEPTION 'TARGET_NOT_MANUAL'; END IF;
  economic:=pg_catalog.jsonb_build_object('action',target.event_class,'amount',posting_payload->>'amount',
   'occurred_at',posting_payload->>'occurred_at','currency',target.currency,
   'account_id',posting_payload->'account_id','destination_account_id',posting_payload->'destination_account_id',
   'fund_id',posting_payload->'fund_id','category_id',posting_payload->'category_id',
   'member_id',posting_payload->'member_id','project_id',posting_payload->'project_id');
  amount:=(posting_payload->>'amount')::numeric;
  IF target.event_class='money_in' THEN
   expected_postings:=pg_catalog.jsonb_build_array(
    financial_core.f3_correction_posting_json(NULL,target.id,g,target.ledger_epoch_id,target.currency,target.occurred_at,
     amount,'custody',(posting_payload->>'account_id')::uuid,(posting_payload->>'fund_id')::uuid,NULL,NULL,
     (posting_payload->>'member_id')::uuid,(posting_payload->>'project_id')::uuid),
    financial_core.f3_correction_posting_json(NULL,target.id,g,target.ledger_epoch_id,target.currency,target.occurred_at,
     -amount,'income',NULL,(posting_payload->>'fund_id')::uuid,(posting_payload->>'category_id')::uuid,'income',
     (posting_payload->>'member_id')::uuid,(posting_payload->>'project_id')::uuid));
  ELSIF target.event_class='money_out' THEN
   expected_postings:=pg_catalog.jsonb_build_array(
    financial_core.f3_correction_posting_json(NULL,target.id,g,target.ledger_epoch_id,target.currency,target.occurred_at,
     amount,'expense',NULL,(posting_payload->>'fund_id')::uuid,(posting_payload->>'category_id')::uuid,'expense',
     (posting_payload->>'member_id')::uuid,(posting_payload->>'project_id')::uuid),
    financial_core.f3_correction_posting_json(NULL,target.id,g,target.ledger_epoch_id,target.currency,target.occurred_at,
     -amount,'custody',(posting_payload->>'account_id')::uuid,(posting_payload->>'fund_id')::uuid,NULL,NULL,
     (posting_payload->>'member_id')::uuid,(posting_payload->>'project_id')::uuid));
  ELSE
   expected_postings:=pg_catalog.jsonb_build_array(
    financial_core.f3_correction_posting_json(NULL,target.id,g,target.ledger_epoch_id,target.currency,target.occurred_at,
     -amount,'custody',(posting_payload->>'account_id')::uuid,(posting_payload->>'fund_id')::uuid,NULL,NULL,NULL,NULL),
    financial_core.f3_correction_posting_json(NULL,target.id,g,target.ledger_epoch_id,target.currency,target.occurred_at,
     amount,'custody',(posting_payload->>'destination_account_id')::uuid,(posting_payload->>'fund_id')::uuid,NULL,NULL,NULL,NULL));
  END IF;
  PERFORM financial_core.assert_f3_correction_postings(target.id,expected_postings);
 ELSIF target.source_module='manual_finance_correction' AND target.effect_kind='correction_replacement' THEN
  SELECT c.replacement_result INTO replacement_result FROM financial_core.correction_command_payloads c
   WHERE c.replacement_event_id=target.id;
  IF replacement_result IS NULL OR replacement_result->>'economic_payload_fingerprint'<>target.economic_payload_fingerprint
   OR financial_core.f3_correction_fingerprint(replacement_result->'economic_payload')<>target.economic_payload_fingerprint
   OR replacement_result->'economic_payload'->'event'->>'id'<>target.id::text
   OR replacement_result->'economic_payload'->'event'->>'group_id'<>g::text
   OR replacement_result->'economic_payload'->'event'->>'ledger_epoch_id'<>target.ledger_epoch_id::text
   OR replacement_result->'economic_payload'->'event'->>'currency'<>target.currency
   OR replacement_result->'economic_payload'->'event'->>'occurred_at'<>financial_core.f3_correction_timestamp(target.occurred_at)
   OR replacement_result->'economic_payload'->'event'->>'event_class'<>target.event_class::text
   OR replacement_result->'economic_payload'->'event'->>'source_module'<>target.source_module
   OR replacement_result->'economic_payload'->'event'->>'source_record_id'<>target.source_record_id
   OR replacement_result->'economic_payload'->'event'->>'effect_kind'<>target.effect_kind
  THEN RAISE EXCEPTION 'TARGET_NOT_MANUAL'; END IF;
  economic:=replacement_result->'economic';
  PERFORM financial_core.assert_f3_correction_postings(target.id,replacement_result->'postings');
 ELSE RAISE EXCEPTION 'TARGET_NOT_MANUAL'; END IF;
 SELECT pg_catalog.jsonb_agg(financial_core.f3_correction_posting_json(p.id,p.event_id,p.group_id,
  p.ledger_epoch_id,p.currency,p.occurred_at,p.amount_signed,p.control_class,p.account_id,p.fund_id,
  p.category_id,p.category_class,p.member_id,p.project_id) ORDER BY p.id)
 INTO target_postings FROM public.financial_postings p WHERE p.event_id=target.id;
 snapshot:=pg_catalog.jsonb_build_object('id',target.id,'group_id',g,'ledger_epoch_id',target.ledger_epoch_id,
  'currency',target.currency,'occurred_at',financial_core.f3_correction_timestamp(target.occurred_at),
  'event_class',target.event_class,'source_module',target.source_module,'source_record_id',target.source_record_id,
  'effect_kind',target.effect_kind,'request_id',target.request_id,
  'economic_payload_fingerprint',target.economic_payload_fingerprint,'description',target.description,
  'reference_metadata',target.reference_metadata,'created_by',target.created_by,'economic',economic,'postings',target_postings);
 replacement:=CASE WHEN intent='CORRECT' THEN
  financial_core.resolve_f3_correction_replacement(cmd->'replacement',snapshot,false) ELSE NULL END;
 IF replacement IS NOT NULL THEN
  description:=CASE WHEN cmd->'replacement'?'description' THEN cmd->'replacement'->>'description' ELSE target.description END;
  IF replacement->>'action'='money_out' AND COALESCE(financial_core.f3_trim(description),'')=''
  THEN RAISE EXCEPTION 'DESCRIPTION_REQUIRED'; END IF;
  metadata:=CASE WHEN cmd->'replacement'?'reference_metadata'
   THEN COALESCE(NULLIF(cmd->'replacement'->'reference_metadata','null'::jsonb),'{}'::jsonb)
   ELSE target.reference_metadata END;
 END IF;
 root_payload:=pg_catalog.jsonb_build_object('contract_version','f3-correction-v1','group_id',g,
  'correction_request_id',request,'target_event_id',target_id,
  'target_economic_fingerprint',target.economic_payload_fingerprint,'intent',intent,
  'correction_reason',reason,'replacement',CASE WHEN replacement IS NULL THEN 'null'::jsonb
   ELSE replacement||pg_catalog.jsonb_build_object('ledger_epoch_id',target.ledger_epoch_id) END);
 root_hash:=financial_core.f3_correction_fingerprint(root_payload);
 reversal_id:=financial_core.f3_correction_child_id(g,request,'reversal');
 replacement_id:=CASE WHEN replacement IS NULL THEN NULL ELSE financial_core.f3_correction_child_id(g,request,'replacement') END;
 SELECT pg_catalog.jsonb_agg(financial_core.f3_correction_posting_json(
  financial_core.f3_correction_child_id(g,request,'reversal/posting/'||p.id::text),reversal_id,p.group_id,
  p.ledger_epoch_id,p.currency,p.occurred_at,-p.amount_signed,p.control_class,p.account_id,p.fund_id,
  p.category_id,p.category_class,p.member_id,p.project_id) ORDER BY p.id)
 INTO reversal_postings FROM public.financial_postings p WHERE p.event_id=target.id;
 reversal_event:=pg_catalog.jsonb_build_object('id',reversal_id,'group_id',g,'ledger_epoch_id',target.ledger_epoch_id,
  'currency',target.currency,'occurred_at',financial_core.f3_correction_timestamp(target.occurred_at),
  'event_class','opening_adjustment','source_module','manual_finance_correction',
  'source_record_id',request::text||'/reversal','effect_kind','correction_reversal',
  'request_id',NULL,'reversal_of_event_id',target.id);
 reversal_payload:=pg_catalog.jsonb_build_object('contract_version','f3-correction-child-v1',
  'correction_request_id',request,'target_event_id',target.id,
  'target_economic_fingerprint',target.economic_payload_fingerprint,'role','reversal',
  'event',reversal_event,'economic',NULL,'postings',reversal_postings);
 reversal_hash:=financial_core.f3_correction_fingerprint(reversal_payload);
 IF replacement IS NOT NULL THEN
  amount:=(replacement->>'amount')::numeric;
  cc:=CASE replacement->>'action' WHEN 'money_in' THEN 'income'::public.financial_category_class
   WHEN 'money_out' THEN 'expense'::public.financial_category_class ELSE NULL END;
  CASE replacement->>'action'
   WHEN 'money_in' THEN first_control:='custody';first_amount:=amount;first_account:=(replacement->>'account_id')::uuid;
    second_control:='income';second_amount:=-amount;second_category:=(replacement->>'category_id')::uuid;
   WHEN 'money_out' THEN first_control:='expense';first_amount:=amount;first_category:=(replacement->>'category_id')::uuid;
    second_control:='custody';second_amount:=-amount;second_account:=(replacement->>'account_id')::uuid;
   WHEN 'transfer' THEN first_control:='custody';first_amount:=-amount;first_account:=(replacement->>'account_id')::uuid;
    second_control:='custody';second_amount:=amount;second_account:=(replacement->>'destination_account_id')::uuid;
  END CASE;
  replacement_postings:=pg_catalog.jsonb_build_array(
   financial_core.f3_correction_posting_json(financial_core.f3_correction_child_id(g,request,'replacement/posting/1'),
    replacement_id,g,target.ledger_epoch_id,target.currency,(replacement->>'occurred_at')::timestamptz,
    first_amount,first_control,first_account,(replacement->>'fund_id')::uuid,first_category,
    CASE WHEN first_category IS NULL THEN NULL ELSE cc END,(replacement->>'member_id')::uuid,(replacement->>'project_id')::uuid),
   financial_core.f3_correction_posting_json(financial_core.f3_correction_child_id(g,request,'replacement/posting/2'),
    replacement_id,g,target.ledger_epoch_id,target.currency,(replacement->>'occurred_at')::timestamptz,
    second_amount,second_control,second_account,(replacement->>'fund_id')::uuid,second_category,
    CASE WHEN second_category IS NULL THEN NULL ELSE cc END,(replacement->>'member_id')::uuid,(replacement->>'project_id')::uuid));
  replacement_event:=pg_catalog.jsonb_build_object('id',replacement_id,'group_id',g,'ledger_epoch_id',target.ledger_epoch_id,
   'currency',target.currency,'occurred_at',replacement->>'occurred_at','event_class',replacement->>'action',
   'source_module','manual_finance_correction','source_record_id',request::text||'/replacement',
   'effect_kind','correction_replacement','request_id',NULL,'reversal_of_event_id',NULL);
  replacement_payload:=pg_catalog.jsonb_build_object('contract_version','f3-correction-child-v1',
   'correction_request_id',request,'target_event_id',target.id,
   'target_economic_fingerprint',target.economic_payload_fingerprint,'role','replacement',
   'event',replacement_event,'economic',replacement,'postings',replacement_postings);
  replacement_hash:=financial_core.f3_correction_fingerprint(replacement_payload);
 END IF;
 IF EXISTS(SELECT 1 FROM public.financial_events e WHERE e.id IN(reversal_id,replacement_id))
 OR EXISTS(SELECT 1 FROM public.financial_postings p WHERE p.id IN(
  SELECT (x.value->>'id')::uuid FROM pg_catalog.jsonb_array_elements(
   reversal_postings||COALESCE(replacement_postings,'[]'::jsonb)) x))
 THEN RAISE EXCEPTION 'CHILD_ID_COLLISION'; END IF;
 BEGIN PERFORM financial_core.assert_finances_manage(g);
 EXCEPTION WHEN insufficient_privilege THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END;
 now_at:=clock_timestamp();
 INSERT INTO public.financial_events(id,group_id,ledger_epoch_id,currency,event_class,source_module,
  source_record_id,effect_kind,request_id,economic_payload_fingerprint,occurred_at,posted_at,created_at,
  created_by,description,reference_metadata,status,reversal_of_event_id)
 VALUES(reversal_id,g,target.ledger_epoch_id,target.currency,'opening_adjustment','manual_finance_correction',
  request::text||'/reversal','correction_reversal',NULL,reversal_hash,target.occurred_at,now_at,now_at,
  actor,target.description,target.reference_metadata,'posted',target.id);
 INSERT INTO public.financial_postings(id,event_id,group_id,ledger_epoch_id,currency,occurred_at,
  amount_signed,control_class,account_id,fund_id,category_id,category_class,member_id,project_id,created_at)
 SELECT financial_core.f3_correction_child_id(g,request,'reversal/posting/'||p.id::text),reversal_id,
  p.group_id,p.ledger_epoch_id,p.currency,p.occurred_at,-p.amount_signed,p.control_class,p.account_id,
  p.fund_id,p.category_id,p.category_class,p.member_id,p.project_id,now_at
 FROM public.financial_postings p WHERE p.event_id=target.id ORDER BY p.id;
 IF replacement_id IS NOT NULL THEN
  INSERT INTO public.financial_events(id,group_id,ledger_epoch_id,currency,event_class,source_module,
   source_record_id,effect_kind,request_id,economic_payload_fingerprint,occurred_at,posted_at,created_at,
   created_by,description,reference_metadata,status)
  VALUES(replacement_id,g,target.ledger_epoch_id,target.currency,(replacement->>'action')::public.financial_event_class,
   'manual_finance_correction',request::text||'/replacement','correction_replacement',NULL,replacement_hash,
   (replacement->>'occurred_at')::timestamptz,now_at,now_at,actor,description,metadata,'posted');
  INSERT INTO public.financial_postings(id,event_id,group_id,ledger_epoch_id,currency,occurred_at,
   amount_signed,control_class,account_id,fund_id,category_id,category_class,member_id,project_id,created_at)
  SELECT (x.value->>'id')::uuid,replacement_id,g,target.ledger_epoch_id,target.currency,
   (replacement->>'occurred_at')::timestamptz,(x.value->>'amount_signed')::numeric,
   (x.value->>'control_class')::public.financial_control_class,(x.value->>'account_id')::uuid,
   (x.value->>'fund_id')::uuid,(x.value->>'category_id')::uuid,
   (x.value->>'category_class')::public.financial_category_class,(x.value->>'member_id')::uuid,
   (x.value->>'project_id')::uuid,now_at FROM pg_catalog.jsonb_array_elements(replacement_postings)x;
 END IF;
 reversal_result:=reversal_event||pg_catalog.jsonb_build_object('economic',NULL,'postings',reversal_postings,
  'economic_payload',reversal_payload,'economic_payload_fingerprint',reversal_hash,'status','posted',
  'replacement_event_id',NULL,'corrected_at',NULL,'correction_reason',NULL,'created_by',actor,
  'posted_at',financial_core.f3_correction_timestamp(now_at),'created_at',financial_core.f3_correction_timestamp(now_at),
  'description',target.description,'reference_metadata',target.reference_metadata);
 IF replacement_id IS NOT NULL THEN
  replacement_result:=replacement_event||pg_catalog.jsonb_build_object('economic',replacement,'postings',replacement_postings,
   'economic_payload',replacement_payload,'economic_payload_fingerprint',replacement_hash,'status','posted',
   'replacement_event_id',NULL,'corrected_at',NULL,'correction_reason',NULL,'created_by',actor,
   'posted_at',financial_core.f3_correction_timestamp(now_at),'created_at',financial_core.f3_correction_timestamp(now_at),
   'description',description,'reference_metadata',metadata);
 END IF;
 result:=pg_catalog.jsonb_build_object('target_event_id',target.id,
  'status',CASE WHEN replacement_id IS NULL THEN 'reversed' ELSE 'corrected' END,
  'reversal_event_id',reversal_id,'replacement_event_id',replacement_id,
  'correction_request_id',request,'correction_actor',actor,'correction_reason',reason,
  'corrected_at',financial_core.f3_correction_timestamp(now_at));
 INSERT INTO financial_core.correction_command_payloads(group_id,correction_request_id,target_event_id,
  canonical_payload,root_fingerprint,target_snapshot,reversal_event_id,replacement_event_id,
  reversal_result,replacement_result,correction_actor,correction_reason,corrected_at,completed_result)
 VALUES(g,request,target.id,root_payload,root_hash,snapshot,reversal_id,replacement_id,reversal_result,
  replacement_result,actor,reason,now_at,result);
 UPDATE public.financial_events SET status=CASE WHEN replacement_id IS NULL THEN 'reversed'::public.financial_event_status
  ELSE 'corrected'::public.financial_event_status END,replacement_event_id=replacement_id,
  corrected_at=now_at,correction_reason=reason WHERE id=target.id AND group_id=g;
 RETURN pg_catalog.jsonb_build_object('decision',CASE WHEN replacement_id IS NULL THEN 'REVERSED' ELSE 'CORRECTED' END,
  'result',result,'fingerprint',root_hash,'new_event_count',CASE WHEN replacement_id IS NULL THEN 1 ELSE 2 END,
  'new_posting_count',pg_catalog.jsonb_array_length(reversal_postings)+
   COALESCE(pg_catalog.jsonb_array_length(replacement_postings),0));
END; $$;

CREATE FUNCTION public.correct_financial_event(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RETURN financial_core.correct_f3_command(p_command); END; $$;

REVOKE ALL ON FUNCTION financial_core.guard_f3_correction_payload(),
 financial_core.f3_correction_canonical(jsonb),financial_core.f3_correction_fingerprint(jsonb),
 financial_core.f3_correction_timestamp(timestamptz),financial_core.f3_correction_signed_amount(numeric,text),
 financial_core.f3_correction_reason(jsonb),financial_core.f3_correction_child_id(uuid,uuid,text),
 financial_core.f3_correction_posting_json(uuid,uuid,uuid,uuid,text,timestamptz,numeric,
 public.financial_control_class,uuid,uuid,uuid,public.financial_category_class,uuid,uuid),
 financial_core.resolve_f3_correction_replacement(jsonb,jsonb,boolean),
 financial_core.assert_f3_correction_postings(uuid,jsonb),
 financial_core.guard_f3_correction_lineage(),financial_core.check_f3_correction_closure(),
 financial_core.correct_f3_command(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.correct_financial_event(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.correct_financial_event(jsonb) TO authenticated;
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

-- Pin F3 SECURITY DEFINER owner to postgres (M2/Cut 1 disposable parity).
-- Never touches has_group_permission or enqueue_outbound_notification.
DO $f3_owner_pin$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS ident
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public','financial_core','financial_private')
      AND p.proname NOT IN ('has_group_permission','enqueue_outbound_notification')
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) OWNER TO postgres',
      r.nspname, r.proname, r.ident
    );
  END LOOP;
END
$f3_owner_pin$;

SET ROLE postgres;
DO $f3_owner_acl$
BEGIN
  IF to_regprocedure('public.post_financial_command(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.post_financial_command(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_financial_command(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.correct_financial_event(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.correct_financial_event(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.correct_financial_event(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.post_financial_opening_cash(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.post_financial_opening_cash(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_financial_opening_cash(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz), public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz), public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer) TO authenticated';
  END IF;
END
$f3_owner_acl$;
RESET ROLE;
