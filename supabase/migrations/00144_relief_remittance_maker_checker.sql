-- R-007/R-009: branch remittance and owner settlement use distinct current
-- authorities and two F3 occurrences. Historical direct rows remain evidence,
-- but are not silently backfilled or accepted as qualified settlements.
DO $pre$
BEGIN
  IF to_regclass('financial_core.relief_agency_receipts') IS NULL
    OR to_regclass('public.relief_remittances') IS NULL
  THEN RAISE EXCEPTION 'RELIEF_REMITTANCE_PREREQUISITE_MISSING'; END IF;
END
$pre$;

ALTER TABLE public.relief_remittances
  ADD COLUMN submitted_by uuid REFERENCES public.profiles(id),
  ADD COLUMN owner_group_id uuid REFERENCES public.groups(id) ON DELETE RESTRICT,
  ADD COLUMN branch_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN branch_fund_id uuid REFERENCES public.financial_funds(id) ON DELETE RESTRICT,
  ADD COLUMN branch_event_id uuid UNIQUE REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  ADD COLUMN owner_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN owner_fund_id uuid REFERENCES public.financial_funds(id) ON DELETE RESTRICT,
  ADD COLUMN owner_event_id uuid UNIQUE REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  ADD COLUMN dispute_reason text;

-- Existing table grants and RLS allowed direct INSERT of a confirmed row and
-- UPDATE of status by a branch admin. The client now uses the RPCs below.
REVOKE INSERT,UPDATE,DELETE ON public.relief_remittances
  FROM PUBLIC,anon,authenticated;
-- S0/M2 granted TRUNCATE directly to ordinary roles. RLS does not cover it.
-- These are the tables that carry the affected Relief/payment membership chain.
REVOKE TRUNCATE ON public.memberships,public.payments,
  public.relief_plans,public.relief_enrollments,public.relief_claims,
  public.relief_payouts,public.relief_remittances
  FROM PUBLIC,anon,authenticated;
DROP POLICY IF EXISTS relief_remittances_insert ON public.relief_remittances;
DROP POLICY IF EXISTS relief_remittances_update ON public.relief_remittances;

CREATE OR REPLACE FUNCTION public.guard_relief_remittance_effect()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    RAISE EXCEPTION 'RELIEF_REMITTANCE_SERVER_COMMAND_REQUIRED'
      USING ERRCODE='42501';
  END IF;
  IF TG_OP='UPDATE' AND OLD.branch_event_id IS NOT NULL AND (
    NEW.branch_group_id IS DISTINCT FROM OLD.branch_group_id
    OR NEW.relief_plan_id IS DISTINCT FROM OLD.relief_plan_id
    OR NEW.owner_group_id IS DISTINCT FROM OLD.owner_group_id
    OR NEW.amount IS DISTINCT FROM OLD.amount
    OR NEW.currency IS DISTINCT FROM OLD.currency
    OR NEW.method IS DISTINCT FROM OLD.method
    OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
    OR NEW.branch_account_id IS DISTINCT FROM OLD.branch_account_id
    OR NEW.branch_fund_id IS DISTINCT FROM OLD.branch_fund_id
    OR NEW.branch_event_id IS DISTINCT FROM OLD.branch_event_id)
  THEN RAISE EXCEPTION 'POSTED_REMITTANCE_MATERIAL_IMMUTABLE'; END IF;
  IF TG_OP='UPDATE' AND OLD.status IN ('confirmed','disputed')
    AND NEW IS DISTINCT FROM OLD
  THEN RAISE EXCEPTION 'DECIDED_REMITTANCE_IMMUTABLE'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER guard_relief_remittance_effect
  BEFORE INSERT OR UPDATE ON public.relief_remittances
  FOR EACH ROW EXECUTE FUNCTION public.guard_relief_remittance_effect();

CREATE OR REPLACE FUNCTION public.submit_relief_remittance(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid; v_branch uuid; v_plan public.relief_plans%ROWTYPE;
  v_branch_group public.groups%ROWTYPE; v_owner_group public.groups%ROWTYPE;
  v_row public.relief_remittances%ROWTYPE;
  v_actor uuid; v_account_id uuid; v_fund uuid; v_amount numeric;
  v_currency text; v_method text; v_reference text; v_available numeric;
  v_notes text;
  v_result jsonb; v_event uuid;
BEGIN
  IF auth.uid() IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR p_command->>'request_id' IS NULL OR p_command->>'branch_group_id' IS NULL
    OR p_command->>'plan_id' IS NULL OR p_command->>'account_id' IS NULL
    OR p_command->>'fund_id' IS NULL OR p_command->>'amount' IS NULL
    OR p_command->>'method' IS NULL
  THEN RAISE EXCEPTION 'INVALID_REMITTANCE_COMMAND'; END IF;
  v_id:=(p_command->>'request_id')::uuid;
  v_branch:=(p_command->>'branch_group_id')::uuid;
  v_actor:=financial_core.assert_finances_manage(v_branch);
  -- Serialize the available-balance check for this plan across branches.
  SELECT * INTO v_plan FROM public.relief_plans
    WHERE id=(p_command->>'plan_id')::uuid FOR UPDATE;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'RELIEF_PLAN_NOT_FOUND'; END IF;
  SELECT * INTO v_branch_group FROM public.groups WHERE id=v_branch FOR SHARE;
  SELECT * INTO v_owner_group FROM public.groups WHERE id=v_plan.group_id FOR SHARE;
  IF v_branch_group.id IS NULL OR v_owner_group.id IS NULL
    OR v_branch_group.id=v_owner_group.id
    OR v_branch_group.organization_id IS NULL
    OR v_branch_group.organization_id IS DISTINCT FROM v_owner_group.organization_id
    OR NOT v_plan.shared_from_org
    OR NOT EXISTS (SELECT 1 FROM public.organization_units owner_unit
      JOIN public.organization_units branch_unit
        ON branch_unit.group_id=v_branch AND branch_unit.archived_at IS NULL
      JOIN public.organization_unit_closure c
        ON c.ancestor_id=owner_unit.id AND c.descendant_id=branch_unit.id
      WHERE owner_unit.group_id=v_owner_group.id
        AND owner_unit.archived_at IS NULL)
  THEN RAISE EXCEPTION 'REMITTANCE_PLAN_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  v_amount:=(p_command->>'amount')::numeric;
  v_currency:=p_command->>'currency';
  v_method:=p_command->>'method';
  v_reference:=nullif(pg_catalog.btrim(p_command->>'reference'),'');
  v_notes:=nullif(pg_catalog.btrim(p_command->>'notes'),'');
  v_account_id:=(p_command->>'account_id')::uuid;
  v_fund:=(p_command->>'fund_id')::uuid;
  IF v_amount<=0 OR v_amount<>
      pg_catalog.round(v_amount,financial_core.currency_scale(v_currency))
    OR v_currency IS DISTINCT FROM v_branch_group.currency
    OR v_currency IS DISTINCT FROM coalesce(v_plan.currency,v_owner_group.currency)
    OR v_method NOT IN ('bank_transfer','mobile_money','cash','other')
    OR pg_catalog.length(coalesce(v_reference,''))>200
    OR pg_catalog.length(coalesce(v_notes,''))>1000
    OR NOT EXISTS (SELECT 1 FROM public.financial_accounts a
      WHERE a.id=v_account_id AND a.group_id=v_branch
        AND a.currency=v_currency AND a.status='active'
        AND a.kind IN ('bank','cash','mobile_money','wallet'))
    OR NOT EXISTS (SELECT 1 FROM public.financial_funds f
      WHERE f.id=v_fund AND f.group_id=v_branch
        AND f.status='active' AND f.is_restricted)
  THEN RAISE EXCEPTION 'INVALID_REMITTANCE_DIMENSIONS'; END IF;
  SELECT * INTO v_row FROM public.relief_remittances WHERE id=v_id FOR UPDATE;
  IF v_row.id IS NOT NULL THEN
    IF v_row.submitted_by IS DISTINCT FROM v_actor
      OR v_row.branch_group_id<>v_branch OR v_row.relief_plan_id<>v_plan.id
      OR v_row.owner_group_id IS DISTINCT FROM v_owner_group.id
      OR v_row.amount<>v_amount OR v_row.currency<>v_currency
      OR v_row.method<>v_method OR v_row.reference IS DISTINCT FROM v_reference
      OR v_row.notes IS DISTINCT FROM v_notes
      OR v_row.branch_account_id IS DISTINCT FROM v_account_id
      OR v_row.branch_fund_id IS DISTINCT FROM v_fund
      OR v_row.branch_event_id IS NULL
    THEN RAISE EXCEPTION 'REMITTANCE_INTENT_CONFLICT'; END IF;
  ELSE
    SELECT coalesce(sum(p.amount),0) INTO v_available
    FROM financial_core.relief_agency_receipts l
    JOIN public.payments p ON p.id=l.payment_id
    WHERE l.plan_id=v_plan.id AND l.branch_group_id=v_branch
      AND l.owner_group_id=v_owner_group.id AND l.owner_event_id IS NOT NULL;
    v_available:=v_available-coalesce((SELECT sum(r.amount)
      FROM public.relief_remittances r
      WHERE r.relief_plan_id=v_plan.id AND r.branch_group_id=v_branch
        AND r.branch_event_id IS NOT NULL),0);
    IF v_amount>v_available THEN RAISE EXCEPTION 'REMITTANCE_EXCEEDS_AGENCY_BALANCE'; END IF;
    IF v_plan.status<>'active' OR NOT v_plan.is_active
    THEN RAISE EXCEPTION 'RELIEF_PLAN_INACTIVE'; END IF;
    INSERT INTO public.relief_remittances
      (id,branch_group_id,owner_group_id,relief_plan_id,amount,currency,
       method,reference,notes,status,submitted_by,branch_account_id,branch_fund_id)
    VALUES(v_id,v_branch,v_owner_group.id,v_plan.id,v_amount,v_currency,
      v_method,v_reference,v_notes,'pending',v_actor,v_account_id,v_fund)
    RETURNING * INTO v_row;
  END IF;
  v_result:=financial_core.post_module_pair(v_branch,'relief',v_id::text,
    'agency_remittance_out',v_amount,v_currency,v_account_id,NULL,v_fund,
    NULL,v_row.created_at,'Relief agency remittance sent');
  v_event:=(v_result->>'event_id')::uuid;
  IF v_event IS NULL THEN RAISE EXCEPTION 'REMITTANCE_POSTING_FAILED'; END IF;
  IF v_row.branch_event_id IS NULL THEN
    UPDATE public.relief_remittances SET branch_event_id=v_event
      WHERE id=v_id;
  ELSIF v_row.branch_event_id IS DISTINCT FROM v_event
  THEN RAISE EXCEPTION 'REMITTANCE_EVENT_CONFLICT'; END IF;
  RETURN pg_catalog.jsonb_build_object('decision',v_result->>'decision',
    'remittance_id',v_id,'branch_event_id',v_event,
    'posting_count',v_result->'new_posting_count');
END
$$;
REVOKE ALL ON FUNCTION public.submit_relief_remittance(jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_relief_remittance(jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.confirm_relief_remittance(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.relief_remittances%ROWTYPE;
  v_plan public.relief_plans%ROWTYPE; v_actor uuid;
  v_account_id uuid; v_fund uuid; v_result jsonb; v_event uuid;
  v_occurred timestamptz;
BEGIN
  IF auth.uid() IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR p_command->>'remittance_id' IS NULL OR p_command->>'account_id' IS NULL
    OR p_command->>'fund_id' IS NULL
  THEN RAISE EXCEPTION 'INVALID_REMITTANCE_CONFIRMATION'; END IF;
  SELECT * INTO v_row FROM public.relief_remittances
    WHERE id=(p_command->>'remittance_id')::uuid FOR UPDATE;
  IF v_row.id IS NULL OR v_row.submitted_by IS NULL
    OR v_row.branch_event_id IS NULL
  THEN RAISE EXCEPTION 'UNQUALIFIED_REMITTANCE'; END IF;
  SELECT * INTO v_plan FROM public.relief_plans
    WHERE id=v_row.relief_plan_id FOR SHARE;
  IF v_plan.id IS NULL OR v_plan.group_id=v_row.branch_group_id
    OR v_plan.group_id IS DISTINCT FROM v_row.owner_group_id
  THEN RAISE EXCEPTION 'REMITTANCE_PLAN_CONFLICT'; END IF;
  v_actor:=financial_core.assert_finances_manage(v_plan.group_id);
  IF v_actor=v_row.submitted_by
  THEN RAISE EXCEPTION 'REMITTANCE_MAKER_CANNOT_CONFIRM' USING ERRCODE='42501'; END IF;
  IF v_row.status NOT IN ('pending','confirmed')
  THEN RAISE EXCEPTION 'REMITTANCE_ALREADY_DISPUTED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_events e
    JOIN financial_core.financial_event_audit_links a ON a.event_id=e.id
    WHERE e.id=v_row.branch_event_id AND e.group_id=v_row.branch_group_id
      AND e.source_module='relief' AND e.source_record_id=v_row.id::text
      AND e.effect_kind='agency_remittance_out')
  THEN RAISE EXCEPTION 'REMITTANCE_BRANCH_EVIDENCE_MISSING'; END IF;
  v_account_id:=(p_command->>'account_id')::uuid;
  v_fund:=(p_command->>'fund_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.financial_accounts a
    WHERE a.id=v_account_id AND a.group_id=v_plan.group_id
      AND a.currency=v_row.currency
      AND (v_row.owner_event_id IS NOT NULL OR a.status='active')
      AND a.kind IN ('bank','cash','mobile_money','wallet'))
    OR NOT EXISTS (SELECT 1 FROM public.financial_funds f
    WHERE f.id=v_fund AND f.group_id=v_plan.group_id AND f.is_restricted
      AND (v_row.owner_event_id IS NOT NULL OR f.status='active'))
  THEN RAISE EXCEPTION 'REMITTANCE_OWNER_ACCOUNT_OR_FUND_INVALID'; END IF;
  IF v_row.owner_event_id IS NOT NULL
    AND (v_row.owner_account_id IS DISTINCT FROM v_account_id
      OR v_row.owner_fund_id IS DISTINCT FROM v_fund)
  THEN RAISE EXCEPTION 'REMITTANCE_INTENT_CONFLICT'; END IF;
  v_occurred:=coalesce(v_row.confirmed_date,transaction_timestamp());
  v_result:=financial_core.post_module_pair(v_plan.group_id,'relief',v_row.id::text,
    'agency_remittance_in',v_row.amount,v_row.currency,v_account_id,NULL,
    v_fund,NULL,v_occurred,'Relief agency remittance received');
  v_event:=(v_result->>'event_id')::uuid;
  IF v_event IS NULL THEN RAISE EXCEPTION 'REMITTANCE_OWNER_POSTING_FAILED'; END IF;
  IF v_row.owner_event_id IS NULL THEN
    UPDATE public.relief_remittances SET status='confirmed',
      confirmed_by=v_actor,confirmed_date=v_occurred,
      owner_account_id=v_account_id,owner_fund_id=v_fund,
      owner_event_id=v_event,updated_at=now()
    WHERE id=v_row.id;
  ELSIF v_row.owner_event_id IS DISTINCT FROM v_event
  THEN RAISE EXCEPTION 'REMITTANCE_OWNER_EVENT_CONFLICT'; END IF;
  RETURN pg_catalog.jsonb_build_object('decision',v_result->>'decision',
    'remittance_id',v_row.id,'owner_event_id',v_event,
    'posting_count',v_result->'new_posting_count');
END
$$;
REVOKE ALL ON FUNCTION public.confirm_relief_remittance(jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_relief_remittance(jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.dispute_relief_remittance(
  p_remittance uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_row public.relief_remittances%ROWTYPE;
  v_owner uuid; v_actor uuid; v_reason text;
BEGIN
  IF auth.uid() IS NULL OR p_remittance IS NULL
  THEN RAISE EXCEPTION 'INVALID_REMITTANCE_DISPUTE'; END IF;
  v_reason:=pg_catalog.btrim(p_reason);
  IF pg_catalog.length(v_reason) NOT BETWEEN 4 AND 500
  THEN RAISE EXCEPTION 'REMITTANCE_DISPUTE_REASON_REQUIRED'; END IF;
  SELECT * INTO v_row FROM public.relief_remittances
    WHERE id=p_remittance FOR UPDATE;
  IF v_row.id IS NULL OR v_row.submitted_by IS NULL
    OR v_row.branch_event_id IS NULL
  THEN RAISE EXCEPTION 'UNQUALIFIED_REMITTANCE'; END IF;
  SELECT group_id INTO v_owner FROM public.relief_plans
    WHERE id=v_row.relief_plan_id;
  IF v_owner IS NULL OR v_owner IS DISTINCT FROM v_row.owner_group_id
  THEN RAISE EXCEPTION 'REMITTANCE_PLAN_CONFLICT'; END IF;
  v_actor:=financial_core.assert_finances_manage(v_owner);
  IF v_actor=v_row.submitted_by
  THEN RAISE EXCEPTION 'REMITTANCE_MAKER_CANNOT_DISPUTE' USING ERRCODE='42501'; END IF;
  IF v_row.status='disputed' THEN
    IF v_row.confirmed_by IS DISTINCT FROM v_actor
      OR v_row.dispute_reason IS DISTINCT FROM v_reason
    THEN RAISE EXCEPTION 'REMITTANCE_INTENT_CONFLICT'; END IF;
    RETURN pg_catalog.jsonb_build_object('decision','IDEMPOTENT_RETURN_EXISTING',
      'remittance_id',v_row.id);
  END IF;
  IF v_row.status<>'pending' OR v_row.owner_event_id IS NOT NULL
  THEN RAISE EXCEPTION 'REMITTANCE_ALREADY_DECIDED'; END IF;
  UPDATE public.relief_remittances SET status='disputed',
    dispute_reason=v_reason,confirmed_by=v_actor,confirmed_date=now(),
    updated_at=now() WHERE id=v_row.id;
  INSERT INTO public.group_audit_logs
    (group_id,actor_id,action,entity_type,entity_id,description,details)
  VALUES (v_owner,v_actor,'relief_remittance.disputed',
    'relief_remittance',v_row.id,'Relief remittance disputed',
    pg_catalog.jsonb_build_object('branch_event_id',v_row.branch_event_id,
      'branch_group_id',v_row.branch_group_id));
  RETURN pg_catalog.jsonb_build_object('decision','DISPUTED',
    'remittance_id',v_row.id);
END
$$;
REVOKE ALL ON FUNCTION public.dispute_relief_remittance(uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dispute_relief_remittance(uuid,text)
  TO authenticated;
