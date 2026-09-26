-- R-009 / Security Revision 2 FCG-1: one linked settlement per Relief receipt.
-- The settlement, both F3 effects where applicable, and their server audit
-- records execute in the same database transaction.
BEGIN;
CREATE OR REPLACE FUNCTION public.settle_relief_receipt(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.payments%ROWTYPE;
  v_link financial_core.relief_agency_receipts%ROWTYPE;
  v_settlement financial_core.relief_credit_settlements%ROWTYPE;
  v_plan public.relief_plans%ROWTYPE;
  v_owner uuid; v_custodian uuid; v_account uuid; v_fund uuid;
  v_original_fund uuid; v_category uuid; v_actor uuid;
  v_action text; v_effect text; v_when timestamptz;
  v_result jsonb; v_owner_event uuid; v_branch_event uuid;
  v_remitted numeric; v_owner_refunded numeric; v_custody_balance numeric;
BEGIN
  IF auth.uid() IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
    OR p_command->>'payment_id' IS NULL
    OR p_command->>'action' NOT IN ('recognize','refund')
    OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_command) k
      WHERE k NOT IN ('payment_id','action','category_id','custodian_group_id',
        'account_id','fund_id'))
  THEN RAISE EXCEPTION 'INVALID_RELIEF_SETTLEMENT_COMMAND'; END IF;
  v_action:=p_command->>'action';
  SELECT * INTO v_payment FROM public.payments
    WHERE id=(p_command->>'payment_id')::uuid FOR UPDATE;
  IF v_payment.id IS NULL OR v_payment.relief_plan_id IS NULL
    OR v_payment.status<>'confirmed' OR v_payment.financial_event_id IS NULL
    OR v_payment.cash_class NOT IN ('refundable','conditional')
    OR v_payment.obligation_id IS NOT NULL
    OR NOT EXISTS (SELECT 1 FROM financial_core.financial_event_audit_links a
      WHERE a.event_id=v_payment.financial_event_id)
  THEN RAISE EXCEPTION 'RELIEF_SETTLEMENT_RECEIPT_INVALID'; END IF;
  SELECT * INTO v_plan FROM public.relief_plans
    WHERE id=v_payment.relief_plan_id FOR UPDATE;
  IF v_plan.id IS NULL THEN RAISE EXCEPTION 'RELIEF_PLAN_NOT_FOUND'; END IF;
  v_owner:=v_plan.group_id;
  SELECT * INTO v_link FROM financial_core.relief_agency_receipts
    WHERE payment_id=v_payment.id FOR UPDATE;
  IF v_payment.group_id<>v_owner THEN
    IF v_link.payment_id IS NULL OR v_link.plan_id<>v_plan.id
      OR v_link.branch_group_id<>v_payment.group_id
      OR v_link.owner_group_id<>v_owner OR v_link.owner_event_id IS NULL
      OR v_link.branch_event_id IS DISTINCT FROM v_payment.financial_event_id
      OR NOT EXISTS (SELECT 1 FROM financial_core.financial_event_audit_links a
        WHERE a.event_id=v_link.owner_event_id)
    THEN RAISE EXCEPTION 'RELIEF_AGENCY_SETTLEMENT_UNACKNOWLEDGED'; END IF;
  ELSIF v_link.payment_id IS NOT NULL THEN
    RAISE EXCEPTION 'RELIEF_SETTLEMENT_SCOPE_CONFLICT';
  END IF;
  SELECT * INTO v_settlement FROM financial_core.relief_credit_settlements
    WHERE payment_id=v_payment.id FOR UPDATE;
  IF v_settlement.payment_id IS NOT NULL AND v_settlement.action<>v_action
  THEN RAISE EXCEPTION 'RELIEF_SETTLEMENT_ALREADY_DECIDED'; END IF;
  IF v_payment.settlement_status NOT IN ('open',
      CASE WHEN v_action='recognize' THEN 'recognized' ELSE 'refunded' END)
    OR (v_settlement.payment_id IS NULL AND v_payment.settlement_status<>'open')
    OR (v_settlement.payment_id IS NOT NULL AND v_payment.settlement_status='open')
  THEN RAISE EXCEPTION 'RELIEF_SETTLEMENT_STATE_CONFLICT'; END IF;
  v_fund:=(p_command->>'fund_id')::uuid;
  v_account:=(p_command->>'account_id')::uuid;
  v_category:=(p_command->>'category_id')::uuid;
  v_custodian:=(p_command->>'custodian_group_id')::uuid;
  IF v_link.payment_id IS NULL THEN
    SELECT (payload.canonical_payload->>'fund_id')::uuid INTO v_original_fund
    FROM financial_core.posting_command_payloads payload
    WHERE payload.event_id=v_payment.financial_event_id;
  ELSE
    SELECT (payload.canonical_payload->>'fund_id')::uuid INTO v_original_fund
    FROM financial_core.posting_command_payloads payload
    WHERE payload.event_id=v_link.owner_event_id;
  END IF;
  IF v_original_fund IS NULL THEN RAISE EXCEPTION 'RELIEF_SETTLEMENT_FUND_MISSING'; END IF;
  IF v_action='recognize' THEN
    v_actor:=financial_core.assert_finances_manage(v_owner);
    IF v_custodian IS NOT NULL OR v_account IS NOT NULL
      OR v_fund IS DISTINCT FROM v_original_fund
      OR v_category IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.financial_categories c
        WHERE c.id=v_category AND c.group_id=v_owner
          AND c.category_class='income'
          AND (v_settlement.payment_id IS NOT NULL OR c.status='active'))
    THEN RAISE EXCEPTION 'RELIEF_RECOGNITION_DIMENSION_CONFLICT'; END IF;
    v_effect:=CASE WHEN v_link.payment_id IS NULL
      THEN 'owner_liability_recognize' ELSE 'agency_liability_recognize' END;
    v_when:=coalesce(v_payment.recognized_at,transaction_timestamp());
    IF v_settlement.payment_id IS NULL THEN
      UPDATE public.payments SET recognized_at=v_when WHERE id=v_payment.id;
    END IF;
    v_result:=financial_core.post_module_pair(v_owner,'relief',v_payment.id::text,
      v_effect,v_payment.amount,v_payment.currency,NULL,v_category,
      v_original_fund,NULL,v_when,'Relief conditional cash recognized');
    v_owner_event:=(v_result->>'event_id')::uuid;
  ELSE
    IF v_category IS NOT NULL OR v_account IS NULL OR v_fund IS NULL
      OR v_custodian NOT IN (v_owner,v_payment.group_id)
    THEN RAISE EXCEPTION 'RELIEF_REFUND_DIMENSION_CONFLICT'; END IF;
    v_actor:=financial_core.assert_finances_manage(v_custodian);
    IF NOT EXISTS (SELECT 1 FROM public.financial_accounts a
      WHERE a.id=v_account AND a.group_id=v_custodian
        AND a.currency=v_payment.currency
        AND a.kind IN ('bank','cash','mobile_money','wallet')
        AND (v_settlement.payment_id IS NOT NULL OR a.status='active'))
      OR NOT EXISTS (SELECT 1 FROM public.financial_funds f
        WHERE f.id=v_fund AND f.group_id=v_custodian AND f.is_restricted
          AND (v_settlement.payment_id IS NOT NULL OR f.status='active'))
    THEN RAISE EXCEPTION 'RELIEF_REFUND_ACCOUNT_OR_FUND_INVALID'; END IF;
    IF v_custodian=v_owner THEN
      IF v_fund IS DISTINCT FROM v_original_fund
      THEN RAISE EXCEPTION 'RELIEF_REFUND_FUND_CONFLICT'; END IF;
    ELSE
      IF v_link.payment_id IS NULL OR v_link.branch_group_id<>v_custodian
        OR v_account IS DISTINCT FROM v_payment.financial_account_id
        OR v_fund IS DISTINCT FROM (
          SELECT (payload.canonical_payload->>'fund_id')::uuid
          FROM financial_core.posting_command_payloads payload
          WHERE payload.event_id=v_link.branch_event_id)
      THEN RAISE EXCEPTION 'RELIEF_BRANCH_REFUND_SOURCE_CONFLICT'; END IF;
    END IF;
    IF v_settlement.payment_id IS NULL THEN
      -- A refund is paid by the selected current cash custodian. Serialize
      -- refunds on its account with the F3 account row lock and check the
      -- actual restricted-fund custody postings, not just plan-level totals.
      PERFORM 1 FROM public.financial_accounts a
        WHERE a.id=v_account FOR UPDATE;
      SELECT coalesce(sum(posting.amount_signed),0)
        INTO v_custody_balance
      FROM public.financial_postings posting
      WHERE posting.group_id=v_custodian
        AND posting.account_id=v_account AND posting.fund_id=v_fund
        AND posting.currency=v_payment.currency
        AND posting.control_class='custody';
      IF v_custody_balance<v_payment.amount
      THEN RAISE EXCEPTION 'RELIEF_REFUND_CUSTODY_INSUFFICIENT'; END IF;
      IF v_custodian=v_owner AND v_link.payment_id IS NOT NULL THEN
        -- An owner-side refund requires confirmed agency cash in that same
        -- custody account/fund; pending remittance is still branch cash.
        SELECT coalesce(sum(r.amount),0) INTO v_remitted
        FROM public.relief_remittances r
        WHERE r.relief_plan_id=v_plan.id
          AND r.branch_group_id=v_link.branch_group_id
          AND r.owner_group_id=v_owner AND r.owner_event_id IS NOT NULL
          AND r.owner_account_id=v_account AND r.owner_fund_id=v_fund;
        SELECT coalesce(sum(payment.amount),0) INTO v_owner_refunded
        FROM financial_core.relief_credit_settlements s
        JOIN public.payments payment ON payment.id=s.payment_id
        JOIN financial_core.relief_agency_receipts link
          ON link.payment_id=s.payment_id
        JOIN financial_core.posting_command_payloads payload
          ON payload.event_id=s.owner_effect_event_id
        WHERE s.action='refund' AND s.payer_group_id=v_owner
          AND link.plan_id=v_plan.id
          AND link.branch_group_id=v_link.branch_group_id
          AND payload.canonical_payload->>'account_id'=v_account::text
          AND payload.canonical_payload->>'fund_id'=v_fund::text;
        IF v_remitted-v_owner_refunded<v_payment.amount
        THEN RAISE EXCEPTION 'RELIEF_OWNER_CUSTODY_INSUFFICIENT'; END IF;
      ELSIF v_custodian<>v_owner THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
          'relief-agency-reserve/'||v_plan.id::text||'/'||v_custodian::text,0));
        IF v_payment.amount>financial_core.relief_agency_available(
            v_plan.id,v_custodian,v_owner,NULL)
          OR v_payment.amount>financial_core.relief_agency_available(
            v_plan.id,v_custodian,v_owner,v_fund)
        THEN RAISE EXCEPTION 'RELIEF_BRANCH_CUSTODY_INSUFFICIENT'; END IF;
      END IF;
      v_when:=transaction_timestamp();
      UPDATE public.payments SET refunded_at=v_when WHERE id=v_payment.id;
    ELSE v_when:=v_payment.refunded_at;
    END IF;
    IF v_custodian=v_owner THEN
      v_result:=financial_core.post_module_pair(v_owner,'relief',
        v_payment.id::text,'owner_liability_refund',v_payment.amount,
        v_payment.currency,v_account,NULL,v_fund,NULL,v_when,
        'Relief conditional cash refunded by owner');
      v_owner_event:=(v_result->>'event_id')::uuid;
    ELSE
      v_result:=financial_core.post_module_pair(v_custodian,'relief',
        v_payment.id::text,'agency_refund_out',v_payment.amount,
        v_payment.currency,v_account,NULL,v_fund,NULL,v_when,
        'Relief conditional cash refunded by branch');
      v_branch_event:=(v_result->>'event_id')::uuid;
      v_result:=financial_core.post_module_pair(v_owner,'relief',
        v_payment.id::text,'agency_refund_owner',v_payment.amount,
        v_payment.currency,NULL,NULL,v_original_fund,NULL,v_when,
        'Relief agency liability and receivable settled by branch refund');
      v_owner_event:=(v_result->>'event_id')::uuid;
    END IF;
  END IF;
  IF v_owner_event IS NULL OR
    (v_settlement.payment_id IS NOT NULL AND
      (v_settlement.owner_effect_event_id IS DISTINCT FROM v_owner_event
        OR v_settlement.branch_effect_event_id IS DISTINCT FROM v_branch_event
        OR v_settlement.payer_group_id IS DISTINCT FROM
          CASE WHEN v_action='refund' THEN v_custodian ELSE NULL END))
  THEN RAISE EXCEPTION 'RELIEF_SETTLEMENT_REPLAY_CONFLICT'; END IF;
  IF v_settlement.payment_id IS NULL THEN
    INSERT INTO financial_core.relief_credit_settlements
      (payment_id,action,receipt_event_id,owner_initial_event_id,
       owner_effect_event_id,branch_effect_event_id,payer_group_id,
       actor_id,settled_at)
    VALUES(v_payment.id,v_action,v_payment.financial_event_id,
      v_link.owner_event_id,v_owner_event,v_branch_event,
      CASE WHEN v_action='refund' THEN v_custodian ELSE NULL END,
      v_actor,v_when);
    UPDATE public.payments SET
      settlement_status=CASE WHEN v_action='recognize' THEN 'recognized'
        ELSE 'refunded' END,
      recognition_event_id=CASE WHEN v_action='recognize' THEN v_owner_event
        ELSE recognition_event_id END,
      refund_event_id=CASE WHEN v_action='refund' THEN v_owner_event
        ELSE refund_event_id END,
      updated_at=now()
    WHERE id=v_payment.id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('decision',
    CASE WHEN v_settlement.payment_id IS NULL THEN 'POSTED'
      ELSE 'IDEMPOTENT_RETURN_EXISTING' END,
    'payment_id',v_payment.id,'receipt_event_id',v_payment.financial_event_id,
    'owner_effect_event_id',v_owner_event,
    'branch_effect_event_id',v_branch_event,
    'settlement_status',CASE WHEN v_action='recognize' THEN 'recognized'
      ELSE 'refunded' END);
END
$$;
REVOKE ALL ON FUNCTION public.settle_relief_receipt(jsonb)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.settle_relief_receipt(jsonb)
  TO authenticated;

-- Server-authoritative settlement state for the mounted recovery controls.
CREATE OR REPLACE FUNCTION public.list_owner_relief_receipts(p_group uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM financial_core.assert_finances_manage(p_group);
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
    ORDER BY x.recorded_at DESC,x.id DESC),'[]'::jsonb)
  INTO v_result FROM (
    SELECT p.id,p.amount,p.currency,p.status,p.financial_event_id,
      p.relief_plan_id,p.membership_id,p.cash_class,p.settlement_status,
      p.recorded_at,
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

CREATE OR REPLACE FUNCTION public.list_branch_relief_receipts(p_branch uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM financial_core.assert_finances_manage(p_branch);
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x)
    ORDER BY x.recorded_at DESC,x.id DESC),'[]'::jsonb)
  INTO v_result FROM (
    SELECT p.id,p.amount,p.currency,p.status,p.cash_class,
      p.settlement_status,p.relief_plan_id,p.membership_id,
      p.financial_event_id,p.recorded_at,
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
      p.cash_class,p.settlement_status,
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
COMMIT;
