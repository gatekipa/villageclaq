DO $probe$
DECLARE
  r jsonb := '{}'::jsonb; admin uuid := 'b1512a61-fe79-4bb8-99ce-1f88249f110d';
  cur text; org uuid; g uuid; ep uuid; acct uuid; fund uuid; cat uuid; owner_m uuid; proxy_m uuid; ct uuid;
  ok_amt text; ok2_amt text; bad_amt text; req uuid; res jsonb; rep jsonb; n int := 0; cmd jsonb; sub jsonb;
  code_rec record; catalog jsonb := '{}'::jsonb; whole text; frac text;
BEGIN
  FOR cur, ok_amt, ok2_amt, bad_amt IN SELECT * FROM (VALUES ('XOF','2500','3000','2500.5'), ('USD','12.30','0.1','12.345')) v(a,b,c,d) LOOP
    n := n + 1; sub := '{}'::jsonb;
    EXECUTE 'RESET ROLE';
    EXECUTE 'SET CONSTRAINTS ALL DEFERRED';
    INSERT INTO public.organizations (name, created_by) VALUES ('FQ-10 probe org ' || cur, admin) RETURNING id INTO org;
    INSERT INTO public.groups (organization_id, name, currency, created_by) VALUES (org, 'FQ-10 probe ' || cur || ' (rolled back)', cur, admin) RETURNING id INTO g;
    SELECT e.id INTO ep FROM public.financial_ledger_epochs e WHERE e.group_id = g AND e.effective_to IS NULL;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    PERFORM public.create_owner_membership(g, 'Probe Owner');
    EXECUTE 'RESET ROLE';
    SELECT m.id INTO owner_m FROM public.memberships m WHERE m.group_id = g AND m.user_id = admin;
    INSERT INTO public.memberships (group_id, user_id, role, membership_status, display_name, is_proxy) VALUES (g, null, 'member', 'active', 'Probe Member', true) RETURNING id INTO proxy_m;
    INSERT INTO public.financial_accounts (group_id, opened_ledger_epoch_id, currency, name, kind, created_by) VALUES (g, ep, cur, 'Probe cash', 'cash', admin) RETURNING id INTO acct;
    INSERT INTO public.financial_funds (group_id, name, is_default, is_restricted, created_by) VALUES (g, 'General', true, false, admin) RETURNING id INTO fund;
    INSERT INTO public.financial_categories (group_id, name, category_class, created_by) VALUES (g, 'Dues', 'income', admin) RETURNING id INTO cat;
    INSERT INTO public.contribution_types (group_id, name, amount, currency, frequency, start_date, created_by) VALUES (g, 'Probe dues', ok_amt::numeric, cur, 'one_time', current_date, admin) RETURNING id INTO ct;
    sub := sub || jsonb_build_object('epoch_currency', (SELECT e.currency FROM public.financial_ledger_epochs e WHERE e.id = ep),
      'owner_role', (SELECT m.role FROM public.memberships m WHERE m.id = owner_m),
      'obligations_generated', (SELECT count(*) FROM public.contribution_obligations o WHERE o.contribution_type_id = ct));
    cmd := jsonb_build_object('group_id', g, 'membership_id', proxy_m, 'contribution_type_id', ct, 'obligation_id', null, 'currency', cur,
      'payment_method', 'cash', 'reference_number', null, 'receipt_url', null, 'notes', 'FQ-10 probe',
      'recorded_at', to_char((now() + interval '1 second') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'cash_class', 'non_refundable', 'account_id', acct, 'category_id', cat, 'fund_id', null);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    req := ('0f100a10-0000-4000-8000-0000000002' || lpad(n::text, 2, '0'))::uuid;
    PERFORM public.prepare_dues_record_intent(cmd || jsonb_build_object('request_id', req, 'amount', ok_amt));
    res := public.post_dues_record_intent(req);
    rep := public.post_dues_record_intent(req);
    sub := sub || jsonb_build_object('post', res->>'decision', 'replay', rep->>'decision', 'replay_postings', rep->'posting_count');
    req := ('0f100a10-0000-4000-8000-0000000003' || lpad(n::text, 2, '0'))::uuid;
    PERFORM public.prepare_dues_record_intent(cmd || jsonb_build_object('request_id', req, 'amount', ok2_amt));
    sub := sub || jsonb_build_object('second_post', (public.post_dues_record_intent(req))->>'decision');
    BEGIN
      req := ('0f100a10-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid;
      PERFORM public.prepare_dues_record_intent(cmd || jsonb_build_object('request_id', req, 'amount', bad_amt));
      PERFORM public.post_dues_record_intent(req);
      sub := sub || jsonb_build_object('bad_amount', 'POSTED');
    EXCEPTION WHEN OTHERS THEN sub := sub || jsonb_build_object('bad_amount_error', SQLERRM);
    END;
    EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
    EXECUTE 'RESET ROLE';
    sub := sub || jsonb_build_object(
      'payments', (SELECT jsonb_agg(p.amount::text ORDER BY p.amount) FROM public.payments p WHERE p.group_id = g),
      'payload_amounts', (SELECT jsonb_agg(pc.canonical_payload->>'amount' ORDER BY pc.canonical_payload->>'amount') FROM financial_core.posting_command_payloads pc JOIN public.financial_events e ON e.id = pc.event_id WHERE e.group_id = g),
      'events', (SELECT count(*) FROM public.financial_events e WHERE e.group_id = g),
      'postings', (SELECT count(*) FROM public.financial_postings fp WHERE fp.group_id = g),
      'posting_sum', (SELECT sum(fp.amount_signed)::text FROM public.financial_postings fp WHERE fp.group_id = g),
      'audit_links', (SELECT count(*) FROM financial_core.financial_event_audit_links l JOIN public.financial_events e ON e.id = l.event_id WHERE e.group_id = g));
    r := r || jsonb_build_object(cur, sub);
  END LOOP;

  FOR code_rec IN SELECT code FROM unnest(ARRAY['XAF','XOF','TZS','UGX','RWF','NGN','GHS','KES','ZAR','ETB','CDF','USD','EUR','GBP','CAD','CHF','AUD','AED']) code LOOP
    whole := financial_core.f3_amount(to_jsonb(trim_scale(1234.00::numeric(12,2))::text), code_rec.code);
    BEGIN
      frac := financial_core.f3_amount(to_jsonb(trim_scale(1234.50::numeric(12,2))::text), code_rec.code);
    EXCEPTION WHEN OTHERS THEN frac := 'REJECTED:' || SQLERRM;
    END;
    catalog := catalog || jsonb_build_object(code_rec.code, jsonb_build_array(financial_core.currency_scale(code_rec.code), whole, frac));
  END LOOP;
  r := r || jsonb_build_object('catalog', catalog);
  RAISE EXCEPTION 'PROBE_RESULT %', r::text;
END
$probe$;