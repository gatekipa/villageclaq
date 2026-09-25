-- M4 Slice 1: Bridge Schema & Canonical Dues Posting RPC
-- Bridges legacy operational dues payments directly into the F3 double-entry financial ledger.
-- Governed by PRD Section 12 (F4) and VILLAGECLAQ_MASTER_REBUILD_PRD_V1_SECURITY_REVISION_2.md.
--
-- INVARIANTS ENFORCED:
-- 1. Cash-Basis Recognition: Confirmed dues payments recognize contribution income once upon confirmation.
-- 2. Custody Tracking: Confirmed payments must bind to an active custody account (financial_accounts).
-- 3. Double-Entry Immutability: Postings are posted atomically via financial_core.post_f3_command.
-- 4. Subledger Lineage: payments row links directly to financial_events(id) and financial_accounts(id).
-- 5. Idempotent Execution: Re-posting returns IDEMPOTENT_RETURN_EXISTING without duplicate entries.

DO $m4_pre$
DECLARE
  v_hgp_count int;
  v_hgp_ident text;
  v_hgp_result text;
  v_hgp_owner text;
  v_hgp_definer boolean;
  v_hgp_cfg text[];
  v_hgp_def_md5 text;
  v_hgp_src_md5 text;
BEGIN
  SELECT count(*) INTO v_hgp_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'M4_ABORT: has_group_permission overload count=% (expected 1; do not add 2-arg)', v_hgp_count;
  END IF;
  SELECT pg_get_function_identity_arguments(p.oid),
         pg_get_function_result(p.oid),
         pg_get_userbyid(p.proowner),
         p.prosecdef,
         p.proconfig,
         md5(pg_get_functiondef(p.oid)),
         md5(p.prosrc)
    INTO v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
         v_hgp_def_md5, v_hgp_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_ident IS DISTINCT FROM 'gid uuid, perm_key text, uid uuid'
     OR v_hgp_result IS DISTINCT FROM 'boolean'
     OR v_hgp_owner IS DISTINCT FROM 'postgres'
     OR v_hgp_definer IS NOT TRUE
     OR v_hgp_cfg IS DISTINCT FROM ARRAY['search_path=""']::text[]
     OR v_hgp_def_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
     OR v_hgp_src_md5 IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff' THEN
    RAISE EXCEPTION
      'M4_ABORT: has_group_permission pin mismatch ident=% result=% owner=% definer=% cfg=% def_md5=% src_md5=%',
      v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
      v_hgp_def_md5, v_hgp_src_md5;
  END IF;

  IF to_regprocedure('public.post_financial_opening_cash(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'M4_ABORT: post_financial_opening_cash missing — apply 00123 first';
  END IF;
  IF to_regprocedure('public.post_dues_payment_confirmation(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'M4_ABORT: post_dues_payment_confirmation already present';
  END IF;
END
$m4_pre$;

BEGIN;

-- ============================================================================
-- 1. Bridge Columns on public.payments
-- ============================================================================
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS financial_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS financial_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_payments_financial_event_id ON public.payments(financial_event_id);
CREATE INDEX IF NOT EXISTS idx_payments_financial_account_id ON public.payments(financial_account_id);

-- ============================================================================
-- 2. Configuration Defaults on public.contribution_types
-- ============================================================================
ALTER TABLE public.contribution_types
  ADD COLUMN IF NOT EXISTS default_category_id uuid REFERENCES public.financial_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS default_fund_id uuid REFERENCES public.financial_funds(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contribution_types_default_category_id ON public.contribution_types(default_category_id);
CREATE INDEX IF NOT EXISTS idx_contribution_types_default_fund_id ON public.contribution_types(default_fund_id);

-- ============================================================================
-- 3. Canonical Dues Posting RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.post_dues_payment_confirmation(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text;
  v_payment_id uuid;
  v_account_id uuid;
  v_request_id uuid;
  v_category_id uuid;
  v_fund_id uuid;
  v_payment public.payments%ROWTYPE;
  v_contrib_type public.contribution_types%ROWTYPE;
  v_group_id uuid;
  v_scale integer;
  v_amount_str text;
  v_metadata jsonb;
  v_f3_command jsonb;
  v_f3_res jsonb;
  v_event_id uuid;
BEGIN
  -- 1. Authentication check
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE = '42501';
  END IF;

  -- 2. Input JSON validation
  IF p_command IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'INVALID_INPUT';
  END IF;

  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_command) LOOP
    IF NOT (v_key = ANY(ARRAY['payment_id', 'account_id', 'category_id', 'fund_id', 'request_id'])) THEN
      RAISE EXCEPTION 'UNSUPPORTED_FIELD';
    END IF;
  END LOOP;

  -- 3. Extract and parse parameters
  v_payment_id  := financial_core.f3_uuid(p_command->'payment_id');
  v_account_id  := financial_core.f3_uuid(p_command->'account_id');
  v_request_id  := financial_core.f3_uuid(p_command->'request_id');
  v_category_id := financial_core.f3_uuid(p_command->'category_id', true);
  v_fund_id     := financial_core.f3_uuid(p_command->'fund_id', true);

  -- 4. Lock payment row
  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = v_payment_id
  FOR UPDATE;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  v_group_id := v_payment.group_id;

  -- 5. Authorization: Caller must hold finances.manage permission for the group
  BEGIN
    PERFORM financial_core.assert_finances_manage(v_group_id);
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE = '42501';
  END;

  -- 6. Idempotency assertion: If payment is already bound to a canonical financial event, return existing state
  IF v_payment.financial_event_id IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'decision', 'IDEMPOTENT_RETURN_EXISTING',
      'payment_id', v_payment.id,
      'financial_event_id', v_payment.financial_event_id,
      'posting_count', 0
    );
  END IF;

  -- 7. Payment status assertion
  IF v_payment.status = 'rejected' THEN
    RAISE EXCEPTION 'PAYMENT_ALREADY_REJECTED';
  END IF;

  IF v_payment.status NOT IN ('pending_confirmation', 'confirmed') THEN
    RAISE EXCEPTION 'INVALID_PAYMENT_STATUS';
  END IF;

  -- 8. Fetch contribution type details if linked
  IF v_payment.contribution_type_id IS NOT NULL THEN
    SELECT * INTO v_contrib_type
    FROM public.contribution_types
    WHERE id = v_payment.contribution_type_id;
  END IF;

  -- 9. Resolve category: caller explicit -> type default -> first active income category
  IF v_category_id IS NULL AND v_contrib_type.id IS NOT NULL THEN
    v_category_id := v_contrib_type.default_category_id;
  END IF;

  IF v_category_id IS NULL THEN
    SELECT c.id INTO v_category_id
    FROM public.financial_categories c
    WHERE c.group_id = v_group_id
      AND c.category_class = 'income'
      AND c.status = 'active'
    ORDER BY (c.name ILIKE '%dues%' OR c.name ILIKE '%contribution%') DESC, c.created_at ASC
    LIMIT 1;
  END IF;

  IF v_category_id IS NULL THEN
    RAISE EXCEPTION 'INCOME_CATEGORY_REQUIRED';
  END IF;

  -- 10. Resolve fund: caller explicit -> type default -> NULL (post_f3_command auto-resolves general fund)
  IF v_fund_id IS NULL AND v_contrib_type.id IS NOT NULL THEN
    v_fund_id := v_contrib_type.default_fund_id;
  END IF;

  -- 11. Format exact amount according to currency scale
  v_scale := financial_core.currency_scale(v_payment.currency);
  IF v_scale IS NULL THEN
    RAISE EXCEPTION 'UNSUPPORTED_CURRENCY';
  END IF;

  IF v_scale = 0 THEN
    v_amount_str := ROUND(v_payment.amount, 0)::bigint::text;
  ELSE
    v_amount_str := to_char(ROUND(v_payment.amount, v_scale), 'FM999999999999999990.00');
  END IF;

  -- 12. Build reference metadata
  IF v_payment.reference_number IS NOT NULL AND pg_catalog.length(financial_core.f3_trim(v_payment.reference_number)) > 0 THEN
    v_metadata := pg_catalog.jsonb_build_object('reference', financial_core.f3_trim(v_payment.reference_number));
  ELSE
    v_metadata := '{}'::jsonb;
  END IF;

  -- 13. Construct canonical F3 command
  v_f3_command := pg_catalog.jsonb_build_object(
    'action', 'money_in',
    'group_id', v_group_id,
    'request_id', v_request_id,
    'occurred_at', to_char(v_payment.recorded_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'amount', v_amount_str,
    'currency', v_payment.currency,
    'account_id', v_account_id,
    'category_id', v_category_id,
    'member_id', v_payment.membership_id,
    'description', 'Dues payment: ' || COALESCE(v_contrib_type.name, 'Dues'),
    'reference_metadata', v_metadata
  );

  IF v_fund_id IS NOT NULL THEN
    v_f3_command := v_f3_command || pg_catalog.jsonb_build_object('fund_id', v_fund_id);
  END IF;

  -- 14. Execute atomic F3 posting
  v_f3_res := financial_core.post_f3_command(v_f3_command, NULL);
  v_event_id := (v_f3_res->>'event_id')::uuid;

  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'POSTING_FAILED';
  END IF;

  -- 15. Update payment row with confirmed status and canonical links
  UPDATE public.payments
  SET status = 'confirmed',
      financial_event_id = v_event_id,
      financial_account_id = v_account_id,
      updated_at = pg_catalog.now()
  WHERE id = v_payment.id;

  -- 16. Recalculate linked obligation amount_paid and status
  IF v_payment.obligation_id IS NOT NULL THEN
    PERFORM public.recalc_obligation_amount_paid(v_payment.obligation_id);
  END IF;

  -- 17. Return canonical result
  RETURN pg_catalog.jsonb_build_object(
    'decision', v_f3_res->>'decision',
    'payment_id', v_payment.id,
    'financial_event_id', v_event_id,
    'posting_count', COALESCE((v_f3_res->>'new_posting_count')::int, 2)
  );
END;
$$;

-- ============================================================================
-- 4. Owner Pin & ACL Grants
-- ============================================================================
DO $m4_owner_pin$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS ident
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND n.nspname IN ('public','financial_core','financial_private')
      AND p.proname NOT IN ('has_group_permission','enqueue_outbound_notification')
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) OWNER TO postgres',
      r.nspname, r.proname, r.ident
    );
  END LOOP;
END
$m4_owner_pin$;

SET ROLE postgres;
DO $m4_owner_acl$
BEGIN
  IF to_regprocedure('public.post_dues_payment_confirmation(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.post_dues_payment_confirmation(jsonb) FROM PUBLIC, anon, authenticated, service_role';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ubuntu') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.post_dues_payment_confirmation(jsonb) FROM ubuntu';
    END IF;
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_dues_payment_confirmation(jsonb) TO authenticated';
  END IF;
END
$m4_owner_acl$;
RESET ROLE;

COMMIT;
