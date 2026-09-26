-- R-004: an approved membership transfer moves operational responsibility
-- prospectively while retaining the person/plan coverage start and maturity.
-- A destination outside the effective participation scope suspends coverage;
-- it does not invent a new waiting period or rewrite prior responsibility.
BEGIN;
ALTER TABLE public.relief_coverage_contracts
  ADD COLUMN suspended_membership_id uuid REFERENCES public.memberships(id)
    ON DELETE RESTRICT;
ALTER TABLE public.relief_coverage_contracts
  ADD CONSTRAINT relief_coverage_current_or_suspended CHECK (
    (status='active' AND current_membership_id IS NOT NULL
      AND suspended_membership_id IS NULL)
    OR (status='suspended_out_of_scope' AND current_membership_id IS NULL
      AND suspended_membership_id IS NOT NULL));
ALTER TABLE public.relief_coverage_responsibilities
  ADD COLUMN coverage_status text NOT NULL DEFAULT 'active'
    CHECK (coverage_status IN ('active','suspended_out_of_scope'));
ALTER TABLE public.relief_coverage_responsibilities
  ADD COLUMN transfer_id uuid REFERENCES public.member_transfers(id)
    ON DELETE RESTRICT;
CREATE UNIQUE INDEX relief_coverage_transfer_once
  ON public.relief_coverage_responsibilities(contract_id,transfer_id)
  WHERE transfer_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.rebind_relief_coverage_on_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_group public.groups%ROWTYPE; v_person uuid; v_unit uuid;
  v_contract public.relief_coverage_contracts%ROWTYPE;
  v_scope public.relief_plan_scope_versions%ROWTYPE;
  v_transfer uuid; v_transfer_count integer;
  v_topology bigint; v_now timestamptz:=transaction_timestamp();
  v_allowed boolean;
BEGIN
  IF NEW.membership_status<>'active' THEN RETURN NEW; END IF;
  SELECT * INTO v_group FROM public.groups WHERE id=NEW.group_id;
  IF v_group.organization_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_person FROM public.organization_people
    WHERE organization_id=v_group.organization_id AND user_id=NEW.user_id;
  IF v_person IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_unit FROM public.organization_units
    WHERE group_id=NEW.group_id AND archived_at IS NULL;
  FOR v_contract IN SELECT * FROM public.relief_coverage_contracts
      WHERE person_id=v_person AND organization_id=v_group.organization_id
        AND (status='suspended_out_of_scope' OR EXISTS (
          SELECT 1 FROM public.memberships old_member
          WHERE old_member.id=current_membership_id
            AND old_member.membership_status='exited'))
      FOR UPDATE
  LOOP
    SELECT count(*),(array_agg(t.id))[1] INTO v_transfer_count,v_transfer
    FROM public.member_transfers t
    JOIN public.memberships source_member
      ON source_member.user_id=NEW.user_id
        AND source_member.group_id=t.source_group_id
        AND source_member.membership_status='exited'
    WHERE t.member_id=NEW.user_id AND t.dest_group_id=NEW.group_id
      AND t.status='approved' AND t.completed_at IS NULL
      AND source_member.id=coalesce(v_contract.current_membership_id,
        v_contract.suspended_membership_id);
    IF v_transfer_count=0 THEN CONTINUE; END IF;
    IF v_transfer_count<>1 THEN RAISE EXCEPTION 'RELIEF_TRANSFER_AMBIGUOUS'; END IF;
    SELECT * INTO v_scope FROM public.relief_plan_scope_versions
      WHERE plan_id=v_contract.plan_id AND effective_to IS NULL FOR SHARE;
    SELECT topology_version INTO v_topology FROM public.organizations
      WHERE id=v_contract.organization_id FOR SHARE;
    v_allowed:=v_scope.id IS NOT NULL
      AND v_topology IS NOT DISTINCT FROM v_scope.topology_version
      AND v_group.currency IS NOT DISTINCT FROM (
        SELECT coalesce(p.currency,owner_group.currency)
        FROM public.relief_plans p JOIN public.groups owner_group
          ON owner_group.id=p.group_id WHERE p.id=v_contract.plan_id)
      AND v_unit IS NOT NULL
      AND EXISTS (SELECT 1 FROM financial_core.relief_plan_scope_membership sm
        WHERE sm.scope_id=v_scope.id AND sm.unit_id=v_unit
          AND sm.purpose='participation');
    UPDATE public.relief_coverage_responsibilities
      SET effective_to=v_now
      WHERE contract_id=v_contract.id AND effective_to IS NULL;
    IF v_contract.current_membership_id IS NOT NULL THEN
      UPDATE public.relief_enrollments
        SET is_active=false,status='suspended'
        WHERE plan_id=v_contract.plan_id
          AND membership_id=v_contract.current_membership_id;
    END IF;
    UPDATE public.relief_coverage_contracts
      SET current_membership_id=CASE WHEN v_allowed THEN NEW.id ELSE NULL END,
        suspended_membership_id=CASE WHEN v_allowed THEN NULL ELSE NEW.id END,
        status=CASE WHEN v_allowed THEN 'active' ELSE 'suspended_out_of_scope' END,
        version=v_contract.version+1,updated_at=v_now
      WHERE id=v_contract.id;
    INSERT INTO public.relief_coverage_responsibilities
      (contract_id,version,membership_id,group_id,effective_from,
       actor_id,reason,transfer_id,coverage_status)
    VALUES (v_contract.id,v_contract.version+1,NEW.id,NEW.group_id,
      v_now,auth.uid(),'transfer',v_transfer,
      CASE WHEN v_allowed THEN 'active' ELSE 'suspended_out_of_scope' END);
    IF v_allowed THEN
      INSERT INTO public.relief_enrollments
        (plan_id,membership_id,group_id,collecting_group_id,
         enrolled_at,matures_at,eligible_date,enrollment_type,status,is_active)
      VALUES (v_contract.plan_id,NEW.id,NEW.group_id,NEW.group_id,
        v_contract.coverage_started_at,v_contract.matures_at,
        v_contract.matures_at::date,v_contract.enrollment_type,'active',true)
      ON CONFLICT (plan_id,membership_id) DO UPDATE SET
        group_id=EXCLUDED.group_id,
        collecting_group_id=EXCLUDED.collecting_group_id,
        enrolled_at=EXCLUDED.enrolled_at,
        matures_at=EXCLUDED.matures_at,
        eligible_date=EXCLUDED.eligible_date,
        enrollment_type=EXCLUDED.enrollment_type,
        status='active',is_active=true;
    END IF;
  END LOOP;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_rebind_relief_coverage_on_transfer
  AFTER INSERT ON public.memberships FOR EACH ROW
  EXECUTE FUNCTION public.rebind_relief_coverage_on_transfer();
REVOKE ALL ON FUNCTION public.rebind_relief_coverage_on_transfer()
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
