-- Correct only untouched FQ-09 obligations after an officer verifies the
-- affected record. Payment/waiver history is never changed by this command.
CREATE FUNCTION public.correct_fq09_obligation_date(
  p_obligation uuid, p_expected_old date, p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old public.contribution_obligations%ROWTYPE;
  v_type public.contribution_types%ROWTYPE;
  v_actor uuid := auth.uid(); v_new date;
  v_reason text := btrim(coalesce(p_reason,''));
BEGIN
  SELECT * INTO v_old FROM public.contribution_obligations
    WHERE id=p_obligation FOR UPDATE;
  IF v_old.id IS NULL OR v_actor IS NULL OR
    NOT public.has_group_permission(v_old.group_id,'contributions.manage',v_actor) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_type FROM public.contribution_types
    WHERE id=v_old.contribution_type_id AND group_id=v_old.group_id;
  IF v_type.id IS NULL OR v_type.due_day NOT BETWEEN 29 AND 31
    OR v_type.frequency NOT IN ('monthly','quarterly','annual') THEN
    RAISE EXCEPTION 'NOT_FQ09_RECURRING' USING ERRCODE='22023';
  END IF;
  IF length(v_reason)<10 OR length(v_reason)>500 THEN
    RAISE EXCEPTION 'CORRECTION_REASON_REQUIRED' USING ERRCODE='22023';
  END IF;
  v_new := pg_catalog.make_date(
    extract(year from v_old.due_date)::integer,
    extract(month from v_old.due_date)::integer,
    least(v_type.due_day,extract(day from
      pg_catalog.date_trunc('month',v_old.due_date::timestamp)
        + interval '1 month - 1 day')::integer));
  IF v_old.due_date=v_new THEN
    RETURN jsonb_build_object('decision','ALREADY_CORRECTED','due_date',v_new);
  END IF;
  IF v_old.due_date IS DISTINCT FROM p_expected_old THEN
    RAISE EXCEPTION 'STALE_DUE_DATE' USING ERRCODE='40001';
  END IF;
  IF v_old.status='waived' OR coalesce(v_old.amount_paid,0)<>0
    OR EXISTS (SELECT 1 FROM public.payment_obligation_applications a
      WHERE a.obligation_id=p_obligation)
    OR EXISTS (SELECT 1 FROM public.payments p
      WHERE (p.obligation_id=p_obligation OR
        (p.membership_id=v_old.membership_id
         AND p.contribution_type_id=v_old.contribution_type_id))
        AND p.status<>'rejected') THEN
    RAISE EXCEPTION 'OBLIGATION_HAS_HISTORY' USING ERRCODE='22023';
  END IF;
  UPDATE public.contribution_obligations SET due_date=v_new WHERE id=p_obligation;
  INSERT INTO public.group_audit_logs
    (group_id,actor_id,action,entity_type,entity_id,details,description)
  VALUES(v_old.group_id,v_actor,'dues.obligation_due_date_corrected',
    'contribution_obligation',p_obligation,
    jsonb_build_object('old_due_date',v_old.due_date,'new_due_date',v_new,
      'selected_due_day',v_type.due_day,'reason',v_reason),
    'FQ-09 obligation calendar correction');
  RETURN jsonb_build_object('decision','CORRECTED',
    'old_due_date',v_old.due_date,'due_date',v_new);
END;
$$;
REVOKE ALL ON FUNCTION public.correct_fq09_obligation_date(uuid,date,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.correct_fq09_obligation_date(uuid,date,text)
  TO authenticated;
