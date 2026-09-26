-- R-011: paid Relief claims are posted through F3, not relief_payouts.
-- Use the claim-linked owner expense event; a delegated branch custody event
-- is a separate leg and must not be counted as another disbursement.
CREATE OR REPLACE FUNCTION public.platform_relief_aggregate(p_since timestamptz)
RETURNS TABLE (
  plan_id uuid,
  plan_name text,
  group_name text,
  currency text,
  contribution_amount numeric,
  is_active boolean,
  active_enrollments bigint,
  claims_all bigint,
  claims_since bigint,
  claim_amount_since numeric,
  payouts_all numeric,
  payouts_since numeric,
  payouts_by_month jsonb
) LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $function$
  WITH enrollment_totals AS (
    SELECT e.plan_id, count(*) FILTER (WHERE e.is_active) AS active_enrollments
    FROM public.relief_enrollments e GROUP BY e.plan_id
  ), claim_totals AS (
    SELECT c.plan_id, count(*) AS claims_all,
      count(*) FILTER (WHERE c.created_at >= p_since) AS claims_since,
      coalesce(sum(c.amount) FILTER (WHERE c.created_at >= p_since), 0)
        AS claim_amount_since
    FROM public.relief_claims c GROUP BY c.plan_id
  ), posted_payouts AS (
    SELECT c.plan_id, ev.posted_at,
      sum(fp.amount_signed) AS amount
    FROM public.relief_claims c
    JOIN public.relief_plans plan ON plan.id = c.plan_id
    JOIN public.financial_events ev ON ev.id = c.financial_event_id
      AND ev.group_id = plan.group_id
      AND ev.currency = c.currency
      AND ev.source_module = 'relief'
      AND ev.source_record_id = c.id::text
      AND ev.effect_kind IN ('claim_payout', 'agency_claim_payout_owner')
      AND ev.status = 'posted'
    JOIN public.financial_postings fp ON fp.event_id = ev.id
      AND fp.group_id = ev.group_id
      AND fp.currency = ev.currency
      AND fp.control_class = 'expense'
      AND fp.category_class = 'expense'
    WHERE c.status = 'paid'
    GROUP BY c.id, c.plan_id, ev.id, ev.posted_at
  ), payout_months AS (
    SELECT po.plan_id, date_trunc('month', po.posted_at) AS month,
      sum(po.amount) AS amount
    FROM posted_payouts po
    WHERE po.posted_at >= p_since
    GROUP BY po.plan_id, date_trunc('month', po.posted_at)
  ), payout_totals AS (
    SELECT po.plan_id, coalesce(sum(po.amount), 0) AS payouts_all,
      coalesce(sum(po.amount) FILTER (WHERE po.posted_at >= p_since), 0)
        AS payouts_since
    FROM posted_payouts po GROUP BY po.plan_id
  ), payout_month_json AS (
    SELECT m.plan_id,
      jsonb_agg(jsonb_build_object('month', to_char(m.month, 'YYYY-MM'),
        'amount', m.amount) ORDER BY m.month) AS payouts_by_month
    FROM payout_months m GROUP BY m.plan_id
  )
  SELECT p.id, p.name, g.name, g.currency, p.contribution_amount,
    p.is_active, coalesce(e.active_enrollments, 0),
    coalesce(c.claims_all, 0), coalesce(c.claims_since, 0),
    coalesce(c.claim_amount_since, 0), coalesce(pt.payouts_all, 0),
    coalesce(pt.payouts_since, 0), coalesce(pm.payouts_by_month, '[]'::jsonb)
  FROM public.relief_plans p
  JOIN public.groups g ON g.id = p.group_id
  LEFT JOIN enrollment_totals e ON e.plan_id = p.id
  LEFT JOIN claim_totals c ON c.plan_id = p.id
  LEFT JOIN payout_totals pt ON pt.plan_id = p.id
  LEFT JOIN payout_month_json pm ON pm.plan_id = p.id
  ORDER BY g.name, p.name, p.id;
$function$;
