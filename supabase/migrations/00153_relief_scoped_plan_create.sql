-- R-002/R-003: new plans and their first authority contract commit together.
BEGIN;
CREATE TABLE financial_core.relief_plan_create_intents (
  request_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  material_payload jsonb NOT NULL,
  plan_id uuid NOT NULL UNIQUE REFERENCES public.relief_plans(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp()
);
ALTER TABLE financial_core.relief_plan_create_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.relief_plan_create_intents
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT ON public.relief_plans FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_relief_plan_with_scope(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid:=auth.uid(); v_group public.groups%ROWTYPE;
  v_intent financial_core.relief_plan_create_intents%ROWTYPE;
  v_unit uuid; v_plan uuid; v_request uuid;
  v_name text; v_description text; v_amount numeric; v_wait integer;
  v_currency text; v_payload jsonb; v_scope jsonb; v_scope_result jsonb;
BEGIN
  IF v_actor IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
     OR p_command->>'request_id' IS NULL
     OR p_command->>'group_id' IS NULL
     OR p_command->>'name' IS NULL
     OR p_command->>'coverage_amount' IS NULL
     OR p_command->>'currency' IS NULL
  THEN RAISE EXCEPTION 'INVALID_RELIEF_PLAN_COMMAND'; END IF;
  v_request:=(p_command->>'request_id')::uuid;
  v_name:=pg_catalog.btrim(p_command->>'name');
  v_description:=NULLIF(pg_catalog.btrim(p_command->>'description'),'');
  v_amount:=(p_command->>'coverage_amount')::numeric;
  v_wait:=coalesce((p_command->>'waiting_period_days')::integer,90);
  v_currency:=p_command->>'currency';
  SELECT * INTO v_group FROM public.groups
    WHERE id=(p_command->>'group_id')::uuid FOR SHARE;
  IF v_group.id IS NULL OR v_group.organization_id IS NULL
     OR v_group.currency IS DISTINCT FROM v_currency
     OR pg_catalog.length(v_name) NOT BETWEEN 1 AND 120
     OR pg_catalog.length(coalesce(v_description,''))>2000
     OR v_amount<=0
     OR v_amount<>pg_catalog.round(v_amount,
       financial_core.currency_scale(v_currency))
     OR v_wait NOT BETWEEN 0 AND 3650
  THEN RAISE EXCEPTION 'INVALID_RELIEF_PLAN_DIMENSIONS'; END IF;
  SELECT id INTO v_unit FROM public.organization_units
    WHERE group_id=v_group.id AND archived_at IS NULL;
  IF v_unit IS NULL THEN RAISE EXCEPTION 'RELIEF_OWNER_UNIT_MISSING'; END IF;
  IF NOT public.has_group_permission(v_group.id,'relief.manage',v_actor)
  THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  v_scope:=pg_catalog.jsonb_build_object(
    'owning_unit_id',coalesce(p_command->>'owning_unit_id',v_unit::text),
    'financial_owner_group_id',v_group.id,
    'participation_unit_id',coalesce(p_command->>'participation_unit_id',v_unit::text),
    'participation_mode',coalesce(p_command->>'participation_mode','unit'),
    'collection_unit_id',coalesce(p_command->>'collection_unit_id',v_unit::text),
    'collection_mode',coalesce(p_command->>'collection_mode','unit'),
    'review_unit_id',coalesce(p_command->>'review_unit_id',v_unit::text),
    'payout_unit_id',coalesce(p_command->>'payout_unit_id',v_unit::text),
    'reporting_unit_id',coalesce(p_command->>'reporting_unit_id',v_unit::text),
    'reporting_mode',coalesce(p_command->>'reporting_mode','unit'));
  v_payload:=pg_catalog.jsonb_build_object('group_id',v_group.id,
    'name',v_name,'description',v_description,'coverage_amount',v_amount,
    'currency',v_currency,'waiting_period_days',v_wait,'scope',v_scope);
  SELECT * INTO v_intent FROM financial_core.relief_plan_create_intents
    WHERE request_id=v_request FOR UPDATE;
  IF v_intent.request_id IS NOT NULL THEN
    IF v_intent.actor_id<>v_actor OR v_intent.group_id<>v_group.id
       OR v_intent.material_payload<>v_payload
    THEN RAISE EXCEPTION 'RELIEF_PLAN_INTENT_CONFLICT'; END IF;
    RETURN pg_catalog.jsonb_build_object('plan_id',v_intent.plan_id,
      'decision','recovered');
  END IF;
  v_plan:=gen_random_uuid();
  INSERT INTO public.relief_plans
    (id,group_id,name,description,coverage_amount,currency,
     waiting_period_days,created_by,is_active,status,shared_from_org)
  VALUES (v_plan,v_group.id,v_name,v_description,v_amount,v_currency,
    v_wait,v_actor,true,'active',
    v_scope->>'participation_mode'<>'unit'
      OR v_scope->>'participation_unit_id'<>v_unit::text);
  v_scope:=v_scope||pg_catalog.jsonb_build_object('plan_id',v_plan,
    'request_id',v_request,'expected_version',0);
  v_scope_result:=public.configure_relief_plan_scope(v_scope);
  IF v_scope_result->>'decision'<>'posted'
  THEN RAISE EXCEPTION 'RELIEF_SCOPE_CREATE_FAILED'; END IF;
  INSERT INTO financial_core.relief_plan_create_intents
    (request_id,actor_id,group_id,material_payload,plan_id)
  VALUES (v_request,v_actor,v_group.id,v_payload,v_plan);
  RETURN pg_catalog.jsonb_build_object('plan_id',v_plan,
    'scope_version',1,'decision','posted');
END
$$;
REVOKE ALL ON FUNCTION public.create_relief_plan_with_scope(jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_relief_plan_with_scope(jsonb)
  TO authenticated;
COMMIT;
