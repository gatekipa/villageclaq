DO $probe$
DECLARE
  r jsonb := '{}'::jsonb; admin uuid := 'b1512a61-fe79-4bb8-99ce-1f88249f110d';
  g uuid := 'f3d65556-110e-4d01-b507-2a741bdc5dec'; mem uuid := 'fe688bb8-14df-4ab6-b77a-2dd40ab931da';
  acct uuid := 'b9e5c625-48e4-4d18-8266-c0ca7dffd1b4'; cat uuid := 'c8935dbe-bb8e-434a-8190-3fcd2b7f2cbf';
  loan1 uuid; loan2 uuid; rep jsonb; rep_id uuid; ev_id uuid; tier_ok_id uuid;
  treq uuid := '0f100a10-0000-4000-8000-000000000501'; x jsonb; etype text;
BEGIN
  SELECT (enum_range(null::public.event_type))[1]::text INTO etype;
  INSERT INTO public.loans (group_id, membership_id, amount_requested, amount_approved, interest_rate, total_repayable, total_repaid, status, currency)
    VALUES (g, mem, 50000, 50000, 10, 55000, 0, 'approved', 'XAF') RETURNING id INTO loan1;
  INSERT INTO public.loans (group_id, membership_id, amount_requested, amount_approved, interest_rate, total_repayable, total_repaid, status, currency)
    VALUES (g, mem, 1000.50, 1000.50, 0, 1000.50, 0, 'approved', 'XAF') RETURNING id INTO loan2;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := r || jsonb_build_object('a_start', jsonb_build_array(auth.uid(), public.has_group_permission(g, 'events.manage')));
  r := r || jsonb_build_object('loan_disburse', public.post_loan_disbursement(jsonb_build_object('loan_id', loan1, 'account_id', acct)) - 'loan_id');
  r := r || jsonb_build_object('loan_disburse_replay', (public.post_loan_disbursement(jsonb_build_object('loan_id', loan1, 'account_id', acct)))->>'decision');
  r := r || jsonb_build_object('b_after_disburse', jsonb_build_array(auth.uid(), public.has_group_permission(g, 'events.manage')));
  rep := public.prepare_loan_repayment(jsonb_build_object('loan_id', loan1, 'account_id', acct, 'amount', '10000', 'request_id', '0f100a10-0000-4000-8000-000000000401'));
  rep_id := (rep->>'repayment_id')::uuid;
  x := public.post_loan_repayment(jsonb_build_object('repayment_id', rep_id));
  r := r || jsonb_build_object('loan_repay', jsonb_build_object('decision', x->>'decision', 'principal', x->>'principal', 'interest', x->>'interest'));
  r := r || jsonb_build_object('loan_repay_replay', (public.post_loan_repayment(jsonb_build_object('repayment_id', rep_id)))->>'decision');
  r := r || jsonb_build_object('c_after_repay', jsonb_build_array(auth.uid(), public.has_group_permission(g, 'events.manage')));
  BEGIN
    rep := public.prepare_loan_repayment(jsonb_build_object('loan_id', loan1, 'account_id', acct, 'amount', '100.5', 'request_id', '0f100a10-0000-4000-8000-000000000402'));
    PERFORM public.post_loan_repayment(jsonb_build_object('repayment_id', (rep->>'repayment_id')::uuid));
    r := r || jsonb_build_object('loan_fraction_repay', 'POSTED');
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('loan_fraction_repay_error', SQLERRM);
  END;
  BEGIN
    PERFORM public.post_loan_disbursement(jsonb_build_object('loan_id', loan2, 'account_id', acct));
    r := r || jsonb_build_object('loan_fraction_disburse', 'POSTED');
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('loan_fraction_disburse_error', SQLERRM);
  END;
  r := r || jsonb_build_object('d_after_fractions', jsonb_build_array(auth.uid(), public.has_group_permission(g, 'events.manage'), current_user));
  x := public.manage_event(g, jsonb_build_object('title', 'FQ-10 probe event (rolled back)', 'event_type', etype, 'starts_at', (now() + interval '7 days')::text));
  ev_id := (x->>'event_id')::uuid;
  PERFORM public.create_ticket_tier(ev_id, 'Standard', 1500, null);
  BEGIN
    PERFORM public.create_ticket_tier(ev_id, 'Fractional', 1500.5, null);
    r := r || jsonb_build_object('ticket_fraction_tier', 'CREATED');
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('ticket_fraction_tier_error', SQLERRM);
  END;
  EXECUTE 'RESET ROLE';
  SELECT t.id INTO tier_ok_id FROM public.ticket_tiers t WHERE t.event_id = ev_id AND t.name = 'Standard';
  EXECUTE 'SET LOCAL ROLE authenticated';
  r := r || jsonb_build_object('e_before_ticket', jsonb_build_array(auth.uid(), public.has_group_permission(g, 'events.manage'), current_user));
  BEGIN
    x := public.post_ticket_purchase(treq, g, ev_id, tier_ok_id, mem, acct, cat);
    r := r || jsonb_build_object('ticket', x->>'decision', 'ticket_replay', (public.post_ticket_purchase(treq, g, ev_id, tier_ok_id, mem, acct, cat))->>'decision');
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('ticket_error', SQLSTATE || ' ' || SQLERRM);
  END;
  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
  EXECUTE 'RESET ROLE';
  r := r || jsonb_build_object(
    'events', (SELECT jsonb_agg(jsonb_build_object('module', e.source_module, 'effect', e.effect_kind, 'amount', pc.canonical_payload->>'amount',
                 'sum', (SELECT sum(fp.amount_signed)::text FROM public.financial_postings fp WHERE fp.event_id = e.id),
                 'postings', (SELECT count(*) FROM public.financial_postings fp WHERE fp.event_id = e.id),
                 'audit', (SELECT count(*) FROM financial_core.financial_event_audit_links l WHERE l.event_id = e.id)) ORDER BY e.effect_kind)
               FROM public.financial_events e JOIN financial_core.posting_command_payloads pc ON pc.event_id = e.id WHERE e.group_id = g),
    'loan1', (SELECT jsonb_build_object('status', l.status, 'total_repaid', l.total_repaid::text, 'schedule_rows', (SELECT count(*) FROM public.loan_schedule s WHERE s.loan_id = l.id)) FROM public.loans l WHERE l.id = loan1),
    'loan2_status', (SELECT l.status FROM public.loans l WHERE l.id = loan2));
  RAISE EXCEPTION 'PROBE_RESULT %', r::text;
END
$probe$;