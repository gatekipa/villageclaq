-- R-002/R-003 local plan-contract diagnostic; fictional rows roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a931','scope-owner@example.test'),
 ('00000000-0000-4000-8000-00000000a932','branch-admin@example.test'),
 ('00000000-0000-4000-8000-00000000a933','other-admin@example.test'),
 ('00000000-0000-4000-8000-00000000a934','local-admin@example.test'),
 ('00000000-0000-4000-8000-00000000a935','covered-person@example.test');
INSERT INTO public.organizations(id,name,slug,owner_id) VALUES
 ('00000000-0000-4000-8000-00000000d931','Scope Union',
  'scope-union','00000000-0000-4000-8000-00000000a931'),
 ('00000000-0000-4000-8000-00000000d932','Other Union',
  'other-scope-union','00000000-0000-4000-8000-00000000a933');
INSERT INTO public.groups(id,organization_id,name,slug,group_level,currency) VALUES
 ('00000000-0000-4000-8000-00000000b931',
  '00000000-0000-4000-8000-00000000d931','HQ','scope-hq','hq','USD'),
 ('00000000-0000-4000-8000-00000000b932',
  '00000000-0000-4000-8000-00000000d931','Branch','scope-branch','branch','USD'),
 ('00000000-0000-4000-8000-00000000b933',
  '00000000-0000-4000-8000-00000000d932','Other','scope-other','hq','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status)
VALUES
 ('00000000-0000-4000-8000-00000000c931',
  '00000000-0000-4000-8000-00000000a931',
  '00000000-0000-4000-8000-00000000b931','owner','active'),
 ('00000000-0000-4000-8000-00000000c932',
  '00000000-0000-4000-8000-00000000a932',
  '00000000-0000-4000-8000-00000000b932','admin','active'),
 ('00000000-0000-4000-8000-00000000c933',
  '00000000-0000-4000-8000-00000000a933',
  '00000000-0000-4000-8000-00000000b933','admin','active'),
 ('00000000-0000-4000-8000-00000000c934',
  '00000000-0000-4000-8000-00000000a934',
  '00000000-0000-4000-8000-00000000b931','admin','active'),
 ('00000000-0000-4000-8000-00000000c935',
  '00000000-0000-4000-8000-00000000a935',
  '00000000-0000-4000-8000-00000000b932','member','active');
INSERT INTO public.group_subscriptions(group_id,tier,status)
VALUES ('00000000-0000-4000-8000-00000000b931','pro','active');
INSERT INTO public.relief_plans(id,group_id,name,created_by,
  is_active,status,currency,shared_from_org,waiting_period_days)
VALUES ('00000000-0000-4000-8000-00000000e931',
 '00000000-0000-4000-8000-00000000b931','Scoped Plan',
 '00000000-0000-4000-8000-00000000a931',true,'active','USD',true,0);
INSERT INTO public.relief_enrollments
 (plan_id,membership_id,group_id,collecting_group_id,status,is_active)
VALUES ('00000000-0000-4000-8000-00000000e931',
 '00000000-0000-4000-8000-00000000c932',
 '00000000-0000-4000-8000-00000000b932',
 '00000000-0000-4000-8000-00000000b932','active',true);
INSERT INTO public.relief_enrollments
 (plan_id,membership_id,group_id,collecting_group_id,status,is_active,matures_at)
VALUES ('00000000-0000-4000-8000-00000000e931',
 '00000000-0000-4000-8000-00000000c931',
 '00000000-0000-4000-8000-00000000b931',
 '00000000-0000-4000-8000-00000000b931','active',true,
 now()-interval '1 day');
INSERT INTO public.relief_claims
 (id,plan_id,membership_id,claimant_membership_id,group_id,
  event_type,incident_date,amount,amount_requested,currency,
  description,status)
VALUES ('00000000-0000-4000-8000-00000000e936',
 '00000000-0000-4000-8000-00000000e931',
 '00000000-0000-4000-8000-00000000c931',
 '00000000-0000-4000-8000-00000000c931',
 '00000000-0000-4000-8000-00000000b931',
 'illness',CURRENT_DATE,20,20,'USD','Fictional scoped claim','submitted');
INSERT INTO public.financial_ledger_epochs
 (id,group_id,currency,effective_from,source_kind,approval_note)
VALUES ('00000000-0000-4000-8000-00000000d937',
 '00000000-0000-4000-8000-00000000b931','USD','2020-01-01',
 'cutover','Fictional scope epoch');
INSERT INTO public.financial_accounts
 (id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at)
VALUES ('00000000-0000-4000-8000-00000000e937',
 '00000000-0000-4000-8000-00000000b931',
 '00000000-0000-4000-8000-00000000d937','USD',
 'Fictional Scope Cash','cash','2020-01-01');
INSERT INTO public.financial_categories
 (id,group_id,name,category_class)
VALUES ('00000000-0000-4000-8000-00000000f937',
 '00000000-0000-4000-8000-00000000b931','Relief expense','expense');
INSERT INTO public.financial_funds
 (id,group_id,name,is_default,is_restricted)
VALUES ('00000000-0000-4000-8000-00000000f938',
 '00000000-0000-4000-8000-00000000b931','Relief',false,true),
 ('00000000-0000-4000-8000-00000000f939',
 '00000000-0000-4000-8000-00000000b931','General',true,false);
INSERT INTO public.payments
  (id,group_id,membership_id,amount,currency,payment_method,
   recorded_by,relief_plan_id,status)
VALUES ('00000000-0000-4000-8000-00000000e934',
  '00000000-0000-4000-8000-00000000b932',
  '00000000-0000-4000-8000-00000000c932',10,'USD','cash',
  '00000000-0000-4000-8000-00000000a932',
  '00000000-0000-4000-8000-00000000e931','pending_confirmation');
DO $test$
DECLARE v_root uuid; v_branch uuid; v_other uuid;
BEGIN
  SELECT id INTO v_root FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b931';
  SELECT id INTO v_branch FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b932';
  SELECT id INTO v_other FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b933';
  PERFORM set_config('qual.scope_root',v_root::text,true);
  PERFORM set_config('qual.scope_branch',v_branch::text,true);
  PERFORM set_config('qual.scope_other',v_other::text,true);
  IF v_root IS NULL OR v_branch IS NULL OR v_other IS NULL
     OR NOT financial_core.relief_unit_in_scope(v_root,'subtree',v_branch)
     OR financial_core.relief_unit_in_scope(v_root,'unit',v_branch)
     OR NOT financial_core.relief_unit_in_scope(v_root,'organization',v_branch)
     OR financial_core.relief_unit_in_scope(v_root,'organization',v_other)
  THEN RAISE EXCEPTION 'SCOPE_UNIT_TOPOLOGY_INVALID'; END IF;
END
$test$;

SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_root uuid; v_branch uuid; v_other uuid;
  v_command jsonb; v_result jsonb; v_denied boolean;
BEGIN
  v_root:=current_setting('qual.scope_root')::uuid;
  v_branch:=current_setting('qual.scope_branch')::uuid;
  v_other:=current_setting('qual.scope_other')::uuid;
  IF v_root IS NULL OR v_branch IS NULL OR v_other IS NULL
  THEN RAISE EXCEPTION 'SCOPE_UNIT_TOPOLOGY_INVALID'; END IF;
  v_command:=pg_catalog.jsonb_build_object(
    'plan_id','00000000-0000-4000-8000-00000000e931',
    'request_id','00000000-0000-4000-8000-00000000f931',
    'expected_version',0,'owning_unit_id',v_root,
    'financial_owner_group_id','00000000-0000-4000-8000-00000000b931',
    'participation_unit_id',v_root,'participation_mode','subtree',
    'collection_unit_id',v_root,'collection_mode','subtree',
    'review_unit_id',v_root,'payout_unit_id',v_root,
    'reporting_unit_id',v_root,'reporting_mode','organization');
  v_result:=public.configure_relief_plan_scope(v_command);
  IF v_result->>'decision'<>'posted' OR
     (public.get_relief_plan_scope('00000000-0000-4000-8000-00000000e931')
       ->>'version')::integer<>1
  THEN RAISE EXCEPTION 'PLAN_SCOPE_NOT_POSTED'; END IF;
  IF (SELECT count(*) FROM public.get_relief_branch_summary()
      WHERE relief_plan_id='00000000-0000-4000-8000-00000000e931')<>2
  THEN RAISE EXCEPTION 'AUTHORIZED_SCOPED_REPORT_HIDDEN'; END IF;
  IF public.configure_relief_plan_scope(v_command)->>'decision'<>'recovered'
  THEN RAISE EXCEPTION 'PLAN_SCOPE_RETRY_NOT_RECOVERED'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.configure_relief_plan_scope(
      pg_catalog.jsonb_set(v_command,'{participation_mode}','"unit"'));
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%IDENTITY_CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CHANGED_SCOPE_PAYLOAD_ALLOWED'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.configure_relief_plan_scope(
      pg_catalog.jsonb_set(v_command,'{request_id}',
        '"00000000-0000-4000-8000-00000000f932"'));
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%VERSION_CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'STALE_SCOPE_VERSION_ALLOWED'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.configure_relief_plan_scope(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(v_command,'{request_id}',
          '"00000000-0000-4000-8000-00000000f933"'),
        '{collection_unit_id}',pg_catalog.to_jsonb(v_other)));
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%CROSS_ORGANIZATION%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_ORG_COLLECTION_SCOPE_ALLOWED'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.configure_relief_plan_scope(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(
          pg_catalog.jsonb_set(v_command,'{request_id}',
            '"00000000-0000-4000-8000-00000000f938"'),
          '{participation_unit_id}',pg_catalog.to_jsonb(v_branch)),
        '{participation_mode}','"organization"'));
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%DIMENSION_CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'NONROOT_ORGANIZATION_SCOPE_ALLOWED'; END IF;
  v_command:=pg_catalog.jsonb_set(v_command,'{request_id}',
    '"00000000-0000-4000-8000-00000000f934"');
  v_command:=pg_catalog.jsonb_set(v_command,'{expected_version}','1');
  v_command:=pg_catalog.jsonb_set(v_command,'{participation_mode}','"unit"');
  v_result:=public.configure_relief_plan_scope(v_command);
  IF v_result->>'decision'<>'posted' OR
     (public.get_relief_plan_scope('00000000-0000-4000-8000-00000000e931')
       ->>'version')::integer<>2
  THEN RAISE EXCEPTION 'PLAN_SCOPE_VERSION_REPLACEMENT_FAILED'; END IF;
END
$test$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a932',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_relief_branch_summary()
      WHERE relief_plan_id='00000000-0000-4000-8000-00000000e931')
  THEN RAISE EXCEPTION 'BRANCH_REPORT_WITHOUT_GRANT_VISIBLE'; END IF;
END
$test$;
RESET ROLE;
INSERT INTO public.organization_scoped_grants
 (organization_id,user_id,unit_id,capability,scope_mode,granted_by)
VALUES ('00000000-0000-4000-8000-00000000d931',
 '00000000-0000-4000-8000-00000000a932',
 current_setting('qual.scope_branch')::uuid,'reports.view','unit',
 '00000000-0000-4000-8000-00000000a931');
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a932',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.get_relief_branch_summary()
      WHERE relief_plan_id='00000000-0000-4000-8000-00000000e931')<>1
  THEN RAISE EXCEPTION 'GRANTED_BRANCH_REPORT_HIDDEN'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a934',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_command jsonb; v_result jsonb; v_denied boolean:=false;
BEGIN
  v_command:=pg_catalog.jsonb_build_object(
    'request_id','00000000-0000-4000-8000-00000000f942',
    'group_id','00000000-0000-4000-8000-00000000b931',
    'name','Local Admin Plan','coverage_amount',15,'currency','USD');
  v_result:=public.create_relief_plan_with_scope(v_command);
  IF v_result->>'decision'<>'posted' OR
     (public.get_relief_plan_scope((v_result->>'plan_id')::uuid)
       ->>'participation_mode')<>'unit'
  THEN RAISE EXCEPTION 'LOCAL_ADMIN_CREATE_DENIED'; END IF;
  BEGIN
    PERFORM public.create_relief_plan_with_scope(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(v_command,'{request_id}',
          '"00000000-0000-4000-8000-00000000f943"'),
        '{participation_mode}','"subtree"'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'LOCAL_ADMIN_EXPANDED_SCOPE'; END IF;
END
$test$;
RESET ROLE;
INSERT INTO public.payments
  (id,group_id,membership_id,amount,currency,payment_method,
   recorded_by,relief_plan_id,status)
VALUES ('00000000-0000-4000-8000-00000000e932',
  '00000000-0000-4000-8000-00000000b931',
  '00000000-0000-4000-8000-00000000c931',10,'USD','cash',
  '00000000-0000-4000-8000-00000000a931',
  '00000000-0000-4000-8000-00000000e931','pending_confirmation');
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  IF (SELECT relief_scope_version FROM public.payments
      WHERE id='00000000-0000-4000-8000-00000000e932')<>2
  THEN RAISE EXCEPTION 'OWNER_PAYMENT_SCOPE_VERSION_NOT_BOUND'; END IF;
  BEGIN
    INSERT INTO public.payments
      (id,group_id,membership_id,amount,currency,payment_method,
       recorded_by,relief_plan_id,status)
    VALUES ('00000000-0000-4000-8000-00000000e933',
      '00000000-0000-4000-8000-00000000b932',
      '00000000-0000-4000-8000-00000000c932',10,'USD','cash',
      '00000000-0000-4000-8000-00000000a932',
      '00000000-0000-4000-8000-00000000e931','pending_confirmation');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'BRANCH_PAYMENT_IGNORED_UNIT_SCOPE'; END IF;
  v_denied:=false;
  BEGIN
    UPDATE public.payments SET status='confirmed'
      WHERE id='00000000-0000-4000-8000-00000000e934';
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%LEGACY_PAYMENT_CUTOVER_REQUIRED%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'LEGACY_PAYMENT_CONFIRMED_AFTER_CUTOVER'; END IF;
END
$test$;

SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_root uuid:=current_setting('qual.scope_root')::uuid;
  v_result jsonb;
BEGIN
  v_result:=public.configure_relief_plan_scope(pg_catalog.jsonb_build_object(
    'plan_id','00000000-0000-4000-8000-00000000e931',
    'request_id','00000000-0000-4000-8000-00000000f936',
    'expected_version',2,'owning_unit_id',v_root,
    'financial_owner_group_id','00000000-0000-4000-8000-00000000b931',
    'participation_unit_id',v_root,'participation_mode','subtree',
    'collection_unit_id',v_root,'collection_mode','subtree',
    'review_unit_id',current_setting('qual.scope_branch')::uuid,
    'payout_unit_id',v_root,
    'reporting_unit_id',v_root,'reporting_mode','unit'));
  IF (v_result->>'version')::integer<>3
  THEN RAISE EXCEPTION 'SUBTREE_SCOPE_NOT_ACTIVATED'; END IF;
  BEGIN
    PERFORM public.configure_relief_plan_scope(pg_catalog.jsonb_build_object(
      'plan_id','00000000-0000-4000-8000-00000000e931',
      'request_id','00000000-0000-4000-8000-00000000f952',
      'expected_version',3,'owning_unit_id',v_root,
      'financial_owner_group_id','00000000-0000-4000-8000-00000000b931',
      'participation_unit_id',v_root,'participation_mode','subtree',
      'collection_unit_id',v_root,'collection_mode','subtree',
      'review_unit_id',current_setting('qual.scope_branch')::uuid,
      'payout_unit_id',current_setting('qual.scope_branch')::uuid,
      'reporting_unit_id',v_root,'reporting_mode','unit'));
    RAISE EXCEPTION 'DELEGATED_PAYOUT_FALSELY_CONFIGURED';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%DELEGATED_PAYOUT_ADAPTER_PENDING%'
    THEN RAISE; END IF;
  END;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a932',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_relief_branch_summary()
      WHERE relief_plan_id='00000000-0000-4000-8000-00000000e931')
  THEN RAISE EXCEPTION 'OUT_OF_AUDIENCE_BRANCH_REPORT_VISIBLE'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    INSERT INTO public.relief_enrollments
      (plan_id,membership_id,group_id,collecting_group_id,status,is_active)
    VALUES ('00000000-0000-4000-8000-00000000e931',
      '00000000-0000-4000-8000-00000000c935',
      '00000000-0000-4000-8000-00000000b932',
      '00000000-0000-4000-8000-00000000b932','active',true);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DIRECT_CONTRACTED_ENROLLMENT_ALLOWED'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a932',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_command jsonb; v_result jsonb; v_denied boolean:=false;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.list_relief_plans_for_group(
      '00000000-0000-4000-8000-00000000b932')
      WHERE id='00000000-0000-4000-8000-00000000e931')
  THEN RAISE EXCEPTION 'BRANCH_CONTRACTED_PLAN_NOT_DISCOVERABLE'; END IF;
  v_command:=pg_catalog.jsonb_build_object(
    'request_id','00000000-0000-4000-8000-00000000f960',
    'plan_id','00000000-0000-4000-8000-00000000e931',
    'membership_id','00000000-0000-4000-8000-00000000c935',
    'group_id','00000000-0000-4000-8000-00000000b932',
    'enrollment_type','full_member');
  v_result:=public.enroll_relief_person(v_command);
  IF v_result->>'decision'<>'posted' OR v_result->>'enrollment_id' IS NULL
  THEN RAISE EXCEPTION 'PERSON_COVERAGE_NOT_POSTED'; END IF;
  IF public.enroll_relief_person(v_command)->>'decision'<>'recovered'
  THEN RAISE EXCEPTION 'PERSON_COVERAGE_RETRY_DUPLICATED'; END IF;
  IF public.enroll_relief_person(pg_catalog.jsonb_set(v_command,
       '{request_id}','"00000000-0000-4000-8000-00000000f961"'))
       ->>'decision'<>'recovered'
  THEN RAISE EXCEPTION 'FRESH_INTENT_DUPLICATED_COVERAGE'; END IF;
  BEGIN
    PERFORM public.enroll_relief_person(pg_catalog.jsonb_set(v_command,
      '{enrollment_type}','"external"'));
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%IDENTITY_CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ENROLLMENT_IDENTITY_MUTATED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.relief_coverage_contracts
      WHERE plan_id='00000000-0000-4000-8000-00000000e931')<>1
     OR (SELECT count(*) FROM public.relief_enrollments
       WHERE plan_id='00000000-0000-4000-8000-00000000e931'
         AND membership_id='00000000-0000-4000-8000-00000000c935')<>1
  THEN RAISE EXCEPTION 'PERSON_COVERAGE_EFFECT_COUNT_INVALID'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a933',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_relief_plans_for_group(
      '00000000-0000-4000-8000-00000000b932'))
  THEN RAISE EXCEPTION 'CROSS_TENANT_PLAN_DISCOVERY_ALLOWED'; END IF;
  BEGIN
    PERFORM public.enroll_relief_person(pg_catalog.jsonb_build_object(
      'request_id','00000000-0000-4000-8000-00000000f960',
      'plan_id','00000000-0000-4000-8000-00000000e931',
      'membership_id','00000000-0000-4000-8000-00000000c935',
      'group_id','00000000-0000-4000-8000-00000000b932'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_TENANT_ENROLLMENT_RECOVERY_ALLOWED'; END IF;
END
$test$;
RESET ROLE;
UPDATE public.memberships SET membership_status='suspended'
  WHERE id='00000000-0000-4000-8000-00000000c932';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a932',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  IF EXISTS (SELECT 1 FROM public.list_relief_plans_for_group(
      '00000000-0000-4000-8000-00000000b932'))
  THEN RAISE EXCEPTION 'REVOKED_PLAN_DISCOVERY_ALLOWED'; END IF;
  BEGIN
    PERFORM public.enroll_relief_person(pg_catalog.jsonb_build_object(
      'request_id','00000000-0000-4000-8000-00000000f960',
      'plan_id','00000000-0000-4000-8000-00000000e931',
      'membership_id','00000000-0000-4000-8000-00000000c935',
      'group_id','00000000-0000-4000-8000-00000000b932'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_ENROLLMENT_RECOVERY_ALLOWED'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
UPDATE public.memberships SET membership_status='active'
  WHERE id='00000000-0000-4000-8000-00000000c932';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a935',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.relief_claims
  (id,plan_id,membership_id,claimant_membership_id,group_id,
   event_type,incident_date,amount,amount_requested,currency,
   description,status)
VALUES ('00000000-0000-4000-8000-00000000e938',
 '00000000-0000-4000-8000-00000000e931',
 '00000000-0000-4000-8000-00000000c935',
 '00000000-0000-4000-8000-00000000c935',
 '00000000-0000-4000-8000-00000000b931',
 'illness',CURRENT_DATE,12,12,'USD','Fictional branch claim','submitted');
RESET ROLE;
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.relief_claims
    WHERE id='00000000-0000-4000-8000-00000000e938'
      AND group_id='00000000-0000-4000-8000-00000000b931'
      AND membership_id='00000000-0000-4000-8000-00000000c935')
  THEN RAISE EXCEPTION 'BRANCH_CLAIM_NOT_FILED_AT_OWNER'; END IF;
END
$test$;
DO $test$
DECLARE v_coverage uuid; v_maturity timestamptz;
BEGIN
  SELECT id,matures_at INTO v_coverage,v_maturity
    FROM public.relief_coverage_contracts
    WHERE plan_id='00000000-0000-4000-8000-00000000e931'
      AND current_membership_id='00000000-0000-4000-8000-00000000c935';
  IF v_coverage IS NULL THEN RAISE EXCEPTION 'COVERAGE_FOR_TRANSFER_MISSING'; END IF;
  PERFORM set_config('qual.coverage_id',v_coverage::text,true);
  PERFORM set_config('qual.matures_at',v_maturity::text,true);
END
$test$;
INSERT INTO public.member_transfers
    (id,member_id,source_group_id,dest_group_id,status,requested_by,
     approved_by_source,approved_by_dest)
  VALUES ('00000000-0000-4000-8000-00000000f962',
    '00000000-0000-4000-8000-00000000a935',
    '00000000-0000-4000-8000-00000000b932',
    '00000000-0000-4000-8000-00000000b931','approved',
    '00000000-0000-4000-8000-00000000a932',
    '00000000-0000-4000-8000-00000000a932',
    '00000000-0000-4000-8000-00000000a931');
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a932',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.execute_member_transfer(
    '00000000-0000-4000-8000-00000000f962');
  IF v_result->>'ok'<>'true' THEN
    RAISE EXCEPTION 'MEMBER_TRANSFER_FAILED: %',v_result; END IF;
  IF public.execute_member_transfer(
      '00000000-0000-4000-8000-00000000f962')
      ->>'new_membership_id' IS DISTINCT FROM v_result->>'new_membership_id'
  THEN RAISE EXCEPTION 'MEMBER_TRANSFER_RETRY_DUPLICATED'; END IF;
  PERFORM set_config('qual.new_member_id',v_result->>'new_membership_id',true);
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_coverage uuid:=current_setting('qual.coverage_id')::uuid;
  v_maturity timestamptz:=current_setting('qual.matures_at')::timestamptz;
  v_new_member uuid:=current_setting('qual.new_member_id')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.relief_coverage_contracts
      WHERE id=v_coverage AND current_membership_id=v_new_member
        AND status='active' AND matures_at=v_maturity AND version=2)
     OR (SELECT count(*) FROM public.relief_coverage_contracts
       WHERE plan_id='00000000-0000-4000-8000-00000000e931')<>1
     OR (SELECT count(*) FROM public.relief_coverage_responsibilities
       WHERE contract_id=v_coverage)<>2
     OR NOT EXISTS (SELECT 1 FROM public.relief_enrollments
       WHERE plan_id='00000000-0000-4000-8000-00000000e931'
         AND membership_id=v_new_member AND is_active AND matures_at=v_maturity)
     OR EXISTS (SELECT 1 FROM public.relief_enrollments
       WHERE plan_id='00000000-0000-4000-8000-00000000e931'
         AND membership_id='00000000-0000-4000-8000-00000000c935'
         AND is_active)
  THEN RAISE EXCEPTION 'COVERAGE_TRANSFER_PROJECTION_INVALID'; END IF;
  RAISE NOTICE 'RELIEF_PERSON_TRANSFER_PASS: coverage and maturity retained';
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a932',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF public.decide_relief_claim(pg_catalog.jsonb_build_object(
      'group_id','00000000-0000-4000-8000-00000000b931',
      'claim_id','00000000-0000-4000-8000-00000000e938',
      'request_id','00000000-0000-4000-8000-00000000f963',
      'expected_version',0,'status','reviewing'))
      ->>'decision'<>'posted'
  THEN RAISE EXCEPTION 'HISTORICAL_BRANCH_CLAIM_NOT_REVIEWED'; END IF;
  IF public.decide_relief_claim(pg_catalog.jsonb_build_object(
      'group_id','00000000-0000-4000-8000-00000000b931',
      'claim_id','00000000-0000-4000-8000-00000000e938',
      'request_id','00000000-0000-4000-8000-00000000f964',
      'expected_version',1,'status','approved','amount_approved',10))
      ->>'decision'<>'posted'
  THEN RAISE EXCEPTION 'HISTORICAL_BRANCH_CLAIM_NOT_APPROVED'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_result jsonb; v_event uuid;
BEGIN
  v_result:=public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
    'claim_id','00000000-0000-4000-8000-00000000e938',
    'account_id','00000000-0000-4000-8000-00000000e937',
    'fund_id','00000000-0000-4000-8000-00000000f938'));
  v_event:=(v_result->>'financial_event_id')::uuid;
  IF v_event IS NULL THEN RAISE EXCEPTION 'BRANCH_CLAIM_OWNER_PAYOUT_FAILED'; END IF;
  PERFORM set_config('qual.branch_claim_event',v_event::text,true);
  IF public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
    'claim_id','00000000-0000-4000-8000-00000000e938',
    'account_id','00000000-0000-4000-8000-00000000e937'))
    ->>'financial_event_id' IS DISTINCT FROM v_event::text
  THEN RAISE EXCEPTION 'BRANCH_CLAIM_PAYOUT_RETRY_DUPLICATED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_event uuid:=current_setting('qual.branch_claim_event')::uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.relief_claims
      WHERE id='00000000-0000-4000-8000-00000000e938'
        AND membership_id='00000000-0000-4000-8000-00000000c935'
        AND financial_event_id=v_event AND status='paid')
     OR (SELECT count(*) FROM public.financial_postings
       WHERE event_id=v_event)<>2
     OR (SELECT count(*) FROM financial_core.financial_event_audit_links
       WHERE event_id=v_event)<>1
  THEN RAISE EXCEPTION 'BRANCH_CLAIM_OWNER_PAYOUT_FAILED'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.get_relief_branch_summary()
      WHERE relief_plan_id='00000000-0000-4000-8000-00000000e931'
        AND collecting_group_id='00000000-0000-4000-8000-00000000b931'
        AND enrolled_count=2)
     OR NOT EXISTS (SELECT 1 FROM public.get_relief_branch_summary()
      WHERE relief_plan_id='00000000-0000-4000-8000-00000000e931'
        AND collecting_group_id='00000000-0000-4000-8000-00000000b932'
        AND enrolled_count=1)
  THEN RAISE EXCEPTION 'TRANSFER_DOUBLE_COUNTED_OR_HIDDEN'; END IF;
END
$test$;
RESET ROLE;
SAVEPOINT relief_out_of_scope_transfer;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.configure_relief_plan_scope(pg_catalog.jsonb_build_object(
    'plan_id','00000000-0000-4000-8000-00000000e931',
    'request_id','00000000-0000-4000-8000-00000000f965',
    'expected_version',3,
    'owning_unit_id',current_setting('qual.scope_root')::uuid,
    'financial_owner_group_id','00000000-0000-4000-8000-00000000b931',
    'participation_unit_id',current_setting('qual.scope_root')::uuid,
    'participation_mode','unit',
    'collection_unit_id',current_setting('qual.scope_root')::uuid,
    'collection_mode','unit',
    'review_unit_id',current_setting('qual.scope_branch')::uuid,
    'payout_unit_id',current_setting('qual.scope_root')::uuid,
    'reporting_unit_id',current_setting('qual.scope_root')::uuid,
    'reporting_mode','unit'));
  IF (v_result->>'version')::integer<>4
  THEN RAISE EXCEPTION 'UNIT_SCOPE_FOR_SUSPENSION_FAILED'; END IF;
END
$test$;
RESET ROLE;
INSERT INTO public.member_transfers
  (id,member_id,source_group_id,dest_group_id,status,requested_by,
   approved_by_source,approved_by_dest)
VALUES ('00000000-0000-4000-8000-00000000f966',
  '00000000-0000-4000-8000-00000000a935',
  '00000000-0000-4000-8000-00000000b931',
  '00000000-0000-4000-8000-00000000b932','approved',
  '00000000-0000-4000-8000-00000000a931',
  '00000000-0000-4000-8000-00000000a931',
  '00000000-0000-4000-8000-00000000a932');
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF public.execute_member_transfer(
      '00000000-0000-4000-8000-00000000f966')->>'ok'<>'true'
  THEN RAISE EXCEPTION 'OUT_OF_SCOPE_TRANSFER_FAILED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_suspended uuid;
BEGIN
  SELECT suspended_membership_id INTO v_suspended
    FROM public.relief_coverage_contracts
    WHERE id=current_setting('qual.coverage_id')::uuid
      AND status='suspended_out_of_scope'
      AND current_membership_id IS NULL
      AND matures_at=current_setting('qual.matures_at')::timestamptz
      AND version=3;
  IF v_suspended IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.relief_coverage_responsibilities
      WHERE contract_id=current_setting('qual.coverage_id')::uuid
        AND membership_id=v_suspended
        AND coverage_status='suspended_out_of_scope'
        AND effective_to IS NULL)
  THEN RAISE EXCEPTION 'OUT_OF_SCOPE_COVERAGE_NOT_SUSPENDED'; END IF;
END
$test$;
INSERT INTO public.member_transfers
  (id,member_id,source_group_id,dest_group_id,status,requested_by,
   approved_by_source,approved_by_dest)
VALUES ('00000000-0000-4000-8000-00000000f967',
  '00000000-0000-4000-8000-00000000a935',
  '00000000-0000-4000-8000-00000000b932',
  '00000000-0000-4000-8000-00000000b931','approved',
  '00000000-0000-4000-8000-00000000a931',
  '00000000-0000-4000-8000-00000000a932',
  '00000000-0000-4000-8000-00000000a931');
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF public.execute_member_transfer(
      '00000000-0000-4000-8000-00000000f967')->>'ok'<>'true'
  THEN RAISE EXCEPTION 'RETURN_TO_SCOPE_TRANSFER_FAILED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.relief_coverage_contracts
      WHERE id=current_setting('qual.coverage_id')::uuid
        AND status='active' AND current_membership_id IS NOT NULL
        AND suspended_membership_id IS NULL
        AND matures_at=current_setting('qual.matures_at')::timestamptz
        AND version=4)
     OR (SELECT count(*) FROM public.relief_coverage_responsibilities
       WHERE contract_id=current_setting('qual.coverage_id')::uuid)<>4
     OR (SELECT count(*) FROM public.relief_enrollments
       WHERE plan_id='00000000-0000-4000-8000-00000000e931'
         AND membership_id=(SELECT current_membership_id
           FROM public.relief_coverage_contracts
           WHERE id=current_setting('qual.coverage_id')::uuid)
         AND is_active)<>1
  THEN RAISE EXCEPTION 'RETURN_TO_SCOPE_RESET_COVERAGE'; END IF;
  RAISE NOTICE 'RELIEF_OUT_OF_SCOPE_TRANSFER_PASS: suspension and return retain maturity';
END
$test$;
ROLLBACK TO SAVEPOINT relief_out_of_scope_transfer;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a932',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_result jsonb; v_denied boolean:=false;
BEGIN
  v_result:=public.decide_relief_claim(pg_catalog.jsonb_build_object(
    'group_id','00000000-0000-4000-8000-00000000b931',
    'claim_id','00000000-0000-4000-8000-00000000e936',
    'request_id','00000000-0000-4000-8000-00000000f950',
    'expected_version',0,'status','reviewing'));
  IF v_result->>'decision'<>'posted' THEN
    RAISE EXCEPTION 'DESIGNATED_BRANCH_REVIEWER_DENIED'; END IF;
  IF (SELECT count(*) FROM public.relief_claims
      WHERE id='00000000-0000-4000-8000-00000000e936')<>1
     OR (SELECT count(*) FROM public.list_relief_claim_decisions(
       '00000000-0000-4000-8000-00000000e936'))<>1
  THEN RAISE EXCEPTION 'DESIGNATED_REVIEWER_DETAIL_OR_HISTORY_HIDDEN'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a934',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  IF NOT public.can_pay_relief_plan(
      '00000000-0000-4000-8000-00000000e931')
     OR NOT EXISTS (SELECT 1 FROM public.relief_claims
      WHERE id='00000000-0000-4000-8000-00000000e936')
  THEN RAISE EXCEPTION 'AUTHORIZED_PAYER_CANNOT_VIEW_CLAIM'; END IF;
  BEGIN
    PERFORM public.list_relief_claim_decisions(
      '00000000-0000-4000-8000-00000000e936');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%UNAUTHORIZED%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'UNDESIGNATED_OWNER_ADMIN_SAW_HISTORY'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.decide_relief_claim(pg_catalog.jsonb_build_object(
      'group_id','00000000-0000-4000-8000-00000000b931',
      'claim_id','00000000-0000-4000-8000-00000000e936',
      'request_id','00000000-0000-4000-8000-00000000f951',
      'expected_version',1,'status','approved','amount_approved',15));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'UNDESIGNATED_OWNER_REVIEWED'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a932',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_result jsonb; v_denied boolean:=false;
BEGIN
  v_result:=public.decide_relief_claim(pg_catalog.jsonb_build_object(
    'group_id','00000000-0000-4000-8000-00000000b931',
    'claim_id','00000000-0000-4000-8000-00000000e936',
    'request_id','00000000-0000-4000-8000-00000000f951',
    'expected_version',1,'status','approved','amount_approved',15));
  IF v_result->>'decision'<>'posted' THEN
    RAISE EXCEPTION 'DESIGNATED_BRANCH_APPROVAL_DENIED'; END IF;
  BEGIN
    PERFORM public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
      'claim_id','00000000-0000-4000-8000-00000000e936',
      'account_id','00000000-0000-4000-8000-00000000e937'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REVIEWER_SPENT_OWNER_CUSTODY'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_result jsonb; v_event uuid;
BEGIN
  v_result:=public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
    'claim_id','00000000-0000-4000-8000-00000000e936',
    'account_id','00000000-0000-4000-8000-00000000e937',
    'fund_id','00000000-0000-4000-8000-00000000f938'));
  v_event:=(v_result->>'financial_event_id')::uuid;
  IF v_result->>'ok'<>'true' OR v_event IS NULL
  THEN RAISE EXCEPTION 'SCOPED_OWNER_PAYOUT_NOT_ATOMIC'; END IF;
  PERFORM set_config('qual.scope_payout_event',v_event::text,true);
  v_result:=public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
    'claim_id','00000000-0000-4000-8000-00000000e936',
    'account_id','00000000-0000-4000-8000-00000000e937'));
  IF v_result->>'financial_event_id' IS DISTINCT FROM v_event::text
  THEN RAISE EXCEPTION 'SCOPED_OWNER_PAYOUT_RETRY_DUPLICATED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_event uuid:=current_setting('qual.scope_payout_event')::uuid;
BEGIN
  IF (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_event)<>2
     OR (SELECT count(*) FROM financial_core.financial_event_audit_links
       WHERE event_id=v_event)<>1
     OR (SELECT count(*) FROM public.relief_claim_decisions
       WHERE claim_id='00000000-0000-4000-8000-00000000e936'
         AND new_status='paid')<>1
  THEN RAISE EXCEPTION 'SCOPED_OWNER_PAYOUT_EFFECT_DUPLICATED'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
UPDATE public.memberships SET membership_status='suspended'
  WHERE id='00000000-0000-4000-8000-00000000c932';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a932',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.decide_relief_claim(pg_catalog.jsonb_build_object(
      'group_id','00000000-0000-4000-8000-00000000b931',
      'claim_id','00000000-0000-4000-8000-00000000e936',
      'request_id','00000000-0000-4000-8000-00000000f951',
      'expected_version',1,'status','approved','amount_approved',15));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_REVIEW_REPLAY_ALLOWED'; END IF;
END
$test$;
RESET ROLE;
INSERT INTO public.payments
  (id,group_id,membership_id,amount,currency,payment_method,
   recorded_by,relief_plan_id,status)
VALUES ('00000000-0000-4000-8000-00000000e933',
  '00000000-0000-4000-8000-00000000b932',
  '00000000-0000-4000-8000-00000000c932',10,'USD','cash',
  '00000000-0000-4000-8000-00000000a932',
  '00000000-0000-4000-8000-00000000e931','pending_confirmation');
DO $test$
BEGIN
  IF (SELECT relief_scope_version FROM public.payments
      WHERE id='00000000-0000-4000-8000-00000000e933')<>3
     OR (SELECT count(*) FROM financial_core.relief_plan_scope_membership m
       JOIN public.relief_plan_scope_versions s ON s.id=m.scope_id
       WHERE s.plan_id='00000000-0000-4000-8000-00000000e931'
         AND s.version=3 AND m.purpose='participation')<>2
  THEN RAISE EXCEPTION 'BRANCH_PAYMENT_SCOPE_VERSION_NOT_BOUND'; END IF;
END
$test$;
UPDATE public.organizations SET topology_version=topology_version+1
  WHERE id='00000000-0000-4000-8000-00000000d931';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  IF (public.get_relief_plan_scope(
      '00000000-0000-4000-8000-00000000e931')
      ->>'topology_stale')<>'true'
  THEN RAISE EXCEPTION 'STALE_SCOPE_NOT_DISPLAYED'; END IF;
  BEGIN
    PERFORM public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
      'claim_id','00000000-0000-4000-8000-00000000e936',
      'account_id','00000000-0000-4000-8000-00000000e937'));
    RAISE EXCEPTION 'STALE_TOPOLOGY_PAYOUT_REPLAY_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.payments
      (id,group_id,membership_id,amount,currency,payment_method,
       recorded_by,relief_plan_id,status)
    VALUES ('00000000-0000-4000-8000-00000000e935',
      '00000000-0000-4000-8000-00000000b932',
      '00000000-0000-4000-8000-00000000c932',10,'USD','cash',
      '00000000-0000-4000-8000-00000000a932',
      '00000000-0000-4000-8000-00000000e931','pending_confirmation');
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%TOPOLOGY_STALE%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'NEW_RECEIPT_USED_STALE_TOPOLOGY'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_root uuid:=current_setting('qual.scope_root')::uuid;
  v_other uuid:=current_setting('qual.scope_other')::uuid;
  v_created jsonb; v_command jsonb; v_denied boolean:=false;
BEGIN
  IF (public.configure_relief_plan_scope(pg_catalog.jsonb_build_object(
    'plan_id','00000000-0000-4000-8000-00000000e931',
    'request_id','00000000-0000-4000-8000-00000000f937',
    'expected_version',3,'owning_unit_id',v_root,
    'financial_owner_group_id','00000000-0000-4000-8000-00000000b931',
    'participation_unit_id',v_root,'participation_mode','unit',
    'collection_unit_id',v_root,'collection_mode','unit',
    'review_unit_id',v_root,'payout_unit_id',v_root,
    'reporting_unit_id',v_root,'reporting_mode','organization'))
    ->>'version')::integer<>4
  THEN RAISE EXCEPTION 'UNIT_SCOPE_NOT_REACTIVATED'; END IF;
  v_command:=pg_catalog.jsonb_build_object(
    'request_id','00000000-0000-4000-8000-00000000f940',
    'group_id','00000000-0000-4000-8000-00000000b931',
    'name','Atomic Local Plan','coverage_amount',25,
    'currency','USD','waiting_period_days',10);
  v_created:=public.create_relief_plan_with_scope(v_command);
  IF v_created->>'decision'<>'posted' OR
     (public.get_relief_plan_scope((v_created->>'plan_id')::uuid)
       ->>'version')::integer<>1
  THEN RAISE EXCEPTION 'ATOMIC_PLAN_SCOPE_CREATE_FAILED'; END IF;
  IF public.create_relief_plan_with_scope(v_command)->>'decision'<>'recovered'
  THEN RAISE EXCEPTION 'PLAN_CREATE_RETRY_NOT_RECOVERED'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.create_relief_plan_with_scope(
      pg_catalog.jsonb_set(v_command,'{coverage_amount}','26'));
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%INTENT_CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CHANGED_PLAN_INTENT_ALLOWED'; END IF;
  v_denied:=false;
  BEGIN
    INSERT INTO public.relief_plans
      (group_id,name,created_by,currency,status,is_active)
    VALUES ('00000000-0000-4000-8000-00000000b931',
      'Unscoped Direct Plan',auth.uid(),'USD','active',true);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DIRECT_UNSCOPED_PLAN_INSERT_ALLOWED'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.create_relief_plan_with_scope(
      pg_catalog.jsonb_set(
        pg_catalog.jsonb_set(v_command,'{request_id}',
          '"00000000-0000-4000-8000-00000000f941"'),
        '{participation_unit_id}',pg_catalog.to_jsonb(v_other)));
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%CROSS_ORGANIZATION%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'BAD_SCOPE_CREATE_NOT_ROLLED_BACK'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.configure_relief_plan_scope(
      pg_catalog.jsonb_build_object(
        'plan_id',(v_created->>'plan_id')::uuid,
        'request_id','00000000-0000-4000-8000-00000000f944',
        'expected_version',1,'owning_unit_id',v_root,
        'financial_owner_group_id','00000000-0000-4000-8000-00000000b931',
        'participation_unit_id',v_root,'participation_mode','subtree',
        'collection_unit_id',v_root,'collection_mode','subtree',
        'review_unit_id',v_root,'payout_unit_id',v_root,
        'reporting_unit_id',v_root,'reporting_mode','organization'));
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%EXPANSION_REQUIRES_NEW_PLAN%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'LOCAL_PLAN_EXPANDED_WITHOUT_LEGACY_FLAG'; END IF;
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  IF (SELECT count(*) FROM public.relief_plans
      WHERE name='Atomic Local Plan')<>1
     OR EXISTS (SELECT 1 FROM financial_core.relief_plan_create_intents
       WHERE request_id='00000000-0000-4000-8000-00000000f941')
  THEN RAISE EXCEPTION 'PLAN_CREATE_ATOMICITY_INVALID'; END IF;
  BEGIN
    UPDATE public.relief_plans SET shared_from_org=true
      WHERE name='Atomic Local Plan';
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%SCOPE_IDENTITY_IMMUTABLE%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'SCOPED_PLAN_IDENTITY_MUTATED'; END IF;
END
$test$;
UPDATE public.payments SET status='rejected'
  WHERE id='00000000-0000-4000-8000-00000000e933';
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    UPDATE public.payments SET relief_scope_version=4
      WHERE id='00000000-0000-4000-8000-00000000e933';
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%SCOPE_IMMUTABLE%'; END;
  IF NOT v_denied OR
     (SELECT relief_scope_version FROM public.payments
      WHERE id='00000000-0000-4000-8000-00000000e933')<>3
  THEN RAISE EXCEPTION 'RECEIPT_SCOPE_LINEAGE_MUTATED'; END IF;
END
$test$;

SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a932',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false; v_root uuid;
BEGIN
  v_root:=current_setting('qual.scope_root')::uuid;
  BEGIN
    PERFORM public.configure_relief_plan_scope(pg_catalog.jsonb_build_object(
      'plan_id','00000000-0000-4000-8000-00000000e931',
      'request_id','00000000-0000-4000-8000-00000000f935',
      'expected_version',2,'owning_unit_id',v_root,
      'financial_owner_group_id','00000000-0000-4000-8000-00000000b931',
      'participation_unit_id',v_root,'participation_mode','subtree',
      'collection_unit_id',v_root,'collection_mode','subtree',
      'review_unit_id',v_root,'payout_unit_id',v_root,
      'reporting_unit_id',v_root,'reporting_mode','subtree'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'BRANCH_ADMIN_CONFIGURED_OWNER_PLAN'; END IF;
END
$test$;
RESET ROLE;
UPDATE public.organization_scoped_grants SET revoked_at=now()
  WHERE user_id='00000000-0000-4000-8000-00000000a931'
    AND capability='hierarchy.manage';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a931',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false; v_root uuid;
BEGIN
  v_root:=current_setting('qual.scope_root')::uuid;
  BEGIN
    PERFORM public.configure_relief_plan_scope(pg_catalog.jsonb_build_object(
      'plan_id','00000000-0000-4000-8000-00000000e931',
      'request_id','00000000-0000-4000-8000-00000000f931',
      'expected_version',0,'owning_unit_id',v_root,
      'financial_owner_group_id','00000000-0000-4000-8000-00000000b931',
      'participation_unit_id',v_root,'participation_mode','subtree',
      'collection_unit_id',v_root,'collection_mode','subtree',
      'review_unit_id',v_root,'payout_unit_id',v_root,
      'reporting_unit_id',v_root,'reporting_mode','organization'));
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_SCOPE_RECOVERY_ALLOWED'; END IF;
  RAISE NOTICE 'RELIEF_PLAN_SCOPE_PASS: hierarchy modes, version/retry/payload, cross-org and current authorization';
END
$test$;
RESET ROLE;
ROLLBACK;
