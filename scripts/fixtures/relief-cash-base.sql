-- R-009 branch/owner receipt slice on the production S0/M2-compatible catalog.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a801','owner@example.test'),
 ('00000000-0000-4000-8000-00000000a802','branch-officer@example.test'),
 ('00000000-0000-4000-8000-00000000a803','branch-member@example.test'),
 ('00000000-0000-4000-8000-00000000a804','other-officer@example.test');
INSERT INTO public.organizations(id,name,slug,owner_id) VALUES
 ('00000000-0000-4000-8000-00000000d801','Fictional Relief Union',
  'fictional-relief-union','00000000-0000-4000-8000-00000000a801'),
 ('00000000-0000-4000-8000-00000000d802','Other Union',
  'other-union','00000000-0000-4000-8000-00000000a804');
INSERT INTO public.groups(id,organization_id,name,slug,group_level,currency) VALUES
 ('00000000-0000-4000-8000-00000000b801',
  '00000000-0000-4000-8000-00000000d801','HQ','relief-hq','hq','USD'),
 ('00000000-0000-4000-8000-00000000b802',
  '00000000-0000-4000-8000-00000000d801','Branch','relief-branch','branch','USD'),
 ('00000000-0000-4000-8000-00000000b803',
  '00000000-0000-4000-8000-00000000d802','Other','other-branch','branch','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status) VALUES
 ('00000000-0000-4000-8000-00000000c801',
  '00000000-0000-4000-8000-00000000a801',
  '00000000-0000-4000-8000-00000000b801','owner','active'),
 ('00000000-0000-4000-8000-00000000c802',
  '00000000-0000-4000-8000-00000000a802',
  '00000000-0000-4000-8000-00000000b802','admin','active'),
 ('00000000-0000-4000-8000-00000000c803',
  '00000000-0000-4000-8000-00000000a803',
  '00000000-0000-4000-8000-00000000b802','member','active'),
 ('00000000-0000-4000-8000-00000000c804',
  '00000000-0000-4000-8000-00000000a804',
  '00000000-0000-4000-8000-00000000b803','admin','active');
INSERT INTO public.group_subscriptions(group_id,tier,status)
VALUES ('00000000-0000-4000-8000-00000000b801','starter','active');
INSERT INTO public.relief_plans(id,group_id,name,created_by,
  is_active,status,currency,shared_from_org)
VALUES ('00000000-0000-4000-8000-00000000d803',
 '00000000-0000-4000-8000-00000000b801','Fictional Shared Plan',
 '00000000-0000-4000-8000-00000000a801',true,'active','USD',true);
INSERT INTO public.relief_enrollments
 (plan_id,membership_id,group_id,collecting_group_id,status,is_active)
VALUES ('00000000-0000-4000-8000-00000000d803',
 '00000000-0000-4000-8000-00000000c803',
 '00000000-0000-4000-8000-00000000b802',
 '00000000-0000-4000-8000-00000000b802','active',true);
INSERT INTO public.relief_enrollments
 (plan_id,membership_id,group_id,collecting_group_id,status,is_active,
  matures_at)
VALUES ('00000000-0000-4000-8000-00000000d803',
 '00000000-0000-4000-8000-00000000c801',
 '00000000-0000-4000-8000-00000000b801',
 '00000000-0000-4000-8000-00000000b801','active',true,
 now()-interval '1 day');
INSERT INTO public.relief_claims
 (id,plan_id,membership_id,claimant_membership_id,group_id,
  event_type,incident_date,amount,amount_requested,currency,
  description,status)
VALUES ('00000000-0000-4000-8000-00000000e80a',
 '00000000-0000-4000-8000-00000000d803',
 '00000000-0000-4000-8000-00000000c801',
 '00000000-0000-4000-8000-00000000c801',
 '00000000-0000-4000-8000-00000000b801',
 'illness',CURRENT_DATE,15,15,'USD',
 'Fictional delegated payout claim','submitted');
INSERT INTO public.relief_claims
 (id,plan_id,membership_id,claimant_membership_id,group_id,
  event_type,incident_date,amount,amount_requested,currency,
  description,status)
VALUES ('00000000-0000-4000-8000-00000000e80c',
 '00000000-0000-4000-8000-00000000d803',
 '00000000-0000-4000-8000-00000000c801',
 '00000000-0000-4000-8000-00000000c801',
 '00000000-0000-4000-8000-00000000b801',
 'illness',CURRENT_DATE,4,4,'USD',
 'Fictional payout fault probe','submitted');
INSERT INTO public.financial_ledger_epochs
 (id,group_id,currency,effective_from,source_kind,approval_note)
VALUES
 ('00000000-0000-4000-8000-00000000d804',
  '00000000-0000-4000-8000-00000000b801','USD','2020-01-01',
  'cutover','Fictional HQ epoch'),
 ('00000000-0000-4000-8000-00000000d805',
  '00000000-0000-4000-8000-00000000b802','USD','2020-01-01',
  'cutover','Fictional branch epoch');
INSERT INTO public.financial_accounts
 (id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at)
VALUES ('00000000-0000-4000-8000-00000000e801',
 '00000000-0000-4000-8000-00000000b802',
 '00000000-0000-4000-8000-00000000d805','USD',
 'Branch Cash','cash','2020-01-01'),
 ('00000000-0000-4000-8000-00000000e804',
  '00000000-0000-4000-8000-00000000b801',
  '00000000-0000-4000-8000-00000000d804','USD',
  'HQ Cash','cash','2020-01-01');
INSERT INTO public.financial_funds(id,group_id,name,is_default,is_restricted)
VALUES
 ('00000000-0000-4000-8000-00000000f801',
  '00000000-0000-4000-8000-00000000b801','HQ Relief',false,true),
 ('00000000-0000-4000-8000-00000000f802',
  '00000000-0000-4000-8000-00000000b802','Branch Relief',false,true);
INSERT INTO public.financial_funds(id,group_id,name,is_default,is_restricted)
VALUES ('00000000-0000-4000-8000-00000000f807',
  '00000000-0000-4000-8000-00000000b801','Other HQ Restricted',false,true);
INSERT INTO public.financial_funds(id,group_id,name,is_default,is_restricted)
VALUES ('00000000-0000-4000-8000-00000000f806',
 '00000000-0000-4000-8000-00000000b802',
 'Other Branch Restricted',false,true);
INSERT INTO public.financial_categories(id,group_id,name,category_class)
VALUES ('00000000-0000-4000-8000-00000000f803',
 '00000000-0000-4000-8000-00000000b801','Relief Income','income');
INSERT INTO public.financial_categories(id,group_id,name,category_class)
VALUES ('00000000-0000-4000-8000-00000000f804',
 '00000000-0000-4000-8000-00000000b801','Relief Expense','expense');
INSERT INTO public.payments(id,group_id,membership_id,amount,currency,
  payment_method,recorded_by,relief_plan_id,status,cash_class)
VALUES ('00000000-0000-4000-8000-00000000e802',
 '00000000-0000-4000-8000-00000000b802',
 '00000000-0000-4000-8000-00000000c803',70,'USD','cash',
 '00000000-0000-4000-8000-00000000a802',
 '00000000-0000-4000-8000-00000000d803','pending_confirmation','non_refundable');
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    INSERT INTO public.payments(id,group_id,membership_id,amount,currency,
      payment_method,recorded_by,relief_plan_id,status)
    VALUES ('00000000-0000-4000-8000-00000000e803',
      '00000000-0000-4000-8000-00000000b803',
      '00000000-0000-4000-8000-00000000c804',10,'USD','cash',
      '00000000-0000-4000-8000-00000000a804',
      '00000000-0000-4000-8000-00000000d803','pending_confirmation');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_ORG_RELIEF_PLAN_LINK'; END IF;
END
$test$;
