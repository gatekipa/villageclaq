-- R-009: fixed F3 effects for conditional/refundable Relief cash.
BEGIN;
-- A branch may settle the owner's liability/receivable only for a linked,
-- audited conditional agency receipt it still has authority to refund.
CREATE FUNCTION financial_core.assert_relief_agency_refund_authority(
  p_owner_group uuid,p_payment_source text)
RETURNS TABLE(actor_id uuid,branch_group_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payment public.payments%ROWTYPE;
  v_link financial_core.relief_agency_receipts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_owner_group IS NULL OR p_payment_source IS NULL
    OR p_payment_source !~
      '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  THEN RAISE EXCEPTION 'DENY' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_payment FROM public.payments
    WHERE id=p_payment_source::uuid;
  SELECT * INTO v_link FROM financial_core.relief_agency_receipts
    WHERE payment_id=v_payment.id;
  IF v_payment.id IS NULL OR v_payment.cash_class='non_refundable'
     OR v_payment.status<>'confirmed'
     OR v_link.payment_id IS NULL
     OR v_link.owner_group_id IS DISTINCT FROM p_owner_group
     OR v_link.branch_group_id IS DISTINCT FROM v_payment.group_id
     OR v_link.owner_event_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM financial_core.financial_event_audit_links
       WHERE event_id=v_link.owner_event_id)
  THEN RAISE EXCEPTION 'RELIEF_REFUND_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  branch_group_id:=v_link.branch_group_id;
  actor_id:=financial_core.assert_finances_manage(branch_group_id);
  RETURN NEXT;
END
$$;
REVOKE ALL ON FUNCTION financial_core.assert_relief_agency_refund_authority(
  uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION financial_core.post_module_pair(
  p_group uuid, p_module text, p_source text, p_effect text,
  p_amount numeric, p_currency text, p_account uuid, p_category uuid,
  p_fund uuid, p_member uuid, p_occurred timestamptz, p_description text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor uuid; v_auth_group uuid; v_request uuid; v_epoch public.financial_ledger_epochs%ROWTYPE;
  v_account public.financial_accounts%ROWTYPE; v_fund uuid; v_category_class public.financial_category_class;
  v_class public.financial_event_class; v_first public.financial_control_class;
  v_second public.financial_control_class; v_amount text; v_payload jsonb;
  v_hash text; v_event uuid; v_existing public.financial_events%ROWTYPE;
  v_request_event uuid; v_source_event uuid; v_existing_payload jsonb;
BEGIN
  IF p_group IS NULL OR p_module IS NULL OR p_source IS NULL OR p_effect IS NULL
     OR p_occurred IS NULL OR p_amount IS NULL OR p_amount <= 0
     OR p_currency IS NULL OR p_currency <> pg_catalog.upper(p_currency)
     OR financial_core.currency_scale(p_currency) IS NULL
     OR pg_catalog.length(p_source) NOT BETWEEN 1 AND 256
     OR p_source !~ '^[A-Za-z0-9_:.-]+$'
  THEN RAISE EXCEPTION 'MODULE_PAIR_INVALID_INPUT'; END IF;

  CASE p_module||':'||p_effect
    WHEN 'relief:claim_payout' THEN
      v_class := 'money_out'; v_first := 'expense'; v_second := 'custody';
    WHEN 'relief:owner_nonrefundable_receipt' THEN
      v_class := 'money_in'; v_first := 'custody'; v_second := 'income';
    WHEN 'relief:owner_conditional_receipt' THEN
      v_class := 'money_in'; v_first := 'custody'; v_second := 'liability';
    WHEN 'relief:agency_receipt' THEN
      v_class := 'money_in'; v_first := 'custody'; v_second := 'liability';
    WHEN 'relief:agency_owner_recognition' THEN
      v_class := 'money_in'; v_first := 'receivable'; v_second := 'income';
    WHEN 'relief:agency_remittance_out' THEN
      v_class := 'money_out'; v_first := 'liability'; v_second := 'custody';
    WHEN 'relief:agency_remittance_in' THEN
      v_class := 'money_in'; v_first := 'custody'; v_second := 'receivable';
    WHEN 'relief:agency_claim_payout_out' THEN
      v_class := 'money_out'; v_first := 'liability'; v_second := 'custody';
    WHEN 'relief:agency_claim_payout_owner' THEN
      v_class := 'money_out'; v_first := 'expense'; v_second := 'receivable';
    WHEN 'relief:owner_liability_recognize' THEN
      v_class := 'money_in'; v_first := 'liability'; v_second := 'income';
    WHEN 'relief:owner_liability_refund' THEN
      v_class := 'money_out'; v_first := 'liability'; v_second := 'custody';
    WHEN 'relief:agency_owner_liability' THEN
      v_class := 'money_in'; v_first := 'receivable'; v_second := 'liability';
    WHEN 'relief:agency_liability_recognize' THEN
      v_class := 'money_in'; v_first := 'liability'; v_second := 'income';
    WHEN 'relief:agency_refund_out' THEN
      v_class := 'money_out'; v_first := 'liability'; v_second := 'custody';
    WHEN 'relief:agency_refund_owner' THEN
      v_class := 'money_out'; v_first := 'liability'; v_second := 'receivable';
    WHEN 'loan:principal_disbursement' THEN
      v_class := 'money_out'; v_first := 'receivable'; v_second := 'custody';
    WHEN 'loan:principal_repayment' THEN
      v_class := 'money_in'; v_first := 'custody'; v_second := 'receivable';
    WHEN 'loan:interest_receipt' THEN
      v_class := 'money_in'; v_first := 'custody'; v_second := 'income';
    WHEN 'events:ticket_receipt' THEN
      v_class := 'money_in'; v_first := 'custody'; v_second := 'income';
    WHEN 'dues:nonrefundable_receipt' THEN
      v_class := 'money_in'; v_first := 'custody'; v_second := 'income';
    WHEN 'dues:conditional_receipt' THEN
      v_class := 'money_in'; v_first := 'custody'; v_second := 'liability';
    WHEN 'dues:condition_satisfied' THEN
      v_class := 'money_in'; v_first := 'liability'; v_second := 'income';
    WHEN 'dues:credit_refund' THEN
      v_class := 'money_out'; v_first := 'liability'; v_second := 'custody';
    ELSE RAISE EXCEPTION 'MODULE_PAIR_EFFECT_NOT_ALLOWED';
  END CASE;
  -- A noncash recognition may retain its source receipt account in the
  -- canonical payload for lineage. Custody effects require an account.
  IF (v_first='custody' OR v_second='custody') AND p_account IS NULL
  THEN RAISE EXCEPTION 'MODULE_PAIR_ACCOUNT_CONTRACT'; END IF;

  BEGIN
    IF p_module='relief' AND p_effect='agency_refund_owner' THEN
      SELECT authority.actor_id,authority.branch_group_id
        INTO v_actor,v_auth_group
      FROM financial_core.assert_relief_agency_refund_authority(
        p_group,p_source) authority;
    ELSIF p_module='relief' AND p_effect='agency_claim_payout_owner' THEN
      SELECT authority.actor_id,authority.branch_group_id
        INTO v_actor,v_auth_group
      FROM financial_core.assert_relief_delegated_payout_authority(
        p_group,p_source) authority;
    ELSE
      v_actor := financial_core.assert_finances_manage(p_group);
      v_auth_group := p_group;
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE = '42501';
  END;
  v_request := public.uuid_generate_v5(
    '6ba7b811-9dad-11d1-80b4-00c04fd430c8'::uuid,
    'villageclaq/module-pair-v1/'||p_group::text||'/'||p_module||'/'||p_source||'/'||p_effect
  );
  PERFORM financial_core.lock_f3_identity(p_group,v_request,p_module,p_source,p_effect);
  PERFORM 1 FROM public.memberships m
    WHERE m.group_id=v_auth_group AND m.user_id=v_actor FOR SHARE;
  BEGIN
    IF p_module='relief' AND p_effect='agency_refund_owner' THEN
      PERFORM 1 FROM financial_core.assert_relief_agency_refund_authority(
        p_group,p_source);
    ELSIF p_module='relief' AND p_effect='agency_claim_payout_owner' THEN
      PERFORM 1 FROM financial_core.assert_relief_delegated_payout_authority(
        p_group,p_source);
    ELSE
      PERFORM financial_core.assert_finances_manage(p_group);
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE = '42501';
  END;

  SELECT e.id INTO v_request_event FROM public.financial_events e
    WHERE e.group_id=p_group AND e.request_id=v_request;
  SELECT e.id INTO v_source_event FROM public.financial_events e
    WHERE e.group_id=p_group AND e.source_module=p_module
      AND e.source_record_id=p_source AND e.effect_kind=p_effect;
  IF v_request_event IS NOT NULL AND v_source_event IS NOT NULL
     AND v_request_event <> v_source_event THEN
    RAISE EXCEPTION 'OCCURRENCE_INTEGRITY';
  END IF;
  SELECT e.* INTO v_existing FROM public.financial_events e
    WHERE e.id=coalesce(v_request_event,v_source_event);
  IF v_existing.id IS NOT NULL AND
     (v_existing.request_id IS DISTINCT FROM v_request
      OR v_existing.source_module IS DISTINCT FROM p_module
      OR v_existing.source_record_id IS DISTINCT FROM p_source
      OR v_existing.effect_kind IS DISTINCT FROM p_effect)
  THEN RAISE EXCEPTION 'OCCURRENCE_INTEGRITY'; END IF;

  IF p_account IS NOT NULL THEN
    SELECT a.* INTO v_account FROM public.financial_accounts a WHERE a.id=p_account FOR SHARE;
    IF v_account.id IS NULL OR v_account.group_id<>p_group OR v_account.currency<>p_currency
    THEN RAISE EXCEPTION 'CROSS_GROUP_OR_CURRENCY_ACCOUNT'; END IF;
    IF v_existing.id IS NULL AND v_account.status<>'active'
    THEN RAISE EXCEPTION 'ACCOUNT_INACTIVE'; END IF;
  END IF;

  IF p_member IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.memberships m WHERE m.id=p_member AND m.group_id=p_group
  ) THEN RAISE EXCEPTION 'CROSS_GROUP_MEMBER'; END IF;
  IF v_first IN ('income','expense') OR v_second IN ('income','expense') THEN
    v_category_class := CASE WHEN v_first='expense' THEN 'expense'
                             ELSE 'income' END;
    IF p_category IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.financial_categories c
      WHERE c.id=p_category AND c.group_id=p_group
        AND c.category_class=v_category_class
        AND (v_existing.id IS NOT NULL OR c.status='active')
    ) THEN RAISE EXCEPTION 'CATEGORY_REQUIRED_OR_INVALID'; END IF;
  ELSIF p_category IS NOT NULL THEN
    RAISE EXCEPTION 'CATEGORY_PROHIBITED';
  END IF;

  IF p_fund IS NULL AND v_existing.id IS NOT NULL THEN
    SELECT (c.canonical_payload->>'fund_id')::uuid INTO v_fund
    FROM financial_core.posting_command_payloads c WHERE c.event_id=v_existing.id;
  ELSIF p_fund IS NULL THEN
    SELECT f.id INTO v_fund FROM public.financial_funds f
    WHERE f.group_id=p_group AND f.is_default AND f.status='active'
      AND NOT f.is_restricted FOR SHARE;
  ELSE v_fund := p_fund;
  END IF;
  IF v_fund IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.financial_funds f
    WHERE f.id=v_fund AND f.group_id=p_group
      AND (v_existing.id IS NOT NULL OR f.status='active')
  ) THEN RAISE EXCEPTION 'FUND_REQUIRED_OR_INVALID'; END IF;

  IF v_existing.id IS NOT NULL THEN
    SELECT e.* INTO v_epoch FROM public.financial_ledger_epochs e
    WHERE e.id=v_existing.ledger_epoch_id;
  ELSE
    PERFORM 1 FROM public.groups g WHERE g.id=p_group FOR SHARE;
    SELECT e.* INTO v_epoch FROM public.financial_ledger_epochs e
    WHERE e.group_id=p_group AND e.currency=p_currency
      AND e.effective_from<=p_occurred
      AND (e.effective_to IS NULL OR p_occurred<e.effective_to)
    FOR SHARE;
  END IF;
  IF v_epoch.id IS NULL OR v_epoch.group_id<>p_group
     OR v_epoch.currency<>p_currency THEN RAISE EXCEPTION 'EPOCH_NOT_FOUND'; END IF;
  v_amount := financial_core.f3_amount(pg_catalog.to_jsonb(p_amount::text),p_currency);
  v_payload := pg_catalog.jsonb_build_object(
    'contract_version','f3-posting-v1','group_id',p_group,
    'ledger_epoch_id',v_epoch.id,'event_class',v_class,'effect_kind',p_effect,
    'currency',p_currency,'amount',v_amount,
    'occurred_at',pg_catalog.to_char(p_occurred AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'source_module',p_module,'source_record_id',p_source,'request_id',v_request,
    'account_id',p_account,'destination_account_id',NULL,'fund_id',v_fund,
    'category_id',p_category,'member_id',p_member,'project_id',NULL,
    'opening_provenance_id',NULL
  );
  v_hash := financial_core.f3_fingerprint(v_payload);
  IF v_existing.id IS NOT NULL THEN
    SELECT c.canonical_payload INTO v_existing_payload
    FROM financial_core.posting_command_payloads c WHERE c.event_id=v_existing.id;
    IF v_existing_payload IS NULL OR
       financial_core.f3_canonical(v_payload)<>financial_core.f3_canonical(v_existing_payload)
    THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    RETURN pg_catalog.jsonb_build_object('decision','IDEMPOTENT_RETURN_EXISTING',
      'event_id',v_existing.id,'new_event_count',0,'new_posting_count',0);
  END IF;

  INSERT INTO public.financial_events
    (group_id,ledger_epoch_id,currency,event_class,source_module,source_record_id,
     effect_kind,request_id,economic_payload_fingerprint,occurred_at,created_by,
     description,status)
  VALUES (p_group,v_epoch.id,p_currency,v_class,p_module,p_source,p_effect,
          v_request,v_hash,p_occurred,v_actor,p_description,'posted')
  RETURNING id INTO v_event;
  INSERT INTO public.financial_postings
    (event_id,group_id,ledger_epoch_id,currency,occurred_at,amount_signed,
     control_class,account_id,fund_id,category_id,category_class,member_id)
  VALUES
    (v_event,p_group,v_epoch.id,p_currency,p_occurred,p_amount,v_first,
     CASE WHEN v_first='custody' THEN p_account ELSE NULL END,v_fund,
     CASE WHEN v_first IN ('income','expense') THEN p_category ELSE NULL END,
     CASE WHEN v_first IN ('income','expense') THEN v_category_class ELSE NULL END,p_member),
    (v_event,p_group,v_epoch.id,p_currency,p_occurred,-p_amount,v_second,
     CASE WHEN v_second='custody' THEN p_account ELSE NULL END,v_fund,
     CASE WHEN v_second IN ('income','expense') THEN p_category ELSE NULL END,
     CASE WHEN v_second IN ('income','expense') THEN v_category_class ELSE NULL END,p_member);
  INSERT INTO financial_core.posting_command_payloads(event_id,canonical_payload)
    VALUES(v_event,v_payload);
  RETURN pg_catalog.jsonb_build_object('decision','POSTED','event_id',v_event,
    'new_event_count',1,'new_posting_count',2);
END;
$$;
REVOKE ALL ON FUNCTION financial_core.post_module_pair(
  uuid,text,text,text,numeric,text,uuid,uuid,uuid,uuid,timestamptz,text
) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
