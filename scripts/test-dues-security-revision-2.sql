-- F4-002/FCG-1 transactional local probe on production S0/M2 schema.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a501','dues-officer@example.test'),
 ('00000000-0000-4000-8000-00000000a502','dues-member@example.test'),
 ('00000000-0000-4000-8000-00000000a503','other-actor@example.test');
INSERT INTO public.groups(id,name,currency) VALUES
 ('00000000-0000-4000-8000-00000000b501','Fictional Dues','USD'),
 ('00000000-0000-4000-8000-00000000b502','Other Group','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status)
VALUES
 ('00000000-0000-4000-8000-00000000c501',
  '00000000-0000-4000-8000-00000000a501',
  '00000000-0000-4000-8000-00000000b501','admin','active'),
 ('00000000-0000-4000-8000-00000000c502',
  '00000000-0000-4000-8000-00000000a502',
  '00000000-0000-4000-8000-00000000b501','member','active'),
 ('00000000-0000-4000-8000-00000000c503',
  '00000000-0000-4000-8000-00000000a503',
  '00000000-0000-4000-8000-00000000b502','admin','active');
INSERT INTO public.financial_ledger_epochs
 (id,group_id,currency,effective_from,source_kind,approval_note)
VALUES ('00000000-0000-4000-8000-00000000d501',
 '00000000-0000-4000-8000-00000000b501','USD','2020-01-01',
 'cutover','Fictional dues epoch');
INSERT INTO public.financial_accounts
 (id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at)
VALUES ('00000000-0000-4000-8000-00000000e501',
 '00000000-0000-4000-8000-00000000b501',
 '00000000-0000-4000-8000-00000000d501','USD',
 'Fictional Cash','cash','2020-01-01');
INSERT INTO public.financial_funds(id,group_id,name,is_default,is_restricted)
VALUES ('00000000-0000-4000-8000-00000000f501',
 '00000000-0000-4000-8000-00000000b501','General',true,false);
INSERT INTO public.financial_categories(id,group_id,name,category_class)
VALUES ('00000000-0000-4000-8000-00000000f502',
 '00000000-0000-4000-8000-00000000b501','Dues Income','income');
INSERT INTO public.contribution_types
 (id,group_id,name,amount,currency,frequency,enroll_all_members)
VALUES ('00000000-0000-4000-8000-00000000a504',
 '00000000-0000-4000-8000-00000000b501','Dues',60,'USD',
 'one_time',false);
INSERT INTO public.contribution_obligations
 (id,contribution_type_id,membership_id,group_id,amount,currency,due_date)
VALUES
 ('00000000-0000-4000-8000-00000000a505',
  '00000000-0000-4000-8000-00000000a504',
  '00000000-0000-4000-8000-00000000c502',
  '00000000-0000-4000-8000-00000000b501',60,'USD','2026-09-01'),
 ('00000000-0000-4000-8000-00000000a506',
  '00000000-0000-4000-8000-00000000a504',
  '00000000-0000-4000-8000-00000000c502',
  '00000000-0000-4000-8000-00000000b501',40,'USD','2026-10-01');
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a501',true);
SET LOCAL ROLE authenticated;
SELECT public.prepare_dues_record_intent(jsonb_build_object(
 'request_id','00000000-0000-4000-8000-00000000a507',
 'group_id','00000000-0000-4000-8000-00000000b501',
 'membership_id','00000000-0000-4000-8000-00000000c502',
 'contribution_type_id','00000000-0000-4000-8000-00000000a504',
 'obligation_id','00000000-0000-4000-8000-00000000a505',
 'amount','100.00','currency','USD','payment_method','cash',
 'recorded_at','2026-09-01T00:00:00Z','cash_class','non_refundable',
 'account_id','00000000-0000-4000-8000-00000000e501',
 'category_id','00000000-0000-4000-8000-00000000f502'
)) AS prepared;
SELECT public.post_dues_record_intent(
 '00000000-0000-4000-8000-00000000a507') AS posted;
SELECT public.post_dues_record_intent(
 '00000000-0000-4000-8000-00000000a507') AS retry;
DO $test$
DECLARE v_payment uuid; v_result jsonb; v_denied boolean:=false;
BEGIN
  v_payment:=(public.list_dues_record_intents(
    '00000000-0000-4000-8000-00000000b501')->0->>'payment_id')::uuid;
  PERFORM public.prepare_dues_allocation_intent(
    '00000000-0000-4000-8000-00000000a513',v_payment,
    '00000000-0000-4000-8000-00000000a506',40);
  v_result:=public.apply_dues_allocation(
    '00000000-0000-4000-8000-00000000a513');
  IF v_result->>'decision'<>'APPLIED' THEN RAISE EXCEPTION 'ALLOCATION_FIRST'; END IF;
  v_result:=public.apply_dues_allocation(
    '00000000-0000-4000-8000-00000000a513');
  IF v_result->>'decision'<>'ALREADY_APPLIED'
    OR public.list_dues_allocation_intents(v_payment)->0->>'status'<>'applied'
    THEN RAISE EXCEPTION 'ALLOCATION_RETRY_DUPLICATED'; END IF;
  BEGIN
    PERFORM public.prepare_dues_allocation_intent(
      '00000000-0000-4000-8000-00000000a513',v_payment,
      '00000000-0000-4000-8000-00000000a506',39);
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ALLOCATION_CHANGED_PAYLOAD_ACCEPTED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_payment uuid; v_count int;
BEGIN
  SELECT payment_id INTO v_payment FROM financial_core.dues_record_intents
    WHERE request_id='00000000-0000-4000-8000-00000000a507';
  IF (SELECT count(*) FROM public.financial_events
      WHERE source_module='dues' AND source_record_id=v_payment::text)<>1
    OR (SELECT count(*) FROM public.financial_postings p
      JOIN public.financial_events e ON e.id=p.event_id
      WHERE e.source_module='dues' AND e.source_record_id=v_payment::text)<>2
    OR (SELECT amount_paid FROM public.contribution_obligations
      WHERE id='00000000-0000-4000-8000-00000000a505')<>60
    OR (SELECT sum(amount_applied) FROM public.payment_obligation_applications
      WHERE payment_id=v_payment)<>100
  THEN RAISE EXCEPTION 'NONREFUNDABLE_RECEIPT_OR_ALLOCATION_FAIL paid=% paid2=% apps=%',
    (SELECT amount_paid FROM public.contribution_obligations WHERE id='00000000-0000-4000-8000-00000000a505'),
    (SELECT amount_paid FROM public.contribution_obligations WHERE id='00000000-0000-4000-8000-00000000a506'),
    (SELECT sum(amount_applied) FROM public.payment_obligation_applications WHERE payment_id=v_payment); END IF;
  IF (SELECT count(*) FROM public.financial_events
      WHERE source_module='dues' AND source_record_id=v_payment::text)<>1
    OR (SELECT amount_paid FROM public.contribution_obligations
      WHERE id='00000000-0000-4000-8000-00000000a506')<>40
  THEN RAISE EXCEPTION 'LATER_ALLOCATION_REPOSTED'; END IF;
  SELECT count(*) INTO v_count FROM financial_core.financial_event_audit_links l
    JOIN public.financial_events e ON e.id=l.event_id
    WHERE e.source_module='dues' AND e.source_record_id=v_payment::text;
  IF v_count<>1 THEN RAISE EXCEPTION 'AUDIT_LINK_FAIL'; END IF;
  RAISE NOTICE 'DUES_NONREFUNDABLE_PASS: receipt once, 60/40 allocation, one audit';
END
$test$;
INSERT INTO public.payments
 (id,group_id,membership_id,contribution_type_id,amount,currency,
  payment_method,recorded_by,recorded_at,status,cash_class)
VALUES
 ('00000000-0000-4000-8000-00000000a508',
  '00000000-0000-4000-8000-00000000b501',
  '00000000-0000-4000-8000-00000000c502',
  '00000000-0000-4000-8000-00000000a504',25,'USD','cash',
  '00000000-0000-4000-8000-00000000a501','2026-09-02',
  'pending_confirmation','refundable'),
 ('00000000-0000-4000-8000-00000000a509',
  '00000000-0000-4000-8000-00000000b501',
  '00000000-0000-4000-8000-00000000c502',
  '00000000-0000-4000-8000-00000000a504',30,'USD','cash',
  '00000000-0000-4000-8000-00000000a501','2026-09-03',
  'pending_confirmation','conditional'),
 ('00000000-0000-4000-8000-00000000a510',
  '00000000-0000-4000-8000-00000000b501',
  '00000000-0000-4000-8000-00000000c502',
  '00000000-0000-4000-8000-00000000a504',15,'USD','cash',
  '00000000-0000-4000-8000-00000000a501','2026-09-04',
  'pending_confirmation','non_refundable');
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.financial_events
    WHERE source_module='dues' AND source_record_id IN (
      '00000000-0000-4000-8000-00000000a508',
      '00000000-0000-4000-8000-00000000a509',
      '00000000-0000-4000-8000-00000000a510'))
  THEN RAISE EXCEPTION 'PENDING_POSTED'; END IF;
END
$test$;
SET LOCAL ROLE authenticated;
SELECT public.post_dues_payment_confirmation(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000a508',
 'account_id','00000000-0000-4000-8000-00000000e501',
 'cash_class','refundable')) AS refundable_receipt;
SELECT public.settle_dues_credit(
 '00000000-0000-4000-8000-00000000a508','refund',NULL) AS refund;
SELECT public.settle_dues_credit(
 '00000000-0000-4000-8000-00000000a508','refund',NULL) AS refund_retry;
SELECT public.post_dues_payment_confirmation(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000a509',
 'account_id','00000000-0000-4000-8000-00000000e501',
 'cash_class','conditional')) AS conditional_receipt;
SELECT public.settle_dues_credit(
 '00000000-0000-4000-8000-00000000a509','recognize',
 '00000000-0000-4000-8000-00000000f502') AS recognize;
SELECT public.settle_dues_credit(
 '00000000-0000-4000-8000-00000000a509','recognize',
 '00000000-0000-4000-8000-00000000f502') AS recognize_retry;
RESET ROLE;
DO $test$
DECLARE v_count int;
BEGIN
  IF (SELECT count(*) FROM public.financial_events
      WHERE source_module='dues' AND source_record_id IN (
        '00000000-0000-4000-8000-00000000a508',
        '00000000-0000-4000-8000-00000000a509'))<>4
    OR (SELECT count(*) FROM financial_core.dues_settlement_links)<>2
    OR (SELECT count(*) FROM financial_core.financial_event_audit_links l
      JOIN public.financial_events e ON e.id=l.event_id
      WHERE e.source_module='dues')<>5
  THEN RAISE EXCEPTION 'LIABILITY_SETTLEMENT_OR_AUDIT_FAIL'; END IF;
  SELECT count(*) INTO v_count FROM public.financial_postings p
  JOIN public.financial_events e ON e.id=p.event_id
  WHERE e.source_module='dues'
    AND e.source_record_id='00000000-0000-4000-8000-00000000a508'
    AND p.control_class='liability';
  IF v_count<>2 THEN RAISE EXCEPTION 'REFUND_LIABILITY_NOT_CLEARED'; END IF;
  RAISE NOTICE 'DUES_LIABILITY_PASS: refundable refund and conditional recognition each retain lineage, one audit per event';
END
$test$;
UPDATE public.payments SET status='rejected'
 WHERE id='00000000-0000-4000-8000-00000000a510';
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.financial_events
    WHERE source_record_id='00000000-0000-4000-8000-00000000a510')
  THEN RAISE EXCEPTION 'REJECTED_POSTED'; END IF;
  RAISE NOTICE 'DUES_PENDING_REJECTED_PASS: no canonical effect';
END
$test$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_command jsonb; v_denied boolean:=false;
BEGIN
  v_command:=public.list_dues_record_intents(
    '00000000-0000-4000-8000-00000000b501')->0->'command';
  BEGIN
    PERFORM public.prepare_dues_record_intent(
      jsonb_set(v_command,'{amount}','"101.00"'::jsonb));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CHANGED_PAYLOAD_ACCEPTED'; END IF;
  PERFORM public.prepare_dues_record_intent(jsonb_set(v_command,
    '{request_id}','"00000000-0000-4000-8000-00000000a511"'::jsonb));
  PERFORM public.post_dues_record_intent(
    '00000000-0000-4000-8000-00000000a511');
  RAISE NOTICE 'DUES_IDENTITY_PASS: changed payload conflicts, explicit second request posts';
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.financial_events
      WHERE source_module='dues' AND effect_kind='nonrefundable_receipt')<>2
  THEN RAISE EXCEPTION 'SECOND_RECEIPT_NOT_DISTINCT'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.memberships SET membership_status='suspended'
 WHERE id='00000000-0000-4000-8000-00000000c501';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a501',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_dues_record_intent(
      '00000000-0000-4000-8000-00000000a507');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_ACTOR_REPLAYED'; END IF;
  RAISE NOTICE 'DUES_REVOKED_ACTOR_PASS';
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a503',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_dues_record_intent(
      '00000000-0000-4000-8000-00000000a507');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_TENANT_REPLAYED'; END IF;
  RAISE NOTICE 'DUES_CROSS_TENANT_PASS';
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.memberships SET membership_status='active'
 WHERE id='00000000-0000-4000-8000-00000000c501';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a501',true);
SET LOCAL ROLE authenticated;
SELECT public.prepare_dues_record_intent(jsonb_set(
 (public.list_dues_record_intents(
   '00000000-0000-4000-8000-00000000b501')->0->'command'),
 '{request_id}','"00000000-0000-4000-8000-00000000a512"'::jsonb));
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    INSERT INTO public.group_audit_logs
      (group_id,actor_id,action,entity_type,description)
    VALUES('00000000-0000-4000-8000-00000000b501',auth.uid(),
      'financial_event.posted','financial_event','forged');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CLIENT_AUDIT_FORGERY_ACCEPTED'; END IF;
  RAISE NOTICE 'DUES_AUDIT_FORGERY_DENIED';
END
$test$;
RESET ROLE;
CREATE FUNCTION pg_temp.reject_dues_audit() RETURNS trigger
 LANGUAGE plpgsql AS $fn$
BEGIN
  IF new.action='financial_event.posted' THEN
    RAISE EXCEPTION 'INJECTED_DUES_AUDIT_FAILURE';
  END IF;
  RETURN new;
END
$fn$;
CREATE TRIGGER reject_dues_audit BEFORE INSERT ON public.group_audit_logs
 FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_dues_audit();
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_failed boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_dues_record_intent(
      '00000000-0000-4000-8000-00000000a512');
  EXCEPTION WHEN OTHERS THEN
    v_failed:=SQLERRM LIKE '%INJECTED_DUES_AUDIT_FAILURE%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'AUDIT_FAILURE_NOT_PROPAGATED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_payment uuid;
BEGIN
  SELECT payment_id INTO v_payment FROM financial_core.dues_record_intents
    WHERE request_id='00000000-0000-4000-8000-00000000a512';
  IF EXISTS (SELECT 1 FROM public.payments WHERE id=v_payment)
    OR EXISTS (SELECT 1 FROM public.financial_events
      WHERE source_module='dues' AND source_record_id=v_payment::text)
  THEN RAISE EXCEPTION 'AUDIT_FAILURE_LEFT_FINANCIAL_EFFECT'; END IF;
END
$test$;
DROP TRIGGER reject_dues_audit ON public.group_audit_logs;
SET LOCAL ROLE authenticated;
SELECT public.post_dues_record_intent(
 '00000000-0000-4000-8000-00000000a512') AS after_audit_failure_retry;
RESET ROLE;
DO $test$
DECLARE v_payment uuid;
BEGIN
  SELECT payment_id INTO v_payment FROM financial_core.dues_record_intents
    WHERE request_id='00000000-0000-4000-8000-00000000a512';
  IF (SELECT count(*) FROM public.financial_events
      WHERE source_module='dues' AND source_record_id=v_payment::text)<>1
    OR (SELECT count(*) FROM financial_core.financial_event_audit_links l
      JOIN public.financial_events e ON e.id=l.event_id
      WHERE e.source_module='dues' AND e.source_record_id=v_payment::text)<>1
  THEN RAISE EXCEPTION 'AUDIT_RETRY_DUPLICATED'; END IF;
  RAISE NOTICE 'DUES_AUDIT_ATOMIC_PASS: forced audit failure rolled back payment and event; retry posted once';
END
$test$;
ROLLBACK;
