-- Founder observation: require an attributable reason and durable request identity
-- before the existing canonical refundable/conditional dues credit settlement.
BEGIN;

CREATE TABLE financial_core.dues_credit_refund_audits (
  request_id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  original_event_id uuid NOT NULL REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  refund_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE financial_core.dues_credit_refund_audits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.dues_credit_refund_audits FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.refund_dues_credit_with_reason(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_group uuid; v_payment_id uuid; v_request uuid; v_actor uuid; v_reason text;
  v_payment public.payments%ROWTYPE;
  v_bound financial_core.dues_credit_refund_audits%ROWTYPE;
  v_result jsonb; v_event uuid; v_audit uuid;
BEGIN
  IF auth.uid() IS NULL OR jsonb_typeof(p_command)<>'object'
    OR p_command->>'action'<>'refund_credit'
  THEN RAISE EXCEPTION 'INVALID_REFUND_COMMAND' USING ERRCODE='22023'; END IF;
  v_group:=(p_command->>'group_id')::uuid;
  v_payment_id:=(p_command->>'payment_id')::uuid;
  v_request:=(p_command->>'request_id')::uuid;
  v_reason:=btrim(p_command->>'reason');
  IF v_group IS NULL OR v_payment_id IS NULL OR v_request IS NULL
    OR length(v_reason) NOT BETWEEN 10 AND 1000
  THEN RAISE EXCEPTION 'INVALID_REFUND_COMMAND' USING ERRCODE='22023'; END IF;
  v_actor:=financial_core.assert_finances_manage(v_group);
  SELECT * INTO v_payment FROM public.payments
    WHERE id=v_payment_id AND group_id=v_group FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  SELECT * INTO v_bound FROM financial_core.dues_credit_refund_audits
    WHERE request_id=v_request FOR UPDATE;
  IF v_bound.request_id IS NOT NULL THEN
    IF v_bound.group_id IS DISTINCT FROM v_group
      OR v_bound.actor_id IS DISTINCT FROM v_actor
      OR v_bound.payment_id IS DISTINCT FROM v_payment_id
      OR v_bound.original_event_id IS DISTINCT FROM v_payment.financial_event_id
      OR v_bound.reason IS DISTINCT FROM v_reason
    THEN RAISE EXCEPTION 'REFUND_IDENTITY_CONFLICT'; END IF;
    PERFORM financial_core.assert_finances_manage(v_group);
    IF v_bound.refund_event_id IS NOT NULL
      AND v_payment.refund_event_id=v_bound.refund_event_id
      AND v_payment.settlement_status='refunded'
    THEN RETURN jsonb_build_object('decision','IDEMPOTENT_RETURN_EXISTING',
      'payment_id',v_payment_id,'original_event_id',v_bound.original_event_id,
      'refund_event_id',v_bound.refund_event_id); END IF;
    RAISE EXCEPTION 'REFUND_INTEGRITY';
  END IF;
  IF EXISTS (SELECT 1 FROM financial_core.dues_credit_refund_audits
    WHERE payment_id=v_payment_id)
  THEN RAISE EXCEPTION 'PAYMENT_ALREADY_REFUNDED'; END IF;
  IF v_payment.relief_plan_id IS NOT NULL OR v_payment.status<>'confirmed'
    OR v_payment.cash_class NOT IN ('refundable','conditional')
    OR v_payment.settlement_status<>'open'
    OR v_payment.financial_event_id IS NULL
    OR v_payment.refund_event_id IS NOT NULL
    OR v_payment.reversal_event_id IS NOT NULL
  THEN RAISE EXCEPTION 'PAYMENT_NOT_REFUNDABLE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.financial_events e
    WHERE e.id=v_payment.financial_event_id AND e.group_id=v_group
      AND e.status='posted' AND e.source_module='dues'
      AND e.source_record_id=v_payment.id::text
      AND e.effect_kind='conditional_receipt'
      AND e.currency=v_payment.currency)
  THEN RAISE EXCEPTION 'ORIGINAL_RECEIPT_INTEGRITY'; END IF;
  INSERT INTO financial_core.dues_credit_refund_audits
    (request_id,group_id,actor_id,payment_id,original_event_id,reason)
  VALUES (v_request,v_group,v_actor,v_payment_id,v_payment.financial_event_id,v_reason);
  PERFORM financial_core.assert_finances_manage(v_group);
  v_result:=public.settle_dues_credit(v_payment_id,'refund',NULL);
  v_event:=(v_result->>'effect_event_id')::uuid;
  IF v_event IS NULL OR NOT EXISTS (
    SELECT 1 FROM financial_core.financial_event_audit_links a WHERE a.event_id=v_event)
  THEN RAISE EXCEPTION 'REFUND_AUDIT_REQUIRED'; END IF;
  PERFORM public.recalculate_membership_standing(v_payment.membership_id);
  INSERT INTO public.group_audit_logs
    (group_id,actor_id,action,entity_type,entity_id,description,details)
  VALUES (v_group,v_actor,'dues_credit.refunded','payment',v_payment.id,
    'Dues credit refunded',jsonb_build_object(
      'reason',v_reason,'request_id',v_request,
      'original_event_id',v_payment.financial_event_id,'refund_event_id',v_event))
  RETURNING id INTO v_audit;
  UPDATE financial_core.dues_credit_refund_audits
    SET refund_event_id=v_event,completed_at=now() WHERE request_id=v_request;
  RETURN jsonb_build_object('decision','REFUNDED','payment_id',v_payment.id,
    'original_event_id',v_payment.financial_event_id,
    'refund_event_id',v_event,'audit_id',v_audit);
END
$$;
REVOKE ALL ON FUNCTION public.refund_dues_credit_with_reason(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.refund_dues_credit_with_reason(jsonb) TO authenticated;

COMMIT;
