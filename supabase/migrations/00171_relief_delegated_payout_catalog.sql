-- R-006: expose only the owner restricted funds needed by an authorized
-- designated branch payer; make the payer's plan discoverable on that route.
BEGIN;
CREATE OR REPLACE FUNCTION public.list_relief_plans_for_group(p_group uuid)
RETURNS SETOF public.relief_plans LANGUAGE sql STABLE SECURITY DEFINER
SET search_path='' AS $function$
  SELECT plan.* FROM public.relief_plans plan
  WHERE auth.uid() IS NOT NULL AND p_group IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.memberships actor_membership
      WHERE actor_membership.group_id=p_group
        AND actor_membership.user_id=auth.uid()
        AND actor_membership.membership_status='active'
        AND actor_membership.standing<>'banned')
    AND (plan.group_id=p_group OR EXISTS (
      SELECT 1 FROM public.relief_plan_scope_versions scope
      JOIN public.organization_units unit ON unit.group_id=p_group
        AND unit.organization_id=scope.organization_id
        AND unit.archived_at IS NULL
      JOIN public.organizations organization ON organization.id=scope.organization_id
      WHERE scope.plan_id=plan.id AND scope.effective_to IS NULL
        AND scope.topology_version=organization.topology_version
        AND plan.shared_from_org AND plan.is_active AND plan.status='active'
        AND (EXISTS (SELECT 1 FROM financial_core.relief_plan_scope_membership sm
          WHERE sm.scope_id=scope.id AND sm.unit_id=unit.id
            AND sm.purpose='participation')
          OR (unit.id=scope.review_unit_id AND
            public.has_group_permission(p_group,'relief.manage',auth.uid()))
          OR (unit.id=scope.payout_unit_id AND
            public.has_group_permission(p_group,'finances.manage',auth.uid())))))
  ORDER BY plan.name,plan.id;
$function$;
REVOKE ALL ON FUNCTION public.list_relief_plans_for_group(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_relief_plans_for_group(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.list_relief_delegated_owner_funds(p_plan uuid)
RETURNS TABLE(id uuid,name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_scope public.relief_plan_scope_versions%ROWTYPE;
  v_payout_group uuid;
BEGIN
  IF auth.uid() IS NULL OR p_plan IS NULL
  THEN RAISE EXCEPTION 'RELIEF_PAYOUT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_scope FROM public.relief_plan_scope_versions
    WHERE plan_id=p_plan AND effective_to IS NULL;
  SELECT unit.group_id INTO v_payout_group
  FROM public.organization_units unit
  JOIN public.organizations organization
    ON organization.id=unit.organization_id
  WHERE unit.id=v_scope.payout_unit_id
    AND unit.organization_id=v_scope.organization_id
    AND unit.archived_at IS NULL
    AND organization.topology_version=v_scope.topology_version;
  IF v_scope.id IS NULL OR v_payout_group IS NULL
     OR v_payout_group=v_scope.financial_owner_group_id
     OR NOT public.has_group_permission(v_payout_group,
       'finances.manage',auth.uid())
  THEN RAISE EXCEPTION 'RELIEF_PAYOUT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT fund.id,fund.name
  FROM public.financial_funds fund
  WHERE fund.group_id=v_scope.financial_owner_group_id
    AND fund.status='active' AND fund.is_restricted
  ORDER BY fund.name,fund.id;
END
$$;
REVOKE ALL ON FUNCTION public.list_relief_delegated_owner_funds(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_relief_delegated_owner_funds(uuid)
  TO authenticated;
COMMIT;
