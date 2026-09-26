-- R-004: claims for a contracted plan are filed against the plan owner's
-- economic group, while the claimant may belong to a participating branch.
-- The person/plan coverage and current active membership authorize creation;
-- prior claims retain their original membership and group after a transfer.
BEGIN;
CREATE OR REPLACE FUNCTION public.assert_relief_claim_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_plan public.relief_plans%ROWTYPE;
  v_member public.memberships%ROWTYPE;
  v_event public.financial_events%ROWTYPE;
  v_scope public.relief_plan_scope_versions%ROWTYPE;
  v_contract public.relief_coverage_contracts%ROWTYPE;
  v_unit uuid; v_topology bigint;
BEGIN
  SELECT * INTO v_plan FROM public.relief_plans WHERE id=NEW.plan_id;
  SELECT * INTO v_member FROM public.memberships WHERE id=NEW.membership_id;
  IF v_plan.id IS NULL OR v_member.id IS NULL
     OR NEW.group_id IS DISTINCT FROM v_plan.group_id
     OR NEW.claimant_membership_id IS DISTINCT FROM NEW.membership_id
     OR NEW.currency IS DISTINCT FROM v_plan.currency
     OR NEW.amount_requested IS DISTINCT FROM NEW.amount
  THEN RAISE EXCEPTION 'RELIEF_CLAIM_DIMENSION_CONFLICT'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO v_scope FROM public.relief_plan_scope_versions
      WHERE plan_id=v_plan.id AND effective_to IS NULL;
    IF v_member.group_id IS DISTINCT FROM v_plan.group_id THEN
      IF v_scope.id IS NULL OR v_member.membership_status<>'active'
      THEN RAISE EXCEPTION 'RELIEF_CLAIM_COVERAGE_REQUIRED' USING ERRCODE='42501'; END IF;
      SELECT c.* INTO v_contract FROM public.relief_coverage_contracts c
        JOIN public.organization_people p ON p.id=c.person_id
        WHERE c.plan_id=v_plan.id AND c.organization_id=v_scope.organization_id
          AND p.user_id=v_member.user_id
          AND c.current_membership_id=v_member.id AND c.status='active';
      SELECT u.id INTO v_unit FROM public.organization_units u
        WHERE u.group_id=v_member.group_id AND u.archived_at IS NULL;
      SELECT o.topology_version INTO v_topology FROM public.organizations o
        WHERE o.id=v_scope.organization_id;
      IF v_contract.id IS NULL OR v_topology IS DISTINCT FROM v_scope.topology_version
         OR v_unit IS NULL OR NOT EXISTS (
           SELECT 1 FROM financial_core.relief_plan_scope_membership sm
           WHERE sm.scope_id=v_scope.id AND sm.unit_id=v_unit
             AND sm.purpose='participation')
      THEN RAISE EXCEPTION 'RELIEF_CLAIM_COVERAGE_REQUIRED' USING ERRCODE='42501'; END IF;
    END IF;
  ELSE
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
       OR NEW.membership_id IS DISTINCT FROM OLD.membership_id
       OR NEW.claimant_membership_id IS DISTINCT FROM OLD.claimant_membership_id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.amount_requested IS DISTINCT FROM OLD.amount_requested
       OR NEW.amount IS DISTINCT FROM OLD.amount
    THEN RAISE EXCEPTION 'RELIEF_CLAIM_IDENTITY_IMMUTABLE'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='paid'
     AND (NEW.status IS DISTINCT FROM OLD.status
       OR NEW.amount_approved IS DISTINCT FROM OLD.amount_approved
       OR NEW.claimant_membership_id IS DISTINCT FROM OLD.claimant_membership_id
       OR NEW.payout_account_id IS DISTINCT FROM OLD.payout_account_id
       OR NEW.financial_event_id IS DISTINCT FROM OLD.financial_event_id
       OR NEW.disbursed_at IS DISTINCT FROM OLD.disbursed_at)
  THEN RAISE EXCEPTION 'PAID_CLAIM_IMMUTABLE'; END IF;
  IF NEW.status='paid' THEN
    SELECT * INTO v_event FROM public.financial_events WHERE id=NEW.financial_event_id;
    IF v_event.id IS NULL OR v_event.group_id<>NEW.group_id
       OR v_event.source_module<>'relief' OR v_event.source_record_id<>NEW.id::text
       OR v_event.effect_kind<>'claim_payout' OR v_event.currency<>NEW.currency
       OR NOT EXISTS (SELECT 1 FROM public.financial_postings fp
           WHERE fp.event_id=v_event.id AND fp.control_class='custody'
             AND fp.account_id=NEW.payout_account_id
             AND fp.amount_signed=-NEW.amount_approved)
    THEN RAISE EXCEPTION 'PAID_CLAIM_EVENT_CONFLICT'; END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.assert_relief_claim_contract()
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
