-- M15 request and abuse caps with fictional actors. The transaction rolls back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('11111111-1111-4111-8111-11111111a981','growth-rate-owner@example.test');
INSERT INTO public.groups(id,name,slug,currency,created_by) VALUES
 ('11111111-1111-4111-8111-11111111b981','Fictional Rate Group',
  'fictional-growth-rate','USD','11111111-1111-4111-8111-11111111a981');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status,display_name)
VALUES ('11111111-1111-4111-8111-11111111c981',
 '11111111-1111-4111-8111-11111111a981',
 '11111111-1111-4111-8111-11111111b981','owner','active','Rate Owner');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-11111111a981',true);
SELECT public.configure_public_profile(
 '11111111-1111-4111-8111-11111111b981','fictional-growth-rate',
 'public','Fictional Rate Group','Rate limit qualification',true,'{}'::jsonb);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE anon;
DO $probe$
DECLARE v_i integer; v_denied boolean:=false;
BEGIN
  FOR v_i IN 1..100 LOOP
    PERFORM public.submit_public_membership_request(
      'fictional-growth-rate','Fictional Visitor',
      'visitor'||v_i::text||'@example.test',NULL,NULL);
    IF v_i=1 THEN
      PERFORM public.submit_public_membership_request(
        'fictional-growth-rate','Fictional Visitor',
        'visitor1@example.test',NULL,NULL);
    END IF;
  END LOOP;
  BEGIN
    PERFORM public.submit_public_membership_request(
      'fictional-growth-rate','Fictional Visitor',
      'visitor101@example.test',NULL,NULL);
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%REQUEST_RATE_LIMITED%';
  END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REQUEST_LIMIT_NOT_ENFORCED'; END IF;
  FOR v_i IN 1..26 LOOP
    PERFORM public.submit_public_profile_abuse_report(
      'fictional-growth-rate','other',
      'Fictional report number '||v_i::text||' for moderation.');
  END LOOP;
END
$probe$;
RESET ROLE;
DO $probe$
BEGIN
  IF (SELECT count(*) FROM public.organization_membership_requests
      WHERE group_id='11111111-1111-4111-8111-11111111b981')<>100
    OR (SELECT count(*) FROM public.organization_profile_abuse_reports
      WHERE group_id='11111111-1111-4111-8111-11111111b981')<>25
    OR (SELECT count(*) FROM public.memberships
      WHERE group_id='11111111-1111-4111-8111-11111111b981')<>1
  THEN RAISE EXCEPTION 'M15_RATE_OR_MEMBERSHIP_EFFECT_MISMATCH'; END IF;
END
$probe$;
ROLLBACK;
SELECT 'M15_RATE_LIMIT_PASS' AS result;
