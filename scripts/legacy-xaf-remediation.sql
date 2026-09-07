-- PREPARE/REVIEW ONLY. DO NOT EXECUTE WITHOUT SEPARATE PRODUCTION AUTHORIZATION.
-- Required order: Phase A -> this package -> app cutover/drain -> Phase B.
-- Invocation after approval:
--   psql -v ON_ERROR_STOP=1 -v remediation_actor_id='<ACTIVE_OWNER_OR_ADMIN_UUID>' -f scripts/legacy-xaf-remediation.sql
\set ON_ERROR_STOP on

BEGIN;
SELECT set_config('villageclaq.remediation_actor_id', :'remediation_actor_id', true);

DO $legacy_xaf_remediation$
DECLARE
  v_group constant uuid := 'eaf89185-3dc0-4d92-8d4d-97bc976a211e';
  v_batch constant uuid := '40dbed40-fadb-4e85-9e45-dc7ea8b5a731';
  v_type constant uuid := 'f97536f4-c7a6-459b-b684-569ee12e30fb';
  v_usd_type constant uuid := 'eea68b29-fdbd-4b18-b37a-090385dc36fd';
  v_receipt_payment constant uuid := 'c6f1b1a3-fcb3-4498-b2bc-508bc5542b7e';
  v_reason constant text := 'Production QA/test artifact — founder-approved legacy financial cleanup.';
  v_actor uuid := nullif(current_setting('villageclaq.remediation_actor_id', true), '')::uuid;
  v_at timestamptz := clock_timestamp();
  v_count integer;
  v_receipt_fingerprint text;
  v_usd_fingerprint jsonb;
  v_standing_before jsonb;
  v_obligations constant uuid[] := ARRAY[
    '059b6642-f273-4f97-af58-97920e149c49','11293571-15bf-4fb9-aa94-e2d558f3c689',
    '1a153ab0-dbea-4aad-b246-7b255c488b78','1decd7de-bf02-43dc-8cb1-1028097f4318',
    '4a7da745-a044-4f3e-a042-6ce015fc512a','831a136e-44d7-4f1e-93d5-1ee113daa341',
    'b0b46a63-c1d5-45ee-bbfc-03746808a90e','d7c2bb42-768b-47c4-a505-e82972b39e03',
    'dc71a552-3254-43b2-a32c-462d7d06f9ac','ffa92a83-ef14-4010-ad87-34bddea358ed'
  ]::uuid[];
  v_payments constant uuid[] := ARRAY[
    '1d2b3d09-4f93-46ee-9cbf-64b9d8b031be','225923fc-8ceb-4532-89ad-509a8fbb9d80',
    '9f44a05e-133c-46ed-9ca7-727d34f383b1','9f78dacd-a8db-4b94-b483-b1b3a0e7d323',
    'b2f9876f-f64c-422a-b668-e70cec32d183','c0c1dd82-a85e-423b-be51-ad2268dccf30',
    'c6f1b1a3-fcb3-4498-b2bc-508bc5542b7e','ce95e515-200c-4aa5-a6e0-d40ef66d74a6',
    'eff3a330-654c-4446-a6c3-202e1a7a892c','fc9b14d1-6953-4cab-903a-d333abdb196c'
  ]::uuid[];
  v_memberships constant uuid[] := ARRAY[
    '02c1afca-7aea-4277-9aad-68bddc8a9ff5','3c4ad458-80d7-4694-9276-04d7fd91a64b',
    '3cb38ffd-3e13-402e-b86c-c7653760c3ad','4ac03283-2f55-41b0-8ca3-6b6bd5478c5a',
    '5ff9caa8-963d-4360-b107-7ae4ae748ee2','681e8cb1-0565-4e4b-8770-7b67107d5daf',
    '6fe4ea45-277a-4f58-a339-1ffb43dc19b8','7c101044-5bf5-47a6-9556-a87ee9a0e2bf',
    '9e5c9514-ad04-42d4-945b-bb1861d29d6a'
  ]::uuid[];
  r record;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'REMEDIATION_ACTOR_REQUIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('legacy-xaf-remediation:' || v_group::text, 0));

  IF to_regclass('financial_private.legacy_financial_neutralizations') IS NULL
     OR to_regclass('financial_private.ledger_epoch_conflicts') IS NULL
  THEN RAISE EXCEPTION 'PHASE_A_REQUIRED'; END IF;
  IF to_regprocedure('public.apply_payment_command(uuid,uuid,text,jsonb,uuid,integer,text)') IS NOT NULL
  THEN RAISE EXCEPTION 'REMEDIATION_MUST_PRECEDE_PHASE_B'; END IF;

  PERFORM 1 FROM public.groups g
  WHERE g.id=v_group AND g.name='METACU Edit' AND g.currency='USD' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TARGET_GROUP_PRESTATE_MISMATCH'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.group_id=v_group AND m.user_id=v_actor
      AND m.role IN ('owner','admin') AND m.membership_status='active')
  THEN RAISE EXCEPTION 'ACTIVE_GROUP_ADMIN_REQUIRED'; END IF;

  SELECT count(*) INTO v_count
  FROM financial_private.legacy_financial_neutralizations n WHERE n.batch_id=v_batch;
  IF v_count=21 THEN
    IF (SELECT count(*) FROM financial_private.legacy_financial_neutralizations
          WHERE batch_id=v_batch AND group_id=v_group)<>21
      OR NOT EXISTS (SELECT 1 FROM public.contribution_types
        WHERE id=v_type AND group_id=v_group AND currency='XAF' AND is_active=false)
      OR (SELECT count(*) FROM public.contribution_obligations
        WHERE id=ANY(v_obligations) AND group_id=v_group AND currency='XAF' AND status='waived')<>10
      OR (SELECT count(*) FROM public.payments
        WHERE id=ANY(v_payments) AND group_id=v_group AND currency='XAF' AND status='rejected')<>10
      OR NOT EXISTS (SELECT 1 FROM public.payments
        WHERE id=v_receipt_payment AND nullif(receipt_url,'') IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.financial_ledger_epochs
        WHERE group_id=v_group AND currency='XAF')
      OR EXISTS (SELECT 1 FROM financial_private.current_ledger_epoch_conflicts
        WHERE group_id=v_group)
      OR EXISTS (SELECT 1 FROM financial_private.ledger_epoch_conflicts
        WHERE group_id=v_group AND resolution_status<>'approved')
      OR (SELECT count(*) FROM public.group_audit_logs
        WHERE group_id=v_group AND action='financial.legacy_pollution_neutralized' AND entity_id=v_batch)<>1
    THEN RAISE EXCEPTION 'REMEDIATION_REPLAY_STATE_MISMATCH'; END IF;
    RETURN;
  ELSIF v_count<>0 THEN
    RAISE EXCEPTION 'PARTIAL_REMEDIATION_REGISTRY';
  END IF;

  IF EXISTS (SELECT 1 FROM financial_private.legacy_financial_neutralizations n
    WHERE (n.record_type='contribution_type' AND n.record_id=v_type)
       OR (n.record_type='obligation' AND n.record_id=ANY(v_obligations))
       OR (n.record_type='payment' AND n.record_id=ANY(v_payments)))
  THEN RAISE EXCEPTION 'TARGET_ALREADY_REGISTERED'; END IF;
  IF (SELECT count(*) FROM public.contribution_types WHERE group_id=v_group AND currency='XAF')<>1
    OR NOT EXISTS (SELECT 1 FROM public.contribution_types
      WHERE id=v_type AND group_id=v_group AND name='Test Quarterly' AND amount=100000
        AND currency='XAF' AND frequency::text='monthly' AND is_active=true)
  THEN RAISE EXCEPTION 'CONTRIBUTION_TYPE_PRESTATE_MISMATCH'; END IF;
  IF (SELECT count(*) FROM public.contribution_obligations WHERE group_id=v_group AND currency='XAF')<>10
    OR (SELECT count(*) FROM public.contribution_obligations
      WHERE id=ANY(v_obligations) AND group_id=v_group AND contribution_type_id=v_type
        AND amount=100000 AND amount_paid=0 AND currency='XAF' AND status='pending'
        AND waived_by IS NULL AND waived_at IS NULL)<>10
  THEN RAISE EXCEPTION 'OBLIGATION_PRESTATE_MISMATCH'; END IF;
  IF (SELECT count(*) FROM public.payments WHERE group_id=v_group AND currency='XAF')<>10
    OR (SELECT count(*) FROM public.payments
      WHERE id=ANY(v_payments) AND group_id=v_group AND amount IN (10000,100000)
        AND currency='XAF' AND status='confirmed' AND obligation_id IS NULL
        AND payment_date='2026-04-06')<>10
    OR (SELECT count(*) FROM public.payments
      WHERE id=ANY(v_payments) AND amount=100000 AND contribution_type_id=v_type)<>8
    OR (SELECT count(*) FROM public.payments
      WHERE id=ANY(v_payments) AND amount=10000 AND contribution_type_id=v_usd_type)<>2
    OR (SELECT coalesce(sum(amount),0) FROM public.payments WHERE id=ANY(v_payments))<>820000
  THEN RAISE EXCEPTION 'PAYMENT_PRESTATE_MISMATCH'; END IF;
  IF (SELECT count(*) FROM public.payment_obligation_applications WHERE payment_id=ANY(v_payments))<>0
  THEN RAISE EXCEPTION 'UNEXPECTED_XAF_PAYMENT_APPLICATION'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payments
      WHERE id=v_receipt_payment AND nullif(receipt_url,'') IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.payments
      WHERE id=ANY(v_payments) AND id<>v_receipt_payment AND nullif(receipt_url,'') IS NOT NULL)
  THEN RAISE EXCEPTION 'RECEIPT_EVIDENCE_PRESTATE_MISMATCH'; END IF;
  IF (SELECT count(*) FROM public.memberships WHERE id=ANY(v_memberships) AND group_id=v_group)<>9
  THEN RAISE EXCEPTION 'AFFECTED_MEMBERSHIP_PRESTATE_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM public.financial_ledger_epochs
    WHERE group_id=v_group AND currency='XAF')
  THEN RAISE EXCEPTION 'PROHIBITED_XAF_EPOCH_PRESENT'; END IF;

  SELECT md5(receipt_url) INTO v_receipt_fingerprint
  FROM public.payments WHERE id=v_receipt_payment;
  SELECT jsonb_build_object(
    'types',md5(coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text
      FROM public.contribution_types t WHERE t.group_id=v_group AND t.currency='USD'),'[]')),
    'obligations',md5(coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id)::text
      FROM public.contribution_obligations o WHERE o.group_id=v_group AND o.currency='USD'),'[]')),
    'payments',md5(coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)::text
      FROM public.payments p WHERE p.group_id=v_group AND p.currency='USD'),'[]'))
  ) INTO v_usd_fingerprint;
  SELECT jsonb_agg(jsonb_build_object('membershipId',m.id,'standing',m.standing::text)
    ORDER BY m.id) INTO v_standing_before
  FROM public.memberships m WHERE m.id=ANY(v_memberships);

  INSERT INTO financial_private.legacy_financial_neutralizations(
    batch_id,group_id,record_type,record_id,record_currency,founder_decision,reason,
    prior_state,resulting_state,authorized_by,applied_by,applied_at)
  SELECT v_batch,v_group,'contribution_type',t.id,t.currency,'C',v_reason,
    jsonb_build_object('name',t.name,'amount',t.amount,'currency',t.currency,
      'frequency',t.frequency,'isActive',t.is_active),
    jsonb_build_object('isActive',false,'authoritative',false),v_actor,v_actor,v_at
  FROM public.contribution_types t WHERE t.id=v_type;
  INSERT INTO financial_private.legacy_financial_neutralizations(
    batch_id,group_id,record_type,record_id,record_currency,founder_decision,reason,
    prior_state,resulting_state,authorized_by,applied_by,applied_at)
  SELECT v_batch,v_group,'obligation',o.id,o.currency,'C',v_reason,
    jsonb_build_object('membershipId',o.membership_id,'typeId',o.contribution_type_id,
      'amount',o.amount,'amountPaid',o.amount_paid,'currency',o.currency,
      'dueDate',o.due_date,'status',o.status),
    jsonb_build_object('status','waived','authoritative',false),v_actor,v_actor,v_at
  FROM public.contribution_obligations o WHERE o.id=ANY(v_obligations);
  INSERT INTO financial_private.legacy_financial_neutralizations(
    batch_id,group_id,record_type,record_id,record_currency,founder_decision,reason,
    prior_state,resulting_state,authorized_by,applied_by,applied_at)
  SELECT v_batch,v_group,'payment',p.id,p.currency,'C',v_reason,
    jsonb_build_object('membershipId',p.membership_id,'typeId',p.contribution_type_id,
      'obligationId',p.obligation_id,'amount',p.amount,'currency',p.currency,
      'status',p.status,'paymentDate',p.payment_date,
      'hasReceipt',nullif(p.receipt_url,'') IS NOT NULL),
    jsonb_build_object('status','rejected','authoritative',false,
      'receiptPreserved',nullif(p.receipt_url,'') IS NOT NULL),v_actor,v_actor,v_at
  FROM public.payments p WHERE p.id=ANY(v_payments);
  IF (SELECT count(*) FROM financial_private.legacy_financial_neutralizations
    WHERE batch_id=v_batch)<>21 THEN RAISE EXCEPTION 'REMEDIATION_REGISTRY_COUNT_MISMATCH'; END IF;

  UPDATE public.contribution_types SET is_active=false,updated_at=v_at
  WHERE id=v_type AND group_id=v_group AND currency='XAF' AND is_active=true;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>1 THEN RAISE EXCEPTION 'CONTRIBUTION_TYPE_UPDATE_COUNT_MISMATCH'; END IF;
  UPDATE public.contribution_obligations
  SET status='waived',waived_by=v_actor,waived_at=v_at,updated_at=v_at
  WHERE id=ANY(v_obligations) AND group_id=v_group AND currency='XAF' AND status='pending';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>10 THEN RAISE EXCEPTION 'OBLIGATION_UPDATE_COUNT_MISMATCH'; END IF;
  UPDATE public.payments SET status='rejected',updated_at=v_at
  WHERE id=ANY(v_payments) AND group_id=v_group AND currency='XAF' AND status='confirmed';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>10 THEN RAISE EXCEPTION 'PAYMENT_UPDATE_COUNT_MISMATCH'; END IF;

  FOR r IN SELECT unnest(v_memberships) id LOOP
    PERFORM public.recalculate_membership_standing(r.id);
  END LOOP;

  PERFORM financial_private.refresh_ledger_epoch_conflicts();
  IF EXISTS (SELECT 1 FROM financial_private.current_ledger_epoch_conflicts WHERE group_id=v_group)
  THEN RAISE EXCEPTION 'LEGACY_CONFLICT_REMAINS'; END IF;
  UPDATE financial_private.ledger_epoch_conflicts
  SET resolution_status='approved',resolution_note=v_reason || ' Batch ' || v_batch::text,
      resolved_by=v_actor,resolved_at=v_at
  WHERE group_id=v_group AND resolution_status='unresolved';
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>31 THEN RAISE EXCEPTION 'EXPECTED_CONFLICT_INVENTORY_MISMATCH'; END IF;

  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  SELECT v_group,v_actor,'financial.legacy_pollution_neutralized','remediation_batch',v_batch,
    jsonb_build_object(
      'batchId',v_batch,'founderDecision','C — ERRONEOUS PRODUCTION FINANCIAL DATA',
      'reason',v_reason,'appliedAt',v_at,
      'contributionTypeIds',to_jsonb(ARRAY[v_type]),
      'obligationIds',to_jsonb(v_obligations),'paymentIds',to_jsonb(v_payments),
      'standingBefore',v_standing_before,
      'standingAfter',(SELECT jsonb_agg(jsonb_build_object(
        'membershipId',m.id,'standing',m.standing::text) ORDER BY m.id)
        FROM public.memberships m WHERE m.id=ANY(v_memberships)),
      'neutralized',jsonb_build_object('XAFExpected',1000000,'XAFConfirmed',820000),
      'receiptEvidencePreserved',true,'xafEpochCreated',false);

  IF (SELECT count(*) FROM public.group_audit_logs
      WHERE group_id=v_group AND action='financial.legacy_pollution_neutralized' AND entity_id=v_batch)<>1
    OR (SELECT count(*) FROM public.contribution_obligations
      WHERE id=ANY(v_obligations) AND status='waived' AND waived_by=v_actor AND waived_at=v_at)<>10
    OR (SELECT count(*) FROM public.payments
      WHERE id=ANY(v_payments) AND status='rejected')<>10
  THEN RAISE EXCEPTION 'REMEDIATION_POSTSTATE_MISMATCH'; END IF;
  IF (SELECT md5(receipt_url) FROM public.payments WHERE id=v_receipt_payment)
       IS DISTINCT FROM v_receipt_fingerprint
    OR (SELECT jsonb_build_object(
      'types',md5(coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.id)::text
        FROM public.contribution_types t WHERE t.group_id=v_group AND t.currency='USD'),'[]')),
      'obligations',md5(coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id)::text
        FROM public.contribution_obligations o WHERE o.group_id=v_group AND o.currency='USD'),'[]')),
      'payments',md5(coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id)::text
        FROM public.payments p WHERE p.group_id=v_group AND p.currency='USD'),'[]')))
    ) IS DISTINCT FROM v_usd_fingerprint
  THEN RAISE EXCEPTION 'EVIDENCE_OR_USD_HISTORY_CHANGED'; END IF;
  IF (SELECT currency FROM public.groups WHERE id=v_group)<>'USD'
    OR EXISTS (SELECT 1 FROM public.financial_ledger_epochs WHERE group_id=v_group AND currency='XAF')
  THEN RAISE EXCEPTION 'CURRENCY_OR_EPOCH_POSTSTATE_MISMATCH'; END IF;
END;
$legacy_xaf_remediation$;

COMMIT;
