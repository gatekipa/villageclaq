BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a701','relief-officer@example.test'),
 ('00000000-0000-4000-8000-00000000a702','relief-member@example.test'),
 ('00000000-0000-4000-8000-00000000a703','other-officer@example.test');
INSERT INTO public.groups(id,name,currency) VALUES
 ('00000000-0000-4000-8000-00000000b701','Fictional Relief','USD'),
 ('00000000-0000-4000-8000-00000000b702','Other Group','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status) VALUES
 ('00000000-0000-4000-8000-00000000c701',
  '00000000-0000-4000-8000-00000000a701',
  '00000000-0000-4000-8000-00000000b701','admin','active'),
 ('00000000-0000-4000-8000-00000000c702',
  '00000000-0000-4000-8000-00000000a702',
  '00000000-0000-4000-8000-00000000b701','member','active'),
 ('00000000-0000-4000-8000-00000000c703',
  '00000000-0000-4000-8000-00000000a703',
  '00000000-0000-4000-8000-00000000b702','admin','active');
INSERT INTO public.group_subscriptions(group_id,tier,status) VALUES
 ('00000000-0000-4000-8000-00000000b701','starter','active');
INSERT INTO public.relief_plans(id,group_id,name,created_by,
  is_active,status,currency) VALUES
 ('00000000-0000-4000-8000-00000000d701',
  '00000000-0000-4000-8000-00000000b701','Fictional Plan',
  '00000000-0000-4000-8000-00000000a701',true,'active','USD');
INSERT INTO public.relief_enrollments
 (plan_id,membership_id,group_id,status,is_active)
VALUES ('00000000-0000-4000-8000-00000000d701',
 '00000000-0000-4000-8000-00000000c702',
 '00000000-0000-4000-8000-00000000b701','active',true);
INSERT INTO public.financial_ledger_epochs
 (id,group_id,currency,effective_from,source_kind,approval_note)
VALUES ('00000000-0000-4000-8000-00000000d702',
 '00000000-0000-4000-8000-00000000b701','USD','2020-01-01',
 'cutover','Fictional relief epoch');
INSERT INTO public.financial_accounts
 (id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at)
VALUES ('00000000-0000-4000-8000-00000000e702',
 '00000000-0000-4000-8000-00000000b701',
 '00000000-0000-4000-8000-00000000d702','USD',
 'Fictional Cash','cash','2020-01-01');
INSERT INTO public.financial_funds(id,group_id,name,is_default,is_restricted)
VALUES ('00000000-0000-4000-8000-00000000f701',
 '00000000-0000-4000-8000-00000000b701','Relief Restricted',false,true);
INSERT INTO public.financial_categories(id,group_id,name,category_class)
VALUES ('00000000-0000-4000-8000-00000000f702',
 '00000000-0000-4000-8000-00000000b701','Relief Income','income');
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a701',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    INSERT INTO public.payments(id,group_id,membership_id,amount,currency,
      payment_method,recorded_by,relief_plan_id)
    VALUES ('00000000-0000-4000-8000-00000000e701',
     '00000000-0000-4000-8000-00000000b701',
     '00000000-0000-4000-8000-00000000c702',100,'USD','cash',
     '00000000-0000-4000-8000-00000000a701',
     '00000000-0000-4000-8000-00000000d701');
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%PAYMENT_CONFIRMATION_REQUIRES_SERVER_COMMAND%';
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DIRECT_RELIEF_CONFIRM_ACCEPTED'; END IF;
END
$test$;
INSERT INTO public.payments(id,group_id,membership_id,amount,currency,
  payment_method,recorded_by,relief_plan_id,status)
VALUES ('00000000-0000-4000-8000-00000000e701',
 '00000000-0000-4000-8000-00000000b701',
 '00000000-0000-4000-8000-00000000c702',100,'USD','cash',
 '00000000-0000-4000-8000-00000000a701',
 '00000000-0000-4000-8000-00000000d701','pending_confirmation');
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    UPDATE public.payments SET status='confirmed'
    WHERE id='00000000-0000-4000-8000-00000000e701';
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%PAYMENT_CONFIRMATION_REQUIRES_SERVER_COMMAND%';
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DIRECT_RELIEF_UPDATE_ACCEPTED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT status FROM public.payments
    WHERE id='00000000-0000-4000-8000-00000000e701')<>'pending_confirmation'
    OR EXISTS (SELECT 1 FROM public.financial_events
      WHERE group_id='00000000-0000-4000-8000-00000000b701')
  THEN RAISE EXCEPTION 'RELIEF_BOUNDARY_RESULT_CONFLICT'; END IF;
  RAISE NOTICE 'RELIEF_DIRECT_CONFIRM_DENIED: pending submission has no financial effect';
END
$test$;
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_dues_payment_confirmation(pg_catalog.jsonb_build_object(
      'payment_id','00000000-0000-4000-8000-00000000e701',
      'account_id','00000000-0000-4000-8000-00000000e702'));
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%PAYMENT_OWNED_BY_RELIEF%';
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'RELIEF_ROUTED_AS_DUES'; END IF;
END
$test$;
SELECT public.post_owner_relief_receipt(pg_catalog.jsonb_build_object(
  'payment_id','00000000-0000-4000-8000-00000000e701',
  'account_id','00000000-0000-4000-8000-00000000e702',
  'fund_id','00000000-0000-4000-8000-00000000f701',
  'category_id','00000000-0000-4000-8000-00000000f702',
  'cash_class','non_refundable')) AS first_post;
SELECT public.post_owner_relief_receipt(pg_catalog.jsonb_build_object(
  'payment_id','00000000-0000-4000-8000-00000000e701',
  'account_id','00000000-0000-4000-8000-00000000e702',
  'fund_id','00000000-0000-4000-8000-00000000f701',
  'category_id','00000000-0000-4000-8000-00000000f702',
  'cash_class','non_refundable')) AS replay;
DO $test$
BEGIN
  IF public.list_owner_relief_receipts(
    '00000000-0000-4000-8000-00000000b701')->0->>'audit_verified'<>'true'
  THEN RAISE EXCEPTION 'RELIEF_AUDIT_DISPLAY_UNTRUSTED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_event uuid;
BEGIN
  SELECT financial_event_id INTO v_event FROM public.payments
    WHERE id='00000000-0000-4000-8000-00000000e701';
  IF v_event IS NULL OR
    (SELECT count(*) FROM public.financial_events
      WHERE group_id='00000000-0000-4000-8000-00000000b701')<>1 OR
    (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_event)<>2 OR
    (SELECT count(*) FROM financial_core.financial_event_audit_links
      WHERE event_id=v_event)<>1 OR
    NOT EXISTS (SELECT 1 FROM public.financial_events
      WHERE id=v_event AND source_module='relief'
        AND source_record_id='00000000-0000-4000-8000-00000000e701'
        AND effect_kind='owner_nonrefundable_receipt')
  THEN RAISE EXCEPTION 'RELIEF_OWNER_RECEIPT_NOT_ATOMIC'; END IF;
  RAISE NOTICE 'RELIEF_OWNER_RECEIPT_PASS: one event, two postings, one audit, retry unchanged';
END
$test$;
INSERT INTO public.payments(id,group_id,membership_id,amount,currency,
  payment_method,recorded_by,relief_plan_id,status,cash_class)
VALUES ('00000000-0000-4000-8000-00000000e704',
 '00000000-0000-4000-8000-00000000b701',
 '00000000-0000-4000-8000-00000000c702',15,'USD','cash',
 '00000000-0000-4000-8000-00000000a701',
 '00000000-0000-4000-8000-00000000d701','pending_confirmation','refundable');
SET LOCAL ROLE authenticated;
SELECT public.post_owner_relief_receipt(pg_catalog.jsonb_build_object(
  'payment_id','00000000-0000-4000-8000-00000000e704',
  'account_id','00000000-0000-4000-8000-00000000e702',
  'fund_id','00000000-0000-4000-8000-00000000f701')) AS refundable_receipt;
RESET ROLE;
DO $test$
DECLARE v_event uuid;
BEGIN
  SELECT financial_event_id INTO v_event FROM public.payments
    WHERE id='00000000-0000-4000-8000-00000000e704';
  IF v_event IS NULL OR
    (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_event AND control_class='custody' AND amount_signed=15)<>1
    OR (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_event AND control_class='liability' AND amount_signed=-15)<>1
    OR EXISTS (SELECT 1 FROM public.financial_postings
      WHERE event_id=v_event AND control_class='income')
  THEN RAISE EXCEPTION 'RELIEF_REFUNDABLE_NOT_LIABILITY'; END IF;
  RAISE NOTICE 'RELIEF_REFUNDABLE_PASS: custody and liability, no income';
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a703',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_owner_relief_receipt(pg_catalog.jsonb_build_object(
      'payment_id','00000000-0000-4000-8000-00000000e701',
      'account_id','00000000-0000-4000-8000-00000000e702',
      'fund_id','00000000-0000-4000-8000-00000000f701',
      'category_id','00000000-0000-4000-8000-00000000f702'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_TENANT_RELIEF_REPLAY'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.list_owner_relief_receipts(
      '00000000-0000-4000-8000-00000000b701');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_TENANT_RELIEF_AUDIT_READ'; END IF;
END
$test$;
RESET ROLE;
UPDATE public.memberships SET membership_status='suspended'
  WHERE id='00000000-0000-4000-8000-00000000c701';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a701',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_owner_relief_receipt(pg_catalog.jsonb_build_object(
      'payment_id','00000000-0000-4000-8000-00000000e701',
      'account_id','00000000-0000-4000-8000-00000000e702',
      'fund_id','00000000-0000-4000-8000-00000000f701',
      'category_id','00000000-0000-4000-8000-00000000f702'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_RELIEF_REPLAY'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.memberships SET membership_status='active'
  WHERE id='00000000-0000-4000-8000-00000000c701';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a701',true);
INSERT INTO public.payments(id,group_id,membership_id,amount,currency,
  payment_method,recorded_by,relief_plan_id,status)
VALUES ('00000000-0000-4000-8000-00000000e703',
 '00000000-0000-4000-8000-00000000b701',
 '00000000-0000-4000-8000-00000000c702',25,'USD','cash',
 '00000000-0000-4000-8000-00000000a701',
 '00000000-0000-4000-8000-00000000d701','pending_confirmation');
CREATE FUNCTION pg_temp.reject_relief_audit() RETURNS trigger
 LANGUAGE plpgsql AS $fn$
BEGIN
  IF new.action='financial_event.posted' THEN
    RAISE EXCEPTION 'INJECTED_RELIEF_AUDIT_FAILURE';
  END IF;
  RETURN new;
END
$fn$;
CREATE TRIGGER reject_relief_audit BEFORE INSERT ON public.group_audit_logs
 FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_relief_audit();
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_failed boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_owner_relief_receipt(pg_catalog.jsonb_build_object(
      'payment_id','00000000-0000-4000-8000-00000000e703',
      'account_id','00000000-0000-4000-8000-00000000e702',
      'fund_id','00000000-0000-4000-8000-00000000f701',
      'category_id','00000000-0000-4000-8000-00000000f702'));
  EXCEPTION WHEN OTHERS THEN
    v_failed:=SQLERRM LIKE '%INJECTED_RELIEF_AUDIT_FAILURE%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'RELIEF_AUDIT_FAILURE_NOT_PROPAGATED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT status FROM public.payments
    WHERE id='00000000-0000-4000-8000-00000000e703')<>'pending_confirmation'
    OR EXISTS (SELECT 1 FROM public.financial_events
      WHERE source_module='relief'
        AND source_record_id='00000000-0000-4000-8000-00000000e703')
  THEN RAISE EXCEPTION 'RELIEF_AUDIT_FAILURE_LEFT_EFFECT'; END IF;
END
$test$;
DROP TRIGGER reject_relief_audit ON public.group_audit_logs;
SET LOCAL ROLE authenticated;
SELECT public.post_owner_relief_receipt(pg_catalog.jsonb_build_object(
  'payment_id','00000000-0000-4000-8000-00000000e703',
  'account_id','00000000-0000-4000-8000-00000000e702',
  'fund_id','00000000-0000-4000-8000-00000000f701',
  'category_id','00000000-0000-4000-8000-00000000f702')) AS after_failure;
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.financial_events
      WHERE source_module='relief'
        AND source_record_id='00000000-0000-4000-8000-00000000e703')<>1
    OR (SELECT count(*) FROM financial_core.financial_event_audit_links l
      JOIN public.financial_events e ON e.id=l.event_id
      WHERE e.source_module='relief'
        AND e.source_record_id='00000000-0000-4000-8000-00000000e703')<>1
  THEN RAISE EXCEPTION 'RELIEF_AUDIT_RETRY_DUPLICATED'; END IF;
  RAISE NOTICE 'RELIEF_AUDIT_RETRY_PASS: fault rollback, authorized retry, cross-tenant and revoked denial';
END
$test$;
ROLLBACK;
