-- R-002/R-003/R-009: bind new Relief receipts to the authoritative plan
-- scope version. Pre-cutover legacy receipts remain distinguishable by NULL;
-- a pending legacy row cannot silently confirm after the plan activates.
BEGIN;
ALTER TABLE public.payments
  ADD COLUMN relief_scope_version integer;

CREATE OR REPLACE FUNCTION public.guard_relief_payment_plan_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_plan public.relief_plans%ROWTYPE;
  v_branch public.groups%ROWTYPE; v_owner public.groups%ROWTYPE;
  v_scope public.relief_plan_scope_versions%ROWTYPE;
  v_branch_unit uuid; v_topology bigint;
BEGIN
  IF NEW.relief_plan_id IS NULL THEN
    IF NEW.relief_scope_version IS NOT NULL
    THEN RAISE EXCEPTION 'RELIEF_SCOPE_WITHOUT_PLAN'; END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO v_plan FROM public.relief_plans WHERE id=NEW.relief_plan_id;
  SELECT * INTO v_branch FROM public.groups WHERE id=NEW.group_id;
  SELECT * INTO v_owner FROM public.groups WHERE id=v_plan.group_id;
  IF v_plan.id IS NULL OR v_branch.id IS NULL OR v_owner.id IS NULL
  THEN RAISE EXCEPTION 'RELIEF_PLAN_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  IF TG_OP='UPDATE' AND
     (NEW.relief_scope_version IS DISTINCT FROM OLD.relief_scope_version
      OR NEW.relief_plan_id IS DISTINCT FROM OLD.relief_plan_id
      OR NEW.group_id IS DISTINCT FROM OLD.group_id)
  THEN RAISE EXCEPTION 'RELIEF_RECEIPT_SCOPE_IMMUTABLE'; END IF;
  SELECT * INTO v_scope FROM public.relief_plan_scope_versions s
    WHERE s.plan_id=v_plan.id AND s.effective_to IS NULL;
  IF TG_OP='INSERT' THEN
    NEW.relief_scope_version:=v_scope.version;
  ELSIF OLD.relief_scope_version IS NOT NULL THEN
    SELECT * INTO v_scope FROM public.relief_plan_scope_versions s
      WHERE s.plan_id=v_plan.id AND s.version=OLD.relief_scope_version;
  ELSIF v_scope.id IS NOT NULL AND NEW.status='confirmed' THEN
    RAISE EXCEPTION 'RELIEF_LEGACY_PAYMENT_CUTOVER_REQUIRED';
  END IF;
  IF v_scope.id IS NOT NULL THEN
    IF TG_OP='INSERT' THEN
      SELECT topology_version INTO v_topology FROM public.organizations
        WHERE id=v_scope.organization_id;
      IF v_topology IS DISTINCT FROM v_scope.topology_version
      THEN RAISE EXCEPTION 'RELIEF_SCOPE_TOPOLOGY_STALE'; END IF;
    END IF;
    SELECT id INTO v_branch_unit FROM public.organization_units
      WHERE group_id=v_branch.id AND archived_at IS NULL;
    IF v_scope.financial_owner_group_id<>v_owner.id
       OR v_scope.organization_id IS DISTINCT FROM v_owner.organization_id
       OR v_branch.organization_id IS DISTINCT FROM v_owner.organization_id
       OR v_branch_unit IS NULL
       OR NOT EXISTS (SELECT 1 FROM financial_core.relief_plan_scope_membership m
         WHERE m.scope_id=v_scope.id AND m.unit_id=v_branch_unit
           AND m.purpose='participation')
       OR NOT EXISTS (SELECT 1 FROM financial_core.relief_plan_scope_membership m
         WHERE m.scope_id=v_scope.id AND m.unit_id=v_branch_unit
           AND m.purpose='collection')
    THEN RAISE EXCEPTION 'RELIEF_PLAN_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  ELSIF v_plan.group_id<>NEW.group_id AND (
    NOT v_plan.shared_from_org OR v_branch.organization_id IS NULL
    OR v_branch.organization_id IS DISTINCT FROM v_owner.organization_id
    OR NOT EXISTS (SELECT 1 FROM public.organization_units owner_unit
      JOIN public.organization_units branch_unit
        ON branch_unit.group_id=NEW.group_id
          AND branch_unit.archived_at IS NULL
      JOIN public.organization_unit_closure c
        ON c.ancestor_id=owner_unit.id AND c.descendant_id=branch_unit.id
      WHERE owner_unit.group_id=v_owner.id
        AND owner_unit.archived_at IS NULL))
  THEN RAISE EXCEPTION 'RELIEF_PLAN_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END
$$;
-- 00143 created the original dimension trigger. Recreate it to include
-- scope_version in the immutable payment dimensions, and check status changes
-- before a receipt can become a ledger event.
DROP TRIGGER IF EXISTS guard_relief_payment_plan_scope ON public.payments;
CREATE TRIGGER guard_relief_payment_plan_scope
  BEFORE INSERT OR UPDATE OF relief_plan_id,group_id,relief_scope_version,status
  ON public.payments FOR EACH ROW
  EXECUTE FUNCTION public.guard_relief_payment_plan_scope();
COMMIT;
