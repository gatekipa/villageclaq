-- F4-002/003/004/005/007 and Security Revision 2 FCG-1.
-- The existing payment remains the operational source; each economic effect
-- uses its payment ID and a distinct fixed effect kind in canonical F3.
BEGIN;
ALTER TABLE public.payments
  ADD COLUMN cash_class text NOT NULL DEFAULT 'non_refundable'
    CHECK (cash_class IN ('non_refundable','refundable','conditional')),
  ADD COLUMN recognition_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  ADD COLUMN refund_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  ADD COLUMN recognized_at timestamptz,
  ADD COLUMN refunded_at timestamptz,
  ADD COLUMN settlement_status text NOT NULL DEFAULT 'open'
    CHECK (settlement_status IN ('open','recognized','refunded'));
ALTER TABLE public.payment_obligation_applications
  ADD CONSTRAINT payment_application_positive CHECK (amount_applied>0);
UPDATE public.payments SET settlement_status='recognized'
 WHERE financial_event_id IS NOT NULL;
REVOKE INSERT,UPDATE,DELETE ON public.payment_obligation_applications
 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.guard_dues_obligation_paid()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_user IN ('authenticated','anon')
    AND new.amount_paid IS DISTINCT FROM old.amount_paid
  THEN RAISE EXCEPTION 'OBLIGATION_PAID_SERVER_DERIVED'; END IF;
  RETURN new;
END
$$;
CREATE TRIGGER guard_dues_obligation_paid
 BEFORE UPDATE OF amount_paid ON public.contribution_obligations
 FOR EACH ROW EXECUTE FUNCTION public.guard_dues_obligation_paid();

-- Count confirmed allocations, not the unallocated remainder of a receipt.
-- Legacy confirmed payments without application rows preserve their original
-- obligation pointer until explicitly migrated into the application ledger.
CREATE OR REPLACE FUNCTION public.recalc_obligation_amount_paid(p_obligation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_total numeric; v_amount numeric; v_status public.obligation_status;
BEGIN
  IF p_obligation_id IS NULL THEN RETURN; END IF;
  SELECT COALESCE(sum(x.amount),0) INTO v_total FROM (
    SELECT a.amount_applied amount
    FROM public.payment_obligation_applications a
    JOIN public.payments p ON p.id=a.payment_id
    WHERE a.obligation_id=p_obligation_id AND p.status='confirmed'
      AND p.settlement_status='recognized'
    UNION ALL
    SELECT p.amount
    FROM public.payments p
    WHERE p.obligation_id=p_obligation_id AND p.status='confirmed'
      AND p.settlement_status='recognized'
      AND NOT EXISTS (SELECT 1 FROM public.payment_obligation_applications a
        WHERE a.payment_id=p.id)
  ) x;
  SELECT amount,status INTO v_amount,v_status
  FROM public.contribution_obligations WHERE id=p_obligation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.contribution_obligations SET amount_paid=v_total,
    status=CASE WHEN v_status='waived' THEN 'waived'
      WHEN v_amount>0 AND v_total>=v_amount THEN 'paid'
      WHEN v_total>0 THEN 'partial'
      WHEN v_status='overdue' THEN 'overdue'
      ELSE 'pending' END::public.obligation_status
  WHERE id=p_obligation_id;
END
$$;

CREATE OR REPLACE FUNCTION public.guard_posted_dues_material()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF old.financial_event_id IS NOT NULL AND (
     new.group_id IS DISTINCT FROM old.group_id
     OR new.membership_id IS DISTINCT FROM old.membership_id
     OR new.amount IS DISTINCT FROM old.amount
     OR new.currency IS DISTINCT FROM old.currency
     OR new.cash_class IS DISTINCT FROM old.cash_class
     OR new.payment_method IS DISTINCT FROM old.payment_method
     OR new.recorded_at IS DISTINCT FROM old.recorded_at
     OR new.payment_date IS DISTINCT FROM old.payment_date
     OR new.obligation_id IS DISTINCT FROM old.obligation_id
     OR new.contribution_type_id IS DISTINCT FROM old.contribution_type_id
     OR new.relief_plan_id IS DISTINCT FROM old.relief_plan_id
     OR new.financial_account_id IS DISTINCT FROM old.financial_account_id
     OR new.financial_event_id IS DISTINCT FROM old.financial_event_id
     OR new.status IS DISTINCT FROM old.status)
  THEN RAISE EXCEPTION 'POSTED_DUES_MATERIAL_IMMUTABLE'; END IF;
  IF current_user IN ('authenticated','anon') AND (
      new.group_id IS DISTINCT FROM old.group_id
      OR new.membership_id IS DISTINCT FROM old.membership_id
      OR new.amount IS DISTINCT FROM old.amount
      OR new.currency IS DISTINCT FROM old.currency
      OR new.cash_class IS DISTINCT FROM old.cash_class
      OR new.relief_plan_id IS DISTINCT FROM old.relief_plan_id
      OR new.obligation_id IS DISTINCT FROM old.obligation_id
      OR new.contribution_type_id IS DISTINCT FROM old.contribution_type_id
      OR new.payment_method IS DISTINCT FROM old.payment_method
      OR new.recorded_at IS DISTINCT FROM old.recorded_at
      OR new.payment_date IS DISTINCT FROM old.payment_date
      OR new.financial_event_id IS DISTINCT FROM old.financial_event_id
      OR new.financial_account_id IS DISTINCT FROM old.financial_account_id
      OR new.recognition_event_id IS DISTINCT FROM old.recognition_event_id
      OR new.refund_event_id IS DISTINCT FROM old.refund_event_id
      OR (old.status='confirmed' AND new.status IS DISTINCT FROM old.status))
  THEN RAISE EXCEPTION 'PAYMENT_EFFECT_SERVER_ONLY'; END IF;
  IF old.financial_event_id IS NOT NULL AND current_user NOT IN
    ('postgres','supabase_admin') AND (
      new.settlement_status IS DISTINCT FROM old.settlement_status
      OR new.recognition_event_id IS DISTINCT FROM old.recognition_event_id
      OR new.refund_event_id IS DISTINCT FROM old.refund_event_id)
  THEN RAISE EXCEPTION 'DUES_SETTLEMENT_SERVER_ONLY'; END IF;
  RETURN new;
END
$$;
CREATE TRIGGER guard_posted_dues_material BEFORE UPDATE ON public.payments
 FOR EACH ROW EXECUTE FUNCTION public.guard_posted_dues_material();
CREATE OR REPLACE FUNCTION public.guard_posted_dues_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF old.financial_event_id IS NOT NULL
  THEN RAISE EXCEPTION 'POSTED_DUES_DELETE_PROHIBITED'; END IF;
  RETURN old;
END
$$;
CREATE TRIGGER guard_posted_dues_delete BEFORE DELETE ON public.payments
 FOR EACH ROW EXECUTE FUNCTION public.guard_posted_dues_delete();

CREATE OR REPLACE FUNCTION public.guard_direct_dues_confirmation()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  -- Every confirmed receipt needs its owning domain's authoritative command.
  -- A Relief tag must not turn a direct client INSERT into unaudited cash.
  IF tg_op='INSERT' AND current_user IN ('authenticated','anon')
    AND (new.financial_event_id IS NOT NULL
      OR new.financial_account_id IS NOT NULL
      OR new.recognition_event_id IS NOT NULL
      OR new.refund_event_id IS NOT NULL)
  THEN RAISE EXCEPTION 'PAYMENT_EFFECT_SERVER_ONLY'; END IF;
  IF current_user IN ('authenticated','anon') AND new.status='confirmed' THEN
    IF tg_op='INSERT' THEN
      RAISE EXCEPTION 'PAYMENT_CONFIRMATION_REQUIRES_SERVER_COMMAND';
    ELSIF old.status IS DISTINCT FROM 'confirmed' THEN
      RAISE EXCEPTION 'PAYMENT_CONFIRMATION_REQUIRES_SERVER_COMMAND';
    END IF;
  END IF;
  RETURN new;
END
$$;
CREATE TRIGGER guard_direct_dues_confirmation
 BEFORE INSERT OR UPDATE OF status ON public.payments
 FOR EACH ROW EXECUTE FUNCTION public.guard_direct_dues_confirmation();

CREATE OR REPLACE FUNCTION public.post_dues_payment_confirmation(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.payments%ROWTYPE; v_account public.financial_accounts%ROWTYPE;
  v_type public.contribution_types%ROWTYPE; v_account_id uuid;
  v_category uuid; v_fund uuid; v_cash_class text; v_effect text;
  v_result jsonb; v_event uuid; v_applied numeric; v_obligation public.contribution_obligations%ROWTYPE;
  v_already numeric;
BEGIN
  IF pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
  THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
  SELECT * INTO v_payment FROM public.payments
    WHERE id=(p_command->>'payment_id')::uuid FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  PERFORM financial_core.assert_finances_manage(v_payment.group_id);
  IF v_payment.relief_plan_id IS NOT NULL
  THEN RAISE EXCEPTION 'PAYMENT_OWNED_BY_RELIEF'; END IF;
  IF v_payment.status='rejected' THEN RAISE EXCEPTION 'PAYMENT_ALREADY_REJECTED'; END IF;
  IF v_payment.status NOT IN ('pending_confirmation','confirmed')
  THEN RAISE EXCEPTION 'INVALID_PAYMENT_STATUS'; END IF;
  v_cash_class:=coalesce(p_command->>'cash_class',v_payment.cash_class);
  IF v_cash_class NOT IN ('non_refundable','refundable','conditional')
  THEN RAISE EXCEPTION 'INVALID_CASH_CLASS'; END IF;
  v_account_id:=(p_command->>'account_id')::uuid;
  SELECT * INTO v_account FROM public.financial_accounts
    WHERE id=v_account_id FOR SHARE;
  IF v_account.id IS NULL OR v_account.group_id<>v_payment.group_id
    OR v_account.currency<>v_payment.currency
    OR v_account.status<>'active'
    OR v_account.kind NOT IN ('bank','cash','mobile_money','wallet')
  THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND_OR_INACTIVE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.id=v_payment.membership_id AND m.group_id=v_payment.group_id)
  THEN RAISE EXCEPTION 'CROSS_GROUP_MEMBER'; END IF;
  IF v_payment.contribution_type_id IS NOT NULL THEN
    SELECT * INTO v_type FROM public.contribution_types
      WHERE id=v_payment.contribution_type_id;
    IF v_type.id IS NULL OR v_type.group_id<>v_payment.group_id
    THEN RAISE EXCEPTION 'CROSS_GROUP_CONTRIBUTION_TYPE'; END IF;
  END IF;
  v_category:=coalesce((p_command->>'category_id')::uuid,v_type.default_category_id);
  v_fund:=coalesce((p_command->>'fund_id')::uuid,v_type.default_fund_id);
  IF v_cash_class='non_refundable' AND v_category IS NULL THEN
    SELECT id INTO v_category FROM public.financial_categories
    WHERE group_id=v_payment.group_id AND category_class='income'
      AND status='active'
    ORDER BY (name ILIKE '%dues%' OR name ILIKE '%contribution%') DESC,
      created_at,id LIMIT 1;
  END IF;
  IF v_cash_class='non_refundable' AND v_category IS NULL
  THEN RAISE EXCEPTION 'INCOME_CATEGORY_REQUIRED'; END IF;
  IF v_payment.amount<=0 OR v_payment.amount<>
    round(v_payment.amount,financial_core.currency_scale(v_payment.currency))
  THEN RAISE EXCEPTION 'AMOUNT_PRECISION'; END IF;
  v_effect:=CASE WHEN v_cash_class='non_refundable'
    THEN 'nonrefundable_receipt' ELSE 'conditional_receipt' END;
  IF v_payment.financial_event_id IS NOT NULL AND (
    v_payment.cash_class<>v_cash_class
    OR v_payment.financial_account_id<>v_account_id)
  THEN RAISE EXCEPTION 'CONFLICT'; END IF;
  -- 00124 already posted some receipts with F3's former manual source.
  -- Those rows are cutover receipts, never a reason to create a second event.
  IF v_payment.financial_event_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.financial_events e
    WHERE e.id=v_payment.financial_event_id AND e.group_id=v_payment.group_id
      AND e.source_module<>'dues')
  THEN
    IF v_cash_class<>'non_refundable' THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    RETURN jsonb_build_object('decision','IDEMPOTENT_RETURN_EXISTING',
      'payment_id',v_payment.id,'financial_event_id',v_payment.financial_event_id,
      'posting_count',0,'cash_class',v_cash_class);
  END IF;
  IF v_payment.financial_event_id IS NULL THEN
    UPDATE public.payments SET cash_class=v_cash_class
      WHERE id=v_payment.id;
  END IF;
  v_result:=financial_core.post_module_pair(
    v_payment.group_id,'dues',v_payment.id::text,v_effect,v_payment.amount,
    v_payment.currency,v_account_id,
    CASE WHEN v_cash_class='non_refundable' THEN v_category ELSE NULL END,
    v_fund,v_payment.membership_id,v_payment.recorded_at,
    'Dues payment: '||coalesce(v_type.name,'Dues'));
  v_event:=(v_result->>'event_id')::uuid;
  IF v_event IS NULL THEN RAISE EXCEPTION 'POSTING_FAILED'; END IF;
  UPDATE public.payments SET status='confirmed',financial_event_id=v_event,
    financial_account_id=v_account_id,
    settlement_status=CASE WHEN v_cash_class='non_refundable'
      THEN 'recognized' ELSE 'open' END,updated_at=now()
  WHERE id=v_payment.id;
  IF v_payment.obligation_id IS NOT NULL
    AND v_cash_class='non_refundable'
    AND NOT EXISTS (SELECT 1 FROM public.payment_obligation_applications
      WHERE payment_id=v_payment.id)
  THEN
    SELECT * INTO v_obligation FROM public.contribution_obligations
      WHERE id=v_payment.obligation_id FOR UPDATE;
    IF v_obligation.id IS NULL OR v_obligation.group_id<>v_payment.group_id
      OR v_obligation.membership_id<>v_payment.membership_id
      OR v_obligation.currency<>v_payment.currency
    THEN RAISE EXCEPTION 'CROSS_GROUP_OBLIGATION'; END IF;
    SELECT COALESCE(sum(x.amount),0) INTO v_already FROM (
      SELECT a.amount_applied amount FROM public.payment_obligation_applications a
      JOIN public.payments p ON p.id=a.payment_id
      WHERE a.obligation_id=v_obligation.id AND p.id<>v_payment.id
        AND p.status='confirmed' AND p.settlement_status='recognized'
      UNION ALL
      SELECT p.amount FROM public.payments p
      WHERE p.obligation_id=v_obligation.id AND p.id<>v_payment.id
        AND p.status='confirmed' AND p.settlement_status='recognized'
        AND NOT EXISTS (SELECT 1 FROM public.payment_obligation_applications a
          WHERE a.payment_id=p.id)
    ) x;
    v_applied:=least(v_payment.amount,greatest(0,v_obligation.amount-v_already));
    IF v_applied>0 THEN
      INSERT INTO public.payment_obligation_applications
        (payment_id,obligation_id,amount_applied)
      VALUES(v_payment.id,v_obligation.id,v_applied);
    END IF;
    PERFORM public.recalc_obligation_amount_paid(v_obligation.id);
  END IF;
  RETURN jsonb_build_object('decision',v_result->>'decision',
    'payment_id',v_payment.id,'financial_event_id',v_event,
    'posting_count',coalesce((v_result->>'new_posting_count')::int,0),
    'cash_class',v_cash_class);
END
$$;
REVOKE ALL ON FUNCTION public.post_dues_payment_confirmation(jsonb)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_dues_payment_confirmation(jsonb)
 TO authenticated;

CREATE TABLE financial_core.dues_allocation_intents (
  request_id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  obligation_id uuid NOT NULL REFERENCES public.contribution_obligations(id) ON DELETE RESTRICT,
  amount numeric NOT NULL CHECK (amount>0),
  prepared_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);
ALTER TABLE financial_core.dues_allocation_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.dues_allocation_intents
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.prepare_dues_allocation_intent(
  p_request uuid,p_payment uuid,p_obligation uuid,p_amount numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.payments%ROWTYPE;
  v_existing financial_core.dues_allocation_intents%ROWTYPE;
BEGIN
  IF p_request IS NULL OR p_amount IS NULL OR p_amount<=0 THEN
    RAISE EXCEPTION 'INVALID_ALLOCATION_INTENT'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id=p_payment;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  PERFORM financial_core.assert_finances_manage(v_payment.group_id);
  IF v_payment.status<>'confirmed' OR v_payment.financial_event_id IS NULL
    OR v_payment.settlement_status<>'recognized' OR p_amount<>
      round(p_amount,financial_core.currency_scale(v_payment.currency))
    OR NOT EXISTS (SELECT 1 FROM public.contribution_obligations o
      WHERE o.id=p_obligation AND o.group_id=v_payment.group_id
        AND o.membership_id=v_payment.membership_id
        AND o.currency=v_payment.currency)
    THEN RAISE EXCEPTION 'INVALID_ALLOCATION_INTENT'; END IF;
  INSERT INTO financial_core.dues_allocation_intents
    (request_id,group_id,actor_id,payment_id,obligation_id,amount)
  VALUES(p_request,v_payment.group_id,auth.uid(),p_payment,p_obligation,p_amount)
  ON CONFLICT(request_id) DO NOTHING;
  SELECT * INTO v_existing FROM financial_core.dues_allocation_intents
    WHERE request_id=p_request;
  IF v_existing.group_id<>v_payment.group_id OR v_existing.actor_id<>auth.uid()
    OR v_existing.payment_id<>p_payment OR v_existing.obligation_id<>p_obligation
    OR v_existing.amount<>p_amount
    THEN RAISE EXCEPTION 'ALLOCATION_IDENTITY_CONFLICT'; END IF;
  RETURN jsonb_build_object('request_id',p_request,
    'status',CASE WHEN v_existing.applied_at IS NULL THEN 'prepared' ELSE 'applied' END);
END
$$;
REVOKE ALL ON FUNCTION public.prepare_dues_allocation_intent(uuid,uuid,uuid,numeric)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_dues_allocation_intent(uuid,uuid,uuid,numeric)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_dues_allocation_intents(p_payment uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_group uuid; v_items jsonb;
BEGIN
  SELECT group_id INTO v_group FROM public.payments WHERE id=p_payment;
  IF v_group IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  PERFORM financial_core.assert_finances_manage(v_group);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'request_id',i.request_id,'obligation_id',i.obligation_id,
    'amount',i.amount::text,'status',CASE WHEN i.applied_at IS NULL
      THEN 'prepared' ELSE 'applied' END) ORDER BY i.prepared_at DESC),
    '[]'::jsonb) INTO v_items
  FROM financial_core.dues_allocation_intents i
  WHERE i.payment_id=p_payment AND i.group_id=v_group AND i.actor_id=auth.uid();
  RETURN v_items;
END
$$;
REVOKE ALL ON FUNCTION public.list_dues_allocation_intents(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_dues_allocation_intents(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_dues_allocation(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_intent financial_core.dues_allocation_intents%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_obligation public.contribution_obligations%ROWTYPE;
  v_applied numeric;
BEGIN
  SELECT * INTO v_intent FROM financial_core.dues_allocation_intents
    WHERE request_id=p_request FOR UPDATE;
  IF v_intent.request_id IS NULL OR v_intent.actor_id<>auth.uid()
    THEN RAISE EXCEPTION 'ALLOCATION_INTENT_DENIED' USING ERRCODE='42501'; END IF;
  PERFORM financial_core.assert_finances_manage(v_intent.group_id);
  SELECT * INTO v_payment FROM public.payments
    WHERE id=v_intent.payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  PERFORM 1 FROM public.memberships m
    WHERE m.group_id=v_intent.group_id AND m.user_id=auth.uid() FOR SHARE;
  PERFORM financial_core.assert_finances_manage(v_intent.group_id);
  IF v_payment.group_id<>v_intent.group_id
    THEN RAISE EXCEPTION 'ALLOCATION_TENANT_CHANGED'; END IF;
  IF v_intent.applied_at IS NOT NULL THEN
    RETURN jsonb_build_object('applied',v_intent.amount,
      'payment_id',v_intent.payment_id,'obligation_id',v_intent.obligation_id,
      'financial_event_id',v_payment.financial_event_id,
      'new_financial_event_count',0,'decision','ALREADY_APPLIED');
  END IF;
  IF v_payment.status<>'confirmed' OR v_payment.financial_event_id IS NULL
     OR v_payment.settlement_status<>'recognized'
  THEN RAISE EXCEPTION 'CREDIT_NOT_RECOGNIZED'; END IF;
  SELECT * INTO v_obligation FROM public.contribution_obligations
    WHERE id=v_intent.obligation_id FOR UPDATE;
  IF v_obligation.id IS NULL OR v_obligation.group_id<>v_payment.group_id
    OR v_obligation.membership_id<>v_payment.membership_id
    OR v_obligation.currency<>v_payment.currency
  THEN RAISE EXCEPTION 'CROSS_GROUP_OBLIGATION'; END IF;
  SELECT COALESCE(sum(amount_applied),0) INTO v_applied
  FROM public.payment_obligation_applications WHERE payment_id=v_intent.payment_id;
  IF v_applied+v_intent.amount>v_payment.amount OR
     v_obligation.amount_paid+v_intent.amount>v_obligation.amount
  THEN RAISE EXCEPTION 'ALLOCATION_EXCEEDS_CREDIT_OR_OBLIGATION'; END IF;
  INSERT INTO public.payment_obligation_applications
    (payment_id,obligation_id,amount_applied)
  VALUES(v_intent.payment_id,v_intent.obligation_id,v_intent.amount)
  ON CONFLICT(payment_id,obligation_id) DO UPDATE
    SET amount_applied=public.payment_obligation_applications.amount_applied
      +excluded.amount_applied;
  PERFORM public.recalc_obligation_amount_paid(v_intent.obligation_id);
  UPDATE financial_core.dues_allocation_intents SET applied_at=now()
    WHERE request_id=p_request;
  RETURN jsonb_build_object('applied',v_intent.amount,
    'payment_id',v_intent.payment_id,'obligation_id',v_intent.obligation_id,
    'financial_event_id',v_payment.financial_event_id,
    'new_financial_event_count',0,'decision','APPLIED');
END
$$;
REVOKE ALL ON FUNCTION public.apply_dues_allocation(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_dues_allocation(uuid)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.get_dues_credit_balance(p_payment uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.payments%ROWTYPE; v_applied numeric;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id=p_payment;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  PERFORM financial_core.assert_finances_manage(v_payment.group_id);
  SELECT coalesce(sum(amount_applied),0) INTO v_applied
    FROM public.payment_obligation_applications WHERE payment_id=p_payment;
  RETURN jsonb_build_object('payment_id',p_payment,
    'unapplied_amount',(v_payment.amount-v_applied)::text,
    'currency',v_payment.currency,'settlement_status',v_payment.settlement_status);
END
$$;
REVOKE ALL ON FUNCTION public.get_dues_credit_balance(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_dues_credit_balance(uuid) TO authenticated;

CREATE TABLE financial_core.dues_settlement_links (
  effect_event_id uuid PRIMARY KEY REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  receipt_event_id uuid NOT NULL REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  effect_kind text NOT NULL CHECK (effect_kind IN ('condition_satisfied','credit_refund')),
  UNIQUE(payment_id,effect_kind)
);
ALTER TABLE financial_core.dues_settlement_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.dues_settlement_links FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.settle_dues_credit(
  p_payment uuid,p_action text,p_category uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.payments%ROWTYPE; v_effect text; v_when timestamptz;
  v_existing uuid; v_result jsonb; v_event uuid;
BEGIN
  SELECT * INTO v_payment FROM public.payments WHERE id=p_payment FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  PERFORM financial_core.assert_finances_manage(v_payment.group_id);
  IF v_payment.cash_class='non_refundable'
    OR v_payment.financial_event_id IS NULL OR v_payment.status<>'confirmed'
    OR p_action NOT IN ('recognize','refund')
  THEN RAISE EXCEPTION 'INVALID_DUES_SETTLEMENT'; END IF;
  IF p_action='recognize' THEN
    IF v_payment.settlement_status='refunded'
    THEN RAISE EXCEPTION 'CREDIT_ALREADY_REFUNDED'; END IF;
    IF p_category IS NULL OR NOT EXISTS (SELECT 1 FROM public.financial_categories c
      WHERE c.id=p_category AND c.group_id=v_payment.group_id
        AND c.category_class='income' AND c.status='active')
    THEN RAISE EXCEPTION 'INCOME_CATEGORY_REQUIRED'; END IF;
    v_effect:='condition_satisfied';
    v_when:=coalesce(v_payment.recognized_at,now());
    v_existing:=v_payment.recognition_event_id;
    IF v_existing IS NULL THEN
      UPDATE public.payments SET recognized_at=v_when WHERE id=p_payment;
    END IF;
  ELSE
    IF v_payment.settlement_status='recognized'
    THEN RAISE EXCEPTION 'CREDIT_ALREADY_RECOGNIZED'; END IF;
    IF EXISTS (SELECT 1 FROM public.payment_obligation_applications
      WHERE payment_id=p_payment)
    THEN RAISE EXCEPTION 'APPLIED_CREDIT_CANNOT_REFUND'; END IF;
    IF p_category IS NOT NULL THEN RAISE EXCEPTION 'CATEGORY_PROHIBITED'; END IF;
    v_effect:='credit_refund';
    v_when:=coalesce(v_payment.refunded_at,now());
    v_existing:=v_payment.refund_event_id;
    IF v_existing IS NULL THEN
      UPDATE public.payments SET refunded_at=v_when WHERE id=p_payment;
    END IF;
  END IF;
  v_result:=financial_core.post_module_pair(
    v_payment.group_id,'dues',v_payment.id::text,v_effect,v_payment.amount,
    v_payment.currency,v_payment.financial_account_id,p_category,NULL,
    v_payment.membership_id,v_when,
    CASE WHEN p_action='recognize' THEN 'Dues credit recognized'
         ELSE 'Dues credit refunded' END);
  v_event:=(v_result->>'event_id')::uuid;
  IF v_event IS NULL OR (v_existing IS NOT NULL AND v_existing<>v_event)
  THEN RAISE EXCEPTION 'DUES_SETTLEMENT_CONFLICT'; END IF;
  INSERT INTO financial_core.dues_settlement_links
    (effect_event_id,receipt_event_id,payment_id,effect_kind)
  VALUES(v_event,v_payment.financial_event_id,p_payment,v_effect)
  ON CONFLICT(effect_event_id) DO NOTHING;
  UPDATE public.payments SET
    recognition_event_id=CASE WHEN p_action='recognize' THEN v_event
      ELSE recognition_event_id END,
    refund_event_id=CASE WHEN p_action='refund' THEN v_event
      ELSE refund_event_id END,
    settlement_status=CASE WHEN p_action='recognize' THEN 'recognized'
      ELSE 'refunded' END WHERE id=p_payment;
  IF v_payment.obligation_id IS NOT NULL THEN
    PERFORM public.recalc_obligation_amount_paid(v_payment.obligation_id);
  END IF;
  RETURN jsonb_build_object('decision',v_result->>'decision',
    'receipt_event_id',v_payment.financial_event_id,
    'effect_event_id',v_event,'payment_id',p_payment);
END
$$;
REVOKE ALL ON FUNCTION public.settle_dues_credit(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.settle_dues_credit(uuid,text,uuid)
 TO authenticated;

-- The admin record path is one database transaction. The prepared command is
-- recoverable by the original actor on another device; a new request UUID is
-- the deliberate way to record an otherwise identical second cash receipt.
CREATE TABLE financial_core.dues_record_intents (
  request_id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  command jsonb NOT NULL CHECK (jsonb_typeof(command)='object'),
  posted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dues_record_intents_recovery
 ON financial_core.dues_record_intents(group_id,actor_id,created_at DESC);
ALTER TABLE financial_core.dues_record_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.dues_record_intents FROM PUBLIC,anon,authenticated,service_role;

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
  INSERT INTO financial_core.dues_record_intents
    (request_id,group_id,actor_id,command)
  VALUES(v_request,v_group,v_actor,p_command)
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
CREATE OR REPLACE FUNCTION public.list_dues_record_intents(p_group uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actor uuid; v_result jsonb;
BEGIN
  v_actor:=financial_core.assert_finances_manage(p_group);
  SELECT coalesce(jsonb_agg(x.item ORDER BY x.created_at DESC),'[]'::jsonb)
    INTO v_result FROM (
      SELECT i.created_at,jsonb_build_object(
        'request_id',i.request_id,'payment_id',i.payment_id,
        'command',i.command,'created_at',i.created_at,
        'status',CASE WHEN i.posted_at IS NULL THEN 'prepared'
          ELSE 'posted' END) item
      FROM financial_core.dues_record_intents i
      WHERE i.group_id=p_group AND i.actor_id=v_actor
      ORDER BY i.created_at DESC LIMIT 25
    ) x;
  RETURN v_result;
END
$$;
CREATE OR REPLACE FUNCTION public.post_dues_record_intent(p_request uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_intent financial_core.dues_record_intents%ROWTYPE;
  v_command jsonb; v_result jsonb; v_payment public.payments%ROWTYPE;
BEGIN
  SELECT * INTO v_intent FROM financial_core.dues_record_intents
    WHERE request_id=p_request FOR UPDATE;
  IF v_intent.request_id IS NULL OR v_intent.actor_id IS DISTINCT FROM auth.uid()
  THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.memberships m
    WHERE m.group_id=v_intent.group_id AND m.user_id=v_intent.actor_id FOR SHARE;
  PERFORM financial_core.assert_finances_manage(v_intent.group_id);
  v_command:=v_intent.command;
  IF v_intent.posted_at IS NOT NULL THEN
    SELECT * INTO v_payment FROM public.payments WHERE id=v_intent.payment_id;
    IF v_payment.id IS NULL OR v_payment.financial_event_id IS NULL
    THEN RAISE EXCEPTION 'DUES_INTENT_INTEGRITY'; END IF;
    RETURN jsonb_build_object('decision','IDEMPOTENT_RETURN_EXISTING',
      'payment_id',v_payment.id,'financial_event_id',v_payment.financial_event_id,
      'posting_count',0,'cash_class',v_payment.cash_class);
  END IF;
  IF (v_command->>'group_id')::uuid IS DISTINCT FROM v_intent.group_id
    OR NOT EXISTS (SELECT 1 FROM public.memberships m
      WHERE m.id=(v_command->>'membership_id')::uuid
        AND m.group_id=v_intent.group_id)
  THEN RAISE EXCEPTION 'CROSS_GROUP_MEMBER'; END IF;
  INSERT INTO public.payments
    (id,group_id,membership_id,contribution_type_id,obligation_id,
     amount,currency,payment_method,reference_number,receipt_url,notes,
     recorded_by,recorded_at,status,cash_class)
  VALUES(v_intent.payment_id,v_intent.group_id,
    (v_command->>'membership_id')::uuid,
    (v_command->>'contribution_type_id')::uuid,
    (v_command->>'obligation_id')::uuid,
    (v_command->>'amount')::numeric,v_command->>'currency',
    (v_command->>'payment_method')::public.payment_method,
    v_command->>'reference_number',v_command->>'receipt_url',
    v_command->>'notes',v_intent.actor_id,
    (v_command->>'recorded_at')::timestamptz,
    'pending_confirmation',v_command->>'cash_class');
  v_result:=public.post_dues_payment_confirmation(jsonb_build_object(
    'payment_id',v_intent.payment_id,'account_id',v_command->>'account_id',
    'category_id',v_command->>'category_id','fund_id',v_command->>'fund_id',
    'cash_class',v_command->>'cash_class'));
  UPDATE financial_core.dues_record_intents SET posted_at=now()
    WHERE request_id=p_request;
  RETURN v_result;
END
$$;
REVOKE ALL ON FUNCTION public.prepare_dues_record_intent(jsonb),
 public.list_dues_record_intents(uuid),public.post_dues_record_intent(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.prepare_dues_record_intent(jsonb),
 public.list_dues_record_intents(uuid),public.post_dues_record_intent(uuid)
 TO authenticated;
COMMIT;
