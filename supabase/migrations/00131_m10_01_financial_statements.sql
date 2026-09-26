-- =========================================================================================
-- Stage M10 Slice 1: Financial Ledger Statements & SQL Engine
-- Universal Adversarial Audit Standard Applied
-- =========================================================================================

-- 1. Preflight Checks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'has_group_permission') THEN
    RAISE EXCEPTION 'M10_ABORT: Missing public.has_group_permission (Apply 00125)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'financial_core' AND p.proname = 'post_f3_command') THEN
    RAISE EXCEPTION 'M10_ABORT: Missing financial_core.post_f3_command (Apply 00119)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ticket_purchases') THEN
    RAISE EXCEPTION 'M10_ABORT: Missing public.ticket_purchases (Apply 00130)';
  END IF;
END $$;

-- 2. Canonical F3 Financial Views
CREATE OR REPLACE VIEW public.v_f3_trial_balance AS
SELECT
  p.group_id,
  COALESCE(p.account_id, p.category_id, p.fund_id) AS account_id,
  CASE
    WHEN p.control_class = 'custody' THEN (SELECT name FROM public.financial_accounts WHERE id = p.account_id)
    WHEN p.control_class IN ('income', 'expense') THEN (SELECT name FROM public.financial_categories WHERE id = p.category_id)
    WHEN p.control_class = 'receivable' THEN 'Accounts Receivable'
    WHEN p.control_class = 'liability' THEN 'Liabilities'
    WHEN p.control_class = 'opening_position' THEN 'Opening Balance Equity'
    ELSE 'Unknown Account'
  END AS account_name,
  NULL AS account_code,
  CASE
    WHEN p.control_class IN ('custody', 'receivable') THEN 'asset'
    WHEN p.control_class = 'liability' THEN 'liability'
    WHEN p.control_class = 'opening_position' THEN 'equity'
    WHEN p.control_class = 'income' THEN 'revenue'
    WHEN p.control_class = 'expense' THEN 'expense'
    ELSE 'unknown'
  END AS account_class,
  p.currency,
  SUM(CASE WHEN p.amount_signed > 0 THEN p.amount_signed ELSE 0 END) AS total_debit,
  SUM(CASE WHEN p.amount_signed < 0 THEN abs(p.amount_signed) ELSE 0 END) AS total_credit,
  SUM(
    CASE 
      WHEN p.control_class IN ('custody', 'receivable', 'expense') THEN p.amount_signed
      ELSE -p.amount_signed
    END
  ) AS net_balance
FROM public.financial_postings p
JOIN public.financial_events e ON e.id = p.event_id
WHERE e.status = 'posted'
GROUP BY 
  p.group_id,
  COALESCE(p.account_id, p.category_id, p.fund_id),
  p.control_class,
  p.account_id,
  p.category_id,
  p.currency;

CREATE OR REPLACE VIEW public.v_f3_account_ledger AS
SELECT
  p.id AS posting_id,
  p.event_id,
  p.group_id,
  COALESCE(p.account_id, p.category_id, p.fund_id) AS account_id,
  CASE
    WHEN p.control_class = 'custody' THEN (SELECT name FROM public.financial_accounts WHERE id = p.account_id)
    WHEN p.control_class IN ('income', 'expense') THEN (SELECT name FROM public.financial_categories WHERE id = p.category_id)
    WHEN p.control_class = 'receivable' THEN 'Accounts Receivable'
    WHEN p.control_class = 'liability' THEN 'Liabilities'
    WHEN p.control_class = 'opening_position' THEN 'Opening Balance Equity'
    ELSE 'Unknown Account'
  END AS account_name,
  CASE
    WHEN p.control_class IN ('custody', 'receivable') THEN 'asset'
    WHEN p.control_class = 'liability' THEN 'liability'
    WHEN p.control_class = 'opening_position' THEN 'equity'
    WHEN p.control_class = 'income' THEN 'revenue'
    WHEN p.control_class = 'expense' THEN 'expense'
    ELSE 'unknown'
  END AS account_class,
  p.currency,
  p.amount_signed,
  CASE WHEN p.amount_signed > 0 THEN p.amount_signed ELSE 0 END AS debit,
  CASE WHEN p.amount_signed < 0 THEN abs(p.amount_signed) ELSE 0 END AS credit,
  SUM(
    CASE 
      WHEN p.control_class IN ('custody', 'receivable', 'expense') THEN p.amount_signed
      ELSE -p.amount_signed
    END
  ) OVER (
    PARTITION BY p.group_id, p.currency, COALESCE(p.account_id, p.category_id, p.fund_id), p.control_class
    ORDER BY e.occurred_at ASC, p.id ASC
  ) AS running_balance,
  e.occurred_at,
  e.description,
  e.source_module,
  e.source_record_id,
  e.status AS event_status
FROM public.financial_postings p
JOIN public.financial_events e ON e.id = p.event_id;

-- 3. Canonical Statement RPCs
CREATE OR REPLACE FUNCTION public.get_financial_statement(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_uid uuid;
  v_type text;
  v_currency text;
  v_as_of_date timestamptz;
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_result jsonb;
  v_assets jsonb;
  v_liabs jsonb;
  v_equity jsonb;
  v_revs jsonb;
  v_exps jsonb;
  v_total_assets numeric;
  v_total_liabs_eq numeric;
  v_total_rev numeric;
  v_total_exp numeric;
  v_net_income numeric;
BEGIN
  v_uid := auth.uid();
  v_group_id := (p_command->>'group_id')::uuid;
  v_type := p_command->>'statement_type';
  v_currency := p_command->>'currency';
  v_as_of_date := COALESCE((p_command->>'as_of_date')::timestamptz, now());
  v_start_date := (p_command->>'start_date')::timestamptz;
  v_end_date := COALESCE((p_command->>'end_date')::timestamptz, now());

  -- Authorization
  IF NOT public.has_group_permission(v_group_id, 'finances.view', v_uid) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'INSUFFICIENT_PRIVILEGE';
  END IF;

  -- Currency Guard
  IF v_currency IS NULL OR financial_core.currency_scale(v_currency) IS NULL THEN
    RAISE EXCEPTION 'INVALID_CURRENCY' USING ERRCODE = '22023';
  END IF;

  IF v_type = 'trial_balance' THEN
    SELECT jsonb_build_object(
      'accounts', COALESCE(jsonb_agg(row_to_json(tb)), '[]'::jsonb),
      'total_debit', COALESCE(SUM(tb.total_debit), 0),
      'total_credit', COALESCE(SUM(tb.total_credit), 0),
      'is_balanced', COALESCE(SUM(tb.total_debit) = SUM(tb.total_credit), true),
      'generated_at', now(),
      'currency', v_currency
    ) INTO v_result
    FROM public.v_f3_trial_balance tb
    WHERE tb.group_id = v_group_id AND tb.currency = v_currency;

  ELSIF v_type = 'balance_sheet' THEN
    -- Calculate Assets
    SELECT COALESCE(jsonb_agg(row_to_json(a)), '[]'::jsonb), COALESCE(SUM(a.net_balance), 0)
    INTO v_assets, v_total_assets
    FROM (
      SELECT account_name, SUM(net_balance) AS net_balance 
      FROM public.v_f3_account_ledger 
      WHERE group_id = v_group_id AND currency = v_currency AND account_class = 'asset' AND occurred_at <= v_as_of_date AND event_status = 'posted'
      GROUP BY account_name
    ) a;

    -- Calculate Liabilities
    SELECT COALESCE(jsonb_agg(row_to_json(l)), '[]'::jsonb), COALESCE(SUM(l.net_balance), 0)
    INTO v_liabs, v_total_liabs_eq
    FROM (
      SELECT account_name, SUM(net_balance) AS net_balance 
      FROM public.v_f3_account_ledger 
      WHERE group_id = v_group_id AND currency = v_currency AND account_class = 'liability' AND occurred_at <= v_as_of_date AND event_status = 'posted'
      GROUP BY account_name
    ) l;

    -- Calculate Equity and Net Income
    SELECT COALESCE(SUM(net_balance), 0) INTO v_net_income
    FROM (
      SELECT SUM(net_balance) AS net_balance FROM public.v_f3_account_ledger WHERE group_id = v_group_id AND currency = v_currency AND account_class = 'revenue' AND occurred_at <= v_as_of_date AND event_status = 'posted'
      UNION ALL
      SELECT -SUM(net_balance) AS net_balance FROM public.v_f3_account_ledger WHERE group_id = v_group_id AND currency = v_currency AND account_class = 'expense' AND occurred_at <= v_as_of_date AND event_status = 'posted'
    ) ni;

    SELECT COALESCE(jsonb_agg(row_to_json(e)), '[]'::jsonb), COALESCE(SUM(e.net_balance), 0)
    INTO v_equity, v_total_exp 
    FROM (
      SELECT account_name, SUM(net_balance) AS net_balance 
      FROM public.v_f3_account_ledger 
      WHERE group_id = v_group_id AND currency = v_currency AND account_class = 'equity' AND occurred_at <= v_as_of_date AND event_status = 'posted'
      GROUP BY account_name
    ) e;

    -- Inject Net Income into Equity
    IF v_net_income <> 0 THEN
      v_equity := v_equity || jsonb_build_object('account_name', 'Retained Earnings (Net Income)', 'net_balance', v_net_income);
      v_total_exp := v_total_exp + v_net_income;
    END IF;

    v_total_liabs_eq := v_total_liabs_eq + v_total_exp;

    v_result := jsonb_build_object(
      'assets', v_assets,
      'liabilities', v_liabs,
      'equity', v_equity,
      'total_assets', v_total_assets,
      'total_liabilities_equity', v_total_liabs_eq,
      'is_balanced', (v_total_assets = v_total_liabs_eq),
      'generated_at', now(),
      'as_of_date', v_as_of_date,
      'currency', v_currency
    );

  ELSIF v_type = 'income_statement' THEN
    SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb), COALESCE(SUM(r.net_balance), 0)
    INTO v_revs, v_total_rev
    FROM (
      SELECT account_name, SUM(net_balance) AS net_balance 
      FROM public.v_f3_account_ledger 
      WHERE group_id = v_group_id AND currency = v_currency AND account_class = 'revenue' 
      AND (v_start_date IS NULL OR occurred_at >= v_start_date) AND occurred_at <= v_end_date AND event_status = 'posted'
      GROUP BY account_name
    ) r;

    SELECT COALESCE(jsonb_agg(row_to_json(ex)), '[]'::jsonb), COALESCE(SUM(ex.net_balance), 0)
    INTO v_exps, v_total_exp
    FROM (
      SELECT account_name, SUM(net_balance) AS net_balance 
      FROM public.v_f3_account_ledger 
      WHERE group_id = v_group_id AND currency = v_currency AND account_class = 'expense' 
      AND (v_start_date IS NULL OR occurred_at >= v_start_date) AND occurred_at <= v_end_date AND event_status = 'posted'
      GROUP BY account_name
    ) ex;

    v_result := jsonb_build_object(
      'revenues', v_revs,
      'expenses', v_exps,
      'total_revenue', v_total_rev,
      'total_expenses', v_total_exp,
      'net_income', v_total_rev - v_total_exp,
      'generated_at', now(),
      'start_date', v_start_date,
      'end_date', v_end_date,
      'currency', v_currency
    );
  ELSE
    RAISE EXCEPTION 'INVALID_STATEMENT_TYPE' USING ERRCODE = '22023';
  END IF;

  RETURN v_result;
END;
$$;

-- 4. Member Contribution Statement RPC
CREATE OR REPLACE FUNCTION public.get_member_contribution_statement(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
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

  -- Privacy Invariant: Rejects if caller is not the owner of the membership and lacks finances.view.
  SELECT (user_id = v_uid AND membership_status = 'active') INTO v_is_owner
  FROM public.memberships WHERE id = v_member_id AND group_id = v_group_id;
  v_has_view := public.has_group_permission(v_group_id, 'finances.view', v_uid);
  
  IF v_is_owner IS NOT TRUE AND v_has_view IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'INSUFFICIENT_PRIVILEGE';
  END IF;

  IF v_currency IS NULL OR financial_core.currency_scale(v_currency) IS NULL THEN
    RAISE EXCEPTION 'INVALID_CURRENCY' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb), COALESCE(SUM(t.amount), 0)
  INTO v_transactions, v_total
  FROM (
    SELECT 
      e.id AS event_id,
      e.source_module,
      e.description,
      e.occurred_at,
      p.amount_signed AS amount
    FROM public.financial_events e
    JOIN public.financial_postings p ON p.event_id = e.id
    WHERE e.group_id = v_group_id
      AND e.currency = v_currency
      AND e.status = 'posted'
      AND p.member_id = v_member_id
      AND e.event_class = 'money_in'
      AND p.amount_signed > 0
      AND (v_start_date IS NULL OR e.occurred_at >= v_start_date)
      AND e.occurred_at <= v_end_date
    ORDER BY e.occurred_at ASC
  ) t;

  v_result := jsonb_build_object(
    'membership_id', v_member_id,
    'currency', v_currency,
    'transactions', v_transactions,
    'total_contributed', v_total,
    'generated_at', now(),
    'start_date', v_start_date,
    'end_date', v_end_date
  );

  RETURN v_result;
END;
$$;

-- Views are owned by the migration role and can bypass underlying RLS. The
-- scoped RPCs above are the only supported client observation boundary.
REVOKE ALL ON public.v_f3_trial_balance, public.v_f3_account_ledger
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_financial_statement(jsonb),
  public.get_member_contribution_statement(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_financial_statement(jsonb),
  public.get_member_contribution_statement(jsonb) TO authenticated;
