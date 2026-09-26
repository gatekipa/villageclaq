-- R-009 / FCG-1: rollback-only, fictional actors on an S0/M2 upgrade.
\ir fixtures/relief-cash-base.sql
INSERT INTO public.payments(id,group_id,membership_id,amount,currency,
  payment_method,recorded_by,relief_plan_id,status,cash_class)
VALUES
 ('00000000-0000-4000-8000-00000000e811',
  '00000000-0000-4000-8000-00000000b802',
  '00000000-0000-4000-8000-00000000c803',30,'USD','cash',
  '00000000-0000-4000-8000-00000000a802',
  '00000000-0000-4000-8000-00000000d803','pending_confirmation','conditional'),
 ('00000000-0000-4000-8000-00000000e812',
  '00000000-0000-4000-8000-00000000b801',
  '00000000-0000-4000-8000-00000000c801',12,'USD','cash',
  '00000000-0000-4000-8000-00000000a801',
  '00000000-0000-4000-8000-00000000d803','pending_confirmation','refundable'),
 ('00000000-0000-4000-8000-00000000e813',
  '00000000-0000-4000-8000-00000000b802',
  '00000000-0000-4000-8000-00000000c803',20,'USD','cash',
  '00000000-0000-4000-8000-00000000a802',
  '00000000-0000-4000-8000-00000000d803','pending_confirmation','refundable'),
 ('00000000-0000-4000-8000-00000000e814',
  '00000000-0000-4000-8000-00000000b802',
  '00000000-0000-4000-8000-00000000c803',15,'USD','cash',
  '00000000-0000-4000-8000-00000000a802',
  '00000000-0000-4000-8000-00000000d803','pending_confirmation','conditional');

SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
SELECT public.post_branch_relief_receipt(jsonb_build_object(
 'payment_id',id,'account_id','00000000-0000-4000-8000-00000000e801',
 'fund_id','00000000-0000-4000-8000-00000000f802'))
FROM public.payments WHERE id IN (
 '00000000-0000-4000-8000-00000000e811',
 '00000000-0000-4000-8000-00000000e813',
 '00000000-0000-4000-8000-00000000e814') ORDER BY id;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a801',true);
SET LOCAL ROLE authenticated;
SELECT public.post_agency_owner_recognition(jsonb_build_object(
 'payment_id',ids.id,'fund_id','00000000-0000-4000-8000-00000000f801'))
FROM (VALUES
 ('00000000-0000-4000-8000-00000000e811'::uuid),
 ('00000000-0000-4000-8000-00000000e813'::uuid),
 ('00000000-0000-4000-8000-00000000e814'::uuid)) ids(id);
SELECT public.post_owner_relief_receipt(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e812',
 'account_id','00000000-0000-4000-8000-00000000e804',
 'fund_id','00000000-0000-4000-8000-00000000f801'));
RESET ROLE;
DO $test$
DECLARE v_branch numeric; v_owner numeric;
BEGIN
  SELECT sum(amount_signed) INTO v_branch FROM public.financial_postings
  WHERE control_class='liability' AND group_id=
    '00000000-0000-4000-8000-00000000b802';
  SELECT sum(amount_signed) INTO v_owner FROM public.financial_postings
  WHERE control_class='liability' AND group_id=
    '00000000-0000-4000-8000-00000000b801';
  IF v_branch<>-65 OR v_owner<>-77
  THEN RAISE EXCEPTION 'CONDITIONAL_CASH_INCOME_PREMATURE: %, %',
    v_branch,v_owner; END IF;
  IF financial_core.relief_agency_payout_available(
      '00000000-0000-4000-8000-00000000d803',
      '00000000-0000-4000-8000-00000000b802',
      '00000000-0000-4000-8000-00000000b801',
      '00000000-0000-4000-8000-00000000f802')<>0
    OR financial_core.relief_owner_payout_available(
      '00000000-0000-4000-8000-00000000d803',
      '00000000-0000-4000-8000-00000000b802',
      '00000000-0000-4000-8000-00000000b801',
      '00000000-0000-4000-8000-00000000f802',
      '00000000-0000-4000-8000-00000000f801')<>0
  THEN RAISE EXCEPTION 'UNRESOLVED_CASH_SPENDABLE_FOR_CLAIMS'; END IF;
END
$test$;
SET LOCAL ROLE authenticated;
SELECT public.settle_relief_receipt(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e811',
 'action','recognize','fund_id','00000000-0000-4000-8000-00000000f801',
 'category_id','00000000-0000-4000-8000-00000000f803'));
SELECT public.settle_relief_receipt(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e811',
 'action','recognize','fund_id','00000000-0000-4000-8000-00000000f801',
 'category_id','00000000-0000-4000-8000-00000000f803'));
SELECT public.settle_relief_receipt(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e812',
 'action','recognize','fund_id','00000000-0000-4000-8000-00000000f801',
 'category_id','00000000-0000-4000-8000-00000000f803'));
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.settle_relief_receipt(jsonb_build_object(
      'payment_id','00000000-0000-4000-8000-00000000e811',
      'action','refund','custodian_group_id',
      '00000000-0000-4000-8000-00000000b802',
      'account_id','00000000-0000-4000-8000-00000000e801',
      'fund_id','00000000-0000-4000-8000-00000000f802'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%ALREADY_DECIDED%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'SETTLEMENT_ACTION_REPLAY_CHANGED'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.settle_relief_receipt(jsonb_build_object(
      'payment_id','00000000-0000-4000-8000-00000000e811',
      'action','recognize',
      'fund_id','00000000-0000-4000-8000-00000000f807',
      'category_id','00000000-0000-4000-8000-00000000f803'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%DIMENSION_CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'SETTLEMENT_PAYLOAD_REPLAY_CHANGED'; END IF;
END
$test$;
RESET ROLE;

-- A failed audit on the second (owner) effect must roll back the branch cash
-- refund, the payment state, both events, and both success audit records.
CREATE FUNCTION pg_temp.reject_relief_refund_audit() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.action='financial_event.posted'
    AND NEW.details->>'effect_kind'='agency_refund_owner'
  THEN RAISE EXCEPTION 'INJECTED_RELIEF_REFUND_AUDIT_FAILURE'; END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER reject_relief_refund_audit
 BEFORE INSERT ON public.group_audit_logs FOR EACH ROW
 EXECUTE FUNCTION pg_temp.reject_relief_refund_audit();
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_failed boolean:=false;
BEGIN
  BEGIN
    PERFORM public.settle_relief_receipt(jsonb_build_object(
      'payment_id','00000000-0000-4000-8000-00000000e813',
      'action','refund','custodian_group_id',
      '00000000-0000-4000-8000-00000000b802',
      'account_id','00000000-0000-4000-8000-00000000e801',
      'fund_id','00000000-0000-4000-8000-00000000f802'));
  EXCEPTION WHEN OTHERS THEN
    v_failed:=SQLERRM LIKE '%INJECTED_RELIEF_REFUND_AUDIT_FAILURE%'; END;
  IF NOT v_failed THEN RAISE EXCEPTION 'REFUND_AUDIT_FAILURE_NOT_PROPAGATED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM financial_core.relief_credit_settlements
    WHERE payment_id='00000000-0000-4000-8000-00000000e813')
    OR EXISTS (SELECT 1 FROM public.financial_events
      WHERE source_record_id='00000000-0000-4000-8000-00000000e813'
        AND effect_kind IN ('agency_refund_out','agency_refund_owner'))
    OR (SELECT settlement_status FROM public.payments
      WHERE id='00000000-0000-4000-8000-00000000e813')<>'open'
  THEN RAISE EXCEPTION 'FAILED_REFUND_LEFT_FINANCIAL_EFFECT'; END IF;
END
$test$;
DROP TRIGGER reject_relief_refund_audit ON public.group_audit_logs;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
SELECT public.settle_relief_receipt(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e813',
 'action','refund','custodian_group_id',
 '00000000-0000-4000-8000-00000000b802',
 'account_id','00000000-0000-4000-8000-00000000e801',
 'fund_id','00000000-0000-4000-8000-00000000f802'));
SELECT public.settle_relief_receipt(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e813',
 'action','refund','custodian_group_id',
 '00000000-0000-4000-8000-00000000b802',
 'account_id','00000000-0000-4000-8000-00000000e801',
 'fund_id','00000000-0000-4000-8000-00000000f802'));
RESET ROLE;
DO $test$
BEGIN
  IF financial_core.relief_agency_payout_available(
      '00000000-0000-4000-8000-00000000d803',
      '00000000-0000-4000-8000-00000000b802',
      '00000000-0000-4000-8000-00000000b801',
      '00000000-0000-4000-8000-00000000f802')<>30
    OR financial_core.relief_owner_payout_available(
      '00000000-0000-4000-8000-00000000d803',
      '00000000-0000-4000-8000-00000000b802',
      '00000000-0000-4000-8000-00000000b801',
      '00000000-0000-4000-8000-00000000f802',
      '00000000-0000-4000-8000-00000000f801')<>30
  THEN RAISE EXCEPTION 'UNRESOLVED_REFUND_SPENT_RECOGNIZED_CASH'; END IF;
END
$test$;

-- Remit unresolved conditional cash first; the owner then becomes the
-- custodian and pays the linked refund without recognizing income.
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
SELECT public.submit_relief_remittance(jsonb_build_object(
 'request_id','00000000-0000-4000-8000-00000000e815',
 'branch_group_id','00000000-0000-4000-8000-00000000b802',
 'plan_id','00000000-0000-4000-8000-00000000d803',
 'account_id','00000000-0000-4000-8000-00000000e801',
 'fund_id','00000000-0000-4000-8000-00000000f802',
 'amount',15,'currency','USD','method','cash'));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a801',true);
SET LOCAL ROLE authenticated;
SELECT public.confirm_relief_remittance(jsonb_build_object(
 'remittance_id','00000000-0000-4000-8000-00000000e815',
 'account_id','00000000-0000-4000-8000-00000000e804',
 'fund_id','00000000-0000-4000-8000-00000000f801'));
SELECT public.settle_relief_receipt(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e814',
 'action','refund','custodian_group_id',
 '00000000-0000-4000-8000-00000000b801',
 'account_id','00000000-0000-4000-8000-00000000e804',
 'fund_id','00000000-0000-4000-8000-00000000f801'));
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT count(*) FROM financial_core.relief_credit_settlements)<>4
    OR (SELECT count(*) FROM public.financial_events
      WHERE source_module='relief' AND
        source_record_id='00000000-0000-4000-8000-00000000e813')<>4
    OR (SELECT count(*) FROM financial_core.financial_event_audit_links a
      JOIN public.financial_events e ON e.id=a.event_id
      WHERE e.source_module='relief' AND
        e.source_record_id IN (
          '00000000-0000-4000-8000-00000000e811',
          '00000000-0000-4000-8000-00000000e812',
          '00000000-0000-4000-8000-00000000e813',
          '00000000-0000-4000-8000-00000000e814'))<>12
  THEN RAISE EXCEPTION 'RELIEF_SETTLEMENT_DUPLICATE_OR_AUDIT_GAP'; END IF;
  RAISE NOTICE 'RELIEF_CASH_SETTLEMENT_PASS: conditional liability, recognition, branch/owner refunds, audit rollback and retry';
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a804',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.settle_relief_receipt(jsonb_build_object(
      'payment_id','00000000-0000-4000-8000-00000000e814',
      'action','refund','custodian_group_id',
      '00000000-0000-4000-8000-00000000b801',
      'account_id','00000000-0000-4000-8000-00000000e804',
      'fund_id','00000000-0000-4000-8000-00000000f801'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_TENANT_SETTLEMENT_REPLAY'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.memberships SET membership_status='suspended'
  WHERE id='00000000-0000-4000-8000-00000000c802';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.settle_relief_receipt(jsonb_build_object(
      'payment_id','00000000-0000-4000-8000-00000000e813',
      'action','refund','custodian_group_id',
      '00000000-0000-4000-8000-00000000b802',
      'account_id','00000000-0000-4000-8000-00000000e801',
      'fund_id','00000000-0000-4000-8000-00000000f802'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_SETTLEMENT_REPLAY'; END IF;
  RAISE NOTICE 'RELIEF_CASH_AUTH_PASS: cross-tenant and revoked replays denied';
END
$test$;
RESET ROLE;
ROLLBACK;
