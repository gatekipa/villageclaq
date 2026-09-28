-- F4-007 / FCG-1: a new loan repayment uses the durable request as the
-- source voucher; retry and changed payload cannot mint another source.
BEGIN;
ALTER TABLE public.groups DISABLE TRIGGER group_financial_epoch_bootstrap;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a981','loan-voucher-owner@example.test');
INSERT INTO public.groups(id,name,slug,currency) VALUES
 ('00000000-0000-4000-8000-00000000b981','Fictional Loan Voucher Group',
  'fictional-loan-voucher-group','USD');
ALTER TABLE public.groups ENABLE TRIGGER group_financial_epoch_bootstrap;
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status) VALUES
 ('00000000-0000-4000-8000-00000000c981',
  '00000000-0000-4000-8000-00000000a981',
  '00000000-0000-4000-8000-00000000b981','owner','active');
INSERT INTO public.group_subscriptions(group_id,tier,status) VALUES
 ('00000000-0000-4000-8000-00000000b981','starter','active');
INSERT INTO public.financial_ledger_epochs
 (id,group_id,currency,effective_from,source_kind,approval_note) VALUES
 ('00000000-0000-4000-8000-00000000d981',
  '00000000-0000-4000-8000-00000000b981','USD','2020-01-01',
  'cutover','Fictional loan voucher epoch');
INSERT INTO public.financial_accounts
 (id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at) VALUES
 ('00000000-0000-4000-8000-00000000e981',
  '00000000-0000-4000-8000-00000000b981',
  '00000000-0000-4000-8000-00000000d981','USD',
  'Fictional loan cash','cash','2020-01-01');
INSERT INTO public.financial_funds(id,group_id,name,is_default,is_restricted)
VALUES ('00000000-0000-4000-8000-00000000f981',
  '00000000-0000-4000-8000-00000000b981','Fictional General',true,false);
INSERT INTO public.loans
 (id,group_id,membership_id,amount_requested,amount_approved,
  total_repayable,total_repaid,status,currency) VALUES
 ('00000000-0000-4000-8000-00000000e982',
  '00000000-0000-4000-8000-00000000b981',
  '00000000-0000-4000-8000-00000000c981',100,100,100,0,'repaying','USD'),
 ('00000000-0000-4000-8000-00000000e984',
  '00000000-0000-4000-8000-00000000b981',
  '00000000-0000-4000-8000-00000000c981',12,12,12,0,'approved','USD');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a981',true);
DO $test$
DECLARE v_command jsonb; v_result jsonb; v_denied boolean:=false;
BEGIN
  v_command:=jsonb_build_object(
    'request_id','00000000-0000-4000-8000-00000000e983',
    'loan_id','00000000-0000-4000-8000-00000000e982',
    'account_id','00000000-0000-4000-8000-00000000e981',
    'amount',10,'payment_method','cash');
  v_result:=public.prepare_loan_repayment(v_command);
  IF v_result->>'repayment_id'<>'00000000-0000-4000-8000-00000000e983'
    OR (public.prepare_loan_repayment(v_command)->>'repayment_id')<>
      '00000000-0000-4000-8000-00000000e983'
  THEN RAISE EXCEPTION 'LOAN_VOUCHER_IDENTITY_FAILED'; END IF;
  BEGIN
    PERFORM public.prepare_loan_repayment(
      jsonb_set(v_command,'{amount}','11'::jsonb));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'LOAN_VOUCHER_PAYLOAD_CHANGED'; END IF;
  RAISE NOTICE 'LOAN_VOUCHER_PASS: source=request, retry same, changed payload conflict';
END
$test$;
DO $affected_callers$
DECLARE
  v_disbursement jsonb;
  v_disbursement_retry jsonb;
  v_prepared jsonb;
  v_posted jsonb;
  v_posted_retry jsonb;
  v_repayment uuid;
BEGIN
  v_disbursement:=public.post_loan_disbursement(jsonb_build_object(
    'loan_id','00000000-0000-4000-8000-00000000e984',
    'account_id','00000000-0000-4000-8000-00000000e981',
    'disbursed_at','2026-09-28T00:00:00Z'));
  v_disbursement_retry:=public.post_loan_disbursement(jsonb_build_object(
    'loan_id','00000000-0000-4000-8000-00000000e984',
    'account_id','00000000-0000-4000-8000-00000000e981',
    'disbursed_at','2026-09-28T00:00:00Z'));
  IF v_disbursement->>'decision'<>'DISBURSED'
     OR v_disbursement_retry->>'decision'<>'IDEMPOTENT_RETURN_EXISTING'
  THEN RAISE EXCEPTION 'LOAN_DISBURSEMENT_ENTRY_POINT_FAILED'; END IF;

  v_prepared:=public.prepare_loan_repayment(jsonb_build_object(
    'request_id','00000000-0000-4000-8000-00000000e985',
    'loan_id','00000000-0000-4000-8000-00000000e984',
    'account_id','00000000-0000-4000-8000-00000000e981',
    'amount',1,'payment_method','cash'));
  v_repayment:=(v_prepared->>'repayment_id')::uuid;
  v_posted:=public.post_loan_repayment(jsonb_build_object(
    'repayment_id',v_repayment));
  v_posted_retry:=public.post_loan_repayment(jsonb_build_object(
    'repayment_id',v_repayment));
  IF v_posted->>'decision'<>'REPAID'
     OR v_posted_retry->>'decision'<>'IDEMPOTENT_RETURN_EXISTING'
  THEN RAISE EXCEPTION 'LOAN_REPAYMENT_ENTRY_POINT_FAILED'; END IF;
END
$affected_callers$;
RESET ROLE;
DO $effects$
BEGIN
  IF (SELECT count(*) FROM public.financial_events
      WHERE source_module='loan'
        AND source_record_id IN (
          '00000000-0000-4000-8000-00000000e984',
          (SELECT id::text FROM public.loan_repayments
           WHERE request_id='00000000-0000-4000-8000-00000000e985')))<>2
  THEN RAISE EXCEPTION 'LOAN_ENTRY_POINT_EFFECT_COUNT_FAILED'; END IF;
END
$effects$;
ROLLBACK;
