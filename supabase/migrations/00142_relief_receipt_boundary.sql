-- R-009/F4-006: a Relief-tagged receipt belongs to the Relief adapter.
-- Owner-collected receipts use the existing F3 occurrence/audit transaction.
-- Branch-agent settlement requires its separate owner/branch contract and
-- remains fail-closed here; it cannot be represented as ordinary dues income.
DO $pre$
BEGIN
  IF to_regprocedure('financial_core.post_module_pair(uuid,text,text,text,numeric,text,uuid,uuid,uuid,uuid,timestamptz,text)') IS NULL
    OR to_regclass('public.relief_plans') IS NULL
  THEN RAISE EXCEPTION 'RELIEF_RECEIPT_PREREQUISITE_MISSING'; END IF;
END
$pre$;

CREATE OR REPLACE FUNCTION public.post_owner_relief_receipt(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.payments%ROWTYPE; v_plan public.relief_plans%ROWTYPE;
  v_account public.financial_accounts%ROWTYPE; v_group public.groups%ROWTYPE;
  v_account_id uuid; v_category uuid; v_fund uuid; v_class text;
  v_result jsonb; v_event uuid;
BEGIN
  IF auth.uid() IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR p_command->>'payment_id' IS NULL OR p_command->>'account_id' IS NULL
    OR p_command->>'fund_id' IS NULL
  THEN RAISE EXCEPTION 'INVALID_RELIEF_RECEIPT_COMMAND'; END IF;
  SELECT * INTO v_payment FROM public.payments
    WHERE id=(p_command->>'payment_id')::uuid FOR UPDATE;
  IF v_payment.id IS NULL OR v_payment.relief_plan_id IS NULL
  THEN RAISE EXCEPTION 'RELIEF_PAYMENT_NOT_FOUND'; END IF;
  SELECT * INTO v_plan FROM public.relief_plans
    WHERE id=v_payment.relief_plan_id FOR SHARE;
  SELECT * INTO v_group FROM public.groups
    WHERE id=v_payment.group_id FOR SHARE;
  IF v_plan.id IS NULL OR v_group.id IS NULL
  THEN RAISE EXCEPTION 'RELIEF_PLAN_NOT_FOUND'; END IF;
  IF v_plan.group_id<>v_payment.group_id
  THEN RAISE EXCEPTION 'AGENCY_RECEIPT_REQUIRES_OWNER_CONTRACT'; END IF;
  PERFORM financial_core.assert_finances_manage(v_payment.group_id);
  IF v_payment.status NOT IN ('pending_confirmation','confirmed')
  THEN RAISE EXCEPTION 'INVALID_RELIEF_PAYMENT_STATUS'; END IF;
  IF v_payment.status='confirmed' AND v_payment.financial_event_id IS NULL
  THEN RAISE EXCEPTION 'UNQUALIFIED_LEGACY_RELIEF_RECEIPT'; END IF;
  IF v_payment.amount<=0 OR v_payment.amount<>
    pg_catalog.round(v_payment.amount,financial_core.currency_scale(v_payment.currency))
    OR v_payment.currency IS DISTINCT FROM coalesce(v_plan.currency,v_group.currency)
    OR v_payment.obligation_id IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM public.memberships m
      WHERE m.id=v_payment.membership_id AND m.group_id=v_payment.group_id
        AND m.membership_status='active')
  THEN RAISE EXCEPTION 'RELIEF_RECEIPT_DIMENSION_CONFLICT'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.relief_enrollments e
    WHERE e.plan_id=v_plan.id AND e.membership_id=v_payment.membership_id
      AND e.is_active AND e.status='active')
  THEN RAISE EXCEPTION 'RELIEF_MEMBER_NOT_ENROLLED'; END IF;
  IF v_payment.status='pending_confirmation' AND
    (coalesce(v_plan.status,
      CASE WHEN v_plan.is_active THEN 'active' ELSE 'paused' END)<>'active'
      OR NOT v_plan.is_active)
  THEN RAISE EXCEPTION 'RELIEF_PLAN_INACTIVE'; END IF;
  v_class:=v_payment.cash_class;
  IF v_class NOT IN ('non_refundable','refundable','conditional')
  THEN RAISE EXCEPTION 'INVALID_RELIEF_CASH_CLASS'; END IF;
  IF p_command->>'cash_class' IS NOT NULL
    AND p_command->>'cash_class' IS DISTINCT FROM v_class
  THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  v_account_id:=(p_command->>'account_id')::uuid;
  SELECT * INTO v_account FROM public.financial_accounts
    WHERE id=v_account_id FOR SHARE;
  IF v_account.id IS NULL OR v_account.group_id<>v_payment.group_id
    OR v_account.currency<>v_payment.currency
    OR (v_payment.financial_event_id IS NULL AND v_account.status<>'active')
    OR v_account.kind NOT IN ('bank','cash','mobile_money','wallet')
  THEN RAISE EXCEPTION 'RELIEF_CUSTODY_ACCOUNT_INVALID'; END IF;
  v_fund:=(p_command->>'fund_id')::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.financial_funds f
    WHERE f.id=v_fund AND f.group_id=v_payment.group_id
      AND f.is_restricted
      AND (v_payment.financial_event_id IS NOT NULL OR f.status='active'))
  THEN RAISE EXCEPTION 'RELIEF_RESTRICTED_FUND_REQUIRED'; END IF;
  IF v_class='non_refundable' THEN
    v_category:=(p_command->>'category_id')::uuid;
    IF v_category IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.financial_categories c
      WHERE c.id=v_category AND c.group_id=v_payment.group_id
        AND c.category_class='income'
        AND (v_payment.financial_event_id IS NOT NULL OR c.status='active'))
    THEN RAISE EXCEPTION 'RELIEF_INCOME_CATEGORY_REQUIRED'; END IF;
  ELSIF p_command->>'category_id' IS NOT NULL THEN
    RAISE EXCEPTION 'RELIEF_CATEGORY_PROHIBITED_FOR_LIABILITY';
  END IF;
  IF v_payment.financial_event_id IS NOT NULL
    AND v_payment.financial_account_id IS DISTINCT FROM v_account_id
  THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  v_result:=financial_core.post_module_pair(
    v_payment.group_id,'relief',v_payment.id::text,
    CASE WHEN v_class='non_refundable' THEN 'owner_nonrefundable_receipt'
      ELSE 'owner_conditional_receipt' END,
    v_payment.amount,v_payment.currency,v_account_id,v_category,v_fund,
    v_payment.membership_id,v_payment.recorded_at,'Relief plan receipt');
  v_event:=(v_result->>'event_id')::uuid;
  IF v_event IS NULL THEN RAISE EXCEPTION 'RELIEF_RECEIPT_POSTING_FAILED'; END IF;
  IF v_payment.financial_event_id IS NOT NULL
    AND v_payment.financial_event_id IS DISTINCT FROM v_event
  THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  IF v_payment.financial_event_id IS NULL THEN
    UPDATE public.payments SET status='confirmed',cash_class=v_class,
      financial_event_id=v_event,financial_account_id=v_account_id,
      settlement_status=CASE WHEN v_class='non_refundable'
        THEN 'recognized' ELSE 'open' END,updated_at=now()
    WHERE id=v_payment.id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('decision',v_result->>'decision',
    'payment_id',v_payment.id,'financial_event_id',v_event,
    'posting_count',v_result->'new_posting_count','cash_class',v_class);
END
$$;
REVOKE ALL ON FUNCTION public.post_owner_relief_receipt(jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_owner_relief_receipt(jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_owner_relief_receipts(p_group uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM financial_core.assert_finances_manage(p_group);
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
    ORDER BY x.recorded_at DESC,x.id DESC),'[]'::jsonb)
  INTO v_result FROM (
    SELECT p.id,p.amount,p.currency,p.status,p.financial_event_id,
      p.relief_plan_id,p.membership_id,p.cash_class,p.recorded_at,
      EXISTS (SELECT 1 FROM financial_core.financial_event_audit_links l
        JOIN public.group_audit_logs a ON a.id=l.audit_id
        WHERE l.event_id=p.financial_event_id
          AND a.group_id=p.group_id AND a.action='financial_event.posted'
          AND a.entity_id=p.financial_event_id) AS audit_verified
    FROM public.payments p JOIN public.relief_plans rp
      ON rp.id=p.relief_plan_id AND rp.group_id=p.group_id
    WHERE p.group_id=p_group
    ORDER BY p.recorded_at DESC,p.id DESC LIMIT 40
  ) x;
  RETURN v_result;
END
$$;
REVOKE ALL ON FUNCTION public.list_owner_relief_receipts(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_owner_relief_receipts(uuid)
  TO authenticated;
