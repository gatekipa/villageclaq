-- R-004/R-005/R-006: the participant, designated reviewer, and owner
-- payer can discover only plans relevant to their current route group.
BEGIN;
CREATE OR REPLACE FUNCTION public.list_relief_plans_for_group(p_group uuid)
RETURNS SETOF public.relief_plans LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='' AS $function$
  SELECT p.* FROM public.relief_plans p
  WHERE auth.uid() IS NOT NULL AND p_group IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.memberships actor_membership
      WHERE actor_membership.group_id=p_group
        AND actor_membership.user_id=auth.uid()
        AND actor_membership.membership_status='active'
        AND actor_membership.standing<>'banned')
    AND (p.group_id=p_group OR EXISTS (
      SELECT 1 FROM public.relief_plan_scope_versions scope
      JOIN public.organization_units unit ON unit.group_id=p_group
        AND unit.organization_id=scope.organization_id
        AND unit.archived_at IS NULL
      JOIN public.organizations organization ON organization.id=scope.organization_id
      WHERE scope.plan_id=p.id AND scope.effective_to IS NULL
        AND scope.topology_version=organization.topology_version
        AND p.shared_from_org AND p.is_active AND p.status='active'
        AND (EXISTS (SELECT 1 FROM financial_core.relief_plan_scope_membership sm
          WHERE sm.scope_id=scope.id AND sm.unit_id=unit.id
            AND sm.purpose='participation')
          OR (unit.id=scope.review_unit_id AND
            public.has_group_permission(p_group,'relief.manage',auth.uid())))))
  ORDER BY p.name,p.id;
$function$;
REVOKE ALL ON FUNCTION public.list_relief_plans_for_group(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_relief_plans_for_group(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.can_pay_relief_plan(p_plan uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.relief_plan_scope_versions scope
    JOIN public.organizations organization ON organization.id=scope.organization_id
    JOIN public.organization_units payout_unit ON payout_unit.id=scope.payout_unit_id
      AND payout_unit.archived_at IS NULL
    WHERE scope.plan_id=p_plan AND scope.effective_to IS NULL
      AND scope.topology_version=organization.topology_version
      AND payout_unit.group_id=scope.financial_owner_group_id
      AND public.has_group_permission(scope.financial_owner_group_id,
        'finances.manage',auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.relief_plans p
      WHERE p.id=p_plan
        AND NOT EXISTS (SELECT 1 FROM public.relief_plan_scope_versions scope
          WHERE scope.plan_id=p.id AND scope.effective_to IS NULL)
        AND public.has_group_permission(p.group_id,'finances.manage',auth.uid()));
$function$;
REVOKE ALL ON FUNCTION public.can_pay_relief_plan(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_pay_relief_plan(uuid) TO authenticated;
CREATE POLICY relief_claim_owner_payer_detail ON public.relief_claims
  FOR SELECT TO authenticated USING (public.can_pay_relief_plan(plan_id));
COMMIT;
