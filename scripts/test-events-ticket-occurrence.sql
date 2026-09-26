-- Transactional affected-caller probe, using the real F3 tables/policies.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-00000000a801','ticket-officer@example.test'),
 ('00000000-0000-4000-8000-00000000a802','ticket-member@example.test'),
 ('00000000-0000-4000-8000-00000000a803','ticket-outsider@example.test');
INSERT INTO public.groups(id,name,currency) VALUES
 ('00000000-0000-4000-8000-00000000b801','Fictional Ticket Group','USD'),
 ('00000000-0000-4000-8000-00000000b802','Other Ticket Group','USD');
INSERT INTO public.memberships(id,user_id,group_id,role,membership_status) VALUES
 ('00000000-0000-4000-8000-00000000c801','00000000-0000-4000-8000-00000000a801','00000000-0000-4000-8000-00000000b801','owner','active'),
 ('00000000-0000-4000-8000-00000000c802','00000000-0000-4000-8000-00000000a802','00000000-0000-4000-8000-00000000b801','member','active'),
 ('00000000-0000-4000-8000-00000000c803','00000000-0000-4000-8000-00000000a803','00000000-0000-4000-8000-00000000b802','owner','active');
INSERT INTO public.financial_ledger_epochs
 (id,group_id,currency,effective_from,source_kind,approval_note)
VALUES ('00000000-0000-4000-8000-00000000d801',
 '00000000-0000-4000-8000-00000000b801','USD','2020-01-01',
 'cutover','Fictional ticket epoch');
INSERT INTO public.financial_accounts
 (id,group_id,opened_ledger_epoch_id,currency,name,kind,opened_at)
VALUES ('00000000-0000-4000-8000-00000000e801',
 '00000000-0000-4000-8000-00000000b801',
 '00000000-0000-4000-8000-00000000d801','USD',
 'Ticket Cash','cash','2020-01-01');
INSERT INTO public.financial_funds(id,group_id,name,is_default,is_restricted)
VALUES ('00000000-0000-4000-8000-00000000f801',
 '00000000-0000-4000-8000-00000000b801','General',true,false);
INSERT INTO public.financial_categories(id,group_id,name,category_class)
VALUES ('00000000-0000-4000-8000-00000000f802',
 '00000000-0000-4000-8000-00000000b801','Ticket Income','income');
INSERT INTO public.events(id,group_id,title,starts_at,created_by,capacity)
VALUES ('00000000-0000-4000-8000-00000000e802',
 '00000000-0000-4000-8000-00000000b801','Fictional Concert',
 now()+interval '2 days','00000000-0000-4000-8000-00000000a801',2);
INSERT INTO public.ticket_tiers(id,event_id,name,price,capacity)
VALUES ('00000000-0000-4000-8000-00000000f803',
 '00000000-0000-4000-8000-00000000e802','Seat','12.50',2);

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a801',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_tier uuid; v_denied boolean:=false;
BEGIN
  v_tier:=public.create_ticket_tier(
    '00000000-0000-4000-8000-00000000e802','Free admission',0,NULL);
  IF NOT EXISTS (SELECT 1 FROM public.ticket_tiers
      WHERE id=v_tier AND price=0) THEN
    RAISE EXCEPTION 'TIER_RPC_DID_NOT_CREATE'; END IF;
  BEGIN
    INSERT INTO public.ticket_tiers(event_id,name,price)
    VALUES ('00000000-0000-4000-8000-00000000e802','Forged',0);
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DIRECT_TIER_WRITE_ALLOWED'; END IF;
  v_denied:=false;
  BEGIN
    INSERT INTO public.ticket_purchases(event_id,tier_id,membership_id,amount_paid,currency)
    VALUES ('00000000-0000-4000-8000-00000000e802',
      '00000000-0000-4000-8000-00000000f803',
      '00000000-0000-4000-8000-00000000c802',12.50,'USD');
  EXCEPTION WHEN insufficient_privilege THEN v_denied:=true; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'DIRECT_TICKET_WRITE_ALLOWED'; END IF;
  RAISE NOTICE 'TICKET_TIER_RPC_PASS: authorized create, direct writes denied';
END
$test$;
SELECT public.post_ticket_purchase(
 '00000000-0000-4000-8000-00000000a804',
 '00000000-0000-4000-8000-00000000e802',
 '00000000-0000-4000-8000-00000000f803',
 '00000000-0000-4000-8000-00000000c802',
 '00000000-0000-4000-8000-00000000e801',
 '00000000-0000-4000-8000-00000000f802',
 '00000000-0000-4000-8000-00000000b801') AS posted;
SELECT public.post_ticket_purchase(
 '00000000-0000-4000-8000-00000000a804',
 '00000000-0000-4000-8000-00000000e802',
 '00000000-0000-4000-8000-00000000f803',
 '00000000-0000-4000-8000-00000000c802',
 '00000000-0000-4000-8000-00000000e801',
 '00000000-0000-4000-8000-00000000f802',
 '00000000-0000-4000-8000-00000000b801') AS retry;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_ticket_purchase(
      '00000000-0000-4000-8000-00000000a804',
      '00000000-0000-4000-8000-00000000e802',
      '00000000-0000-4000-8000-00000000f803',
      '00000000-0000-4000-8000-00000000c801',
      '00000000-0000-4000-8000-00000000e801',
      '00000000-0000-4000-8000-00000000f802',
      '00000000-0000-4000-8000-00000000b801');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%TICKET_IDENTITY_CONFLICT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'TICKET_CHANGED_PAYLOAD_ACCEPTED'; END IF;
  IF jsonb_array_length(public.list_own_ticket_purchases(
    '00000000-0000-4000-8000-00000000b801'))<>1
    THEN RAISE EXCEPTION 'TICKET_RECOVERY_LIST'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.ticket_purchases WHERE request_id=
    '00000000-0000-4000-8000-00000000a804')<>1
    OR (SELECT count(*) FROM public.financial_events WHERE source_module='events'
      AND source_record_id='00000000-0000-4000-8000-00000000a804')<>1
    OR (SELECT count(*) FROM public.financial_postings p JOIN public.financial_events e
      ON e.id=p.event_id WHERE e.source_module='events')<>2
    OR (SELECT count(*) FROM financial_core.financial_event_audit_links l
      JOIN public.financial_events e ON e.id=l.event_id
      WHERE e.source_module='events')<>1
    THEN RAISE EXCEPTION 'TICKET_FINANCIAL_AUDIT_INTEGRITY'; END IF;
  RAISE NOTICE 'TICKET_POST_ONCE_PASS: purchase, two postings, one audit, recovery';
END
$test$;
CREATE FUNCTION pg_temp.reject_ticket_audit() RETURNS trigger
 LANGUAGE plpgsql AS $fn$
BEGIN
  IF new.action='financial_event.posted' THEN
    RAISE EXCEPTION 'INJECTED_TICKET_AUDIT_FAILURE';
  END IF;
  RETURN new;
END
$fn$;
CREATE TRIGGER reject_ticket_audit BEFORE INSERT ON public.group_audit_logs
 FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_ticket_audit();
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_ticket_purchase(
      '00000000-0000-4000-8000-00000000a805',
      '00000000-0000-4000-8000-00000000e802',
      '00000000-0000-4000-8000-00000000f803',
      '00000000-0000-4000-8000-00000000c802',
      '00000000-0000-4000-8000-00000000e801',
      '00000000-0000-4000-8000-00000000f802',
      '00000000-0000-4000-8000-00000000b801');
  EXCEPTION WHEN OTHERS THEN
    v_denied:=SQLERRM LIKE '%INJECTED_TICKET_AUDIT_FAILURE%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'TICKET_AUDIT_FAULT_NOT_PROPAGATED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ticket_purchases WHERE request_id=
    '00000000-0000-4000-8000-00000000a805') OR EXISTS (
      SELECT 1 FROM public.financial_events WHERE source_module='events'
        AND source_record_id='00000000-0000-4000-8000-00000000a805')
    THEN RAISE EXCEPTION 'TICKET_AUDIT_FAULT_LEFT_EFFECT'; END IF;
END
$test$;
DROP TRIGGER reject_ticket_audit ON public.group_audit_logs;
SET LOCAL ROLE authenticated;
SELECT public.post_ticket_purchase(
 '00000000-0000-4000-8000-00000000a805',
 '00000000-0000-4000-8000-00000000e802',
 '00000000-0000-4000-8000-00000000f803',
 '00000000-0000-4000-8000-00000000c802',
 '00000000-0000-4000-8000-00000000e801',
 '00000000-0000-4000-8000-00000000f802',
 '00000000-0000-4000-8000-00000000b801') AS second_intent;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_ticket_purchase(
      '00000000-0000-4000-8000-00000000a806',
      '00000000-0000-4000-8000-00000000e802',
      '00000000-0000-4000-8000-00000000f803',
      '00000000-0000-4000-8000-00000000c802',
      '00000000-0000-4000-8000-00000000e801',
      '00000000-0000-4000-8000-00000000f802',
      '00000000-0000-4000-8000-00000000b801');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLERRM LIKE '%TICKET_SOLD_OUT%'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'TICKET_CAPACITY_EXCEEDED'; END IF;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  IF (SELECT count(*) FROM public.ticket_purchases WHERE event_id=
    '00000000-0000-4000-8000-00000000e802')<>2
    OR (SELECT count(*) FROM public.financial_events WHERE source_module='events')<>2
    OR (SELECT count(*) FROM financial_core.financial_event_audit_links l
      JOIN public.financial_events e ON e.id=l.event_id
      WHERE e.source_module='events')<>2
    THEN RAISE EXCEPTION 'SECOND_TICKET_OR_AUDIT_DUPLICATE'; END IF;
  RAISE NOTICE 'TICKET_SECOND_INTENT_PASS: second legitimate purchase, cap, atomic audit retry';
END
$test$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a803',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_ticket_purchase(
      '00000000-0000-4000-8000-00000000a804',
      '00000000-0000-4000-8000-00000000e802',
      '00000000-0000-4000-8000-00000000f803',
      '00000000-0000-4000-8000-00000000c802',
      '00000000-0000-4000-8000-00000000e801',
      '00000000-0000-4000-8000-00000000f802',
      '00000000-0000-4000-8000-00000000b801');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'CROSS_TENANT_TICKET_REPLAY'; END IF;
END
$test$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a801',true);
SET LOCAL ROLE authenticated;
SELECT public.transfer_group_ownership(jsonb_build_object(
  'group_id','00000000-0000-4000-8000-00000000b801',
  'new_owner_membership_id','00000000-0000-4000-8000-00000000c802'));
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
UPDATE public.memberships SET role='member'
  WHERE id='00000000-0000-4000-8000-00000000c801';
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a801',true);
SET LOCAL ROLE authenticated;
DO $test$
DECLARE v_denied boolean:=false;
BEGIN
  BEGIN
    PERFORM public.post_ticket_purchase(
      '00000000-0000-4000-8000-00000000a804',
      '00000000-0000-4000-8000-00000000e802',
      '00000000-0000-4000-8000-00000000f803',
      '00000000-0000-4000-8000-00000000c802',
      '00000000-0000-4000-8000-00000000e801',
      '00000000-0000-4000-8000-00000000f802',
      '00000000-0000-4000-8000-00000000b801');
  EXCEPTION WHEN OTHERS THEN v_denied:=SQLSTATE='42501'; END;
  IF NOT v_denied THEN RAISE EXCEPTION 'REVOKED_TICKET_REPLAY'; END IF;
END
$test$;
RESET ROLE;
ROLLBACK;
