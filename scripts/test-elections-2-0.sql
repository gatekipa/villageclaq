-- Transactional E-001–E-011 behavioral probe on the real upgraded catalog.
-- Fictional actors only; every row rolls back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a701','election-owner@example.test'),
 ('00000000-0000-4000-8000-00000000a702','election-member@example.test'),
 ('00000000-0000-4000-8000-00000000a703','election-outsider@example.test');
INSERT INTO public.organizations(id,name,slug,owner_id) VALUES
 ('00000000-0000-4000-8000-00000000d701','Fictional Federation','fictional-election-federation',
  '00000000-0000-4000-8000-00000000a701'),
 ('00000000-0000-4000-8000-00000000d702','Outside Federation','outside-election-federation',
  '00000000-0000-4000-8000-00000000a703');
INSERT INTO public.groups(id,organization_id,name,slug,currency) VALUES
 ('00000000-0000-4000-8000-00000000b701','00000000-0000-4000-8000-00000000d701','HQ','election-hq','USD'),
 ('00000000-0000-4000-8000-00000000b702','00000000-0000-4000-8000-00000000d701','Branch','election-branch','USD'),
 ('00000000-0000-4000-8000-00000000b703','00000000-0000-4000-8000-00000000d702','Other','election-other','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status) VALUES
 ('00000000-0000-4000-8000-00000000c701','00000000-0000-4000-8000-00000000a701','00000000-0000-4000-8000-00000000b701','owner','active'),
 ('00000000-0000-4000-8000-00000000c702','00000000-0000-4000-8000-00000000a702','00000000-0000-4000-8000-00000000b701','member','active'),
 ('00000000-0000-4000-8000-00000000c703','00000000-0000-4000-8000-00000000a702','00000000-0000-4000-8000-00000000b702','member','active'),
 ('00000000-0000-4000-8000-00000000c704','00000000-0000-4000-8000-00000000a703','00000000-0000-4000-8000-00000000b703','owner','active');
INSERT INTO public.group_subscriptions(group_id,tier,status) VALUES
 ('00000000-0000-4000-8000-00000000b701','pro','active');
INSERT INTO public.elections(id,group_id,title,starts_at,ends_at,created_by) VALUES
 ('00000000-0000-4000-8000-00000000e701','00000000-0000-4000-8000-00000000b701',
  'Fictional local poll',now()-interval '1 minute',now()+interval '1 day',
  '00000000-0000-4000-8000-00000000a701'),
 ('00000000-0000-4000-8000-00000000e702','00000000-0000-4000-8000-00000000b701',
  'Fictional federation poll',now()-interval '1 minute',now()+interval '1 day',
  '00000000-0000-4000-8000-00000000a701'),
 ('00000000-0000-4000-8000-00000000e703','00000000-0000-4000-8000-00000000b701',
  'Fictional officer election',now()-interval '1 minute',now()+interval '1 day',
  '00000000-0000-4000-8000-00000000a701'),
 ('00000000-0000-4000-8000-00000000e704','00000000-0000-4000-8000-00000000b701',
  'Fictional changed scope',now()-interval '1 minute',now()+interval '1 day',
  '00000000-0000-4000-8000-00000000a701');
UPDATE public.elections SET election_type='officer_election'
  WHERE id IN ('00000000-0000-4000-8000-00000000e703',
    '00000000-0000-4000-8000-00000000e704');
INSERT INTO public.group_positions(id,group_id,title) VALUES
 ('00000000-0000-4000-8000-00000000d703',
  '00000000-0000-4000-8000-00000000b701','Fictional Chair');
INSERT INTO public.election_candidates(id,election_id,membership_id,position_id)
VALUES ('00000000-0000-4000-8000-00000000f703',
 '00000000-0000-4000-8000-00000000e703',
 '00000000-0000-4000-8000-00000000c701',
 '00000000-0000-4000-8000-00000000d703');
INSERT INTO public.election_options(id,election_id,label) VALUES
 ('00000000-0000-4000-8000-00000000f701','00000000-0000-4000-8000-00000000e701','Yes'),
 ('00000000-0000-4000-8000-00000000f702','00000000-0000-4000-8000-00000000e702','Yes');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a701',true);
DO $test$
DECLARE v_root uuid; v_result jsonb; v_denied boolean; v_person record;
  v_aggregate uuid; v_frozen_version bigint;
BEGIN
  SELECT id INTO v_root FROM public.organization_units
    WHERE group_id='00000000-0000-4000-8000-00000000b701';
  v_denied:=false;
  BEGIN
    INSERT INTO public.elections(group_id,title,starts_at,ends_at,created_by,status)
    VALUES('00000000-0000-4000-8000-00000000b701','Forged open',
      now()-interval '1 minute',now()+interval '1 day',
      '00000000-0000-4000-8000-00000000a701','open');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%ELECTION_MUST_START_DRAFT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DIRECT_OPEN_ACCEPTED'; END IF;
  PERFORM public.configure_election_scope_v2(
    '00000000-0000-4000-8000-00000000e704',v_root,'organization');
  INSERT INTO public.election_candidates(election_id,membership_id)
    VALUES('00000000-0000-4000-8000-00000000e704',
      '00000000-0000-4000-8000-00000000c703');
  PERFORM public.configure_election_scope_v2(
    '00000000-0000-4000-8000-00000000e704',v_root,'unit');
  v_denied:=false;
  BEGIN PERFORM public.open_election_v2(
    '00000000-0000-4000-8000-00000000e704',v_root,'unit');
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%CANDIDATE_SCOPE_OR_STATUS%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'OUT_OF_SCOPE_CANDIDATE_OPENED'; END IF;
  PERFORM public.open_election_v2(
    '00000000-0000-4000-8000-00000000e703',v_root,'unit');
  v_result:=public.open_election_v2('00000000-0000-4000-8000-00000000e701',v_root,'unit');
  IF (v_result->>'eligible_count')::int<>2 THEN RAISE EXCEPTION 'LOCAL_SNAPSHOT'; END IF;
  v_denied:=false;
  BEGIN
    PERFORM public.open_election_v2('00000000-0000-4000-8000-00000000e702',v_root,'organization');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%AMBIGUOUS_PERSON_IDENTITY%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'AMBIGUOUS_IDENTITY_ACCEPTED'; END IF;
  FOR v_person IN SELECT person_id FROM public.list_organization_people(v_root)
  LOOP PERFORM public.verify_organization_person(v_person.person_id,v_root); END LOOP;
  v_result:=public.open_election_v2('00000000-0000-4000-8000-00000000e702',v_root,'organization');
  IF (v_result->>'eligible_count')::int<>2
    THEN RAISE EXCEPTION 'PERSON_DEDUP_FAILED %',v_result; END IF;
  SELECT frozen_topology_version INTO v_frozen_version FROM public.elections
    WHERE id='00000000-0000-4000-8000-00000000e702';
  v_aggregate:=public.create_aggregate_unit(v_root,'Fictional Region');
  PERFORM public.move_organization_unit(
    (SELECT id FROM public.organization_units WHERE group_id=
      '00000000-0000-4000-8000-00000000b702'),
    v_aggregate,'Fictional election topology move');
  IF (SELECT frozen_topology_version FROM public.elections WHERE id=
    '00000000-0000-4000-8000-00000000e702')<>v_frozen_version
    THEN RAISE EXCEPTION 'FROZEN_TOPOLOGY_CHANGED'; END IF;
  v_denied:=false;
  BEGIN
    INSERT INTO public.election_options(election_id,label)
      VALUES('00000000-0000-4000-8000-00000000e702','Admin late choice');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%ELECTION_CHOICES_FROZEN%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ADMIN_LATE_CHOICE_ACCEPTED'; END IF;
END
$test$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a702',true);
DO $test$
DECLARE v_result jsonb; v_denied boolean;
BEGIN
  v_result:=public.cast_ballot('00000000-0000-4000-8000-00000000e701',
    NULL,'00000000-0000-4000-8000-00000000f701');
  IF v_result->>'ok'<>'true' THEN RAISE EXCEPTION 'LOCAL_VOTE_FAILED %',v_result; END IF;
  v_result:=public.cast_ballot('00000000-0000-4000-8000-00000000e701',
    NULL,'00000000-0000-4000-8000-00000000f701');
  IF v_result->>'error'<>'already_voted' THEN RAISE EXCEPTION 'DUPLICATE_VOTE'; END IF;
  v_result:=public.cast_ballot('00000000-0000-4000-8000-00000000e703',
    '00000000-0000-4000-8000-00000000f703',NULL);
  IF v_result->>'ok'<>'true' THEN RAISE EXCEPTION 'OFFICER_VOTE_FAILED'; END IF;
  IF public.get_published_election_results('00000000-0000-4000-8000-00000000e701')<>'[]'::jsonb
    THEN RAISE EXCEPTION 'LIVE_RESULTS_EXPOSED'; END IF;
  v_denied:=false;
  BEGIN PERFORM count(*) FROM public.election_ballots;
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'RAW_BALLOT_VISIBLE'; END IF;
  v_denied:=false;
  BEGIN
    INSERT INTO public.election_options(election_id,label)
      VALUES('00000000-0000-4000-8000-00000000e701','Late choice');
  EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CHOICE_MUTATION_ACCEPTED'; END IF;
END
$test$;

RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.memberships SET membership_status='exited'
  WHERE id='00000000-0000-4000-8000-00000000c702';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a702',true);
DO $test$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.cast_ballot('00000000-0000-4000-8000-00000000e702',
    NULL,'00000000-0000-4000-8000-00000000f702');
  IF v_result->>'ok'<>'true' THEN RAISE EXCEPTION 'TRANSFER_LOST_FROZEN_VOTE %',v_result; END IF;
  v_result:=public.cast_ballot('00000000-0000-4000-8000-00000000e702',
    NULL,'00000000-0000-4000-8000-00000000f702');
  IF v_result->>'error'<>'already_voted' THEN RAISE EXCEPTION 'TRANSFER_DUPLICATE'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.memberships SET membership_status='exited'
  WHERE id='00000000-0000-4000-8000-00000000c703';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a702',true);
DO $test$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.cast_ballot('00000000-0000-4000-8000-00000000e702',
    NULL,'00000000-0000-4000-8000-00000000f702');
  IF v_result->>'error'<>'not_eligible' THEN RAISE EXCEPTION 'REVOKED_VOTE_ACCEPTED'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.memberships SET membership_status='active'
  WHERE id='00000000-0000-4000-8000-00000000c703';
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a703',true);
DO $test$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.cast_ballot('00000000-0000-4000-8000-00000000e702',
    NULL,'00000000-0000-4000-8000-00000000f702');
  IF v_result->>'error'<>'not_eligible' THEN RAISE EXCEPTION 'CROSS_ORG_VOTE'; END IF;
END
$test$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a701',true);
SELECT public.transition_election_v2('00000000-0000-4000-8000-00000000e702','cancelled');
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.publish_election_results(
    '00000000-0000-4000-8000-00000000e702');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%RESULTS_NOT_PUBLISHABLE%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CANCELLED_RESULT_PUBLISHED'; END IF;
  v_denied:=false;
  BEGIN PERFORM public.open_election_v2(
    '00000000-0000-4000-8000-00000000e702',
    (SELECT id FROM public.organization_units WHERE group_id=
       '00000000-0000-4000-8000-00000000b701'),'organization');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%ELECTION_ALREADY_FROZEN%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CANCELLED_REOPENED'; END IF;
END
$test$;
SELECT public.transition_election_v2('00000000-0000-4000-8000-00000000e701','closed');
SELECT public.transition_election_v2('00000000-0000-4000-8000-00000000e703','closed');
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.finalize_election(
    '00000000-0000-4000-8000-00000000e703');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'UNPUBLISHED_FINALIZATION_RPC'; END IF;
  IF EXISTS (SELECT 1 FROM public.position_assignments
      WHERE election_id='00000000-0000-4000-8000-00000000e703')
    THEN RAISE EXCEPTION 'UNPUBLISHED_OFFICER_ASSIGNMENT'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a702',true);
DO $test$
BEGIN
  IF public.get_published_election_results('00000000-0000-4000-8000-00000000e701')<>'[]'::jsonb
    THEN RAISE EXCEPTION 'CLOSED_UNPUBLISHED_EXPOSED'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a701',true);
SELECT public.publish_election_results('00000000-0000-4000-8000-00000000e701');
SELECT public.publish_election_results('00000000-0000-4000-8000-00000000e703');
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.position_assignments WHERE election_id=
      '00000000-0000-4000-8000-00000000e703')<>1
    THEN RAISE EXCEPTION 'PUBLISHED_OFFICER_ASSIGNMENT_MISSING'; END IF;
  RAISE NOTICE 'ELECTION_PUBLICATION_PASS: finalization is atomic and direct RPC denied';
END
$test$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a702',true);
DO $test$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.get_published_election_results('00000000-0000-4000-8000-00000000e701');
  IF jsonb_array_length(v_result)<>1 OR (v_result->0->>'count')::int<>1
    THEN RAISE EXCEPTION 'PUBLISHED_AGGREGATE_FAILED %',v_result; END IF;
  RAISE NOTICE 'ELECTION_PASS: local vote, frozen dedup, ambiguity, cross-tenant, secrecy, publication';
END
$test$;
RESET ROLE;
ROLLBACK;
