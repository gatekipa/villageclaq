DO $probe$
DECLARE
  r jsonb := '{}'::jsonb; admin uuid := 'b1512a61-fe79-4bb8-99ce-1f88249f110d'; outsider uuid := 'f20b6409-7923-407c-ab2f-07805a58fbaf';
  g uuid := 'f3d65556-110e-4d01-b507-2a741bdc5dec'; mem uuid := 'a0be52c0-34ef-4096-b0ad-7b85557191b1';
  acct uuid := 'b9e5c625-48e4-4d18-8266-c0ca7dffd1b4'; cat uuid := 'c8935dbe-bb8e-434a-8190-3fcd2b7f2cbf';
  relief_fund uuid; plan_id uuid; pid uuid := '0f100a10-0000-4000-8000-000000000601'; pid2 uuid := '0f100a10-0000-4000-8000-000000000602';
  x jsonb; created text; enrolled text;
BEGIN
  INSERT INTO public.group_subscriptions (group_id, tier, status) VALUES (g, 'starter', 'active');
  INSERT INTO public.financial_funds (group_id, name, is_default, is_restricted, created_by) VALUES (g, 'Relief fund (probe)', false, true, admin) RETURNING id INTO relief_fund;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  created := public.create_relief_plan_with_scope(jsonb_build_object('request_id', '0f100a10-0000-4000-8000-000000000600', 'group_id', g,
    'name', 'Probe bereavement fund (rolled back)', 'description', 'FQ-10 probe', 'coverage_amount', 100000, 'currency', 'XAF', 'waiting_period_days', 0))::text;
  EXECUTE 'RESET ROLE';
  SELECT p.id INTO plan_id FROM public.relief_plans p WHERE p.group_id = g ORDER BY p.created_at DESC LIMIT 1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  enrolled := public.enroll_relief_person(jsonb_build_object('request_id', '0f100a10-0000-4000-8000-000000000603', 'plan_id', plan_id,
    'membership_id', mem, 'group_id', g, 'enrollment_type', 'full_member'))::text;
  INSERT INTO public.payments (id, group_id, membership_id, relief_plan_id, amount, currency, payment_method, recorded_by, status, cash_class)
    VALUES (pid, g, mem, plan_id, 5000, 'XAF', 'cash', admin, 'pending_confirmation', 'non_refundable');
  x := public.post_owner_relief_receipt(jsonb_build_object('payment_id', pid, 'account_id', acct, 'fund_id', relief_fund, 'category_id', cat));
  r := r || jsonb_build_object('plan_created', created IS NOT NULL, 'enrolled', enrolled IS NOT NULL, 'relief_receipt', x);
  r := r || jsonb_build_object('relief_replay', public.post_owner_relief_receipt(jsonb_build_object('payment_id', pid, 'account_id', acct, 'fund_id', relief_fund, 'category_id', cat)));
  BEGIN
    INSERT INTO public.payments (id, group_id, membership_id, relief_plan_id, amount, currency, payment_method, recorded_by, status, cash_class)
      VALUES (pid2, g, mem, plan_id, 5000.5, 'XAF', 'cash', admin, 'pending_confirmation', 'non_refundable');
    PERFORM public.post_owner_relief_receipt(jsonb_build_object('payment_id', pid2, 'account_id', acct, 'fund_id', relief_fund, 'category_id', cat));
    r := r || jsonb_build_object('relief_fraction', 'POSTED');
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('relief_fraction_error', SQLERRM);
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.post_owner_relief_receipt(jsonb_build_object('payment_id', pid, 'account_id', acct, 'fund_id', relief_fund, 'category_id', cat));
    r := r || jsonb_build_object('relief_outsider', 'accepted');
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('relief_outsider_error', SQLSTATE || ' ' || SQLERRM);
  END;
  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
  EXECUTE 'RESET ROLE';
  r := r || jsonb_build_object(
    'events', (SELECT jsonb_agg(jsonb_build_object('module', e.source_module, 'effect', e.effect_kind, 'amount', pc.canonical_payload->>'amount',
                 'sum', (SELECT sum(fp.amount_signed)::text FROM public.financial_postings fp WHERE fp.event_id = e.id),
                 'classes', (SELECT jsonb_agg(fp.control_class ORDER BY fp.amount_signed DESC) FROM public.financial_postings fp WHERE fp.event_id = e.id),
                 'audit', (SELECT count(*) FROM financial_core.financial_event_audit_links l WHERE l.event_id = e.id)))
               FROM public.financial_events e JOIN financial_core.posting_command_payloads pc ON pc.event_id = e.id WHERE e.group_id = g),
    'payment', (SELECT jsonb_build_object('amount', p.amount::text, 'status', p.status, 'event_linked', p.financial_event_id IS NOT NULL) FROM public.payments p WHERE p.id = pid));
  RAISE EXCEPTION 'PROBE_RESULT %', r::text;
END
$probe$;