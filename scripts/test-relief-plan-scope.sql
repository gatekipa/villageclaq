-- R-002/R-003 local plan-contract diagnostic; fictional rows roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a931','scope-owner@example.test'),
 ('00000000-0000-4000-8000-00000000a932','branch-admin@example.test'),
 ('00000000-0000-4000-8000-00000000a933','other-admin@example.test'),
 ('00000000-0000-4000-8000-00000000a934','local-admin@example.test');
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
  '00000000-0000-4000-8000-00000000b931','admin','active');
INSERT INTO public.group_subscriptions(group_id,tier,status)
VALUES ('00000000-0000-4000-8000-00000000b931','pro','active');
INSERT INTO public.relief_plans(id,group_id,name,created_by,
  is_active,status,currency,shared_from_org)
VALUES ('00000000-0000-4000-8000-00000000e931',
 '00000000-0000-4000-8000-00000000b931','Scoped Plan',
 '00000000-0000-4000-8000-00000000a931',true,'active','USD',true);
INSERT INTO public.relief_enrollments
 (plan_id,membership_id,group_id,collecting_group_id,status,is_active)
VALUES ('00000000-0000-4000-8000-00000000e931',
 '00000000-0000-4000-8000-00000000c932',
 '00000000-0000-4000-8000-00000000b932',
 '00000000-0000-4000-8000-00000000b932','active',true);
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
      WHERE relief_plan_id='00000000-0000-4000-8000-00000000e931')<>1
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
    'review_unit_id',v_root,'payout_unit_id',v_root,
    'reporting_unit_id',v_root,'reporting_mode','unit'));
  IF (v_result->>'version')::integer<>3
  THEN RAISE EXCEPTION 'SUBTREE_SCOPE_NOT_ACTIVATED'; END IF;
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
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  IF (public.get_relief_plan_scope(
      '00000000-0000-4000-8000-00000000e931')
      ->>'topology_stale')<>'true'
  THEN RAISE EXCEPTION 'STALE_SCOPE_NOT_DISPLAYED'; END IF;
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
