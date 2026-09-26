-- R-002/R-003: a contracted plan cannot silently change economic owner,
-- currency or participation flag outside an effective scope version.
CREATE OR REPLACE FUNCTION public.guard_relief_plan_scope_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.relief_plan_scope_versions s
      WHERE s.plan_id=OLD.id)
     AND (NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.shared_from_org IS DISTINCT FROM OLD.shared_from_org)
  THEN RAISE EXCEPTION 'RELIEF_PLAN_SCOPE_IDENTITY_IMMUTABLE'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_guard_relief_plan_scope_identity
  BEFORE UPDATE ON public.relief_plans FOR EACH ROW
  EXECUTE FUNCTION public.guard_relief_plan_scope_identity();
