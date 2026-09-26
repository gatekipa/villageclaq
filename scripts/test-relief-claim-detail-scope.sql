-- R-011 before/after probe. Run with -v expected_suspended_visible=true
-- on pre-00146 catalog and false after; all fictional data rolls back.
BEGIN;
SELECT set_config('qual.expected_suspended_visible',
  :'expected_suspended_visible',true);
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a911','active-reviewer@example.test'),
 ('00000000-0000-4000-8000-00000000a912','suspended-reviewer@example.test'),
 ('00000000-0000-4000-8000-00000000a913','claimant@example.test'),
 ('00000000-0000-4000-8000-00000000a914','outsider@example.test'),
 ('00000000-0000-4000-8000-00000000a915','platform-support@example.test');
INSERT INTO public.platform_staff(user_id,role)
VALUES ('00000000-0000-4000-8000-00000000a915','support');
INSERT INTO public.groups(id,name,currency)
VALUES ('00000000-0000-4000-8000-00000000b911','Fictional Relief Group','USD'),
       ('00000000-0000-4000-8000-00000000b912','Other Group','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status)
VALUES
 ('00000000-0000-4000-8000-00000000c911',
  '00000000-0000-4000-8000-00000000a911',
  '00000000-0000-4000-8000-00000000b911','admin','active'),
 ('00000000-0000-4000-8000-00000000c912',
  '00000000-0000-4000-8000-00000000a912',
  '00000000-0000-4000-8000-00000000b911','admin','suspended'),
 ('00000000-0000-4000-8000-00000000c913',
  '00000000-0000-4000-8000-00000000a913',
  '00000000-0000-4000-8000-00000000b911','member','active'),
 ('00000000-0000-4000-8000-00000000c914',
  '00000000-0000-4000-8000-00000000a914',
  '00000000-0000-4000-8000-00000000b912','admin','active');
INSERT INTO public.group_subscriptions(group_id,tier,status)
VALUES ('00000000-0000-4000-8000-00000000b911','starter','active');
INSERT INTO public.relief_plans(id,group_id,name,created_by,
  is_active,status,currency,waiting_period_days)
VALUES ('00000000-0000-4000-8000-00000000d911',
 '00000000-0000-4000-8000-00000000b911','Private Claim Plan',
 '00000000-0000-4000-8000-00000000a911',true,'active','USD',0);
INSERT INTO public.relief_enrollments
  (plan_id,membership_id,group_id,collecting_group_id,
   status,is_active,matures_at)
VALUES ('00000000-0000-4000-8000-00000000d911',
 '00000000-0000-4000-8000-00000000c913',
 '00000000-0000-4000-8000-00000000b911',
 '00000000-0000-4000-8000-00000000b911',
 'active',true,now()-interval '1 day');
INSERT INTO public.relief_claims
  (id,plan_id,membership_id,claimant_membership_id,group_id,
   event_type,incident_date,amount,amount_requested,currency,
   description,status)
VALUES ('00000000-0000-4000-8000-00000000e911',
 '00000000-0000-4000-8000-00000000d911',
 '00000000-0000-4000-8000-00000000c913',
 '00000000-0000-4000-8000-00000000c913',
 '00000000-0000-4000-8000-00000000b911',
 'illness',CURRENT_DATE,25,25,'USD','Private fictional detail','submitted');
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a912',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_visible boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.relief_claims
    WHERE id='00000000-0000-4000-8000-00000000e911') INTO v_visible;
  IF v_visible IS DISTINCT FROM
    current_setting('qual.expected_suspended_visible')::boolean
  THEN RAISE EXCEPTION 'SUSPENDED_CLAIM_DETAIL_RESULT: %',v_visible; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a915',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_visible boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.relief_claims
    WHERE id='00000000-0000-4000-8000-00000000e911') INTO v_visible;
  IF v_visible IS DISTINCT FROM
    current_setting('qual.expected_suspended_visible')::boolean
  THEN RAISE EXCEPTION 'PLATFORM_SUPPORT_CLAIM_DETAIL_RESULT: %',v_visible; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a911',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.relief_claims
    WHERE id='00000000-0000-4000-8000-00000000e911')
  THEN RAISE EXCEPTION 'ACTIVE_REVIEWER_LOST_CLAIM_DETAIL'; END IF;
  UPDATE public.relief_claims SET review_notes='Fictional authorized review'
    WHERE id='00000000-0000-4000-8000-00000000e911';
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTIVE_REVIEWER_LOST_UPDATE'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a913',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.relief_claims
    WHERE id='00000000-0000-4000-8000-00000000e911')
  THEN RAISE EXCEPTION 'CLAIMANT_LOST_OWN_DETAIL'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a914',true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.relief_claims
    WHERE id='00000000-0000-4000-8000-00000000e911')
  THEN RAISE EXCEPTION 'CROSS_GROUP_CLAIM_DETAIL_VISIBLE'; END IF;
  RAISE NOTICE 'RELIEF_CLAIM_DETAIL_PASS: suspended expectation %, active reviewer and claimant visible, cross-group denied',
    current_setting('qual.expected_suspended_visible');
END
$test$;
RESET ROLE;
ROLLBACK;
