-- F4-001: operational waivers need a current manager and one authoritative audit.
-- Waiving changes expected/outstanding, never posts cash or journal income.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_dues_obligation_waiver()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF current_user IN ('anon','authenticated') AND (
    new.status IS DISTINCT FROM old.status AND
      (new.status='waived' OR old.status='waived')
    OR new.waived_by IS DISTINCT FROM old.waived_by
    OR new.waived_at IS DISTINCT FROM old.waived_at
    OR (old.status='waived' AND new.amount IS DISTINCT FROM old.amount)
  ) THEN
    RAISE EXCEPTION 'WAIVER_COMMAND_REQUIRED' USING ERRCODE='42501';
  END IF;
  RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS guard_dues_obligation_waiver
  ON public.contribution_obligations;
CREATE TRIGGER guard_dues_obligation_waiver
  BEFORE UPDATE OF status,amount,waived_by,waived_at
  ON public.contribution_obligations FOR EACH ROW
  EXECUTE FUNCTION public.guard_dues_obligation_waiver();

CREATE OR REPLACE FUNCTION public.waive_dues_obligation(
  p_obligation uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_obligation public.contribution_obligations%ROWTYPE;
  v_actor uuid:=auth.uid(); v_reason text:=btrim(coalesce(p_reason,''));
BEGIN
  SELECT * INTO v_obligation FROM public.contribution_obligations
    WHERE id=p_obligation FOR UPDATE;
  IF v_obligation.id IS NULL OR v_actor IS NULL OR
    NOT public.has_group_permission(v_obligation.group_id,
      'contributions.manage',v_actor) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_obligation.status='waived' THEN
    RETURN jsonb_build_object('decision','ALREADY_WAIVED',
      'obligation_id',p_obligation);
  END IF;
  IF length(v_reason)<5 OR length(v_reason)>500 THEN
    RAISE EXCEPTION 'WAIVER_REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  IF coalesce(v_obligation.amount_paid,0)<>0
    OR EXISTS (SELECT 1 FROM public.payment_obligation_applications a
       WHERE a.obligation_id=p_obligation)
    OR EXISTS (SELECT 1 FROM public.payments p
       WHERE p.obligation_id=p_obligation AND p.status<>'rejected') THEN
    RAISE EXCEPTION 'OBLIGATION_HAS_PAYMENT' USING ERRCODE='22023';
  END IF;
  UPDATE public.contribution_obligations
    SET status='waived',waived_by=v_actor,waived_at=now()
    WHERE id=p_obligation;
  INSERT INTO public.group_audit_logs
    (group_id,actor_id,action,entity_type,entity_id,details,description)
  VALUES(v_obligation.group_id,v_actor,'dues.obligation_waived',
    'contribution_obligation',p_obligation,
    jsonb_build_object('amount',v_obligation.amount,
      'currency',v_obligation.currency,'reason',v_reason),
    'Dues obligation waived');
  RETURN jsonb_build_object('decision','WAIVED',
    'obligation_id',p_obligation);
END;
$$;
REVOKE ALL ON FUNCTION public.waive_dues_obligation(uuid,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.waive_dues_obligation(uuid,text)
  TO authenticated;
COMMIT;
