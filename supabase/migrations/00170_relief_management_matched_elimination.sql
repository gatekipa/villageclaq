-- R-010: eliminate only reciprocal balances still outstanding on both sides.
-- A pending remittance settles branch liability even before owner receipt;
-- an unrecognized branch collection cannot offset an unrelated receivable.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_relief_management_projection(
  p_organization uuid,p_reporting_unit uuid,p_currency text,p_as_of timestamptz)
RETURNS TABLE (
  plan_id uuid,branch_group_id uuid,owner_group_id uuid,currency text,
  topology_version bigint,as_of timestamptz,
  branch_due numeric,owner_receivable numeric,eliminated_internal numeric,
  branch_after_elimination numeric,owner_after_elimination numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR p_organization IS NULL OR p_reporting_unit IS NULL
     OR p_currency IS NULL OR p_as_of IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.organization_units u
       WHERE u.id=p_reporting_unit AND u.organization_id=p_organization
         AND u.archived_at IS NULL)
     OR NOT public.has_any_organization_scope(p_reporting_unit,'reports.view')
  THEN RAISE EXCEPTION 'RELIEF_REPORT_UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  WITH authorized AS (
    SELECT scope.plan_id,scope.financial_owner_group_id,
      scope.topology_version,owner_unit.id owner_unit_id
    FROM public.relief_plan_scope_versions scope
    JOIN public.organizations organization ON organization.id=scope.organization_id
    JOIN public.relief_plans plan ON plan.id=scope.plan_id
    JOIN public.organization_units owner_unit
      ON owner_unit.group_id=scope.financial_owner_group_id
        AND owner_unit.archived_at IS NULL
    WHERE scope.organization_id=p_organization AND scope.effective_to IS NULL
      AND scope.topology_version=organization.topology_version
      AND plan.currency=p_currency
      AND EXISTS (SELECT 1 FROM financial_core.relief_plan_scope_membership sm
        WHERE sm.scope_id=scope.id AND sm.unit_id=p_reporting_unit
          AND sm.purpose='reporting')
      AND EXISTS (SELECT 1 FROM financial_core.relief_plan_scope_membership sm
        JOIN public.organization_units actor_unit ON actor_unit.id=sm.unit_id
        JOIN public.memberships actor_member ON actor_member.group_id=actor_unit.group_id
        WHERE sm.scope_id=scope.id AND sm.purpose='reporting'
          AND actor_member.user_id=auth.uid()
          AND actor_member.membership_status='active')
      AND EXISTS (SELECT 1 FROM public.organization_unit_closure closure
        WHERE closure.organization_id=p_organization
          AND closure.ancestor_id=p_reporting_unit
          AND closure.descendant_id=owner_unit.id)
  ), linked AS (
    SELECT 'receipt'::text source_kind,a.plan_id,r.branch_group_id,
      a.financial_owner_group_id,a.topology_version,
      r.branch_event_id,r.owner_event_id
    FROM financial_core.relief_agency_receipts r
    JOIN authorized a ON a.plan_id=r.plan_id
      AND a.financial_owner_group_id=r.owner_group_id
    UNION ALL
    SELECT 'remittance',a.plan_id,r.branch_group_id,
      a.financial_owner_group_id,a.topology_version,
      r.branch_event_id,r.owner_event_id
    FROM public.relief_remittances r
    JOIN authorized a ON a.plan_id=r.relief_plan_id
      AND a.financial_owner_group_id=r.owner_group_id
    WHERE r.branch_event_id IS NOT NULL
    UNION ALL
    SELECT 'delegated_payout',a.plan_id,r.branch_group_id,
      a.financial_owner_group_id,a.topology_version,
      r.branch_event_id,r.owner_event_id
    FROM financial_core.relief_delegated_payouts r
    JOIN authorized a ON a.plan_id=r.plan_id
      AND a.financial_owner_group_id=r.owner_group_id
  ), in_perimeter AS (
    SELECT linked.* FROM linked
    JOIN public.organization_units branch_unit
      ON branch_unit.group_id=linked.branch_group_id
        AND branch_unit.organization_id=p_organization
        AND branch_unit.archived_at IS NULL
    JOIN public.organization_unit_closure closure
      ON closure.organization_id=p_organization
        AND closure.ancestor_id=p_reporting_unit
        AND closure.descendant_id=branch_unit.id
  ), side_amounts AS (
    SELECT linked.plan_id,linked.branch_group_id,
      linked.financial_owner_group_id,linked.topology_version,
      linked.source_kind,coalesce(branch_side.amount,0) branch_signed,
      coalesce(owner_side.amount,0) owner_signed
    FROM in_perimeter linked
    LEFT JOIN public.financial_events branch_event
      ON branch_event.id=linked.branch_event_id
        AND branch_event.group_id=linked.branch_group_id
        AND branch_event.status='posted'
        AND branch_event.occurred_at<=p_as_of
    LEFT JOIN public.financial_events owner_event
      ON owner_event.id=linked.owner_event_id
        AND owner_event.group_id=linked.financial_owner_group_id
        AND owner_event.status='posted'
        AND owner_event.occurred_at<=p_as_of
    LEFT JOIN LATERAL (
      SELECT sum(posting.amount_signed) amount
      FROM public.financial_postings posting
      WHERE posting.event_id=branch_event.id
        AND posting.control_class='liability') branch_side ON true
    LEFT JOIN LATERAL (
      SELECT sum(posting.amount_signed) amount
      FROM public.financial_postings posting
      WHERE posting.event_id=owner_event.id
        AND posting.control_class='receivable') owner_side ON true
  ), balances AS (
    SELECT side_amounts.plan_id,side_amounts.branch_group_id,
      side_amounts.financial_owner_group_id,side_amounts.topology_version,
      -sum(side_amounts.branch_signed) branch_due,
      sum(side_amounts.owner_signed) owner_receivable,
      sum(CASE WHEN source_kind='receipt'
        THEN greatest(least(-branch_signed,owner_signed),0)
        ELSE 0 END) paired_receipts,
      sum(CASE WHEN source_kind IN ('remittance','delegated_payout')
        THEN greatest(branch_signed,0) ELSE 0 END) branch_settlements,
      sum(CASE WHEN source_kind IN ('remittance','delegated_payout')
        THEN greatest(-owner_signed,0) ELSE 0 END) owner_settlements
    FROM side_amounts
    GROUP BY side_amounts.plan_id,side_amounts.branch_group_id,
      side_amounts.financial_owner_group_id,side_amounts.topology_version
  ), projection AS (
    SELECT balances.*,
      greatest(least(
        greatest(balances.paired_receipts-balances.branch_settlements,0),
        greatest(balances.paired_receipts-balances.owner_settlements,0),
        greatest(balances.branch_due,0),
        greatest(balances.owner_receivable,0)),0) eliminated
    FROM balances
  )
  SELECT projection.plan_id,projection.branch_group_id,
    projection.financial_owner_group_id,p_currency,projection.topology_version,
    p_as_of,projection.branch_due,projection.owner_receivable,
    projection.eliminated,
    projection.branch_due-projection.eliminated,
    projection.owner_receivable-projection.eliminated
  FROM projection;
END
$$;
REVOKE ALL ON FUNCTION public.get_relief_management_projection(
  uuid,uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_relief_management_projection(
  uuid,uuid,text,timestamptz) TO authenticated;
COMMIT;
