-- R-004/R-010: count only the active membership projection for a
-- contracted plan, inside its frozen reporting audience and current grant.
-- Legacy plans retain the S0/M2 path until R-012 classifies them.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_relief_branch_summary()
RETURNS TABLE (
  relief_plan_id uuid, plan_name text, collecting_group_id uuid,
  branch_name text, branch_currency text, enrolled_count bigint,
  full_member_count bigint, relief_only_count bigint, external_count bigint,
  paid_this_month bigint, collected_this_month numeric, total_remitted numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  WITH enrollment AS (
    SELECT re.plan_id,re.collecting_group_id,
      count(*)::bigint enrolled_count,
      count(*) FILTER (WHERE re.enrollment_type='full_member')::bigint full_member_count,
      count(*) FILTER (WHERE re.enrollment_type='relief_only')::bigint relief_only_count,
      count(*) FILTER (WHERE re.enrollment_type='external')::bigint external_count
    FROM public.relief_enrollments re
    WHERE NOT public.relief_plan_is_contracted(re.plan_id) OR re.is_active
    GROUP BY re.plan_id,re.collecting_group_id
  ), receipts AS (
    SELECT p.relief_plan_id plan_id,p.group_id collecting_group_id,
      count(DISTINCT p.membership_id) FILTER (
        WHERE p.created_at>=date_trunc('month',CURRENT_DATE))::bigint paid_this_month,
      coalesce(sum(p.amount) FILTER (
        WHERE p.created_at>=date_trunc('month',CURRENT_DATE)),0) collected_this_month
    FROM public.payments p
    WHERE p.relief_plan_id IS NOT NULL AND p.status='confirmed'
      AND p.financial_event_id IS NOT NULL
    GROUP BY p.relief_plan_id,p.group_id
  ), remits AS (
    SELECT r.relief_plan_id plan_id,r.branch_group_id collecting_group_id,
      coalesce(sum(r.amount),0) total_remitted
    FROM public.relief_remittances r
    WHERE r.status='confirmed' AND r.owner_event_id IS NOT NULL
    GROUP BY r.relief_plan_id,r.branch_group_id
  ), pairs AS (
    SELECT plan_id,collecting_group_id FROM enrollment
    UNION SELECT plan_id,collecting_group_id FROM receipts
    UNION SELECT plan_id,collecting_group_id FROM remits
  )
  SELECT rp.id,rp.name,pairs.collecting_group_id,g.name,g.currency,
    coalesce(e.enrolled_count,0),coalesce(e.full_member_count,0),
    coalesce(e.relief_only_count,0),coalesce(e.external_count,0),
    coalesce(c.paid_this_month,0),coalesce(c.collected_this_month,0),
    coalesce(r.total_remitted,0)
  FROM pairs
  JOIN public.relief_plans rp ON rp.id=pairs.plan_id AND rp.shared_from_org
  JOIN public.groups owner_group ON owner_group.id=rp.group_id
  JOIN public.groups g ON g.id=pairs.collecting_group_id
    AND g.organization_id IS NOT NULL
    AND g.organization_id=owner_group.organization_id
  LEFT JOIN public.organization_units branch_unit ON branch_unit.group_id=g.id
    AND branch_unit.archived_at IS NULL
  LEFT JOIN public.relief_plan_scope_versions scope
    ON scope.plan_id=rp.id AND scope.effective_to IS NULL
  LEFT JOIN enrollment e ON e.plan_id=pairs.plan_id
    AND e.collecting_group_id=pairs.collecting_group_id
  LEFT JOIN receipts c ON c.plan_id=pairs.plan_id
    AND c.collecting_group_id=pairs.collecting_group_id
  LEFT JOIN remits r ON r.plan_id=pairs.plan_id
    AND r.collecting_group_id=pairs.collecting_group_id
  WHERE auth.uid() IS NOT NULL
    AND g.organization_id IN (
      SELECT caller_group.organization_id
      FROM public.groups caller_group
      WHERE caller_group.id IN (SELECT public.get_user_group_ids())
        AND caller_group.organization_id IS NOT NULL)
    AND (scope.id IS NULL OR (
      scope.topology_version=(SELECT o.topology_version
        FROM public.organizations o WHERE o.id=scope.organization_id)
      AND branch_unit.id IS NOT NULL
      AND EXISTS (SELECT 1 FROM financial_core.relief_plan_scope_membership sm
        JOIN public.organization_units member_unit ON member_unit.id=sm.unit_id
        JOIN public.memberships m ON m.group_id=member_unit.group_id
        WHERE sm.scope_id=scope.id AND sm.purpose='reporting'
          AND m.user_id=auth.uid() AND m.membership_status='active')
      AND public.has_any_organization_scope(branch_unit.id,'reports.view')));
$function$;
REVOKE ALL ON FUNCTION public.get_relief_branch_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_relief_branch_summary()
  TO authenticated,service_role;
COMMIT;

