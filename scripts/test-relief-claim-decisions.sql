-- R-005 diagnostic on the production-compatible local catalog. Fictional rows
-- and all effects roll back. Requires 00148 and 00149.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a921','reviewer@example.test'),
 ('00000000-0000-4000-8000-00000000a922','claimant@example.test'),
 ('00000000-0000-4000-8000-00000000a923','outsider@example.test');
INSERT INTO public.groups(id,name,currency) VALUES
 ('00000000-0000-4000-8000-00000000b921','Decision Group','USD'),
 ('00000000-0000-4000-8000-00000000b922','Other Decision Group','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status)
VALUES
 ('00000000-0000-4000-8000-00000000c921',
  '00000000-0000-4000-8000-00000000a921',
  '00000000-0000-4000-8000-00000000b921','admin','active'),
 ('00000000-0000-4000-8000-00000000c922',
  '00000000-0000-4000-8000-00000000a922',
  '00000000-0000-4000-8000-00000000b921','member','active'),
 ('00000000-0000-4000-8000-00000000c923',
  '00000000-0000-4000-8000-00000000a923',
  '00000000-0000-4000-8000-00000000b922','admin','active');
INSERT INTO public.group_subscriptions(group_id,tier,status)
VALUES ('00000000-0000-4000-8000-00000000b921','starter','active');
INSERT INTO public.relief_plans(id,group_id,name,created_by,
  is_active,status,currency,waiting_period_days)
VALUES ('00000000-0000-4000-8000-00000000d921',
 '00000000-0000-4000-8000-00000000b921','Decision Plan',
 '00000000-0000-4000-8000-00000000a921',true,'active','USD',0);
INSERT INTO public.relief_enrollments
  (plan_id,membership_id,group_id,collecting_group_id,
   status,is_active,matures_at)
VALUES ('00000000-0000-4000-8000-00000000d921',
 '00000000-0000-4000-8000-00000000c922',
 '00000000-0000-4000-8000-00000000b921',
 '00000000-0000-4000-8000-00000000b921',
 'active',true,now()-interval '1 day');
INSERT INTO public.financial_ledger_epochs
  (id,group_id,currency,effective_from,source_kind,approval_note)
VALUES ('00000000-0000-4000-8000-00000000d925',
  '00000000-0000-4000-8000-00000000b921','USD','2020-01-01',
  'cutover','Fictional claim epoch');
INSERT INTO public.financial_accounts
  (id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at)
VALUES ('00000000-0000-4000-8000-00000000e925',
  '00000000-0000-4000-8000-00000000b921',
  '00000000-0000-4000-8000-00000000d925','USD',
  'Fictional Cash','cash','2020-01-01');
INSERT INTO public.financial_categories
  (id,group_id,name,category_class)
VALUES ('00000000-0000-4000-8000-00000000f925',
  '00000000-0000-4000-8000-00000000b921','Relief expense','expense');
INSERT INTO public.financial_funds
  (id,group_id,name,is_default,is_restricted)
VALUES
 ('00000000-0000-4000-8000-00000000f926',
  '00000000-0000-4000-8000-00000000b921','Relief',false,true),
 ('00000000-0000-4000-8000-00000000f927',
  '00000000-0000-4000-8000-00000000b921','General',true,false),
 ('00000000-0000-4000-8000-00000000f928',
  '00000000-0000-4000-8000-00000000b921','Other relief',false,true);
INSERT INTO public.relief_claims
  (id,plan_id,membership_id,claimant_membership_id,group_id,
   event_type,incident_date,amount,amount_requested,currency,
   description,status)
VALUES
 ('00000000-0000-4000-8000-00000000e921',
  '00000000-0000-4000-8000-00000000d921',
  '00000000-0000-4000-8000-00000000c922',
  '00000000-0000-4000-8000-00000000c922',
  '00000000-0000-4000-8000-00000000b921',
  'illness',CURRENT_DATE,25,25,'USD','Fictional review','submitted'),
 ('00000000-0000-4000-8000-00000000e922',
  '00000000-0000-4000-8000-00000000d921',
  '00000000-0000-4000-8000-00000000c922',
  '00000000-0000-4000-8000-00000000c922',
  '00000000-0000-4000-8000-00000000b921',
  'illness',CURRENT_DATE,10,10,'USD','Fictional withdrawal','submitted');
CREATE FUNCTION public.qual_fail_paid_claim_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.new_status='paid'
     AND current_setting('qual.fail_paid_history',true)='on' THEN
    RAISE EXCEPTION 'QUAL_HISTORY_FAULT';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_qual_fail_paid_claim_history
  BEFORE INSERT ON public.relief_claim_decisions FOR EACH ROW
  EXECUTE FUNCTION public.qual_fail_paid_claim_history();
CREATE FUNCTION pg_temp.reject_claim_audit()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.action='financial_event.posted'
     AND current_setting('qual.fail_claim_audit',true)='on' THEN
    RAISE EXCEPTION 'QUAL_CLAIM_AUDIT_FAULT';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_qual_fail_claim_audit
  BEFORE INSERT ON public.group_audit_logs FOR EACH ROW
  EXECUTE FUNCTION pg_temp.reject_claim_audit();
CREATE FUNCTION public.qual_claim_payout_counts()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.jsonb_build_object(
    'events',(SELECT count(*) FROM public.financial_events
      WHERE source_module='relief' AND source_record_id=
        '00000000-0000-4000-8000-00000000e921'
        AND effect_kind='claim_payout'),
    'paid_decisions',(SELECT count(*) FROM public.relief_claim_decisions
      WHERE claim_id='00000000-0000-4000-8000-00000000e921'
        AND new_status='paid'));
$$;
REVOKE ALL ON FUNCTION public.qual_claim_payout_counts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.qual_claim_payout_counts() TO authenticated;

SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a921',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false; v_result jsonb; v_conflict boolean;
BEGIN
  BEGIN
    UPDATE public.relief_claims SET status='approved'
      WHERE id='00000000-0000-4000-8000-00000000e921';
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DIRECT_CLAIM_UPDATE_ALLOWED'; END IF;
  v_denied:=false;
  BEGIN
    DELETE FROM public.relief_claims
      WHERE id='00000000-0000-4000-8000-00000000e921';
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DIRECT_CLAIM_DELETE_ALLOWED'; END IF;
  v_result:=public.decide_relief_claim(pg_catalog.jsonb_build_object(
    'group_id','00000000-0000-4000-8000-00000000b921',
    'claim_id','00000000-0000-4000-8000-00000000e921',
    'request_id','00000000-0000-4000-8000-00000000f921',
    'expected_version',0,'status','reviewing'));
  IF v_result->>'decision'<>'posted' THEN RAISE EXCEPTION 'REVIEW_NOT_POSTED'; END IF;
  v_result:=public.decide_relief_claim(pg_catalog.jsonb_build_object(
    'group_id','00000000-0000-4000-8000-00000000b921',
    'claim_id','00000000-0000-4000-8000-00000000e921',
    'request_id','00000000-0000-4000-8000-00000000f921',
    'expected_version',0,'status','reviewing'));
  IF v_result->>'decision'<>'recovered' THEN RAISE EXCEPTION 'REVIEW_RETRY_NOT_RECOVERED'; END IF;
  v_conflict:=false;
  BEGIN
    PERFORM public.decide_relief_claim(pg_catalog.jsonb_build_object(
      'group_id','00000000-0000-4000-8000-00000000b921',
    'claim_id','00000000-0000-4000-8000-00000000e921',
      'request_id','00000000-0000-4000-8000-00000000f921',
      'expected_version',0,'status','rejected'));
  EXCEPTION WHEN OTHERS THEN
    v_conflict:=SQLERRM LIKE '%IDENTITY_CONFLICT%'; END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'CHANGED_PAYLOAD_NOT_REJECTED'; END IF;
  v_result:=public.decide_relief_claim(pg_catalog.jsonb_build_object(
    'group_id','00000000-0000-4000-8000-00000000b921',
    'claim_id','00000000-0000-4000-8000-00000000e921',
    'request_id','00000000-0000-4000-8000-00000000f922',
    'expected_version',1,'status','approved',
    'amount_approved',20,'review_notes','Evidence checked'));
  IF v_result->>'decision'<>'posted' THEN RAISE EXCEPTION 'APPROVAL_NOT_POSTED'; END IF;
  v_conflict:=false;
  BEGIN
    PERFORM public.decide_relief_claim(pg_catalog.jsonb_build_object(
      'group_id','00000000-0000-4000-8000-00000000b921',
    'claim_id','00000000-0000-4000-8000-00000000e921',
      'request_id','00000000-0000-4000-8000-00000000f923',
      'expected_version',1,'status','rejected'));
  EXCEPTION WHEN OTHERS THEN
    v_conflict:=SQLERRM LIKE '%VERSION_CONFLICT%'; END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'STALE_VERSION_NOT_REJECTED'; END IF;
  IF (SELECT decision_version FROM public.relief_claims
      WHERE id='00000000-0000-4000-8000-00000000e921')<>2
     OR (SELECT count(*) FROM public.list_relief_claim_decisions(
       '00000000-0000-4000-8000-00000000e921'))<>2
  THEN RAISE EXCEPTION 'DECISION_HISTORY_OR_VERSION_WRONG'; END IF;
  v_denied:=false;
  BEGIN
    INSERT INTO public.relief_claim_decisions
      (claim_id,decision_version,prior_status,new_status,actor_id,command_payload)
    VALUES ('00000000-0000-4000-8000-00000000e921',3,
      'approved','rejected',auth.uid(),'{}');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'HISTORY_FORGERY_ALLOWED'; END IF;
  v_conflict:=false;
  BEGIN
    PERFORM public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
      'claim_id','00000000-0000-4000-8000-00000000e921',
      'account_id','00000000-0000-4000-8000-00000000e925',
      'fund_id','00000000-0000-4000-8000-00000000f927'));
  EXCEPTION WHEN OTHERS THEN
    v_conflict:=SQLERRM LIKE '%RESTRICTED_RELIEF_FUND_REQUIRED%'; END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'UNRESTRICTED_PAYOUT_FUND_ACCEPTED'; END IF;
  v_conflict:=false;
  BEGIN
    PERFORM public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
      'claim_id','00000000-0000-4000-8000-00000000e921',
      'account_id','00000000-0000-4000-8000-00000000e925'));
  EXCEPTION WHEN OTHERS THEN
    v_conflict:=SQLERRM LIKE '%RESTRICTED_RELIEF_FUND_REQUIRED%'; END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'MISSING_PAYOUT_FUND_ACCEPTED'; END IF;
  PERFORM pg_catalog.set_config('qual.fail_claim_audit','on',true);
  v_conflict:=false;
  BEGIN
    PERFORM public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
      'claim_id','00000000-0000-4000-8000-00000000e921',
      'account_id','00000000-0000-4000-8000-00000000e925',
      'fund_id','00000000-0000-4000-8000-00000000f926'));
  EXCEPTION WHEN OTHERS THEN
    v_conflict:=SQLERRM LIKE '%QUAL_CLAIM_AUDIT_FAULT%'; END;
  PERFORM pg_catalog.set_config('qual.fail_claim_audit','off',true);
  IF NOT v_conflict OR
     (public.qual_claim_payout_counts()->>'events')::integer<>0 OR
     (public.qual_claim_payout_counts()->>'paid_decisions')::integer<>0
  THEN RAISE EXCEPTION 'PAYOUT_AUDIT_FAULT_DID_NOT_ROLL_BACK'; END IF;
  PERFORM pg_catalog.set_config('qual.fail_paid_history','on',true);
  v_conflict:=false;
  BEGIN
    PERFORM public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
      'claim_id','00000000-0000-4000-8000-00000000e921',
      'account_id','00000000-0000-4000-8000-00000000e925',
      'fund_id','00000000-0000-4000-8000-00000000f926'));
  EXCEPTION WHEN OTHERS THEN
    v_conflict:=SQLERRM LIKE '%QUAL_HISTORY_FAULT%'; END;
  PERFORM pg_catalog.set_config('qual.fail_paid_history','off',true);
  IF NOT v_conflict OR
     (SELECT status FROM public.relief_claims
       WHERE id='00000000-0000-4000-8000-00000000e921')<>'approved' OR
     (SELECT decision_version FROM public.relief_claims
       WHERE id='00000000-0000-4000-8000-00000000e921')<>2 OR
     (SELECT count(*) FROM public.list_relief_claim_decisions(
       '00000000-0000-4000-8000-00000000e921'))<>2
  THEN RAISE EXCEPTION 'PAYOUT_HISTORY_FAULT_DID_NOT_ROLL_BACK'; END IF;
  v_result:=public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
    'claim_id','00000000-0000-4000-8000-00000000e921',
    'account_id','00000000-0000-4000-8000-00000000e925',
    'fund_id','00000000-0000-4000-8000-00000000f926'));
  IF v_result->>'ok'<>'true' OR
     (SELECT decision_version FROM public.relief_claims
       WHERE id='00000000-0000-4000-8000-00000000e921')<>3 OR
     (SELECT count(*) FROM public.list_relief_claim_decisions(
       '00000000-0000-4000-8000-00000000e921'))<>3
  THEN RAISE EXCEPTION 'PAYOUT_HISTORY_OR_AUDIT_INVALID'; END IF;
  PERFORM pg_catalog.set_config('qual.payout_event_id',
    v_result->>'financial_event_id',true);
  v_result:=public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
    'claim_id','00000000-0000-4000-8000-00000000e921',
    'account_id','00000000-0000-4000-8000-00000000e925'));
  IF v_result->>'ok'<>'true' OR
     (SELECT count(*) FROM public.list_relief_claim_decisions(
       '00000000-0000-4000-8000-00000000e921'))<>3
  THEN RAISE EXCEPTION 'PAYOUT_RETRY_DUPLICATED_HISTORY'; END IF;
  v_conflict:=false;
  BEGIN
    PERFORM public.post_relief_claim_payout(pg_catalog.jsonb_build_object(
      'claim_id','00000000-0000-4000-8000-00000000e921',
      'account_id','00000000-0000-4000-8000-00000000e925',
      'fund_id','00000000-0000-4000-8000-00000000f928'));
  EXCEPTION WHEN OTHERS THEN v_conflict:=SQLERRM LIKE '%CONFLICT%'; END;
  IF NOT v_conflict THEN RAISE EXCEPTION 'CHANGED_PAYOUT_FUND_REPLAYED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
DECLARE v_event uuid:=current_setting('qual.payout_event_id')::uuid;
BEGIN
  IF (SELECT count(*) FROM financial_core.financial_event_audit_links
      WHERE event_id=v_event)<>1 OR
     (SELECT count(*) FROM public.financial_postings
      WHERE event_id=v_event)<>2 OR
     (SELECT count(*) FROM public.financial_events
      WHERE source_module='relief' AND source_record_id=
        '00000000-0000-4000-8000-00000000e921'
        AND effect_kind='claim_payout')<>1
  THEN RAISE EXCEPTION 'PAYOUT_AUDIT_OR_POSTINGS_INVALID'; END IF;
END
$test$;

SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a923',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.decide_relief_claim(pg_catalog.jsonb_build_object(
      'group_id','00000000-0000-4000-8000-00000000b921',
    'claim_id','00000000-0000-4000-8000-00000000e921',
      'request_id','00000000-0000-4000-8000-00000000f921',
      'expected_version',0,'status','reviewing'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%UNAUTHORIZED%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_TENANT_RECOVERY_ALLOWED'; END IF;
END
$test$;
RESET ROLE;

UPDATE public.memberships SET membership_status='suspended'
WHERE id='00000000-0000-4000-8000-00000000c921';
SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a921',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.decide_relief_claim(pg_catalog.jsonb_build_object(
      'group_id','00000000-0000-4000-8000-00000000b921',
    'claim_id','00000000-0000-4000-8000-00000000e921',
      'request_id','00000000-0000-4000-8000-00000000f921',
      'expected_version',0,'status','reviewing'));
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%UNAUTHORIZED%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_RECOVERY_ALLOWED'; END IF;
END
$test$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub',
 '00000000-0000-4000-8000-00000000a922',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_result jsonb; v_denied boolean:=false;
BEGIN
  BEGIN
    INSERT INTO public.relief_claims
      (id,plan_id,membership_id,claimant_membership_id,group_id,
       event_type,incident_date,amount,amount_requested,amount_approved,
       currency,status)
    VALUES ('00000000-0000-4000-8000-00000000e923',
      '00000000-0000-4000-8000-00000000d921',
      '00000000-0000-4000-8000-00000000c922',
      '00000000-0000-4000-8000-00000000c922',
      '00000000-0000-4000-8000-00000000b921',
      'illness',CURRENT_DATE,10,10,10,'USD','approved');
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%INITIAL_STATE_CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'PREAPPROVED_CLAIM_INSERT_ALLOWED'; END IF;
  v_denied:=false;
  BEGIN
    INSERT INTO public.relief_claims
      (id,plan_id,membership_id,claimant_membership_id,group_id,
       event_type,incident_date,amount,amount_requested,
       currency,status,review_notes)
    VALUES ('00000000-0000-4000-8000-00000000e923',
      '00000000-0000-4000-8000-00000000d921',
      '00000000-0000-4000-8000-00000000c922',
      '00000000-0000-4000-8000-00000000c922',
      '00000000-0000-4000-8000-00000000b921',
      'illness',CURRENT_DATE,10,10,'USD','submitted','Forged reviewer note');
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%INITIAL_STATE_CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'FORGED_REVIEW_NOTE_INSERT_ALLOWED'; END IF;
  INSERT INTO public.relief_claims
    (id,plan_id,membership_id,claimant_membership_id,group_id,
     event_type,incident_date,amount,amount_requested,currency,status)
  VALUES ('00000000-0000-4000-8000-00000000e924',
    '00000000-0000-4000-8000-00000000d921',
    '00000000-0000-4000-8000-00000000c922',
    '00000000-0000-4000-8000-00000000c922',
    '00000000-0000-4000-8000-00000000b921',
    'illness',CURRENT_DATE,10,10,'USD','submitted');
  IF NOT EXISTS (SELECT 1 FROM public.relief_claims
      WHERE id='00000000-0000-4000-8000-00000000e924')
  THEN RAISE EXCEPTION 'VALID_MEMBER_SUBMISSION_FAILED'; END IF;
  v_result:=public.decide_relief_claim(pg_catalog.jsonb_build_object(
    'group_id','00000000-0000-4000-8000-00000000b921',
    'claim_id','00000000-0000-4000-8000-00000000e922',
    'request_id','00000000-0000-4000-8000-00000000f924',
    'expected_version',0,'status','withdrawn'));
  IF v_result->>'status'<>'withdrawn' OR
     (SELECT count(*) FROM public.list_relief_claim_decisions(
       '00000000-0000-4000-8000-00000000e922'))<>1
  THEN RAISE EXCEPTION 'CLAIMANT_WITHDRAWAL_FAILED'; END IF;
  RAISE NOTICE 'RELIEF_CLAIM_DECISIONS_PASS: direct writes denied, version/history/retry/payload/revocation/cross-tenant/withdrawal';
END
$test$;
RESET ROLE;
ROLLBACK;
