-- Founder observation: reverse an erroneous confirmed non-refundable dues receipt
-- with one linked, audited economic effect. Original receipt and postings remain.
BEGIN;

ALTER TABLE public.payments
  ADD COLUMN reversal_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  ADD COLUMN reversed_at timestamptz;
ALTER TABLE public.payments DROP CONSTRAINT payments_settlement_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_settlement_status_check
  CHECK (settlement_status IN ('open','recognized','refunded','reversed'));

CREATE TABLE financial_core.dues_receipt_reversals (
  request_id uuid PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL UNIQUE REFERENCES public.payments(id) ON DELETE RESTRICT,
  original_event_id uuid NOT NULL REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  reversal_event_id uuid UNIQUE REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CHECK ((reversal_event_id IS NULL) = (completed_at IS NULL))
);
ALTER TABLE financial_core.dues_receipt_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.dues_receipt_reversals FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.guard_dues_reversal_lineage()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_user NOT IN ('postgres','supabase_admin') AND (
    NEW.reversal_event_id IS DISTINCT FROM OLD.reversal_event_id OR
    NEW.reversed_at IS DISTINCT FROM OLD.reversed_at)
  THEN RAISE EXCEPTION 'DUES_REVERSAL_SERVER_ONLY'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER guard_dues_reversal_lineage BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_dues_reversal_lineage();
REVOKE ALL ON FUNCTION public.guard_dues_reversal_lineage() FROM PUBLIC,anon,authenticated,service_role;

-- The exact post_module_pair and member-statement definitions from the last
-- applied migrations are copied below with only the new reversal effect/link.
-- Generation is pinned in the migration file, not resolved dynamically.

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
    WHEN 'dues:receipt_reversal' THEN
      v_class := 'money_out'; v_first := 'income'; v_second := 'custody';
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
  v_amount := financial_core.f3_amount(pg_catalog.to_jsonb(pg_catalog.trim_scale(p_amount)::text),p_currency);
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

CREATE OR REPLACE FUNCTION public.get_member_contribution_statement(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_group_id uuid;
  v_uid uuid;
  v_member_id uuid;
  v_currency text;
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_is_owner boolean;
  v_has_view boolean;
  v_result jsonb;
  v_transactions jsonb;
  v_total numeric;
BEGIN
  v_uid := auth.uid();
  v_group_id := (p_command->>'group_id')::uuid;
  v_member_id := (p_command->>'membership_id')::uuid;
  v_currency := p_command->>'currency';
  v_start_date := (p_command->>'start_date')::timestamptz;
  v_end_date := COALESCE((p_command->>'end_date')::timestamptz, now());

  SELECT (user_id = v_uid AND membership_status = 'active') INTO v_is_owner
  FROM public.memberships WHERE id = v_member_id AND group_id = v_group_id;
  v_has_view := public.has_group_permission(v_group_id, 'finances.view', v_uid);
  IF v_is_owner IS NOT TRUE AND v_has_view IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF v_currency IS NULL OR financial_core.currency_scale(v_currency) IS NULL THEN
    RAISE EXCEPTION 'INVALID_CURRENCY' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb), COALESCE(SUM(t.amount), 0)
    INTO v_transactions, v_total
  FROM (
    SELECT e.id AS event_id, e.source_module, e.description,
      e.occurred_at, p.amount_signed AS amount
    FROM public.financial_events e
    JOIN public.financial_postings p ON p.event_id = e.id
    WHERE e.group_id = v_group_id AND e.currency = v_currency
      AND e.source_module = 'dues'
      AND e.status = 'posted' AND e.event_class IN ('money_in','money_out')
      AND p.member_id = v_member_id AND p.control_class = 'custody'
      AND p.amount_signed <> 0
      AND EXISTS (
        SELECT 1 FROM public.payments payment
        WHERE payment.group_id = v_group_id
          AND payment.membership_id = v_member_id
          AND (payment.financial_event_id = e.id OR payment.refund_event_id = e.id OR payment.reversal_event_id = e.id)
      )
      AND (v_start_date IS NULL OR e.occurred_at >= v_start_date)
      AND e.occurred_at <= v_end_date
    ORDER BY e.occurred_at ASC, e.id
  ) t;

  v_result := jsonb_build_object(
    'membership_id', v_member_id, 'currency', v_currency,
    'transactions', v_transactions, 'total_contributed', v_total,
    'generated_at', now(), 'start_date', v_start_date,
    'end_date', v_end_date
  );
  RETURN v_result;
END;
$$;

CREATE FUNCTION public.reverse_dues_receipt(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_group uuid; v_payment_id uuid; v_request uuid; v_actor uuid; v_reason text;
  v_payment public.payments%ROWTYPE; v_original public.financial_events%ROWTYPE;
  v_bound financial_core.dues_receipt_reversals%ROWTYPE;
  v_account uuid; v_category uuid; v_fund uuid; v_result jsonb; v_event uuid;
  v_audit uuid; v_obligation uuid;
BEGIN
  IF auth.uid() IS NULL OR jsonb_typeof(p_command)<>'object'
    OR p_command->>'action'<>'reverse_erroneous_receipt'
  THEN RAISE EXCEPTION 'INVALID_REVERSAL_COMMAND' USING ERRCODE='22023'; END IF;
  v_group:=(p_command->>'group_id')::uuid;
  v_payment_id:=(p_command->>'payment_id')::uuid;
  v_request:=(p_command->>'request_id')::uuid;
  v_reason:=btrim(p_command->>'reason');
  IF v_group IS NULL OR v_payment_id IS NULL OR v_request IS NULL
    OR length(v_reason) NOT BETWEEN 10 AND 1000
  THEN RAISE EXCEPTION 'INVALID_REVERSAL_COMMAND' USING ERRCODE='22023'; END IF;
  v_actor:=financial_core.assert_finances_manage(v_group);
  SELECT * INTO v_payment FROM public.payments
    WHERE id=v_payment_id AND group_id=v_group FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND'; END IF;
  -- An existing request may be replayed from a fresh session, but only by its
  -- original actor with current manage authority and the same exact meaning.
  SELECT * INTO v_bound FROM financial_core.dues_receipt_reversals
    WHERE request_id=v_request FOR UPDATE;
  IF v_bound.request_id IS NOT NULL THEN
    IF v_bound.group_id IS DISTINCT FROM v_group OR v_bound.actor_id IS DISTINCT FROM v_actor
      OR v_bound.payment_id IS DISTINCT FROM v_payment_id
      OR v_bound.original_event_id IS DISTINCT FROM v_payment.financial_event_id
      OR v_bound.reason IS DISTINCT FROM v_reason
    THEN RAISE EXCEPTION 'REVERSAL_IDENTITY_CONFLICT'; END IF;
    PERFORM 1 FROM public.memberships m
      WHERE m.group_id=v_group AND m.user_id=v_actor FOR SHARE;
    PERFORM financial_core.assert_finances_manage(v_group);
    IF v_bound.reversal_event_id IS NOT NULL
      AND v_payment.reversal_event_id=v_bound.reversal_event_id
      AND v_payment.settlement_status='reversed'
    THEN RETURN jsonb_build_object('decision','IDEMPOTENT_RETURN_EXISTING',
      'payment_id',v_payment_id,'original_event_id',v_bound.original_event_id,
      'reversal_event_id',v_bound.reversal_event_id);
    END IF;
    RAISE EXCEPTION 'REVERSAL_INTEGRITY';
  END IF;
  IF EXISTS (SELECT 1 FROM financial_core.dues_receipt_reversals
    WHERE payment_id=v_payment_id)
  THEN RAISE EXCEPTION 'PAYMENT_ALREADY_REVERSED'; END IF;
  IF v_payment.relief_plan_id IS NOT NULL OR v_payment.status<>'confirmed'
    OR v_payment.cash_class<>'non_refundable'
    OR v_payment.settlement_status<>'recognized'
    OR v_payment.financial_event_id IS NULL
    OR v_payment.reversal_event_id IS NOT NULL OR v_payment.refund_event_id IS NOT NULL
  THEN RAISE EXCEPTION 'PAYMENT_NOT_REVERSIBLE'; END IF;
  SELECT * INTO v_original FROM public.financial_events
    WHERE id=v_payment.financial_event_id AND group_id=v_group FOR SHARE;
  IF v_original.id IS NULL OR v_original.status<>'posted'
    OR v_original.currency<>v_payment.currency
    OR v_original.source_module<>'dues'
    OR v_original.source_record_id<>v_payment.id::text
    OR v_original.effect_kind<>'nonrefundable_receipt'
  THEN RAISE EXCEPTION 'ORIGINAL_RECEIPT_INTEGRITY'; END IF;
  IF (SELECT count(*) FROM public.financial_postings p WHERE p.event_id=v_original.id)<>2
  THEN RAISE EXCEPTION 'ORIGINAL_POSTING_INTEGRITY'; END IF;
  SELECT p.account_id,p.fund_id INTO v_account,v_fund
  FROM public.financial_postings p WHERE p.event_id=v_original.id
    AND p.control_class='custody' AND p.amount_signed=v_payment.amount
    AND p.member_id=v_payment.membership_id;
  SELECT p.category_id INTO v_category
  FROM public.financial_postings p WHERE p.event_id=v_original.id
    AND p.control_class='income' AND p.amount_signed=-v_payment.amount
    AND p.member_id=v_payment.membership_id AND p.fund_id=v_fund;
  IF v_account IS NULL OR v_fund IS NULL OR v_category IS NULL
    OR v_payment.financial_account_id IS DISTINCT FROM v_account
  THEN RAISE EXCEPTION 'ORIGINAL_POSTING_INTEGRITY'; END IF;
  INSERT INTO financial_core.dues_receipt_reversals
    (request_id,group_id,actor_id,payment_id,original_event_id,reason)
  VALUES (v_request,v_group,v_actor,v_payment_id,v_original.id,v_reason)
  RETURNING * INTO v_bound;
  PERFORM 1 FROM public.memberships m
    WHERE m.group_id=v_group AND m.user_id=v_actor FOR SHARE;
  PERFORM financial_core.assert_finances_manage(v_group);
  v_result:=financial_core.post_module_pair(
    v_group,'dues',v_payment.id::text,'receipt_reversal',v_payment.amount,
    v_payment.currency,v_account,v_category,v_fund,v_payment.membership_id,
    v_bound.requested_at,'Erroneous dues receipt reversed: '||v_payment.id::text);
  v_event:=(v_result->>'event_id')::uuid;
  IF v_event IS NULL OR NOT EXISTS (
    SELECT 1 FROM financial_core.financial_event_audit_links a WHERE a.event_id=v_event)
  THEN RAISE EXCEPTION 'REVERSAL_AUDIT_REQUIRED'; END IF;
  UPDATE public.payments SET settlement_status='reversed',
    reversal_event_id=v_event,reversed_at=v_bound.requested_at,updated_at=now()
  WHERE id=v_payment.id;
  FOR v_obligation IN
    SELECT a.obligation_id FROM public.payment_obligation_applications a
      WHERE a.payment_id=v_payment.id
    UNION SELECT v_payment.obligation_id WHERE v_payment.obligation_id IS NOT NULL
  LOOP
    PERFORM public.recalc_obligation_amount_paid(v_obligation);
  END LOOP;
  PERFORM public.recalculate_membership_standing(v_payment.membership_id);
  INSERT INTO public.group_audit_logs
    (group_id,actor_id,action,entity_type,entity_id,description,details)
  VALUES (v_group,v_actor,'dues_payment.reversed','payment',v_payment.id,
    'Erroneous dues receipt reversed',jsonb_build_object(
      'reason',v_reason,'request_id',v_request,
      'original_event_id',v_original.id,'reversal_event_id',v_event))
  RETURNING id INTO v_audit;
  UPDATE financial_core.dues_receipt_reversals
    SET reversal_event_id=v_event,completed_at=now()
    WHERE request_id=v_request;
  RETURN jsonb_build_object('decision','REVERSED','payment_id',v_payment.id,
    'original_event_id',v_original.id,'reversal_event_id',v_event,
    'audit_id',v_audit);
END
$$;
REVOKE ALL ON FUNCTION public.reverse_dues_receipt(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.reverse_dues_receipt(jsonb) TO authenticated;

COMMIT;
