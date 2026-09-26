-- M14/M15 private-default, consent, public projection, request and abuse probes.
-- Fictional actors only; all rows roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a951','growth-owner@example.test'),
 ('00000000-0000-4000-8000-00000000a952','growth-member@example.test'),
 ('00000000-0000-4000-8000-00000000a953','growth-outsider@example.test'),
 ('00000000-0000-4000-8000-00000000a954','growth-staff@example.test');
INSERT INTO public.groups(id,name,slug,currency,created_by) VALUES
 ('00000000-0000-4000-8000-00000000b951','Fictional Growth Group',
  'fictional-growth','USD','00000000-0000-4000-8000-00000000a951');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status,display_name) VALUES
 ('00000000-0000-4000-8000-00000000c951','00000000-0000-4000-8000-00000000a951',
  '00000000-0000-4000-8000-00000000b951','owner','active','Owner'),
 ('00000000-0000-4000-8000-00000000c952','00000000-0000-4000-8000-00000000a952',
  '00000000-0000-4000-8000-00000000b951','member','active','Fictional Member');
INSERT INTO public.platform_staff(user_id,role,is_active)
VALUES('00000000-0000-4000-8000-00000000a954','support',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a951',true);
DO $test$
DECLARE v_result jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.groups WHERE id=
      '00000000-0000-4000-8000-00000000b951' AND allow_public_cards)
    THEN RAISE EXCEPTION 'CARDS_PUBLIC_BY_DEFAULT'; END IF;
  v_result:=public.configure_public_card_sharing(
    '00000000-0000-4000-8000-00000000b951',true);
  IF v_result->>'enabled'<>'true' THEN RAISE EXCEPTION 'CARD_OPT_IN_FAILED'; END IF;
  PERFORM public.configure_public_profile(
    '00000000-0000-4000-8000-00000000b951','fictional-growth-profile',
    'private','Fictional Group','A fictional public mission',false,
    '{"website":"https://example.test"}'::jsonb);
END
$test$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  IF public.get_public_organization_profile('fictional-growth-profile') IS NOT NULL
    THEN RAISE EXCEPTION 'PRIVATE_PROFILE_VISIBLE'; END IF;
  IF public.list_public_organization_profiles('',0,20)<>'[]'::jsonb
    THEN RAISE EXCEPTION 'PRIVATE_PROFILE_DISCOVERABLE'; END IF;
  BEGIN PERFORM public.submit_public_membership_request(
    'fictional-growth-profile','Visitor','visitor@example.test',NULL,NULL);
  EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'PRIVATE_REQUEST_ACCEPTED'; END IF;
END
$test$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a952',true);
DO $test$
DECLARE v_denied boolean:=false; v_result jsonb;
BEGIN
  BEGIN PERFORM public.issue_member_share_card(
    '00000000-0000-4000-8000-00000000b951',
    'membership_card',false,false);
  EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CARD_WITHOUT_CONSENT'; END IF;
  v_result:=public.issue_member_share_card(
    '00000000-0000-4000-8000-00000000b951',
    'membership_card',false,true);
  IF (v_result->'display_data') ? 'member_display_name'
    OR (v_result->'display_data') ? 'payment'
    THEN RAISE EXCEPTION 'PRIVATE_CARD_FIELD'; END IF;
  PERFORM set_config('app.test_card_token',v_result->>'token',true);
  PERFORM set_config('app.test_card_id',v_result->>'card_id',true);
END
$test$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
DECLARE v_card jsonb;
BEGIN
  v_card:=public.verify_public_share_token(current_setting('app.test_card_token'));
  IF v_card->>'valid'<>'true' OR v_card ? 'member_display_name'
    OR v_card ? 'member_id' OR v_card ? 'standing'
    THEN RAISE EXCEPTION 'PUBLIC_CARD_PROJECTION_LEAK %',v_card; END IF;
END
$test$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a952',true);
SELECT public.revoke_share_card('00000000-0000-4000-8000-00000000b951',
  current_setting('app.test_card_id')::uuid);
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  IF public.verify_public_share_token(current_setting('app.test_card_token'))->>'valid'<>'false'
    THEN RAISE EXCEPTION 'REVOKED_CARD_VISIBLE'; END IF;
  RAISE NOTICE 'GROWTH_CARD_PASS: opt-in consent, minimal projection, revocation';
END
$test$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a951',true);
SELECT public.configure_public_profile(
  '00000000-0000-4000-8000-00000000b951','fictional-growth-profile',
  'unlisted','Fictional Group','A fictional public mission',true,
  '{"website":"https://example.test"}'::jsonb);
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  IF public.get_public_organization_profile('fictional-growth-profile') IS NULL
    OR public.list_public_organization_profiles('',0,20)<>'[]'::jsonb
    THEN RAISE EXCEPTION 'UNLISTED_VISIBILITY_CONTRACT'; END IF;
END
$test$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a951',true);
SELECT public.configure_public_profile(
  '00000000-0000-4000-8000-00000000b951','fictional-growth-profile',
  'public','Fictional Group','A fictional public mission',true,
  '{"website":"https://example.test"}'::jsonb);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
DO $test$
DECLARE v_profile jsonb; v_result jsonb; v_denied boolean:=false;
BEGIN
  v_profile:=public.get_public_organization_profile('fictional-growth-profile');
  IF v_profile->>'display_name'<>'Fictional Group'
    OR v_profile ? 'group_id' OR v_profile ? 'memberships'
    THEN RAISE EXCEPTION 'PUBLIC_PROFILE_PROJECTION %',v_profile; END IF;
  IF jsonb_array_length(public.list_public_organization_profiles('Fictional',0,20))<>1
    THEN RAISE EXCEPTION 'PUBLIC_PROFILE_NOT_DISCOVERABLE'; END IF;
  v_result:=public.submit_public_membership_request(
    'fictional-growth-profile','Visitor','visitor@example.test',NULL,NULL);
  IF v_result->>'success'<>'true' THEN RAISE EXCEPTION 'PUBLIC_REQUEST_FAILED'; END IF;
  PERFORM public.submit_public_membership_request(
    'fictional-growth-profile','Visitor','visitor@example.test',NULL,NULL);
  PERFORM public.submit_public_profile_abuse_report(
    'fictional-growth-profile','misrepresentation',
    'The public description needs platform review.');
  BEGIN PERFORM count(*) FROM public.organization_profile_abuse_reports;
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'PUBLIC_ABUSE_INBOX_VISIBLE'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.organization_membership_requests WHERE group_id=
      '00000000-0000-4000-8000-00000000b951')<>1
    OR (SELECT count(*) FROM public.memberships WHERE group_id=
      '00000000-0000-4000-8000-00000000b951')<>2
    OR (SELECT count(*) FROM public.organization_profile_abuse_reports WHERE group_id=
      '00000000-0000-4000-8000-00000000b951')<>1
    THEN RAISE EXCEPTION 'REQUEST_DUPLICATE_MEMBERSHIP_OR_REPORT'; END IF;
END
$test$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a953',true);
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.review_public_membership_request(
    (SELECT id FROM public.organization_membership_requests LIMIT 1),'approved');
  EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'OUTSIDER_REVIEW_ALLOWED'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a951',true);
DO $test$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.review_public_membership_request(
    (SELECT id FROM public.organization_membership_requests LIMIT 1),'approved');
  IF v_result->>'membership_created'<>'false'
    THEN RAISE EXCEPTION 'REVIEW_GRANTED_MEMBERSHIP'; END IF;
  PERFORM public.configure_public_profile(
    '00000000-0000-4000-8000-00000000b951','fictional-growth-profile',
    'private','Fictional Group','A fictional public mission',false,'{}'::jsonb);
END
$test$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $test$
BEGIN
  IF public.get_public_organization_profile('fictional-growth-profile') IS NOT NULL
    THEN RAISE EXCEPTION 'UNPUBLISHED_PAGE_VISIBLE'; END IF;
  IF public.list_public_organization_profiles('',0,20)<>'[]'::jsonb
    THEN RAISE EXCEPTION 'UNPUBLISHED_PAGE_DISCOVERABLE'; END IF;
  PERFORM public.submit_public_profile_abuse_report(
    'fictional-growth-profile','other','A report for a private page.');
  RAISE NOTICE 'GROWTH_PUBLIC_PROFILE_PASS: private default, safe requests, report, unpublish';
END
$test$;
RESET ROLE;
ROLLBACK;
