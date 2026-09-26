-- R-009 branch/owner receipt slice on the production S0/M2-compatible catalog.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a801','owner@example.test'),
 ('00000000-0000-4000-8000-00000000a802','branch-officer@example.test'),
 ('00000000-0000-4000-8000-00000000a803','branch-member@example.test'),
 ('00000000-0000-4000-8000-00000000a804','other-officer@example.test');
INSERT INTO public.organizations(id,name,slug,owner_id) VALUES
 ('00000000-0000-4000-8000-00000000d801','Fictional Relief Union',
  'fictional-relief-union','00000000-0000-4000-8000-00000000a801'),
 ('00000000-0000-4000-8000-00000000d802','Other Union',
  'other-union','00000000-0000-4000-8000-00000000a804');
INSERT INTO public.groups(id,organization_id,name,slug,group_level,currency) VALUES
 ('00000000-0000-4000-8000-00000000b801',
  '00000000-0000-4000-8000-00000000d801','HQ','relief-hq','hq','USD'),
 ('00000000-0000-4000-8000-00000000b802',
  '00000000-0000-4000-8000-00000000d801','Branch','relief-branch','branch','USD'),
 ('00000000-0000-4000-8000-00000000b803',
  '00000000-0000-4000-8000-00000000d802','Other','other-branch','branch','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status) VALUES
 ('00000000-0000-4000-8000-00000000c801',
  '00000000-0000-4000-8000-00000000a801',
  '00000000-0000-4000-8000-00000000b801','owner','active'),
 ('00000000-0000-4000-8000-00000000c802',
  '00000000-0000-4000-8000-00000000a802',
  '00000000-0000-4000-8000-00000000b802','admin','active'),
 ('00000000-0000-4000-8000-00000000c803',
  '00000000-0000-4000-8000-00000000a803',
  '00000000-0000-4000-8000-00000000b802','member','active'),
 ('00000000-0000-4000-8000-00000000c804',
  '00000000-0000-4000-8000-00000000a804',
  '00000000-0000-4000-8000-00000000b803','admin','active');
INSERT INTO public.group_subscriptions(group_id,tier,status)
VALUES ('00000000-0000-4000-8000-00000000b801','starter','active');
INSERT INTO public.relief_plans(id,group_id,name,created_by,
  is_active,status,currency,shared_from_org)
VALUES ('00000000-0000-4000-8000-00000000d803',
 '00000000-0000-4000-8000-00000000b801','Fictional Shared Plan',
 '00000000-0000-4000-8000-00000000a801',true,'active','USD',true);
INSERT INTO public.relief_enrollments
 (plan_id,membership_id,group_id,collecting_group_id,status,is_active)
VALUES ('00000000-0000-4000-8000-00000000d803',
 '00000000-0000-4000-8000-00000000c803',
 '00000000-0000-4000-8000-00000000b802',
 '00000000-0000-4000-8000-00000000b802','active',true);
INSERT INTO public.financial_ledger_epochs
 (id,group_id,currency,effective_from,source_kind,approval_note)
VALUES
 ('00000000-0000-4000-8000-00000000d804',
  '00000000-0000-4000-8000-00000000b801','USD','2020-01-01',
  'cutover','Fictional HQ epoch'),
 ('00000000-0000-4000-8000-00000000d805',
  '00000000-0000-4000-8000-00000000b802','USD','2020-01-01',
  'cutover','Fictional branch epoch');
INSERT INTO public.financial_accounts
 (id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at)
VALUES ('00000000-0000-4000-8000-00000000e801',
 '00000000-0000-4000-8000-00000000b802',
 '00000000-0000-4000-8000-00000000d805','USD',
 'Branch Cash','cash','2020-01-01'),
 ('00000000-0000-4000-8000-00000000e804',
  '00000000-0000-4000-8000-00000000b801',
  '00000000-0000-4000-8000-00000000d804','USD',
  'HQ Cash','cash','2020-01-01');
INSERT INTO public.financial_funds(id,group_id,name,is_default,is_restricted)
VALUES
 ('00000000-0000-4000-8000-00000000f801',
  '00000000-0000-4000-8000-00000000b801','HQ Relief',false,true),
 ('00000000-0000-4000-8000-00000000f802',
  '00000000-0000-4000-8000-00000000b802','Branch Relief',false,true);
INSERT INTO public.financial_categories(id,group_id,name,category_class)
VALUES ('00000000-0000-4000-8000-00000000f803',
 '00000000-0000-4000-8000-00000000b801','Relief Income','income');
INSERT INTO public.payments(id,group_id,membership_id,amount,currency,
  payment_method,recorded_by,relief_plan_id,status,cash_class)
VALUES ('00000000-0000-4000-8000-00000000e802',
 '00000000-0000-4000-8000-00000000b802',
 '00000000-0000-4000-8000-00000000c803',70,'USD','cash',
 '00000000-0000-4000-8000-00000000a802',
 '00000000-0000-4000-8000-00000000d803','pending_confirmation','non_refundable');
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    INSERT INTO public.payments(id,group_id,membership_id,amount,currency,
      payment_method,recorded_by,relief_plan_id,status)
    VALUES ('00000000-0000-4000-8000-00000000e803',
      '00000000-0000-4000-8000-00000000b803',
      '00000000-0000-4000-8000-00000000c804',10,'USD','cash',
      '00000000-0000-4000-8000-00000000a804',
      '00000000-0000-4000-8000-00000000d803','pending_confirmation');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_ORG_RELIEF_PLAN_LINK'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
SELECT public.post_branch_relief_receipt(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e802',
 'account_id','00000000-0000-4000-8000-00000000e801',
 'fund_id','00000000-0000-4000-8000-00000000f802')) AS branch_first;
SELECT public.post_branch_relief_receipt(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e802',
 'account_id','00000000-0000-4000-8000-00000000e801',
 'fund_id','00000000-0000-4000-8000-00000000f802')) AS branch_retry;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_agency_owner_recognition(jsonb_build_object(
      'payment_id','00000000-0000-4000-8000-00000000e802',
      'fund_id','00000000-0000-4000-8000-00000000f801',
      'category_id','00000000-0000-4000-8000-00000000f803'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'BRANCH_SELF_RECOGNIZED_OWNER_INCOME'; END IF;
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_branch_event uuid;
BEGIN
  SELECT branch_event_id INTO v_branch_event
    FROM financial_core.relief_agency_receipts
    WHERE payment_id='00000000-0000-4000-8000-00000000e802';
  IF v_branch_event IS NULL
    OR (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_branch_event AND control_class='custody'
        AND amount_signed=70)<>1
    OR (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_branch_event AND control_class='liability'
        AND amount_signed=-70)<>1
    OR (SELECT count(*) FROM financial_core.financial_event_audit_links
      WHERE event_id=v_branch_event)<>1
  THEN RAISE EXCEPTION 'BRANCH_AGENCY_EFFECT_INVALID'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a801',true);
SET LOCAL ROLE authenticated;
SELECT public.post_agency_owner_recognition(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e802',
 'fund_id','00000000-0000-4000-8000-00000000f801',
 'category_id','00000000-0000-4000-8000-00000000f803')) AS owner_first;
SELECT public.post_agency_owner_recognition(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e802',
 'fund_id','00000000-0000-4000-8000-00000000f801',
 'category_id','00000000-0000-4000-8000-00000000f803')) AS owner_retry;
DO $test$
BEGIN
  IF public.list_pending_agency_relief_receipts(
    '00000000-0000-4000-8000-00000000b801')->0->>'branch_audit_verified'<>'true'
  THEN RAISE EXCEPTION 'AGENCY_AUDIT_DISPLAY_INVALID'; END IF;
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_owner_event uuid;
BEGIN
  SELECT owner_event_id INTO v_owner_event
    FROM financial_core.relief_agency_receipts
    WHERE payment_id='00000000-0000-4000-8000-00000000e802';
  IF v_owner_event IS NULL
    OR (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_owner_event AND control_class='receivable'
        AND amount_signed=70)<>1
    OR (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_owner_event AND control_class='income'
        AND amount_signed=-70)<>1
    OR EXISTS (SELECT 1 FROM public.financial_postings
      WHERE event_id=v_owner_event AND control_class='custody')
    OR (SELECT count(*) FROM financial_core.financial_event_audit_links
      WHERE event_id=v_owner_event)<>1
  THEN RAISE EXCEPTION 'OWNER_AGENCY_RECOGNITION_INVALID'; END IF;
  RAISE NOTICE 'RELIEF_AGENCY_PASS: branch custody/liability, owner receivable/income, distinct authority, two audits, retries';
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
SELECT public.submit_relief_remittance(jsonb_build_object(
 'request_id','00000000-0000-4000-8000-00000000e805',
 'branch_group_id','00000000-0000-4000-8000-00000000b802',
 'plan_id','00000000-0000-4000-8000-00000000d803',
 'account_id','00000000-0000-4000-8000-00000000e801',
 'fund_id','00000000-0000-4000-8000-00000000f802',
 'amount',70,'currency','USD','method','cash')) AS remit_submit;
SELECT public.submit_relief_remittance(jsonb_build_object(
 'request_id','00000000-0000-4000-8000-00000000e805',
 'branch_group_id','00000000-0000-4000-8000-00000000b802',
 'plan_id','00000000-0000-4000-8000-00000000d803',
 'account_id','00000000-0000-4000-8000-00000000e801',
 'fund_id','00000000-0000-4000-8000-00000000f802',
 'amount',70,'currency','USD','method','cash')) AS remit_retry;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    UPDATE public.relief_remittances SET status='confirmed'
      WHERE id='00000000-0000-4000-8000-00000000e805';
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DIRECT_REMITTANCE_DECISION_ALLOWED'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.confirm_relief_remittance(jsonb_build_object(
      'remittance_id','00000000-0000-4000-8000-00000000e805',
      'account_id','00000000-0000-4000-8000-00000000e804',
      'fund_id','00000000-0000-4000-8000-00000000f801'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'BRANCH_SELF_CONFIRMED_REMITTANCE'; END IF;
  BEGIN
    PERFORM public.submit_relief_remittance(jsonb_build_object(
      'request_id','00000000-0000-4000-8000-00000000e805',
      'branch_group_id','00000000-0000-4000-8000-00000000b802',
      'plan_id','00000000-0000-4000-8000-00000000d803',
      'account_id','00000000-0000-4000-8000-00000000e801',
      'fund_id','00000000-0000-4000-8000-00000000f802',
      'amount',69,'currency','USD','method','cash'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501' OR
    SQLERRM='REMITTANCE_INTENT_CONFLICT'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CHANGED_REMITTANCE_INTENT_ACCEPTED'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a804',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.submit_relief_remittance(jsonb_build_object(
      'request_id','00000000-0000-4000-8000-00000000e805',
      'branch_group_id','00000000-0000-4000-8000-00000000b802',
      'plan_id','00000000-0000-4000-8000-00000000d803',
      'account_id','00000000-0000-4000-8000-00000000e801',
      'fund_id','00000000-0000-4000-8000-00000000f802',
      'amount',70,'currency','USD','method','cash'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_TENANT_REMITTANCE_REPLAY'; END IF;
END
$test$;
RESET ROLE;
UPDATE public.memberships SET membership_status='suspended'
  WHERE id='00000000-0000-4000-8000-00000000c802';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.submit_relief_remittance(jsonb_build_object(
      'request_id','00000000-0000-4000-8000-00000000e805',
      'branch_group_id','00000000-0000-4000-8000-00000000b802',
      'plan_id','00000000-0000-4000-8000-00000000d803',
      'account_id','00000000-0000-4000-8000-00000000e801',
      'fund_id','00000000-0000-4000-8000-00000000f802',
      'amount',70,'currency','USD','method','cash'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_REMITTANCE_REPLAY'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.memberships SET membership_status='active'
  WHERE id='00000000-0000-4000-8000-00000000c802';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a801',true);
SET LOCAL ROLE authenticated;
SELECT public.confirm_relief_remittance(jsonb_build_object(
 'remittance_id','00000000-0000-4000-8000-00000000e805',
 'account_id','00000000-0000-4000-8000-00000000e804',
 'fund_id','00000000-0000-4000-8000-00000000f801')) AS remit_confirm;
SELECT public.confirm_relief_remittance(jsonb_build_object(
 'remittance_id','00000000-0000-4000-8000-00000000e805',
 'account_id','00000000-0000-4000-8000-00000000e804',
 'fund_id','00000000-0000-4000-8000-00000000f801')) AS remit_confirm_retry;
RESET ROLE;
INSERT INTO public.payments(id,group_id,membership_id,amount,currency,
  payment_method,recorded_by,relief_plan_id,status,cash_class)
VALUES ('00000000-0000-4000-8000-00000000e806',
 '00000000-0000-4000-8000-00000000b802',
 '00000000-0000-4000-8000-00000000c803',20,'USD','cash',
 '00000000-0000-4000-8000-00000000a802',
 '00000000-0000-4000-8000-00000000d803',
 'pending_confirmation','non_refundable');
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
SELECT public.post_branch_relief_receipt(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e806',
 'account_id','00000000-0000-4000-8000-00000000e801',
 'fund_id','00000000-0000-4000-8000-00000000f802'));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a801',true);
SET LOCAL ROLE authenticated;
SELECT public.post_agency_owner_recognition(jsonb_build_object(
 'payment_id','00000000-0000-4000-8000-00000000e806',
 'fund_id','00000000-0000-4000-8000-00000000f801',
 'category_id','00000000-0000-4000-8000-00000000f803'));
RESET ROLE;
CREATE FUNCTION pg_temp.reject_remittance_audit() RETURNS trigger
 LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.action='financial_event.posted' THEN
    RAISE EXCEPTION 'INJECTED_REMITTANCE_AUDIT_FAILURE';
  END IF;
  RETURN NEW;
END
$fn$;
CREATE TRIGGER reject_remittance_audit BEFORE INSERT ON public.group_audit_logs
 FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_remittance_audit();
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_failed boolean:=false;
BEGIN
  BEGIN
    PERFORM public.submit_relief_remittance(jsonb_build_object(
      'request_id','00000000-0000-4000-8000-00000000e807',
      'branch_group_id','00000000-0000-4000-8000-00000000b802',
      'plan_id','00000000-0000-4000-8000-00000000d803',
      'account_id','00000000-0000-4000-8000-00000000e801',
      'fund_id','00000000-0000-4000-8000-00000000f802',
      'amount',20,'currency','USD','method','cash'));
  EXCEPTION WHEN OTHERS THEN
    v_failed:=SQLERRM LIKE '%INJECTED_REMITTANCE_AUDIT_FAILURE%';
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'REMITTANCE_AUDIT_FAILURE_NOT_PROPAGATED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.relief_remittances
      WHERE id='00000000-0000-4000-8000-00000000e807')
    OR EXISTS (SELECT 1 FROM public.financial_events
      WHERE source_module='relief'
        AND source_record_id='00000000-0000-4000-8000-00000000e807')
  THEN RAISE EXCEPTION 'REMITTANCE_AUDIT_FAILURE_LEFT_EFFECT'; END IF;
END
$test$;
DROP TRIGGER reject_remittance_audit ON public.group_audit_logs;
SET LOCAL ROLE authenticated;
SELECT public.submit_relief_remittance(jsonb_build_object(
 'request_id','00000000-0000-4000-8000-00000000e807',
 'branch_group_id','00000000-0000-4000-8000-00000000b802',
 'plan_id','00000000-0000-4000-8000-00000000d803',
 'account_id','00000000-0000-4000-8000-00000000e801',
 'fund_id','00000000-0000-4000-8000-00000000f802',
 'amount',20,'currency','USD','method','cash')) AS remit_after_audit_failure;
RESET ROLE;
DO $test$
DECLARE v_summary record; v_old_rows bigint;
  v_old_collected numeric; v_old_remitted numeric;
BEGIN
  SELECT count(*),sum(p.amount),sum(rr.amount) FILTER (WHERE rr.status='confirmed')
    INTO v_old_rows,v_old_collected,v_old_remitted
  FROM public.relief_enrollments re
  JOIN public.payments p ON p.relief_plan_id=re.plan_id
    AND p.membership_id=re.membership_id AND p.status='confirmed'
  JOIN public.relief_remittances rr ON rr.relief_plan_id=re.plan_id
    AND rr.branch_group_id=re.collecting_group_id
  WHERE re.plan_id='00000000-0000-4000-8000-00000000d803';
  IF v_old_rows<>4 OR v_old_collected<>180 OR v_old_remitted<>140
  THEN RAISE EXCEPTION 'LEGACY_ROLLUP_COUNTEREXAMPLE_NOT_SENSITIVE: %, %, %',
    v_old_rows,v_old_collected,v_old_remitted; END IF;
  SELECT * INTO v_summary FROM public.get_relief_branch_summary()
    WHERE relief_plan_id='00000000-0000-4000-8000-00000000d803'
      AND collecting_group_id='00000000-0000-4000-8000-00000000b802';
  IF v_summary.enrolled_count<>1 OR v_summary.paid_this_month<>1
    OR v_summary.collected_this_month<>90 OR v_summary.total_remitted<>70
  THEN RAISE EXCEPTION 'RELIEF_ROLLUP_FANOUT: %',row_to_json(v_summary); END IF;
  RAISE NOTICE 'RELIEF_ROLLUP_PASS: one enrollment, two receipts, two remittances, exact sums 90 and 70';
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a804',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_relief_branch_summary()
    WHERE relief_plan_id='00000000-0000-4000-8000-00000000d803')
  THEN RAISE EXCEPTION 'CROSS_ORG_RELIEF_ROLLUP_VISIBLE'; END IF;
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_out uuid; v_in uuid;
BEGIN
  SELECT branch_event_id,owner_event_id INTO v_out,v_in
    FROM public.relief_remittances
    WHERE id='00000000-0000-4000-8000-00000000e805';
  IF v_out IS NULL OR v_in IS NULL OR v_out=v_in
    OR (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_out AND control_class='liability'
        AND amount_signed=70)<>1
    OR (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_out AND control_class='custody'
        AND amount_signed=-70)<>1
    OR (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_in AND control_class='custody'
        AND amount_signed=70)<>1
    OR (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_in AND control_class='receivable'
        AND amount_signed=-70)<>1
    OR (SELECT count(*) FROM financial_core.financial_event_audit_links
      WHERE event_id IN (v_out,v_in))<>2
  THEN RAISE EXCEPTION 'REMITTANCE_POSTING_OR_AUDIT_INVALID'; END IF;
  IF has_table_privilege('authenticated','public.relief_remittances','TRUNCATE')
    OR has_table_privilege('authenticated','public.payments','TRUNCATE')
    OR has_table_privilege('authenticated','public.memberships','TRUNCATE')
    OR has_table_privilege('authenticated','public.relief_plans','TRUNCATE')
    OR has_table_privilege('authenticated','public.relief_enrollments','TRUNCATE')
    OR has_table_privilege('authenticated','public.relief_claims','TRUNCATE')
    OR has_table_privilege('authenticated','public.relief_payouts','TRUNCATE')
  THEN RAISE EXCEPTION 'ROW_POLICY_BYPASS_GRANT_REMAINS'; END IF;
  RAISE NOTICE 'RELIEF_REMITTANCE_PASS: branch liability/custody, owner custody/receivable, audit, retries, maker/checker, no TRUNCATE';
END
$test$;
DO $test$
DECLARE v_root uuid;
BEGIN
  SELECT id INTO v_root FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b801';
  IF v_root IS NULL THEN RAISE EXCEPTION 'PROJECTION_ROOT_MISSING'; END IF;
  PERFORM set_config('qual.relief_projection_root',v_root::text,true);
  PERFORM set_config('qual.relief_event_count',
    (SELECT count(*)::text FROM public.financial_events),true);
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a801',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_result jsonb; v_projection record;
BEGIN
  v_result:=public.configure_relief_plan_scope(pg_catalog.jsonb_build_object(
    'plan_id','00000000-0000-4000-8000-00000000d803',
    'request_id','00000000-0000-4000-8000-00000000f810',
    'expected_version',0,
    'owning_unit_id',current_setting('qual.relief_projection_root')::uuid,
    'financial_owner_group_id','00000000-0000-4000-8000-00000000b801',
    'participation_unit_id',current_setting('qual.relief_projection_root')::uuid,
    'participation_mode','subtree',
    'collection_unit_id',current_setting('qual.relief_projection_root')::uuid,
    'collection_mode','subtree',
    'review_unit_id',current_setting('qual.relief_projection_root')::uuid,
    'payout_unit_id',current_setting('qual.relief_projection_root')::uuid,
    'reporting_unit_id',current_setting('qual.relief_projection_root')::uuid,
    'reporting_mode','subtree'));
  IF v_result->>'decision'<>'posted'
  THEN RAISE EXCEPTION 'PROJECTION_SCOPE_NOT_CONFIGURED'; END IF;
  SELECT * INTO v_projection FROM public.get_relief_management_projection(
    '00000000-0000-4000-8000-00000000d801',
    current_setting('qual.relief_projection_root')::uuid,
    'USD',transaction_timestamp())
    WHERE plan_id='00000000-0000-4000-8000-00000000d803'
      AND branch_group_id='00000000-0000-4000-8000-00000000b802';
  IF v_projection.branch_due<>20 OR v_projection.owner_receivable<>20
     OR v_projection.eliminated_internal<>20
     OR v_projection.branch_after_elimination<>0
     OR v_projection.owner_after_elimination<>0
  THEN RAISE EXCEPTION 'RELIEF_MANAGEMENT_ELIMINATION_INVALID: %',
    row_to_json(v_projection); END IF;
  IF EXISTS (SELECT 1 FROM public.get_relief_management_projection(
      '00000000-0000-4000-8000-00000000d801',
      current_setting('qual.relief_projection_root')::uuid,
      'EUR',transaction_timestamp()))
  THEN RAISE EXCEPTION 'RELIEF_MANAGEMENT_CURRENCY_MIXED'; END IF;
  IF EXISTS (SELECT 1 FROM public.get_relief_management_projection(
      '00000000-0000-4000-8000-00000000d801',
      current_setting('qual.relief_projection_root')::uuid,
      'USD','2000-01-01'::timestamptz)
      WHERE branch_due<>0 OR owner_receivable<>0 OR eliminated_internal<>0)
  THEN RAISE EXCEPTION 'RELIEF_MANAGEMENT_AS_OF_LEAK'; END IF;
  RAISE NOTICE 'RELIEF_MANAGEMENT_PASS: local due 20/receivable 20, projection eliminates 20';
END
$test$;
RESET ROLE;
INSERT INTO public.payments(id,group_id,membership_id,amount,currency,
  payment_method,recorded_by,relief_plan_id,status,cash_class)
VALUES ('00000000-0000-4000-8000-00000000e809',
 '00000000-0000-4000-8000-00000000b802',
 '00000000-0000-4000-8000-00000000c803',10,'USD','cash',
 '00000000-0000-4000-8000-00000000a802',
 '00000000-0000-4000-8000-00000000d803',
 'pending_confirmation','non_refundable');
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF public.post_branch_relief_receipt(pg_catalog.jsonb_build_object(
    'payment_id','00000000-0000-4000-8000-00000000e809',
    'account_id','00000000-0000-4000-8000-00000000e801',
    'fund_id','00000000-0000-4000-8000-00000000f802'))
    ->>'decision' IS NULL
  THEN RAISE EXCEPTION 'UNMATCHED_BRANCH_RECEIPT_NOT_POSTED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  PERFORM set_config('qual.relief_event_count',
    (SELECT count(*)::text FROM public.financial_events),true);
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a801',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_projection record;
BEGIN
  SELECT * INTO v_projection FROM public.get_relief_management_projection(
    '00000000-0000-4000-8000-00000000d801',
    current_setting('qual.relief_projection_root')::uuid,
    'USD',transaction_timestamp())
    WHERE plan_id='00000000-0000-4000-8000-00000000d803'
      AND branch_group_id='00000000-0000-4000-8000-00000000b802';
  IF v_projection.branch_due<>30 OR v_projection.owner_receivable<>20
     OR v_projection.eliminated_internal<>20
     OR v_projection.branch_after_elimination<>10
     OR v_projection.owner_after_elimination<>0
  THEN RAISE EXCEPTION 'UNMATCHED_AGENCY_BALANCE_HIDDEN: %',
    row_to_json(v_projection); END IF;
  RAISE NOTICE 'RELIEF_MANAGEMENT_UNMATCHED_PASS: branch due 30, owner receivable 20, residual 10';
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.financial_events)::text
       IS DISTINCT FROM current_setting('qual.relief_event_count')
  THEN RAISE EXCEPTION 'RELIEF_MANAGEMENT_CHANGED_LOCAL_LEDGER'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a804',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.get_relief_management_projection(
      '00000000-0000-4000-8000-00000000d801',
      current_setting('qual.relief_projection_root')::uuid,
      'USD',transaction_timestamp());
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_TENANT_RELIEF_MANAGEMENT_READ'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a802',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.get_relief_management_projection(
      '00000000-0000-4000-8000-00000000d801',
      current_setting('qual.relief_projection_root')::uuid,
      'USD',transaction_timestamp());
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'BRANCH_RELIEF_MANAGEMENT_READ'; END IF;
END
$test$;
RESET ROLE;
UPDATE public.organizations SET topology_version=topology_version+1
  WHERE id='00000000-0000-4000-8000-00000000d801';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a801',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_relief_management_projection(
    '00000000-0000-4000-8000-00000000d801',
    current_setting('qual.relief_projection_root')::uuid,
    'USD',transaction_timestamp()))
  THEN RAISE EXCEPTION 'STALE_RELIEF_MANAGEMENT_SCOPE_VISIBLE'; END IF;
  RAISE NOTICE 'RELIEF_MANAGEMENT_AUTH_PASS: branch and cross-tenant denied; stale topology empty';
END
$test$;
RESET ROLE;
ROLLBACK;
