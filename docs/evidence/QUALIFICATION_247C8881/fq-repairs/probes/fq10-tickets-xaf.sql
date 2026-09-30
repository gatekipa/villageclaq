DO $probe$
DECLARE
  r jsonb := '{}'::jsonb; admin uuid := 'b1512a61-fe79-4bb8-99ce-1f88249f110d'; outsider uuid := 'f20b6409-7923-407c-ab2f-07805a58fbaf';
  g uuid := 'f3d65556-110e-4d01-b507-2a741bdc5dec'; mem uuid := 'fe688bb8-14df-4ab6-b77a-2dd40ab931da';
  acct uuid := 'b9e5c625-48e4-4d18-8266-c0ca7dffd1b4'; cat uuid := 'c8935dbe-bb8e-434a-8190-3fcd2b7f2cbf';
  ev_id uuid; tier_ok_id uuid; treq uuid := '0f100a10-0000-4000-8000-000000000501'; x jsonb; etype text;
BEGIN
  SELECT (enum_range(null::public.event_type))[1]::text INTO etype;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', admin, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  x := public.manage_event(g, jsonb_build_object('title', 'FQ-10 probe event (rolled back)', 'event_type', etype, 'starts_at', (now() + interval '7 days')::text));
  ev_id := (x->>'event_id')::uuid;
  PERFORM public.create_ticket_tier(ev_id, 'Standard', 1500, null);
  EXECUTE 'RESET ROLE';
  SELECT t.id INTO tier_ok_id FROM public.ticket_tiers t WHERE t.event_id = ev_id AND t.name = 'Standard';
  EXECUTE 'SET LOCAL ROLE authenticated';
  x := public.post_ticket_purchase(treq, ev_id, tier_ok_id, mem, acct, cat, g);
  r := r || jsonb_build_object('ticket', x->>'decision', 'ticket_replay', (public.post_ticket_purchase(treq, ev_id, tier_ok_id, mem, acct, cat, g))->>'decision');
  PERFORM set_config('request.jwt.claims', json_build_object('sub', outsider, 'role', 'authenticated')::text, true);
  BEGIN
    PERFORM public.post_ticket_purchase('0f100a10-0000-4000-8000-000000000503'::uuid, ev_id, tier_ok_id, mem, acct, cat, g);
    r := r || jsonb_build_object('ticket_outsider', 'POSTED');
  EXCEPTION WHEN OTHERS THEN r := r || jsonb_build_object('ticket_outsider_error', SQLSTATE || ' ' || SQLERRM);
  END;
  EXECUTE 'SET CONSTRAINTS ALL IMMEDIATE';
  EXECUTE 'RESET ROLE';
  r := r || jsonb_build_object(
    'events', (SELECT jsonb_agg(jsonb_build_object('module', e.source_module, 'effect', e.effect_kind, 'amount', pc.canonical_payload->>'amount',
                 'sum', (SELECT sum(fp.amount_signed)::text FROM public.financial_postings fp WHERE fp.event_id = e.id),
                 'postings', (SELECT count(*) FROM public.financial_postings fp WHERE fp.event_id = e.id),
                 'audit', (SELECT count(*) FROM financial_core.financial_event_audit_links l WHERE l.event_id = e.id)))
               FROM public.financial_events e JOIN financial_core.posting_command_payloads pc ON pc.event_id = e.id WHERE e.group_id = g),
    'ticket_purchases', (SELECT jsonb_agg(jsonb_build_object('amount', tp.amount_paid::text, 'currency', tp.currency, 'event_linked', tp.financial_event_id IS NOT NULL)) FROM public.ticket_purchases tp WHERE tp.event_id = ev_id));
  RAISE EXCEPTION 'PROBE_RESULT %', r::text;
END
$probe$;