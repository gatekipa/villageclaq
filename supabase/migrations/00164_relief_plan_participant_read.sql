-- R-004/R-005: a current participant may read the contracted plan it is
-- enrolled in; a designated reviewer may read the plan it reviews.
BEGIN;
CREATE OR REPLACE FUNCTION public.can_view_contracted_relief_plan(p_plan uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT EXISTS (
      SELECT 1 FROM public.relief_plan_scope_versions scope
      JOIN public.organizations organization ON organization.id=scope.organization_id
      JOIN public.organization_units unit ON unit.organization_id=scope.organization_id
        AND unit.archived_at IS NULL
      JOIN public.memberships actor_membership ON actor_membership.group_id=unit.group_id
        AND actor_membership.user_id=auth.uid()
        AND actor_membership.membership_status='active'
        AND actor_membership.standing<>'banned'
      WHERE scope.plan_id=p_plan AND scope.effective_to IS NULL
        AND scope.topology_version=organization.topology_version
        AND (EXISTS (
          SELECT 1 FROM financial_core.relief_plan_scope_membership sm
          WHERE sm.scope_id=scope.id AND sm.unit_id=unit.id
            AND sm.purpose='participation')
          OR (unit.id=scope.review_unit_id AND
            public.has_group_permission(unit.group_id,'relief.manage',auth.uid()))));
$function$;
REVOKE ALL ON FUNCTION public.can_view_contracted_relief_plan(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_view_contracted_relief_plan(uuid)
  TO authenticated;
CREATE POLICY relief_plan_contracted_participant_read ON public.relief_plans
  FOR SELECT TO authenticated USING (
    public.can_view_contracted_relief_plan(id));
COMMIT;
