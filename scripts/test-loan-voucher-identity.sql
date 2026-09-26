-- F4-007 / FCG-1: a new loan repayment uses the durable request as the
-- source voucher; retry and changed payload cannot mint another source.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a981','loan-voucher-owner@example.test');
INSERT INTO public.groups(id,name,slug,currency) VALUES
 ('00000000-0000-4000-8000-00000000b981','Fictional Loan Voucher Group',
  'fictional-loan-voucher-group','USD');
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
INSERT INTO public.loans
 (id,group_id,membership_id,amount_requested,amount_approved,
  total_repayable,total_repaid,status,currency) VALUES
 ('00000000-0000-4000-8000-00000000e982',
  '00000000-0000-4000-8000-00000000b981',
  '00000000-0000-4000-8000-00000000c981',100,100,100,0,'repaying','USD');
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
RESET ROLE;
ROLLBACK;
