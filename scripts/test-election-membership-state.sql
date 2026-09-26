-- E-002: frozen voter must still have current active membership to cast.
-- Fictional rows on the upgraded catalog; all effects roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('11111111-1111-4111-8111-11111111a971','election-state-owner@example.test'),
 ('11111111-1111-4111-8111-11111111a972','election-state-voter@example.test');
INSERT INTO public.organizations(id,name,slug,owner_id) VALUES
 ('11111111-1111-4111-8111-11111111d971','Fictional Election State Org',
  'fictional-election-states','11111111-1111-4111-8111-11111111a971');
INSERT INTO public.groups(id,organization_id,name,slug,currency) VALUES
 ('11111111-1111-4111-8111-11111111b971',
  '11111111-1111-4111-8111-11111111d971','Fictional Election State Group',
  'fictional-election-state-group','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status) VALUES
 ('11111111-1111-4111-8111-11111111c971',
  '11111111-1111-4111-8111-11111111a971',
  '11111111-1111-4111-8111-11111111b971','owner','active'),
 ('11111111-1111-4111-8111-11111111c972',
  '11111111-1111-4111-8111-11111111a972',
  '11111111-1111-4111-8111-11111111b971','member','active');
INSERT INTO public.group_subscriptions(group_id,tier,status) VALUES
 ('11111111-1111-4111-8111-11111111b971','pro','active');
INSERT INTO public.elections(id,group_id,title,starts_at,ends_at,created_by) VALUES
 ('11111111-1111-4111-8111-11111111e971',
  '11111111-1111-4111-8111-11111111b971','Fictional state poll',
  now()-interval '1 minute',now()+interval '1 day',
  '11111111-1111-4111-8111-11111111a971');
INSERT INTO public.election_options(id,election_id,label) VALUES
 ('11111111-1111-4111-8111-11111111f971',
  '11111111-1111-4111-8111-11111111e971','Yes');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-11111111a971',true);
DO $probe$
DECLARE v_root uuid; v_result jsonb;
BEGIN
  SELECT id INTO v_root FROM public.organization_units
    WHERE group_id='11111111-1111-4111-8111-11111111b971';
  v_result:=public.open_election_v2(
    '11111111-1111-4111-8111-11111111e971',v_root,'unit');
  IF (v_result->>'eligible_count')::int<>2
  THEN RAISE EXCEPTION 'E002_FROZEN_ELECTORATE_MISSING'; END IF;
END
$probe$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
DO $probe$
DECLARE v_state text; v_result jsonb;
BEGIN
  FOREACH v_state IN ARRAY ARRAY['pending_approval','suspended','exited','archived'] LOOP
    PERFORM set_config('request.jwt.claim.sub','',true);
    UPDATE public.memberships SET membership_status=v_state
      WHERE id='11111111-1111-4111-8111-11111111c972';
    PERFORM set_config('request.jwt.claim.sub','11111111-1111-4111-8111-11111111a972',true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    v_result:=public.cast_ballot(
      '11111111-1111-4111-8111-11111111e971',NULL,
      '11111111-1111-4111-8111-11111111f971');
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claim.sub','',true);
    IF v_result->>'error'<>'not_eligible'
    THEN RAISE EXCEPTION 'E002_INACTIVE_VOTE_%: %',v_state,v_result; END IF;
    IF EXISTS (SELECT 1 FROM public.election_ballots
        WHERE election_id='11111111-1111-4111-8111-11111111e971')
    THEN RAISE EXCEPTION 'E002_DENIED_VOTE_LEFT_BALLOT_%',v_state; END IF;
  END LOOP;
END
$probe$;
UPDATE public.memberships SET membership_status='active'
  WHERE id='11111111-1111-4111-8111-11111111c972';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-11111111a972',true);
DO $probe$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.cast_ballot(
    '11111111-1111-4111-8111-11111111e971',NULL,
    '11111111-1111-4111-8111-11111111f971');
  IF v_result->>'ok'<>'true' THEN RAISE EXCEPTION 'E002_ACTIVE_VOTE_FAILED: %',v_result; END IF;
END
$probe$;
RESET ROLE;
DO $probe$
BEGIN
  IF (SELECT count(*) FROM public.election_ballots WHERE election_id=
      '11111111-1111-4111-8111-11111111e971')<>1
    OR (SELECT count(*) FROM public.election_vote_receipts WHERE election_id=
      '11111111-1111-4111-8111-11111111e971')<>1
  THEN RAISE EXCEPTION 'E002_ONE_VOTE_INVARIANT'; END IF;
END
$probe$;
ROLLBACK;
SELECT 'E002_MEMBERSHIP_STATE_PASS' AS result;
