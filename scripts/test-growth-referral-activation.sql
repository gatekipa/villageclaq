-- M13 transactional acceptance on the real upgraded catalog. Fictional data rolls back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a901','referrer@example.test'),
 ('00000000-0000-4000-8000-00000000a902','recipient@example.test'),
 ('00000000-0000-4000-8000-00000000a903','invited@example.test'),
 ('00000000-0000-4000-8000-00000000a904','outsider-referral@example.test');
INSERT INTO public.groups(id,name,slug,created_by,currency) VALUES
 ('00000000-0000-4000-8000-00000000b901','Fictional Referrer','fictional-referrer',
  '00000000-0000-4000-8000-00000000a901','USD'),
 ('00000000-0000-4000-8000-00000000b902','Fictional Recipient','fictional-recipient',
  '00000000-0000-4000-8000-00000000a902','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status) VALUES
 ('00000000-0000-4000-8000-00000000c901','00000000-0000-4000-8000-00000000a901',
  '00000000-0000-4000-8000-00000000b901','owner','active'),
 ('00000000-0000-4000-8000-00000000c902','00000000-0000-4000-8000-00000000a902',
  '00000000-0000-4000-8000-00000000b902','owner','active');
INSERT INTO public.platform_staff(user_id,role,is_active)
VALUES('00000000-0000-4000-8000-00000000a901','admin',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a901',true);
DO $test$
DECLARE v_ref jsonb;
BEGIN
  v_ref:=public.generate_group_referral_link(
    '00000000-0000-4000-8000-00000000b901',NULL);
  IF length(v_ref->>'token')<>48 THEN RAISE EXCEPTION 'TOKEN_SHAPE'; END IF;
  PERFORM set_config('app.test_referral_token',v_ref->>'token',true);
  PERFORM set_config('app.test_referral_id',v_ref->>'id',true);
END
$test$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a902',true);
DO $test$
DECLARE v_token text:=current_setting('app.test_referral_token');
  v_denied boolean:=false; v_result jsonb;
BEGIN
  BEGIN
    PERFORM public.claim_group_referral(
      (CASE WHEN left(v_token,1)='0' THEN '1' ELSE '0' END)||substr(v_token,2),
      '00000000-0000-4000-8000-00000000b902');
  EXCEPTION WHEN OTHERS THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ALTERED_REFERRAL_ACCEPTED'; END IF;
  v_result:=public.claim_group_referral(
    v_token,'00000000-0000-4000-8000-00000000b902');
  IF v_result->>'status'<>'claimed' THEN RAISE EXCEPTION 'CLAIM_FAILED'; END IF;
  v_result:=public.claim_group_referral(
    v_token,'00000000-0000-4000-8000-00000000b902');
  IF v_result->>'status'<>'claimed' THEN RAISE EXCEPTION 'REPLAY_CLAIM_FAILED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.organization_referrals WHERE claimed_group_id=
      '00000000-0000-4000-8000-00000000b902')<>1
    OR (SELECT status FROM public.organization_referrals WHERE claimed_group_id=
      '00000000-0000-4000-8000-00000000b902')<>'claimed'
    THEN RAISE EXCEPTION 'DUPLICATE_CLAIM_OR_EARLY_ACTIVATION'; END IF;
END
$test$;
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status)
VALUES('00000000-0000-4000-8000-00000000c903',
 '00000000-0000-4000-8000-00000000a903',
 '00000000-0000-4000-8000-00000000b902','member','active');
DO $test$
BEGIN
  IF (SELECT status FROM public.organization_referrals WHERE claimed_group_id=
      '00000000-0000-4000-8000-00000000b902')<>'claimed'
    THEN RAISE EXCEPTION 'MEMBERSHIP_ALONE_ACTIVATED'; END IF;
END
$test$;
INSERT INTO public.events(id,group_id,title,starts_at,status,created_by)
VALUES('00000000-0000-4000-8000-00000000e901',
 '00000000-0000-4000-8000-00000000b902','Fictional completed meeting',
 now()-interval '1 day','completed','00000000-0000-4000-8000-00000000a902');
INSERT INTO public.event_attendances(event_id,membership_id,status)
VALUES('00000000-0000-4000-8000-00000000e901',
 '00000000-0000-4000-8000-00000000c903','present');
DO $test$
BEGIN
  IF (SELECT status FROM public.organization_referrals WHERE claimed_group_id=
      '00000000-0000-4000-8000-00000000b902')<>'activated'
    OR (SELECT activated_at FROM public.organization_referrals WHERE claimed_group_id=
      '00000000-0000-4000-8000-00000000b902') IS NULL
    THEN RAISE EXCEPTION 'CORE_WORKFLOW_DID_NOT_ACTIVATE'; END IF;
END
$test$;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a901',true);
DO $test$
DECLARE v_ref jsonb; v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.revoke_group_referral_by_id(
    current_setting('app.test_referral_id')::uuid);
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%ALREADY_ACTIVATED%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'ACTIVATED_HISTORY_REVOKED'; END IF;
  v_ref:=public.generate_group_referral_link(
    '00000000-0000-4000-8000-00000000b901',NULL);
  IF jsonb_array_length(public.list_own_group_referrals(
      '00000000-0000-4000-8000-00000000b901'))<>1
    THEN RAISE EXCEPTION 'ACTIVE_REFERRAL_LIST'; END IF;
  PERFORM set_config('app.test_revoked_token',v_ref->>'token',true);
  PERFORM public.revoke_group_referral_by_id((v_ref->>'id')::uuid);
  IF jsonb_array_length(public.list_own_group_referrals(
      '00000000-0000-4000-8000-00000000b901'))<>0
    THEN RAISE EXCEPTION 'REVOKED_REFERRAL_LISTED_ACTIVE'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
INSERT INTO public.groups(id,name,slug,created_by,currency) VALUES
 ('00000000-0000-4000-8000-00000000b903','Fictional Revoked Recipient',
  'fictional-revoked-recipient','00000000-0000-4000-8000-00000000a902','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status)
VALUES('00000000-0000-4000-8000-00000000c904',
 '00000000-0000-4000-8000-00000000a902',
 '00000000-0000-4000-8000-00000000b903','owner','active');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a902',true);
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.claim_group_referral(
    current_setting('app.test_revoked_token'),
    '00000000-0000-4000-8000-00000000b903');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%INVALID_REFERRAL%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_ATTRIBUTION_ACCEPTED'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a901',true);
DO $test$
DECLARE v_ref jsonb;
BEGIN
  v_ref:=public.generate_group_referral_link(
    '00000000-0000-4000-8000-00000000b901',NULL);
  PERFORM set_config('app.test_expired_token',v_ref->>'token',true);
  PERFORM set_config('app.test_expired_id',v_ref->>'id',true);
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.organization_referrals SET expires_at=now()-interval '1 day'
  WHERE id=current_setting('app.test_expired_id')::uuid;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a902',true);
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.claim_group_referral(
    current_setting('app.test_expired_token'),
    '00000000-0000-4000-8000-00000000b903');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%INVALID_REFERRAL%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'EXPIRED_ATTRIBUTION_ACCEPTED'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a904',true);
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN PERFORM public.get_referral_activation_report(
    current_date-30,current_date);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'NON_OPERATOR_REPORT_VISIBLE'; END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a901',true);
DO $test$
DECLARE v_report jsonb;
BEGIN
  v_report:=public.get_referral_activation_report(current_date-30,current_date);
  IF (v_report->>'issued')::int<>3 OR (v_report->>'claimed')::int<>1
    OR (v_report->>'unique_activated_organizations')::int<>1
    OR (v_report->>'activation_rate_pct')::numeric<>100
    THEN RAISE EXCEPTION 'ACTIVATION_REPORT_WRONG %',v_report; END IF;
  RAISE NOTICE 'REFERRAL_ACTIVATION_PASS: opaque claim, replay, real activation, aggregate operator gate';
END
$test$;
RESET ROLE;
ROLLBACK;
