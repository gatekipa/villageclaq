-- H-001–H-005 representative transactional acceptance on the S0/M2 upgrade.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a401','hierarchy-owner@example.test'),
 ('00000000-0000-4000-8000-00000000a402','hierarchy-member@example.test');
INSERT INTO public.organizations(id,name,slug,owner_id)
VALUES ('00000000-0000-4000-8000-00000000d401','Fictional Federation',
 'fictional-federation','00000000-0000-4000-8000-00000000a401'),
 ('00000000-0000-4000-8000-00000000d402','Other Federation',
 'other-federation','00000000-0000-4000-8000-00000000a402');
INSERT INTO public.groups(id,organization_id,name,slug,currency) VALUES
 ('00000000-0000-4000-8000-00000000b401',
  '00000000-0000-4000-8000-00000000d401','HQ','hq','USD'),
 ('00000000-0000-4000-8000-00000000b402',
  '00000000-0000-4000-8000-00000000d401','Region','region','USD'),
 ('00000000-0000-4000-8000-00000000b403',
  '00000000-0000-4000-8000-00000000d401','Branch','branch','USD'),
 ('00000000-0000-4000-8000-00000000b404',
  '00000000-0000-4000-8000-00000000d402','Independent','independent','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status) VALUES
 ('00000000-0000-4000-8000-00000000c401',
  '00000000-0000-4000-8000-00000000a401',
  '00000000-0000-4000-8000-00000000b401','owner','active'),
 ('00000000-0000-4000-8000-00000000c402',
  '00000000-0000-4000-8000-00000000a402',
  '00000000-0000-4000-8000-00000000b402','member','active'),
 ('00000000-0000-4000-8000-00000000c405',
  '00000000-0000-4000-8000-00000000a401',
  '00000000-0000-4000-8000-00000000b402','owner','active'),
 ('00000000-0000-4000-8000-00000000c403',
  '00000000-0000-4000-8000-00000000a402',
  '00000000-0000-4000-8000-00000000b404','owner','active');
DO $test$
DECLARE v_root uuid; v_region uuid; v_branch uuid; v_other uuid;
  v_aggregate uuid;
  v_old_version bigint; v_new_version bigint; v_denied boolean;
BEGIN
  SELECT id INTO v_root FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b401';
  SELECT id INTO v_region FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b402';
  SELECT id INTO v_branch FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b403';
  SELECT id INTO v_other FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b404';
  IF v_root IS NULL OR v_region IS NULL OR v_branch IS NULL OR v_other IS NULL
    OR (SELECT count(*) FROM public.organization_unit_closure
        WHERE ancestor_id=v_root)<>3
    OR (SELECT count(*) FROM public.organization_units
        WHERE organization_id='00000000-0000-4000-8000-00000000d401'
          AND parent_id IS NULL)<>1
  THEN RAISE EXCEPTION 'HIERARCHY_BOOTSTRAP_FAIL'; END IF;
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-00000000a402',true);
  IF public.has_organization_scope(v_region,v_region,'hierarchy.manage')
  THEN RAISE EXCEPTION 'MEMBER_SCOPE_FORGED'; END IF;
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-00000000a401',true);
  IF NOT public.has_organization_scope(v_root,v_region,'hierarchy.manage')
  THEN RAISE EXCEPTION 'OWNER_SCOPE_MISSING'; END IF;
  IF (SELECT count(*) FROM public.list_organization_scope_candidates(
      '00000000-0000-4000-8000-00000000d401'))<>2
    THEN RAISE EXCEPTION 'CROSS_BRANCH_GRANT_CANDIDATES_MISSING'; END IF;
  SELECT topology_version INTO v_old_version FROM public.organizations
    WHERE id='00000000-0000-4000-8000-00000000d401';
  v_aggregate:=public.create_aggregate_unit(v_branch,'Country aggregate');
  IF EXISTS (SELECT 1 FROM public.organization_units
    WHERE id=v_aggregate AND group_id IS NOT NULL)
  THEN RAISE EXCEPTION 'AGGREGATE_HAS_FINANCIAL_GROUP'; END IF;
  PERFORM public.move_organization_unit(v_region,v_aggregate,
    'Fictional authorized reparent');
  SELECT topology_version INTO v_new_version FROM public.organizations
    WHERE id='00000000-0000-4000-8000-00000000d401';
  IF v_new_version<>v_old_version+2 OR NOT EXISTS(
    SELECT 1 FROM public.organization_unit_closure
    WHERE ancestor_id=v_branch AND descendant_id=v_region AND depth=2)
    OR (SELECT count(*) FROM public.organization_unit_parent_history
      WHERE unit_id=v_region)<>2
    OR (SELECT count(*) FROM public.organization_hierarchy_audit
      WHERE unit_id=v_region)<>1
  THEN RAISE EXCEPTION 'MOVE_HISTORY_FAIL'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.move_organization_unit(v_branch,v_region,
      'Attempted fictional cycle');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%HIERARCHY_CYCLE%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CYCLE_ACCEPTED'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.move_organization_unit(v_region,v_other,
      'Attempted cross organization move');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%CROSS_ORGANIZATION%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_ORG_ACCEPTED'; END IF;
  PERFORM public.set_organization_scope_grant(v_region,
    '00000000-0000-4000-8000-00000000a402','hierarchy.manage','unit',false);
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-00000000a402',true);
  IF NOT public.has_organization_scope(v_region,v_region,'hierarchy.manage')
    OR public.has_organization_scope(v_region,v_branch,'hierarchy.manage')
  THEN RAISE EXCEPTION 'SCOPE_MODE_FAIL'; END IF;
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-00000000a401',true);
  PERFORM public.set_organization_scope_grant(v_region,
    '00000000-0000-4000-8000-00000000a402','hierarchy.manage','unit',true);
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-00000000a402',true);
  IF public.has_organization_scope(v_region,v_region,'hierarchy.manage')
  THEN RAISE EXCEPTION 'REVOKED_SCOPE_ACTIVE'; END IF;
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-00000000a401',true);
  v_denied:=false;
  BEGIN PERFORM public.archive_organization_unit(
    v_aggregate,'Attempt active-child archive');
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%ARCHIVE_ACTIVE_UNIT_OR_CHILDREN%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ACTIVE_SUBTREE_ARCHIVED'; END IF;
  PERFORM public.move_organization_unit(v_region,v_root,
    'Return region before aggregate archive');
  PERFORM public.archive_organization_unit(v_aggregate,
    'Retire empty fictional region');
  IF (SELECT archived_at FROM public.organization_units
      WHERE id=v_aggregate) IS NULL
    OR EXISTS (SELECT 1 FROM public.organization_unit_closure
      WHERE descendant_id=v_aggregate)
    OR NOT EXISTS (SELECT 1 FROM public.organization_unit_parent_history
      WHERE unit_id=v_aggregate)
    OR NOT EXISTS (SELECT 1 FROM public.organization_hierarchy_audit
      WHERE unit_id=v_aggregate AND action='archive')
    THEN RAISE EXCEPTION 'ARCHIVE_LOST_HISTORY_OR_CURRENT_PROJECTION'; END IF;
  RAISE NOTICE 'HIERARCHY_PASS: root, closure, history, move audit, cycle, cross-org, unit grant, revocation';
END
$test$;
DO $test$
DECLARE v_root uuid; v_branch uuid; v_country uuid; v_region uuid;
  v_chapter uuid; v_parent uuid; v_denied boolean:=false; v_i int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub',
    '00000000-0000-4000-8000-00000000a401',true);
  SELECT id INTO v_root FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b401';
  SELECT id INTO v_branch FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b403';
  v_country:=public.create_aggregate_unit(v_root,'Country');
  v_region:=public.create_aggregate_unit(v_country,'Region');
  v_chapter:=public.create_aggregate_unit(v_region,'Chapter');
  PERFORM public.move_organization_unit(v_branch,v_chapter,
    'Place fictional branch under chapter');
  IF NOT EXISTS (SELECT 1 FROM public.organization_unit_closure
      WHERE ancestor_id=v_root AND descendant_id=v_branch AND depth=4)
    THEN RAISE EXCEPTION 'DEEP_TOPOLOGY_FAILED'; END IF;
  v_parent:=v_root;
  FOR v_i IN 1..32 LOOP
    v_parent:=public.create_aggregate_unit(v_parent,'Depth '||v_i);
  END LOOP;
  BEGIN PERFORM public.create_aggregate_unit(v_parent,'Too deep');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%HIERARCHY_DEPTH%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DEPTH_33_ACCEPTED'; END IF;
  RAISE NOTICE 'HIERARCHY_DEEP_PASS: five-level shape and depth-32 bound';
END
$test$;
SELECT set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000a401',true);
SET LOCAL ROLE authenticated;
SELECT public.transfer_group_ownership(jsonb_build_object(
  'group_id','00000000-0000-4000-8000-00000000b402',
  'new_owner_membership_id','00000000-0000-4000-8000-00000000c402'));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
  '00000000-0000-4000-8000-00000000a402',true);
DO $test$
DECLARE v_root uuid; v_region uuid; v_denied boolean:=false;
BEGIN
  SELECT id INTO v_root FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b401';
  SELECT id INTO v_region FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b402';
  IF public.has_organization_scope(v_root,v_root,'hierarchy.manage')
    THEN RAISE EXCEPTION 'BRANCH_OWNER_ESCALATED_ORG'; END IF;
  BEGIN
    PERFORM public.set_organization_scope_grant(v_region,
      '00000000-0000-4000-8000-00000000a402',
      'hierarchy.manage','organization',false);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'BRANCH_OWNER_GRANTED_ORG'; END IF;
  v_denied:=false;
  BEGIN PERFORM count(*) FROM public.list_organization_scope_candidates(
    '00000000-0000-4000-8000-00000000d401');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'BRANCH_OWNER_SAW_ORG_CANDIDATES'; END IF;
  RAISE NOTICE 'HIERARCHY_SCOPE_PASS: branch ownership is not organization authority';
END
$test$;
ROLLBACK;
