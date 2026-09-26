-- R-011: fixed-window aggregate for current platform admin staff. The
-- unrestricted inner aggregate stays executable by service_role only.
CREATE FUNCTION public.platform_relief_aggregate_for_staff(p_range text)
RETURNS TABLE (
  plan_id uuid, plan_name text, group_name text, currency text,
  contribution_amount numeric, is_active boolean,
  active_enrollments bigint, claims_all bigint, claims_since bigint,
  claim_amount_since numeric, payouts_all numeric, payouts_since numeric,
  payouts_by_month jsonb
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $function$
DECLARE v_since timestamptz;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.platform_staff staff
    WHERE staff.user_id = auth.uid() AND staff.is_active
      AND staff.role IN ('admin', 'super_admin')
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  v_since := CASE p_range
    WHEN '1m' THEN date_trunc('month', now()) - interval '1 month'
    WHEN '3m' THEN date_trunc('month', now()) - interval '3 months'
    WHEN '6m' THEN date_trunc('month', now()) - interval '6 months'
    WHEN '1y' THEN date_trunc('month', now()) - interval '1 year'
    WHEN 'all' THEN '1970-01-01T00:00:00Z'::timestamptz
    ELSE NULL
  END;
  IF v_since IS NULL THEN
    RAISE EXCEPTION 'INVALID_RANGE' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY SELECT * FROM public.platform_relief_aggregate(v_since);
END;
$function$;

REVOKE ALL ON FUNCTION public.platform_relief_aggregate_for_staff(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_relief_aggregate_for_staff(text)
  TO authenticated;
