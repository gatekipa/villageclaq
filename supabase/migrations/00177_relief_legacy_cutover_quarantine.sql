-- R-012: preserve pre-activation Relief plans and stop new financial effects
-- until a reviewed source/owner/opening-balance manifest authorizes cutover.
-- Plans already created with a versioned Relief 2.0 scope are new contracts.
BEGIN;
CREATE TABLE financial_core.relief_legacy_cutover_plans (
  plan_id uuid PRIMARY KEY REFERENCES public.relief_plans(id) ON DELETE RESTRICT,
  owner_group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  was_active boolean NOT NULL,
  prior_status text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  resolution_manifest_hash text,
  resolution_authorized_at timestamptz,
  CONSTRAINT relief_legacy_resolution_pair CHECK (
    (resolution_manifest_hash IS NULL AND resolution_authorized_at IS NULL)
    OR (resolution_manifest_hash IS NOT NULL AND resolution_authorized_at IS NOT NULL)
  )
);
ALTER TABLE financial_core.relief_legacy_cutover_plans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.relief_legacy_cutover_plans
  FROM PUBLIC,anon,authenticated,service_role;

INSERT INTO financial_core.relief_legacy_cutover_plans
  (plan_id,owner_group_id,was_active,prior_status)
SELECT p.id,p.group_id,p.is_active,p.status
FROM public.relief_plans p
WHERE NOT EXISTS (
  SELECT 1 FROM public.relief_plan_scope_versions s WHERE s.plan_id=p.id
);

CREATE FUNCTION financial_core.guard_relief_legacy_receipt_cutover()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_new_effect boolean;
BEGIN
  IF TG_OP='INSERT' THEN
    v_new_effect:=true;
  ELSE
    v_new_effect:=NEW.status='confirmed'
      AND OLD.status IS DISTINCT FROM NEW.status;
  END IF;
  IF NEW.relief_plan_id IS NOT NULL
    AND v_new_effect
    AND EXISTS (
      SELECT 1 FROM financial_core.relief_legacy_cutover_plans c
      WHERE c.plan_id=NEW.relief_plan_id
        AND c.resolution_authorized_at IS NULL
    )
  THEN RAISE EXCEPTION 'RELIEF_LEGACY_CUTOVER_REQUIRED'
    USING ERRCODE='42501'; END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION financial_core.guard_relief_legacy_receipt_cutover()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_relief_legacy_receipt_cutover
  BEFORE INSERT OR UPDATE OF status ON public.payments
  FOR EACH ROW EXECUTE FUNCTION financial_core.guard_relief_legacy_receipt_cutover();

CREATE FUNCTION financial_core.guard_relief_legacy_claim_payout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.financial_event_id IS NOT NULL
    AND NEW.financial_event_id IS DISTINCT FROM OLD.financial_event_id
    AND EXISTS (
      SELECT 1 FROM financial_core.relief_legacy_cutover_plans c
      WHERE c.plan_id=NEW.plan_id AND c.resolution_authorized_at IS NULL
    )
  THEN RAISE EXCEPTION 'RELIEF_LEGACY_CUTOVER_REQUIRED'
    USING ERRCODE='42501'; END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION financial_core.guard_relief_legacy_claim_payout()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_relief_legacy_claim_payout
  BEFORE UPDATE OF financial_event_id ON public.relief_claims
  FOR EACH ROW EXECUTE FUNCTION financial_core.guard_relief_legacy_claim_payout();

CREATE FUNCTION financial_core.guard_relief_legacy_remittance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM financial_core.relief_legacy_cutover_plans c
    WHERE c.plan_id=NEW.relief_plan_id
      AND c.resolution_authorized_at IS NULL
  )
  THEN RAISE EXCEPTION 'RELIEF_LEGACY_CUTOVER_REQUIRED'
    USING ERRCODE='42501'; END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION financial_core.guard_relief_legacy_remittance()
  FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_relief_legacy_remittance
  BEFORE INSERT ON public.relief_remittances
  FOR EACH ROW EXECUTE FUNCTION financial_core.guard_relief_legacy_remittance();
COMMIT;
