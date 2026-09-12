-- M3 forward rematerialization of F3-03 onto post-S0 / post-M2 main (after 00117).
-- DO NOT APPLY TO PRODUCTION from the M3 draft PR.
-- DO NOT MERGE as a production financial write path.
-- Oracle (REFERENCE ONLY, not applied): 20260909022633_f3_projection_read_proof.sql on c7b4cd535d7125737eab2ec0fad27cae9432e8c3
-- Planning: PR #83 tip a178068384290b37ec6c17b02428b399d52ddd10
-- CALL public.has_group_permission(gid, perm_key, uid) only. NEVER CREATE OR REPLACE it.
-- NEVER add a 2-arg overload. NEVER touch Cut 3 storage / Cut 2 queue / M2 policy tables.
-- No F3-06 UI, no F3-07 Record Transaction, no FCG-1 close, no F3-08/09, no M4.
-- No notifications_queue / enqueue / producer wiring.
-- No opening-cash product UX (command only; UI remains hidden).

DO $f3_pre$
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
    RAISE EXCEPTION 'F3_ABORT: has_group_permission overload count=% (expected 1; do not add 2-arg)', v_hgp_count;
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
      'F3_ABORT: has_group_permission pin mismatch ident=% result=% owner=% definer=% cfg=% def_md5=% src_md5=%',
      v_hgp_ident, v_hgp_result, v_hgp_owner, v_hgp_definer, v_hgp_cfg,
      v_hgp_def_md5, v_hgp_src_md5;
  END IF;

  IF to_regprocedure('public.post_financial_command(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'F3_ABORT: post_financial_command missing — apply 00120 first';
  END IF;
  IF to_regprocedure('public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)') IS NOT NULL THEN
    RAISE EXCEPTION 'F3_ABORT: projection RPCs already present';
  END IF;
END
$f3_pre$;

-- F3-03 Stage B: secure database-owned financial projections and read boundary.
-- Projections read the immutable committed event/posting population. This
-- migration creates no duplicate financial truth and performs no data backfill.
BEGIN;

CREATE FUNCTION financial_core.format_projection_amount(
  p_amount numeric,
  p_currency text
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
DECLARE
  v_scale smallint := financial_core.currency_scale(p_currency);
  v_text text;
  v_whole text;
  v_fraction text;
BEGIN
  IF p_amount IS NULL OR v_scale IS NULL THEN
    RAISE EXCEPTION 'PROJECTION_AMOUNT_INVALID' USING ERRCODE = '22023';
  END IF;
  v_text := pg_catalog.round(p_amount, v_scale)::text;
  v_whole := pg_catalog.split_part(v_text, '.', 1);
  IF v_scale = 0 THEN
    RETURN v_whole;
  END IF;
  v_fraction := pg_catalog.split_part(v_text, '.', 2);
  RETURN v_whole || '.' || pg_catalog.rpad(
    pg_catalog.substr(v_fraction, 1, v_scale), v_scale, '0');
END;
$$;

-- One row per custody posting. The running balance is computed over all prior
-- account/currency history before the caller applies a display period or page.
CREATE FUNCTION financial_core.projection_cashbook_rows(
  p_group_id uuid,
  p_include_audit boolean
) RETURNS TABLE (
  posting_id uuid,
  event_id uuid,
  group_id uuid,
  ledger_epoch_id uuid,
  occurred_at timestamptz,
  posted_at timestamptz,
  account_id uuid,
  account_name text,
  account_kind public.financial_account_kind,
  account_status public.financial_account_status,
  fund_id uuid,
  fund_name text,
  fund_is_restricted boolean,
  fund_status public.financial_config_status,
  currency text,
  amount_signed numeric,
  running_balance numeric,
  event_class public.financial_event_class,
  effect_kind text,
  movement_type text,
  direction text,
  counterpart_control_classes jsonb,
  category_contexts jsonb,
  member_id uuid,
  member_name text,
  member_visibility text,
  project_id uuid,
  project_name text,
  project_visibility text,
  source_module text,
  source_record_id text,
  status public.financial_event_status,
  audit_visibility text,
  request_id uuid,
  created_by uuid,
  description text,
  reference text,
  reversal_of_event_id uuid,
  replacement_event_id uuid,
  corrected_at timestamptz,
  correction_reason text
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH custody AS (
    SELECT
      p.id AS posting_id,
      p.event_id,
      p.group_id,
      p.ledger_epoch_id,
      p.occurred_at,
      e.posted_at,
      p.account_id,
      a.name AS account_name,
      a.kind AS account_kind,
      a.status AS account_status,
      p.fund_id,
      f.name AS fund_name,
      f.is_restricted AS fund_is_restricted,
      f.status AS fund_status,
      p.currency,
      p.amount_signed,
      e.event_class,
      e.effect_kind,
      e.source_module,
      e.source_record_id,
      e.status,
      e.request_id,
      e.created_by,
      e.description,
      e.reference_metadata ->> 'reference' AS reference,
      e.reversal_of_event_id,
      e.replacement_event_id,
      e.corrected_at,
      e.correction_reason,
      p.member_id,
      CASE
        WHEN m.id IS NULL THEN NULL
        WHEN m.is_proxy THEN m.display_name
        ELSE coalesce(m.display_name, pr.display_name, pr.full_name)
      END AS member_name,
      p.project_id,
      pj.name AS project_name,
      coalesce(cp.non_custody_classes, '[]'::jsonb) AS counterpart_control_classes,
      coalesce(cp.non_custody_count, 0) AS non_custody_count,
      coalesce(cp.other_custody_count, 0) AS other_custody_count,
      coalesce(cp.other_account_count, 0) AS other_account_count,
      coalesce(cx.category_contexts, '[]'::jsonb) AS category_contexts
    FROM public.financial_postings p
    JOIN public.financial_events e
      ON e.id = p.event_id AND e.group_id = p.group_id
    JOIN public.financial_accounts a
      ON a.id = p.account_id AND a.group_id = p.group_id AND a.currency = p.currency
    JOIN public.financial_funds f
      ON f.id = p.fund_id AND f.group_id = p.group_id
    LEFT JOIN public.memberships m
      ON m.id = p.member_id AND m.group_id = p.group_id
    LEFT JOIN public.profiles pr ON pr.id = m.user_id
    LEFT JOIN public.projects pj
      ON pj.id = p.project_id AND pj.group_id = p.group_id
    LEFT JOIN LATERAL (
      SELECT
        pg_catalog.to_jsonb(coalesce(
          pg_catalog.array_agg(DISTINCT q.control_class::text ORDER BY q.control_class::text)
            FILTER (WHERE q.control_class <> 'custody'),
          ARRAY[]::text[]
        )) AS non_custody_classes,
        pg_catalog.count(DISTINCT q.control_class)
          FILTER (WHERE q.control_class <> 'custody') AS non_custody_count,
        pg_catalog.count(*) FILTER (
          WHERE q.control_class = 'custody' AND q.id <> p.id
        ) AS other_custody_count,
        pg_catalog.count(DISTINCT q.account_id) FILTER (
          WHERE q.control_class = 'custody'
            AND q.id <> p.id
            AND q.account_id IS DISTINCT FROM p.account_id
        ) AS other_account_count
      FROM public.financial_postings q
      WHERE q.event_id = p.event_id AND q.group_id = p.group_id
    ) cp ON true
    LEFT JOIN LATERAL (
      SELECT coalesce(
        pg_catalog.jsonb_agg(context_row.value ORDER BY context_row.sort_key),
        '[]'::jsonb
      ) AS category_contexts
      FROM (
        SELECT DISTINCT
          pg_catalog.jsonb_build_object(
            'category_id', q.category_id,
            'category_name', c.name,
            'category_class', q.category_class,
            'category_status', c.status,
            'fund_id', q.fund_id,
            'fund_name', qf.name,
            'fund_is_restricted', qf.is_restricted,
            'fund_status', qf.status,
            'member_id', q.member_id,
            'member_name', CASE
              WHEN qm.id IS NULL THEN NULL
              WHEN qm.is_proxy THEN qm.display_name
              ELSE coalesce(qm.display_name, qpr.display_name, qpr.full_name)
            END,
            'project_id', q.project_id,
            'project_name', qpj.name
          ) AS value,
          q.category_id::text || '|' || q.fund_id::text || '|' ||
            coalesce(q.member_id::text, '') || '|' ||
            coalesce(q.project_id::text, '') AS sort_key
        FROM public.financial_postings q
        JOIN public.financial_categories c
          ON c.id = q.category_id
         AND c.group_id = q.group_id
         AND c.category_class = q.category_class
        JOIN public.financial_funds qf
          ON qf.id = q.fund_id AND qf.group_id = q.group_id
        LEFT JOIN public.memberships qm
          ON qm.id = q.member_id AND qm.group_id = q.group_id
        LEFT JOIN public.profiles qpr ON qpr.id = qm.user_id
        LEFT JOIN public.projects qpj
          ON qpj.id = q.project_id AND qpj.group_id = q.group_id
        WHERE q.event_id = p.event_id
          AND q.group_id = p.group_id
          AND q.control_class IN ('income', 'expense')
      ) context_row
    ) cx ON true
    WHERE p.group_id = p_group_id
      AND p.control_class = 'custody'
  ), classified AS (
    SELECT c.*,
      CASE
        WHEN c.non_custody_count > 1 THEN 'mixed_non_custody'
        WHEN c.non_custody_count = 1
          AND c.counterpart_control_classes = '["income"]'::jsonb
          THEN 'operating_income'
        WHEN c.non_custody_count = 1
          AND c.counterpart_control_classes = '["expense"]'::jsonb
          THEN 'operating_expense'
        WHEN c.non_custody_count = 1
          AND c.counterpart_control_classes = '["opening_position"]'::jsonb
          THEN 'opening_position'
        WHEN c.non_custody_count = 1
          AND c.counterpart_control_classes = '["receivable"]'::jsonb
          THEN 'receivable_movement'
        WHEN c.non_custody_count = 1
          AND c.counterpart_control_classes = '["liability"]'::jsonb
          THEN 'liability_movement'
        WHEN c.non_custody_count = 0
          AND c.other_custody_count > 0
          AND c.other_account_count > 0
          THEN 'internal_account_transfer'
        ELSE 'unclassified_custody'
      END AS movement_type,
      CASE WHEN c.amount_signed > 0 THEN 'cash_in' ELSE 'cash_out' END AS direction
    FROM custody c
  )
  SELECT
    c.posting_id,
    c.event_id,
    c.group_id,
    c.ledger_epoch_id,
    c.occurred_at,
    c.posted_at,
    c.account_id,
    c.account_name,
    c.account_kind,
    c.account_status,
    c.fund_id,
    c.fund_name,
    c.fund_is_restricted,
    c.fund_status,
    c.currency,
    c.amount_signed,
    pg_catalog.sum(c.amount_signed) OVER (
      PARTITION BY c.group_id, c.account_id, c.currency
      ORDER BY c.occurred_at, c.event_id, c.posting_id
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_balance,
    c.event_class,
    c.effect_kind,
    c.movement_type,
    c.direction,
    c.counterpart_control_classes,
    c.category_contexts,
    c.member_id,
    c.member_name,
    CASE WHEN c.member_id IS NULL THEN 'not_present' ELSE 'visible' END,
    c.project_id,
    c.project_name,
    CASE WHEN c.project_id IS NULL THEN 'not_present' ELSE 'visible' END,
    c.source_module,
    c.source_record_id,
    c.status,
    CASE WHEN p_include_audit THEN 'visible' ELSE 'redacted' END,
    CASE WHEN p_include_audit THEN c.request_id END,
    CASE WHEN p_include_audit THEN c.created_by END,
    CASE WHEN p_include_audit THEN c.description END,
    CASE WHEN p_include_audit THEN c.reference END,
    CASE WHEN p_include_audit THEN c.reversal_of_event_id END,
    CASE WHEN p_include_audit THEN c.replacement_event_id END,
    CASE WHEN p_include_audit THEN c.corrected_at END,
    CASE WHEN p_include_audit THEN c.correction_reason END
  FROM classified c;
$$;

CREATE FUNCTION public.get_financial_projection_bundle(
  p_group_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_as_of_exclusive timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_include_audit boolean;
  v_result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT financial_core.can_view_finances(p_group_id) THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to THEN
    RAISE EXCEPTION 'INVALID_PROJECTION_PERIOD' USING ERRCODE = '22023';
  END IF;
  v_include_audit := financial_core.can_manage_finances(p_group_id);

  WITH observation AS (
    SELECT pg_catalog.gen_random_uuid() AS read_identity,
      pg_catalog.clock_timestamp() AS observed_at
  ), balance_population AS (
    SELECT p.*
    FROM public.financial_postings p
    JOIN public.financial_events e
      ON e.id = p.event_id AND e.group_id = p.group_id
    WHERE p.group_id = p_group_id
      AND (p_as_of_exclusive IS NULL OR p.occurred_at < p_as_of_exclusive)
  ), account_balance AS (
    SELECT p.group_id, p.account_id, p.currency,
      pg_catalog.sum(p.amount_signed) AS amount
    FROM balance_population p
    WHERE p.control_class = 'custody'
    GROUP BY p.group_id, p.account_id, p.currency
  ), fund_cash AS (
    SELECT p.group_id, p.fund_id, p.currency,
      pg_catalog.sum(p.amount_signed) AS amount
    FROM balance_population p
    WHERE p.control_class = 'custody'
    GROUP BY p.group_id, p.fund_id, p.currency
  ), fund_position AS (
    SELECT p.group_id, p.fund_id, p.currency,
      pg_catalog.sum(p.amount_signed) AS amount
    FROM balance_population p
    WHERE p.control_class IN ('custody', 'receivable', 'liability')
    GROUP BY p.group_id, p.fund_id, p.currency
  ), activity_population AS (
    SELECT p.*
    FROM public.financial_postings p
    JOIN public.financial_events e
      ON e.id = p.event_id AND e.group_id = p.group_id
    WHERE p.group_id = p_group_id
      AND p.occurred_at >= p_from
      AND p.occurred_at < p_to
  ), income_activity AS (
    SELECT p.group_id, p.currency, p.category_id, p.category_class,
      p.fund_id, p.member_id, p.project_id,
      -pg_catalog.sum(p.amount_signed) AS amount
    FROM activity_population p
    WHERE p.control_class = 'income'
    GROUP BY p.group_id, p.currency, p.category_id, p.category_class,
      p.fund_id, p.member_id, p.project_id
  ), expense_activity AS (
    SELECT p.group_id, p.currency, p.category_id, p.category_class,
      p.fund_id, p.member_id, p.project_id,
      pg_catalog.sum(p.amount_signed) AS amount
    FROM activity_population p
    WHERE p.control_class = 'expense'
    GROUP BY p.group_id, p.currency, p.category_id, p.category_class,
      p.fund_id, p.member_id, p.project_id
  ), currency_population AS (
    SELECT DISTINCT p.currency
    FROM public.financial_postings p
    JOIN public.financial_events e
      ON e.id = p.event_id AND e.group_id = p.group_id
    WHERE p.group_id = p_group_id
  ), income_by_currency AS (
    SELECT i.currency, pg_catalog.sum(i.amount) AS amount
    FROM income_activity i GROUP BY i.currency
  ), expense_by_currency AS (
    SELECT x.currency, pg_catalog.sum(x.amount) AS amount
    FROM expense_activity x GROUP BY x.currency
  ), book AS (
    SELECT b.*
    FROM financial_core.projection_cashbook_rows(p_group_id, v_include_audit) b
    WHERE b.occurred_at >= p_from AND b.occurred_at < p_to
  )
  SELECT pg_catalog.jsonb_build_object(
    'contract_version', 'f3-projection-v1',
    'group_id', p_group_id,
    'effective_from', pg_catalog.to_char(p_from AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'effective_to', pg_catalog.to_char(p_to AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'as_of_exclusive', CASE WHEN p_as_of_exclusive IS NULL THEN NULL ELSE
      pg_catalog.to_char(p_as_of_exclusive AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
    'observed_at', pg_catalog.to_char(o.observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'read_identity', o.read_identity,
    'read_identity_reusable', false,
    'snapshot_consistency', 'single_statement',
    'continuation_semantics', 'restart_with_new_read_identity',
    'currency_buckets', (SELECT coalesce(
      pg_catalog.jsonb_agg(c.currency ORDER BY c.currency), '[]'::jsonb)
      FROM currency_population c),
    'account_balances', (SELECT coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'group_id', a.group_id, 'account_id', a.account_id,
        'account_name', fa.name, 'account_kind', fa.kind,
        'account_status', fa.status, 'currency', a.currency,
        'amount', financial_core.format_projection_amount(a.amount, a.currency)
      ) ORDER BY a.currency, a.account_id), '[]'::jsonb)
      FROM account_balance a
      JOIN public.financial_accounts fa
        ON fa.id = a.account_id AND fa.group_id = a.group_id AND fa.currency = a.currency),
    'fund_cash', (SELECT coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'group_id', f.group_id, 'fund_id', f.fund_id,
        'fund_name', ff.name, 'fund_is_restricted', ff.is_restricted,
        'fund_status', ff.status, 'currency', f.currency,
        'amount', financial_core.format_projection_amount(f.amount, f.currency)
      ) ORDER BY f.currency, f.fund_id), '[]'::jsonb)
      FROM fund_cash f JOIN public.financial_funds ff
        ON ff.id = f.fund_id AND ff.group_id = f.group_id),
    'fund_net_positions', (SELECT coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'group_id', f.group_id, 'fund_id', f.fund_id,
        'fund_name', ff.name, 'fund_is_restricted', ff.is_restricted,
        'fund_status', ff.status, 'currency', f.currency,
        'amount', financial_core.format_projection_amount(f.amount, f.currency)
      ) ORDER BY f.currency, f.fund_id), '[]'::jsonb)
      FROM fund_position f JOIN public.financial_funds ff
        ON ff.id = f.fund_id AND ff.group_id = f.group_id),
    'organization_custody', (SELECT coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'group_id', p_group_id, 'currency', totals.currency,
        'amount', financial_core.format_projection_amount(totals.amount, totals.currency)
      ) ORDER BY totals.currency), '[]'::jsonb)
      FROM (SELECT p.currency, pg_catalog.sum(p.amount_signed) AS amount
        FROM balance_population p WHERE p.control_class = 'custody'
        GROUP BY p.currency) totals),
    'income_activity', (SELECT coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'group_id', i.group_id, 'currency', i.currency,
        'category_id', i.category_id, 'category_name', c.name,
        'category_class', i.category_class, 'category_status', c.status,
        'fund_id', i.fund_id, 'fund_name', f.name,
        'fund_is_restricted', f.is_restricted, 'fund_status', f.status,
        'member_id', i.member_id,
        'member_name', CASE WHEN m.id IS NULL THEN NULL WHEN m.is_proxy THEN m.display_name
          ELSE coalesce(m.display_name, pr.display_name, pr.full_name) END,
        'member_visibility', CASE WHEN i.member_id IS NULL THEN 'not_present' ELSE 'visible' END,
        'project_id', i.project_id, 'project_name', pj.name,
        'project_visibility', CASE WHEN i.project_id IS NULL THEN 'not_present' ELSE 'visible' END,
        'amount', financial_core.format_projection_amount(i.amount, i.currency)
      ) ORDER BY i.currency, i.category_id, i.fund_id, i.member_id, i.project_id), '[]'::jsonb)
      FROM income_activity i
      JOIN public.financial_categories c ON c.id=i.category_id AND c.group_id=i.group_id AND c.category_class=i.category_class
      JOIN public.financial_funds f ON f.id=i.fund_id AND f.group_id=i.group_id
      LEFT JOIN public.memberships m ON m.id=i.member_id AND m.group_id=i.group_id
      LEFT JOIN public.profiles pr ON pr.id=m.user_id
      LEFT JOIN public.projects pj ON pj.id=i.project_id AND pj.group_id=i.group_id),
    'expense_activity', (SELECT coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'group_id', x.group_id, 'currency', x.currency,
        'category_id', x.category_id, 'category_name', c.name,
        'category_class', x.category_class, 'category_status', c.status,
        'fund_id', x.fund_id, 'fund_name', f.name,
        'fund_is_restricted', f.is_restricted, 'fund_status', f.status,
        'member_id', x.member_id,
        'member_name', CASE WHEN m.id IS NULL THEN NULL WHEN m.is_proxy THEN m.display_name
          ELSE coalesce(m.display_name, pr.display_name, pr.full_name) END,
        'member_visibility', CASE WHEN x.member_id IS NULL THEN 'not_present' ELSE 'visible' END,
        'project_id', x.project_id, 'project_name', pj.name,
        'project_visibility', CASE WHEN x.project_id IS NULL THEN 'not_present' ELSE 'visible' END,
        'amount', financial_core.format_projection_amount(x.amount, x.currency)
      ) ORDER BY x.currency, x.category_id, x.fund_id, x.member_id, x.project_id), '[]'::jsonb)
      FROM expense_activity x
      JOIN public.financial_categories c ON c.id=x.category_id AND c.group_id=x.group_id AND c.category_class=x.category_class
      JOIN public.financial_funds f ON f.id=x.fund_id AND f.group_id=x.group_id
      LEFT JOIN public.memberships m ON m.id=x.member_id AND m.group_id=x.group_id
      LEFT JOIN public.profiles pr ON pr.id=m.user_id
      LEFT JOIN public.projects pj ON pj.id=x.project_id AND pj.group_id=x.group_id),
    'soa_lite', (SELECT coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'group_id', p_group_id, 'currency', c.currency,
        'income', financial_core.format_projection_amount(coalesce(i.amount,0), c.currency),
        'expense', financial_core.format_projection_amount(coalesce(x.amount,0), c.currency),
        'operating_result', financial_core.format_projection_amount(
          coalesce(i.amount,0)-coalesce(x.amount,0), c.currency)
      ) ORDER BY c.currency), '[]'::jsonb)
      FROM currency_population c
      LEFT JOIN income_by_currency i ON i.currency=c.currency
      LEFT JOIN expense_by_currency x ON x.currency=c.currency),
    'cash_movement', (SELECT coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'posting_id', b.posting_id, 'event_id', b.event_id, 'group_id', b.group_id,
        'occurred_at', pg_catalog.to_char(b.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'account_id', b.account_id, 'account_name', b.account_name,
        'fund_id', b.fund_id, 'fund_name', b.fund_name,
        'currency', b.currency,
        'amount_signed', financial_core.format_projection_amount(b.amount_signed,b.currency),
        'movement_type', b.movement_type, 'direction', b.direction,
        'counterpart_control_classes', b.counterpart_control_classes,
        'category_contexts', b.category_contexts,
        'member_id', b.member_id, 'project_id', b.project_id,
        'event_class', b.event_class, 'effect_kind', b.effect_kind,
        'source_module', b.source_module, 'source_record_id', b.source_record_id,
        'status', b.status
      ) ORDER BY b.occurred_at,b.event_id,b.posting_id), '[]'::jsonb) FROM book b),
    'cashbook', (SELECT coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'posting_id', b.posting_id, 'event_id', b.event_id, 'group_id', b.group_id,
        'ledger_epoch_id', b.ledger_epoch_id,
        'occurred_at', pg_catalog.to_char(b.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'posted_at', pg_catalog.to_char(b.posted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'account_id', b.account_id, 'account_name', b.account_name,
        'account_kind', b.account_kind, 'account_status', b.account_status,
        'fund_id', b.fund_id, 'fund_name', b.fund_name,
        'fund_is_restricted', b.fund_is_restricted, 'fund_status', b.fund_status,
        'currency', b.currency,
        'amount_signed', financial_core.format_projection_amount(b.amount_signed,b.currency),
        'running_balance', financial_core.format_projection_amount(b.running_balance,b.currency),
        'event_class', b.event_class, 'effect_kind', b.effect_kind,
        'movement_type', b.movement_type, 'direction', b.direction,
        'counterpart_control_classes', b.counterpart_control_classes,
        'category_contexts', b.category_contexts,
        'member_id', b.member_id, 'member_name', b.member_name,
        'member_visibility', b.member_visibility,
        'project_id', b.project_id, 'project_name', b.project_name,
        'project_visibility', b.project_visibility,
        'source_module', b.source_module, 'source_record_id', b.source_record_id,
        'status', b.status, 'audit_visibility', b.audit_visibility,
        'request_id', b.request_id, 'created_by', b.created_by,
        'description', b.description, 'reference', b.reference,
        'reversal_of_event_id', b.reversal_of_event_id,
        'replacement_event_id', b.replacement_event_id,
        'corrected_at', CASE WHEN b.corrected_at IS NULL THEN NULL ELSE
          pg_catalog.to_char(b.corrected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
        'correction_reason', b.correction_reason
      ) ORDER BY b.occurred_at,b.event_id,b.posting_id), '[]'::jsonb) FROM book b)
  ) INTO v_result
  FROM observation o;

  RETURN v_result;
END;
$$;

CREATE FUNCTION public.get_financial_cashbook(
  p_group_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_account_id uuid,
  p_currency text,
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_include_audit boolean;
  v_result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL
     OR NOT financial_core.can_view_finances(p_group_id) THEN
    RAISE EXCEPTION 'DENY' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from >= p_to
     OR p_account_id IS NULL OR p_currency IS NULL
     OR p_currency <> pg_catalog.upper(p_currency)
     OR financial_core.currency_scale(p_currency) IS NULL
     OR p_offset < 0 OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'INVALID_CASHBOOK_QUERY' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.financial_accounts a
    WHERE a.id=p_account_id AND a.group_id=p_group_id AND a.currency=p_currency
  ) THEN
    RAISE EXCEPTION 'INVALID_CASHBOOK_QUERY' USING ERRCODE = '22023';
  END IF;
  v_include_audit := financial_core.can_manage_finances(p_group_id);

  WITH observation AS (
    SELECT pg_catalog.gen_random_uuid() AS read_identity,
      pg_catalog.clock_timestamp() AS observed_at
  ), period_rows AS (
    SELECT b.*, pg_catalog.count(*) OVER () AS total_period_rows
    FROM financial_core.projection_cashbook_rows(p_group_id, v_include_audit) b
    WHERE b.account_id=p_account_id AND b.currency=p_currency
      AND b.occurred_at>=p_from AND b.occurred_at<p_to
  ), page AS (
    SELECT p.* FROM period_rows p
    ORDER BY p.occurred_at,p.event_id,p.posting_id
    OFFSET p_offset LIMIT p_limit
  ), page_meta AS (
    SELECT pg_catalog.max(p.total_period_rows) AS total_period_rows,
      (pg_catalog.array_agg(p.running_balance-p.amount_signed
        ORDER BY p.occurred_at,p.event_id,p.posting_id))[1] AS opening_balance
    FROM page p
  )
  SELECT pg_catalog.jsonb_build_object(
    'contract_version','f3-projection-v1',
    'group_id',p_group_id,'account_id',p_account_id,'currency',p_currency,
    'effective_from',pg_catalog.to_char(p_from AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'effective_to',pg_catalog.to_char(p_to AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'as_of_exclusive',NULL,
    'observed_at',pg_catalog.to_char(o.observed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'read_identity',o.read_identity,'read_identity_reusable',false,
    'snapshot_consistency','single_statement',
    'continuation_semantics','restart_with_new_read_identity',
    'offset',p_offset,'limit',p_limit,
    'total_period_rows',coalesce(m.total_period_rows,0),
    'opening_balance',CASE WHEN m.opening_balance IS NULL THEN NULL
      ELSE financial_core.format_projection_amount(m.opening_balance,p_currency) END,
    'rows',(SELECT coalesce(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'posting_id',p.posting_id,'event_id',p.event_id,'group_id',p.group_id,
        'ledger_epoch_id',p.ledger_epoch_id,
        'occurred_at',pg_catalog.to_char(p.occurred_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'posted_at',pg_catalog.to_char(p.posted_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
        'account_id',p.account_id,'account_name',p.account_name,
        'account_kind',p.account_kind,'account_status',p.account_status,
        'fund_id',p.fund_id,'fund_name',p.fund_name,
        'fund_is_restricted',p.fund_is_restricted,'fund_status',p.fund_status,
        'currency',p.currency,
        'amount_signed',financial_core.format_projection_amount(p.amount_signed,p.currency),
        'running_balance',financial_core.format_projection_amount(p.running_balance,p.currency),
        'event_class',p.event_class,'effect_kind',p.effect_kind,
        'movement_type',p.movement_type,'direction',p.direction,
        'counterpart_control_classes',p.counterpart_control_classes,
        'category_contexts',p.category_contexts,
        'member_id',p.member_id,'member_name',p.member_name,
        'member_visibility',p.member_visibility,
        'project_id',p.project_id,'project_name',p.project_name,
        'project_visibility',p.project_visibility,
        'source_module',p.source_module,'source_record_id',p.source_record_id,
        'status',p.status,'audit_visibility',p.audit_visibility,
        'request_id',p.request_id,'created_by',p.created_by,
        'description',p.description,'reference',p.reference,
        'reversal_of_event_id',p.reversal_of_event_id,
        'replacement_event_id',p.replacement_event_id,
        'corrected_at',CASE WHEN p.corrected_at IS NULL THEN NULL ELSE
          pg_catalog.to_char(p.corrected_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') END,
        'correction_reason',p.correction_reason
      ) ORDER BY p.occurred_at,p.event_id,p.posting_id),'[]'::jsonb) FROM page p)
  ) INTO v_result
  FROM observation o CROSS JOIN page_meta m;
  RETURN v_result;
END;
$$;

-- Stage B makes the RPCs the intended read boundary. Service-role inspection
-- remains available; authenticated callers receive no naked truth-table SELECT.
REVOKE SELECT ON public.financial_events, public.financial_postings FROM authenticated;

REVOKE ALL ON FUNCTION financial_core.format_projection_amount(numeric,text),
  financial_core.projection_cashbook_rows(uuid,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz),
  public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION
  public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz),
  public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer)
  TO authenticated;

COMMIT;


DO $f3_hgp_post$
DECLARE
  v_hgp_def_md5 text;
  v_hgp_src_md5 text;
  v_hgp_count int;
BEGIN
  SELECT count(*) INTO v_hgp_count
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_count IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'F3_ABORT: has_group_permission overload count changed to %', v_hgp_count;
  END IF;
  SELECT md5(pg_get_functiondef(p.oid)), md5(p.prosrc)
    INTO v_hgp_def_md5, v_hgp_src_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'has_group_permission';
  IF v_hgp_def_md5 IS DISTINCT FROM '695368464e97297fbf0f90ce7345162f'
     OR v_hgp_src_md5 IS DISTINCT FROM '96a296dfd541c7fc75ec68c4da1d92ff' THEN
    RAISE EXCEPTION 'F3_ABORT: has_group_permission fingerprint changed by F3 migration';
  END IF;
END
$f3_hgp_post$;

-- Pin F3 SECURITY DEFINER owner to postgres (M2/Cut 1 disposable parity).
-- Never touches has_group_permission or enqueue_outbound_notification.
DO $f3_owner_pin$
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
$f3_owner_pin$;

SET ROLE postgres;
DO $f3_owner_acl$
BEGIN
  IF to_regprocedure('public.post_financial_command(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.post_financial_command(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_financial_command(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.correct_financial_event(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.correct_financial_event(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.correct_financial_event(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.post_financial_opening_cash(jsonb)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.post_financial_opening_cash(jsonb) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.post_financial_opening_cash(jsonb) TO authenticated';
  END IF;
  IF to_regprocedure('public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz), public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer) FROM PUBLIC, anon, authenticated, service_role, ubuntu';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.get_financial_projection_bundle(uuid,timestamptz,timestamptz,timestamptz), public.get_financial_cashbook(uuid,timestamptz,timestamptz,uuid,text,integer,integer) TO authenticated';
  END IF;
END
$f3_owner_acl$;
RESET ROLE;
