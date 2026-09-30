DO $probe$
DECLARE
  r jsonb := '{}'::jsonb; admin uuid := 'b1512a61-fe79-4bb8-99ce-1f88249f110d';
  g uuid := '07886294-5d3f-484f-8fd1-34727ca449c4';
  c record; ct uuid; members int;
BEGIN
  SELECT count(*) INTO members FROM public.memberships m WHERE m.group_id = g AND m.membership_status = 'active' AND m.standing <> 'banned';
  r := r || jsonb_build_object('eligible_members', members);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  FOR c IN SELECT * FROM (VALUES
      ('ordinary_15', 'monthly', 15, date '2026-10-01'),
      ('clamp_31_nov', 'monthly', 31, date '2026-11-01'),
      ('feb_non_leap_30', 'monthly', 30, date '2027-02-01'),
      ('feb_leap_29', 'monthly', 29, date '2028-02-01'),
      ('feb_leap_28', 'monthly', 28, date '2028-02-10'),
      ('quarterly_31', 'quarterly', 31, date '2026-10-10'),
      ('annual_5', 'annual', 5, date '2027-01-20'),
      ('no_start_10', 'monthly', 10, null::date),
      ('one_time_20', 'one_time', 20, date '2026-12-01')) v(label, freq, dd, sd) LOOP
    BEGIN
      INSERT INTO public.contribution_types (group_id, name, amount, currency, frequency, due_day, start_date, created_by)
        VALUES (g, 'FQ-09 ' || c.label, 1000, 'XAF', c.freq::public.contribution_frequency, c.dd, c.sd, admin) RETURNING id INTO ct;
      r := r || jsonb_build_object(c.label, (SELECT jsonb_build_object('count', count(*), 'due', min(o.due_date)::text, 'period', '"' || min(o.period_label) || '"')
                                             FROM public.contribution_obligations o WHERE o.contribution_type_id = ct));
      RAISE EXCEPTION 'CASE_DONE';
    EXCEPTION WHEN OTHERS THEN
      IF SQLERRM <> 'CASE_DONE' THEN r := r || jsonb_build_object(c.label || '_error', SQLSTATE || ' ' || SQLERRM); END IF;
    END;
  END LOOP;

  BEGIN
    BEGIN
      INSERT INTO public.contribution_types (group_id, name, amount, currency, frequency, due_day, created_by)
        VALUES (g, 'FQ-09 retry', 1000, 'XAF', 'monthly', 0, admin);
      r := r || jsonb_build_object('invalid_due_day', 'accepted');
    EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('invalid_due_day_error', SQLSTATE || ' ' || SQLERRM);
    END;
    r := r || jsonb_build_object('after_failed_submit', (SELECT jsonb_build_object('types', count(*)) FROM public.contribution_types t WHERE t.group_id = g AND t.name = 'FQ-09 retry'));
    INSERT INTO public.contribution_types (group_id, name, amount, currency, frequency, due_day, created_by)
      VALUES (g, 'FQ-09 retry', 1000, 'XAF', 'monthly', 15, admin) RETURNING id INTO ct;
    BEGIN
      INSERT INTO public.contribution_types (group_id, name, amount, currency, frequency, due_day, created_by)
        VALUES (g, 'FQ-09 retry', 1000, 'XAF', 'monthly', 15, admin);
      r := r || jsonb_build_object('double_submit', 'accepted');
    EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('double_submit_error', SQLSTATE || ' ' || SQLERRM);
    END;
    r := r || jsonb_build_object('after_retry', (SELECT jsonb_build_object('types', (SELECT count(*) FROM public.contribution_types t WHERE t.group_id = g AND t.name = 'FQ-09 retry'),
                                                  'obligations', (SELECT count(*) FROM public.contribution_obligations o WHERE o.contribution_type_id = ct))));
    RAISE EXCEPTION 'CASE_DONE';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'CASE_DONE' THEN r := r || jsonb_build_object('retry_error', SQLSTATE || ' ' || SQLERRM); END IF;
  END;
  r := r || jsonb_build_object('types_left_in_group', (SELECT count(*) FROM public.contribution_types t WHERE t.group_id = g), 'current_date_utc', current_date::text,
    'demo_monthly_period_label', (SELECT '"' || min(o.period_label) || '"' FROM public.contribution_obligations o WHERE o.contribution_type_id = 'ca608be2-fcc9-42e2-b809-56b33ea0cb5d'));
  RAISE EXCEPTION 'PROBE_RESULT %', r::text;
END
$probe$;