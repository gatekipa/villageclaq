-- R-011: platform-wide reporting uses aggregate Relief facts, never claim rows.
-- The service-role-only invoker function is called by authenticated server
-- routes after their platform-staff role check. It exposes no claimant ID,
-- claim ID, event type, narrative, or claim timestamp.
CREATE FUNCTION public.platform_relief_aggregate(p_since timestamptz)
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
  ), payout_months AS (
    SELECT c.plan_id, date_trunc('month', po.created_at) AS month,
      sum(po.amount) AS amount
    FROM public.relief_payouts po
    JOIN public.relief_claims c ON c.id = po.claim_id
    WHERE po.created_at >= p_since
    GROUP BY c.plan_id, date_trunc('month', po.created_at)
  ), payout_totals AS (
    SELECT c.plan_id, coalesce(sum(po.amount), 0) AS payouts_all,
      coalesce(sum(po.amount) FILTER (WHERE po.created_at >= p_since), 0)
        AS payouts_since
    FROM public.relief_payouts po
    JOIN public.relief_claims c ON c.id = po.claim_id
    GROUP BY c.plan_id
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

REVOKE ALL ON FUNCTION public.platform_relief_aggregate(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_relief_aggregate(timestamptz)
  TO service_role;
