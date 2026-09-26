-- R-002/R-003/R-009: branch collection as agent, then owner recognition.
-- Frozen plan, organization, and hierarchy identity binds the two effects.
-- Remittance is a separate maker/checker occurrence and is not inferred here.
DO $pre$
BEGIN
  IF to_regclass('public.organization_unit_closure') IS NULL
    OR to_regclass('financial_core.financial_event_audit_links') IS NULL
    OR to_regprocedure('financial_core.post_module_pair(uuid,text,text,text,numeric,text,uuid,uuid,uuid,uuid,timestamptz,text)') IS NULL
  THEN RAISE EXCEPTION 'RELIEF_AGENCY_PREREQUISITE_MISSING'; END IF;
END
$pre$;

CREATE TABLE financial_core.relief_agency_receipts (
  payment_id uuid PRIMARY KEY REFERENCES public.payments(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.relief_plans(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  topology_version bigint NOT NULL,
  branch_group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  owner_group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  branch_event_id uuid NOT NULL UNIQUE REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  owner_event_id uuid UNIQUE REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.profiles(id),
  CHECK (branch_group_id<>owner_group_id),
  CHECK ((owner_event_id IS NULL AND accepted_at IS NULL AND accepted_by IS NULL)
    OR (owner_event_id IS NOT NULL AND accepted_at IS NOT NULL AND accepted_by IS NOT NULL))
);
ALTER TABLE financial_core.relief_agency_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.relief_agency_receipts
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_relief_payment_plan_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_plan public.relief_plans%ROWTYPE;
  v_branch public.groups%ROWTYPE; v_owner public.groups%ROWTYPE;
BEGIN
  IF NEW.relief_plan_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_plan FROM public.relief_plans WHERE id=NEW.relief_plan_id;
  SELECT * INTO v_branch FROM public.groups WHERE id=NEW.group_id;
  SELECT * INTO v_owner FROM public.groups WHERE id=v_plan.group_id;
  IF v_plan.id IS NULL OR v_branch.id IS NULL OR v_owner.id IS NULL
  THEN RAISE EXCEPTION 'RELIEF_PLAN_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  IF v_plan.group_id<>NEW.group_id AND (
    NOT v_plan.shared_from_org OR v_branch.organization_id IS NULL
    OR v_branch.organization_id IS DISTINCT FROM v_owner.organization_id
    OR NOT EXISTS (SELECT 1 FROM public.organization_units owner_unit
      JOIN public.organization_units branch_unit
        ON branch_unit.group_id=NEW.group_id AND branch_unit.archived_at IS NULL
      JOIN public.organization_unit_closure c
        ON c.ancestor_id=owner_unit.id AND c.descendant_id=branch_unit.id
      WHERE owner_unit.group_id=v_owner.id AND owner_unit.archived_at IS NULL))
  THEN RAISE EXCEPTION 'RELIEF_PLAN_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER guard_relief_payment_plan_scope
  BEFORE INSERT OR UPDATE OF relief_plan_id,group_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_relief_payment_plan_scope();

CREATE OR REPLACE FUNCTION public.post_branch_relief_receipt(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.payments%ROWTYPE; v_plan public.relief_plans%ROWTYPE;
  v_branch public.groups%ROWTYPE; v_owner public.groups%ROWTYPE;
  v_account public.financial_accounts%ROWTYPE; v_account_id uuid; v_fund uuid;
  v_owner_unit uuid; v_branch_unit uuid; v_topology bigint;
  v_result jsonb; v_event uuid; v_link financial_core.relief_agency_receipts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR p_command->>'payment_id' IS NULL OR p_command->>'account_id' IS NULL
    OR p_command->>'fund_id' IS NULL
  THEN RAISE EXCEPTION 'INVALID_AGENCY_RECEIPT_COMMAND'; END IF;
  SELECT * INTO v_payment FROM public.payments
    WHERE id=(p_command->>'payment_id')::uuid FOR UPDATE;
  IF v_payment.id IS NULL OR v_payment.relief_plan_id IS NULL
  THEN RAISE EXCEPTION 'RELIEF_PAYMENT_NOT_FOUND'; END IF;
  SELECT * INTO v_plan FROM public.relief_plans
    WHERE id=v_payment.relief_plan_id FOR SHARE;
  SELECT * INTO v_branch FROM public.groups
    WHERE id=v_payment.group_id FOR SHARE;
  SELECT * INTO v_owner FROM public.groups
    WHERE id=v_plan.group_id FOR SHARE;
  IF v_plan.id IS NULL OR v_branch.id IS NULL OR v_owner.id IS NULL
    OR v_plan.group_id=v_payment.group_id
  THEN RAISE EXCEPTION 'AGENCY_PLAN_OR_BRANCH_INVALID'; END IF;
  PERFORM financial_core.assert_finances_manage(v_branch.id);
  SELECT * INTO v_link FROM financial_core.relief_agency_receipts
    WHERE payment_id=v_payment.id FOR UPDATE;
  IF v_payment.status NOT IN ('pending_confirmation','confirmed')
    OR (v_payment.status='confirmed' AND
      (v_payment.financial_event_id IS NULL OR v_link.payment_id IS NULL))
    OR v_payment.cash_class<>'non_refundable'
    OR v_payment.obligation_id IS NOT NULL
    OR v_payment.currency IS DISTINCT FROM coalesce(v_plan.currency,v_owner.currency)
    OR v_payment.currency<>v_branch.currency
    OR v_payment.amount<=0
  THEN RAISE EXCEPTION 'AGENCY_RECEIPT_DIMENSION_CONFLICT'; END IF;
  IF v_link.payment_id IS NULL THEN
    SELECT id INTO v_owner_unit FROM public.organization_units
      WHERE group_id=v_owner.id AND archived_at IS NULL;
    SELECT id INTO v_branch_unit FROM public.organization_units
      WHERE group_id=v_branch.id AND archived_at IS NULL;
    IF NOT v_plan.shared_from_org OR v_branch.organization_id IS NULL
      OR v_branch.organization_id IS DISTINCT FROM v_owner.organization_id
      OR v_owner_unit IS NULL OR v_branch_unit IS NULL
      OR NOT EXISTS (SELECT 1 FROM public.organization_unit_closure c
        WHERE c.ancestor_id=v_owner_unit AND c.descendant_id=v_branch_unit)
      OR v_plan.status<>'active' OR NOT v_plan.is_active
      OR NOT EXISTS (SELECT 1 FROM public.memberships m
        WHERE m.id=v_payment.membership_id AND m.group_id=v_branch.id
          AND m.membership_status='active')
      OR NOT EXISTS (SELECT 1 FROM public.relief_enrollments e
        WHERE e.plan_id=v_plan.id AND e.membership_id=v_payment.membership_id
          AND e.collecting_group_id=v_branch.id
          AND e.status='active' AND e.is_active)
    THEN RAISE EXCEPTION 'AGENCY_SCOPE_OR_ENROLLMENT_DENIED' USING ERRCODE='42501'; END IF;
    SELECT topology_version INTO v_topology FROM public.organizations
      WHERE id=v_owner.organization_id;
  ELSIF v_link.plan_id<>v_plan.id OR v_link.branch_group_id<>v_branch.id
    OR v_link.owner_group_id<>v_owner.id
    OR v_link.branch_event_id IS DISTINCT FROM v_payment.financial_event_id
  THEN RAISE EXCEPTION 'AGENCY_RECEIPT_CONFLICT'; END IF;
  v_account_id:=(p_command->>'account_id')::uuid;
  SELECT * INTO v_account FROM public.financial_accounts
    WHERE id=v_account_id FOR SHARE;
  IF v_account.id IS NULL OR v_account.group_id<>v_branch.id
    OR v_account.currency<>v_payment.currency
    OR v_account.kind NOT IN ('bank','cash','mobile_money','wallet')
    OR (v_link.payment_id IS NULL AND v_account.status<>'active')
  THEN RAISE EXCEPTION 'AGENCY_CUSTODY_ACCOUNT_INVALID'; END IF;
  v_fund:=(p_command->>'fund_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.financial_funds f
    WHERE f.id=v_fund AND f.group_id=v_branch.id AND f.is_restricted
      AND (v_link.payment_id IS NOT NULL OR f.status='active'))
  THEN RAISE EXCEPTION 'AGENCY_RESTRICTED_FUND_REQUIRED'; END IF;
  v_result:=financial_core.post_module_pair(v_branch.id,'relief',v_payment.id::text,
    'agency_receipt',v_payment.amount,v_payment.currency,v_account_id,NULL,
    v_fund,v_payment.membership_id,v_payment.recorded_at,'Relief agency receipt');
  v_event:=(v_result->>'event_id')::uuid;
  IF v_event IS NULL THEN RAISE EXCEPTION 'AGENCY_POSTING_FAILED'; END IF;
  IF v_link.payment_id IS NULL THEN
    UPDATE public.payments SET status='confirmed',financial_event_id=v_event,
      financial_account_id=v_account_id,settlement_status='open',updated_at=now()
    WHERE id=v_payment.id;
    INSERT INTO financial_core.relief_agency_receipts
      (payment_id,plan_id,organization_id,topology_version,
       branch_group_id,owner_group_id,branch_event_id)
    VALUES(v_payment.id,v_plan.id,v_owner.organization_id,v_topology,
      v_branch.id,v_owner.id,v_event);
  ELSIF v_link.branch_event_id IS DISTINCT FROM v_event
  THEN RAISE EXCEPTION 'AGENCY_RECEIPT_CONFLICT'; END IF;
  RETURN pg_catalog.jsonb_build_object('decision',v_result->>'decision',
    'payment_id',v_payment.id,'financial_event_id',v_event,
    'posting_count',v_result->'new_posting_count');
END
$$;
REVOKE ALL ON FUNCTION public.post_branch_relief_receipt(jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_branch_relief_receipt(jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_collectible_relief_plans(p_branch uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM financial_core.assert_finances_manage(p_branch);
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
    ORDER BY x.name,x.id),'[]'::jsonb)
  INTO v_result FROM (
    SELECT rp.id,rp.name,rp.currency,rp.group_id AS owner_group_id
    FROM public.relief_plans rp
    JOIN public.groups owner_group ON owner_group.id=rp.group_id
    JOIN public.groups branch_group ON branch_group.id=p_branch
    JOIN public.organization_units owner_unit
      ON owner_unit.group_id=owner_group.id AND owner_unit.archived_at IS NULL
    JOIN public.organization_units branch_unit
      ON branch_unit.group_id=branch_group.id AND branch_unit.archived_at IS NULL
    JOIN public.organization_unit_closure c
      ON c.ancestor_id=owner_unit.id AND c.descendant_id=branch_unit.id
    WHERE rp.shared_from_org AND rp.is_active AND rp.status='active'
      AND owner_group.id<>branch_group.id
      AND owner_group.organization_id=branch_group.organization_id
  ) x;
  RETURN v_result;
END
$$;
REVOKE ALL ON FUNCTION public.list_collectible_relief_plans(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_collectible_relief_plans(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_branch_relief_receipts(p_branch uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM financial_core.assert_finances_manage(p_branch);
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
    ORDER BY x.recorded_at DESC,x.id DESC),'[]'::jsonb)
  INTO v_result FROM (
    SELECT p.id,p.amount,p.currency,p.status,p.cash_class,p.relief_plan_id,
      p.membership_id,p.financial_event_id,p.recorded_at,
      EXISTS (SELECT 1 FROM financial_core.relief_agency_receipts l
        JOIN financial_core.financial_event_audit_links a
          ON a.event_id=l.branch_event_id
        WHERE l.payment_id=p.id AND l.branch_group_id=p_branch
          AND l.branch_event_id=p.financial_event_id) AS audit_verified,
      EXISTS (SELECT 1 FROM financial_core.relief_agency_receipts l
        WHERE l.payment_id=p.id AND l.branch_group_id=p_branch
          AND l.owner_event_id IS NOT NULL) AS owner_recognized
    FROM public.payments p JOIN public.relief_plans rp ON rp.id=p.relief_plan_id
    WHERE p.group_id=p_branch AND rp.group_id<>p_branch
    ORDER BY p.recorded_at DESC,p.id DESC LIMIT 40
  ) x;
  RETURN v_result;
END
$$;
REVOKE ALL ON FUNCTION public.list_branch_relief_receipts(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_branch_relief_receipts(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_pending_agency_relief_receipts(p_owner uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM financial_core.assert_finances_manage(p_owner);
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
    ORDER BY x.recorded_at DESC,x.payment_id DESC),'[]'::jsonb)
  INTO v_result FROM (
    SELECT l.payment_id,l.plan_id,l.branch_group_id,l.owner_group_id,
      l.branch_event_id,l.owner_event_id,l.recorded_at,p.amount,p.currency,
      EXISTS (SELECT 1 FROM financial_core.financial_event_audit_links a
        WHERE a.event_id=l.branch_event_id) AS branch_audit_verified
    FROM financial_core.relief_agency_receipts l
    JOIN public.payments p ON p.id=l.payment_id
    WHERE l.owner_group_id=p_owner
    ORDER BY l.recorded_at DESC,l.payment_id DESC LIMIT 40
  ) x;
  RETURN v_result;
END
$$;
REVOKE ALL ON FUNCTION public.list_pending_agency_relief_receipts(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_pending_agency_relief_receipts(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.post_agency_owner_recognition(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_link financial_core.relief_agency_receipts%ROWTYPE;
  v_payment public.payments%ROWTYPE; v_fund uuid; v_category uuid;
  v_result jsonb; v_event uuid; v_actor uuid;
BEGIN
  IF auth.uid() IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR p_command->>'payment_id' IS NULL OR p_command->>'fund_id' IS NULL
    OR p_command->>'category_id' IS NULL
  THEN RAISE EXCEPTION 'INVALID_AGENCY_RECOGNITION_COMMAND'; END IF;
  SELECT * INTO v_link FROM financial_core.relief_agency_receipts
    WHERE payment_id=(p_command->>'payment_id')::uuid FOR UPDATE;
  IF v_link.payment_id IS NULL THEN RAISE EXCEPTION 'AGENCY_RECEIPT_NOT_FOUND'; END IF;
  v_actor:=financial_core.assert_finances_manage(v_link.owner_group_id);
  SELECT * INTO v_payment FROM public.payments
    WHERE id=v_link.payment_id FOR SHARE;
  IF v_payment.id IS NULL OR v_payment.status<>'confirmed'
    OR v_payment.financial_event_id IS DISTINCT FROM v_link.branch_event_id
    OR v_payment.cash_class<>'non_refundable'
    OR NOT EXISTS (SELECT 1 FROM public.financial_events e
      JOIN financial_core.financial_event_audit_links a ON a.event_id=e.id
      WHERE e.id=v_link.branch_event_id AND e.group_id=v_link.branch_group_id
        AND e.source_module='relief' AND e.source_record_id=v_payment.id::text
        AND e.effect_kind='agency_receipt')
  THEN RAISE EXCEPTION 'AGENCY_RECEIPT_EVIDENCE_CONFLICT'; END IF;
  v_fund:=(p_command->>'fund_id')::uuid;
  v_category:=(p_command->>'category_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.financial_funds f
    WHERE f.id=v_fund AND f.group_id=v_link.owner_group_id
      AND f.is_restricted
      AND (v_link.owner_event_id IS NOT NULL OR f.status='active'))
    OR NOT EXISTS (SELECT 1 FROM public.financial_categories c
    WHERE c.id=v_category AND c.group_id=v_link.owner_group_id
      AND c.category_class='income'
      AND (v_link.owner_event_id IS NOT NULL OR c.status='active'))
  THEN RAISE EXCEPTION 'AGENCY_OWNER_CATEGORY_OR_FUND_INVALID'; END IF;
  v_result:=financial_core.post_module_pair(
    v_link.owner_group_id,'relief',v_payment.id::text,
    'agency_owner_recognition',v_payment.amount,v_payment.currency,
    NULL,v_category,v_fund,NULL,v_payment.recorded_at,
    'Relief agency owner receivable and restricted income');
  v_event:=(v_result->>'event_id')::uuid;
  IF v_event IS NULL THEN RAISE EXCEPTION 'AGENCY_OWNER_POSTING_FAILED'; END IF;
  IF v_link.owner_event_id IS NULL THEN
    UPDATE financial_core.relief_agency_receipts
      SET owner_event_id=v_event,accepted_at=now(),accepted_by=v_actor
    WHERE payment_id=v_payment.id;
  ELSIF v_link.owner_event_id IS DISTINCT FROM v_event
  THEN RAISE EXCEPTION 'AGENCY_OWNER_CONFLICT'; END IF;
  RETURN pg_catalog.jsonb_build_object('decision',v_result->>'decision',
    'payment_id',v_payment.id,'owner_event_id',v_event,
    'posting_count',v_result->'new_posting_count');
END
$$;
REVOKE ALL ON FUNCTION public.post_agency_owner_recognition(jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_agency_owner_recognition(jsonb)
  TO authenticated;
