-- =========================================================================================
-- Stage M9 Slice 1: Events & Ticketing Canonical Schema & RPCs
-- Universal Adversarial Audit Standard Applied
-- =========================================================================================

-- 1. Preflight Checks
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'has_group_permission') THEN
    RAISE EXCEPTION 'M9_ABORT: Missing public.has_group_permission (Apply 00125)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'financial_core' AND p.proname = 'post_f3_command') THEN
    RAISE EXCEPTION 'M9_ABORT: Missing financial_core.post_f3_command (Apply 00119)';
  END IF;
END $$;

-- 2. Schema Hardening & Expansion
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS capacity INTEGER CHECK (capacity IS NULL OR capacity >= 0);

CREATE TABLE IF NOT EXISTS public.ticket_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL CHECK (price >= 0),
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  sales_start TIMESTAMPTZ,
  sales_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ticket_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES public.ticket_tiers(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  amount_paid NUMERIC NOT NULL CHECK (amount_paid >= 0),
  currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'refunded', 'cancelled')),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Triggers for updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_ticket_tiers_updated_at') THEN
    CREATE TRIGGER set_ticket_tiers_updated_at
      BEFORE UPDATE ON public.ticket_tiers
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_ticket_purchases_updated_at') THEN
    CREATE TRIGGER set_ticket_purchases_updated_at
      BEFORE UPDATE ON public.ticket_purchases
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END $$;

-- 3. Row Level Security
ALTER TABLE public.ticket_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Group members can view ticket tiers"
  ON public.ticket_tiers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      JOIN public.memberships ON memberships.group_id = events.group_id
      WHERE events.id = ticket_tiers.event_id
        AND memberships.user_id = auth.uid()
        AND memberships.standing != 'banned'
    )
  );

CREATE POLICY "Group admins can manage ticket tiers"
  ON public.ticket_tiers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      JOIN public.memberships ON memberships.group_id = events.group_id
      WHERE events.id = ticket_tiers.event_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Group members can view ticket purchases"
  ON public.ticket_purchases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      JOIN public.memberships ON memberships.group_id = events.group_id
      WHERE events.id = ticket_purchases.event_id
        AND memberships.user_id = auth.uid()
        AND memberships.standing != 'banned'
    )
  );

-- 4. Canonical RPCs (Adversarially Hardened)

CREATE OR REPLACE FUNCTION public.post_ticket_purchase(
  p_event_id UUID,
  p_tier_id UUID,
  p_membership_id UUID,
  p_account_id UUID,
  p_group_id UUID
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_member RECORD;
  v_tier RECORD;
  v_event RECORD;
  v_income_account_id UUID;
  v_purchase_id UUID;
  v_sold_tier INTEGER;
  v_sold_event INTEGER;
  v_group_currency TEXT;
BEGIN
  -- 1. Validate Caller
  IF NOT public.has_group_permission(p_group_id, v_caller, 'none') THEN
     RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- 2. Concurrency Control (Advisory Lock on Event)
  PERFORM pg_advisory_xact_lock(hashtext('m9_event_' || p_event_id::text));

  -- 3. Fetch Domain Entities
  SELECT * INTO v_event FROM public.events WHERE id = p_event_id AND group_id = p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'EVENT_NOT_FOUND'; END IF;

  SELECT * INTO v_tier FROM public.ticket_tiers WHERE id = p_tier_id AND event_id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'TIER_NOT_FOUND'; END IF;

  SELECT * INTO v_member FROM public.memberships WHERE id = p_membership_id AND group_id = p_group_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'MEMBER_NOT_FOUND'; END IF;

  SELECT currency INTO v_group_currency FROM public.groups WHERE id = p_group_id;

  -- 4. Temporal Defense (Sales Windows)
  IF (v_tier.sales_start IS NOT NULL AND now() < v_tier.sales_start) OR
     (v_tier.sales_end IS NOT NULL AND now() > v_tier.sales_end) THEN
     RAISE EXCEPTION 'TIER_SALES_CLOSED';
  END IF;

  -- 5. Capacity Overbooking Defense
  SELECT count(*) INTO v_sold_tier FROM public.ticket_purchases WHERE tier_id = p_tier_id AND status = 'completed';
  IF v_tier.capacity IS NOT NULL AND v_sold_tier >= v_tier.capacity THEN
     RAISE EXCEPTION 'TIER_SOLD_OUT';
  END IF;

  SELECT count(*) INTO v_sold_event FROM public.ticket_purchases WHERE event_id = p_event_id AND status = 'completed';
  IF v_event.capacity IS NOT NULL AND v_sold_event >= v_event.capacity THEN
     RAISE EXCEPTION 'EVENT_AT_CAPACITY';
  END IF;

  v_purchase_id := gen_random_uuid();

  -- 6. F3 Ledger Defense
  IF v_tier.price > 0 THEN
    -- Explicitly verify custody account
    IF p_account_id IS NULL THEN
      RAISE EXCEPTION 'ACCOUNT_NOT_FOUND_OR_INACTIVE';
    END IF;

    -- Resolve Income Account fallback chain
    SELECT id INTO v_income_account_id FROM public.financial_accounts
    WHERE group_id = p_group_id AND code = 'event_income' AND status = 'active' AND currency = v_group_currency;
    
    IF v_income_account_id IS NULL THEN
       -- Fallback to general operations
       SELECT id INTO v_income_account_id FROM public.financial_accounts
       WHERE group_id = p_group_id AND kind = 'revenue' AND status = 'active' AND currency = v_group_currency
       ORDER BY created_at ASC LIMIT 1;
    END IF;

    IF v_income_account_id IS NULL THEN
       RAISE EXCEPTION 'EVENT_TICKET_INCOME_ACCOUNT_NOT_CONFIGURED';
    END IF;

    -- Dispatch F3 atomic double-entry Command
    PERFORM financial_core.post_f3_command(jsonb_build_object(
      'group_id', p_group_id,
      'initiated_by', v_caller,
      'currency', v_group_currency,
      'intent', 'ticket_purchase',
      'idempotency_key', 'm9_ticket_' || v_purchase_id,
      'description', 'Ticket: ' || v_event.title || ' (' || v_tier.name || ')',
      'lines', jsonb_build_array(
         jsonb_build_object('account_id', p_account_id, 'direction', 'DEBIT', 'amount', v_tier.price),
         jsonb_build_object('account_id', v_income_account_id, 'direction', 'CREDIT', 'amount', v_tier.price)
      )
    ));
  END IF;

  -- 7. Persist Domain Intent
  INSERT INTO public.ticket_purchases (id, event_id, tier_id, membership_id, amount_paid, currency, status)
  VALUES (v_purchase_id, p_event_id, p_tier_id, p_membership_id, v_tier.price, v_group_currency, 'completed');

  RETURN jsonb_build_object('ok', true, 'purchase_id', v_purchase_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.post_ticket_purchase TO authenticated;

-- Hardened Record Attendance
CREATE OR REPLACE FUNCTION public.record_event_attendance(
  p_event_id UUID,
  p_membership_id UUID,
  p_group_id UUID,
  p_status public.attendance_status,
  p_checkin_method public.checkin_method DEFAULT 'manual'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_existing UUID;
BEGIN
  -- 1. Validate Caller
  IF NOT public.has_group_permission(p_group_id, v_caller, 'manage_attendance') THEN
     IF v_caller != (SELECT user_id FROM public.memberships WHERE id = p_membership_id) THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
     END IF;
  END IF;

  -- 2. Concurrency Lock
  PERFORM pg_advisory_xact_lock(hashtext('m9_attendance_' || p_event_id::text || '_' || p_membership_id::text));

  -- 3. State Upsert
  INSERT INTO public.event_attendances (event_id, membership_id, status, checked_in_via, checked_in_at, marked_by)
  VALUES (p_event_id, p_membership_id, p_status, p_checkin_method, now(), v_caller)
  ON CONFLICT (event_id, membership_id) DO UPDATE
  SET status = EXCLUDED.status,
      checked_in_via = EXCLUDED.checked_in_via,
      checked_in_at = EXCLUDED.checked_in_at,
      marked_by = EXCLUDED.marked_by,
      updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_event_attendance TO authenticated;

-- Hardened Upsert Event (Management)
CREATE OR REPLACE FUNCTION public.manage_event(
  p_group_id UUID,
  p_payload jsonb,
  p_event_id UUID DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_new_id UUID;
BEGIN
  -- 1. Authorization
  IF NOT public.has_group_permission(p_group_id, v_caller, 'manage_events') THEN
     RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_event_id IS NULL THEN
     INSERT INTO public.events (
       group_id, title, description, location, event_type, starts_at, ends_at, capacity, created_by
     ) VALUES (
       p_group_id,
       p_payload->>'title',
       p_payload->>'description',
       p_payload->>'location',
       (p_payload->>'event_type')::public.event_type,
       (p_payload->>'starts_at')::TIMESTAMPTZ,
       (p_payload->>'ends_at')::TIMESTAMPTZ,
       (p_payload->>'capacity')::INTEGER,
       v_caller
     ) RETURNING id INTO v_new_id;
  ELSE
     PERFORM pg_advisory_xact_lock(hashtext('m9_event_' || p_event_id::text));
     UPDATE public.events SET
       title = p_payload->>'title',
       description = p_payload->>'description',
       location = p_payload->>'location',
       event_type = (p_payload->>'event_type')::public.event_type,
       starts_at = (p_payload->>'starts_at')::TIMESTAMPTZ,
       ends_at = (p_payload->>'ends_at')::TIMESTAMPTZ,
       capacity = (p_payload->>'capacity')::INTEGER,
       status = COALESCE((p_payload->>'status')::public.event_status, status)
     WHERE id = p_event_id AND group_id = p_group_id;
     v_new_id := p_event_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'event_id', v_new_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.manage_event TO authenticated;

-- Delete Event
CREATE OR REPLACE FUNCTION public.delete_event(
  p_group_id UUID,
  p_event_id UUID
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF NOT public.has_group_permission(p_group_id, v_caller, 'manage_events') THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;
  
  DELETE FROM public.events WHERE id = p_event_id AND group_id = p_group_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_event TO authenticated;

-- Hardened Record RSVP
CREATE OR REPLACE FUNCTION public.record_event_rsvp(
  p_event_id UUID,
  p_membership_id UUID,
  p_group_id UUID,
  p_response public.rsvp_response
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  IF NOT public.has_group_permission(p_group_id, v_caller, 'none') THEN
     RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('m9_rsvp_' || p_event_id::text || '_' || p_membership_id::text));

  INSERT INTO public.event_rsvps (event_id, membership_id, response, responded_at)
  VALUES (p_event_id, p_membership_id, p_response, now())
  ON CONFLICT (event_id, membership_id) DO UPDATE
  SET response = EXCLUDED.response,
      responded_at = EXCLUDED.responded_at,
      updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_event_rsvp TO authenticated;
