-- F4-001: INSERT must not create an already-waived obligation without the command audit.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_dues_obligation_waiver()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') THEN
    IF tg_op='INSERT' THEN
      IF new.status='waived' OR new.waived_by IS NOT NULL
        OR new.waived_at IS NOT NULL THEN
        RAISE EXCEPTION 'WAIVER_COMMAND_REQUIRED' USING ERRCODE='42501';
      END IF;
    ELSIF (
      (new.status IS DISTINCT FROM old.status AND
        (new.status='waived' OR old.status='waived'))
      OR new.waived_by IS DISTINCT FROM old.waived_by
      OR new.waived_at IS DISTINCT FROM old.waived_at
      OR (old.status='waived' AND new.amount IS DISTINCT FROM old.amount)
    ) THEN
      RAISE EXCEPTION 'WAIVER_COMMAND_REQUIRED' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN new;
END;
$$;
CREATE TRIGGER guard_dues_obligation_waiver_insert
  BEFORE INSERT ON public.contribution_obligations FOR EACH ROW
  EXECUTE FUNCTION public.guard_dues_obligation_waiver();
COMMIT;
