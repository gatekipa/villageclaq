-- Existing 00130 ticket caller used nonexistent financial_accounts.code/kind
-- and the wrong F3 signature. Bind a durable ticket request to the approved
-- module occurrence adapter; purchase and ledger commit in one transaction.
ALTER TABLE public.ticket_purchases
  ADD COLUMN request_id uuid,
  ADD COLUMN actor_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN account_id uuid REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN category_id uuid REFERENCES public.financial_categories(id) ON DELETE RESTRICT,
  ADD COLUMN financial_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT;
UPDATE public.ticket_purchases SET request_id=id WHERE request_id IS NULL;
ALTER TABLE public.ticket_purchases ALTER COLUMN request_id SET NOT NULL;
CREATE UNIQUE INDEX ticket_purchases_request_unique ON public.ticket_purchases(request_id);
ALTER TABLE public.ticket_purchases
  DROP CONSTRAINT ticket_purchases_event_id_fkey,
  ADD CONSTRAINT ticket_purchases_event_id_fkey FOREIGN KEY(event_id)
    REFERENCES public.events(id) ON DELETE RESTRICT,
  DROP CONSTRAINT ticket_purchases_tier_id_fkey,
  ADD CONSTRAINT ticket_purchases_tier_id_fkey FOREIGN KEY(tier_id)
    REFERENCES public.ticket_tiers(id) ON DELETE RESTRICT,
  DROP CONSTRAINT ticket_purchases_membership_id_fkey,
  ADD CONSTRAINT ticket_purchases_membership_id_fkey FOREIGN KEY(membership_id)
    REFERENCES public.memberships(id) ON DELETE RESTRICT;
DROP POLICY IF EXISTS "Group members can view ticket purchases" ON public.ticket_purchases;
CREATE POLICY ticket_purchase_actor_or_manager ON public.ticket_purchases FOR SELECT
  TO authenticated USING (
    actor_id=auth.uid() OR EXISTS (
      SELECT 1 FROM public.events e WHERE e.id=ticket_purchases.event_id
        AND public.has_group_permission(e.group_id,'events.manage')));
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.ticket_purchases FROM PUBLIC,anon,authenticated;
DROP POLICY IF EXISTS "Group members can view ticket tiers" ON public.ticket_tiers;
CREATE POLICY active_member_ticket_tiers ON public.ticket_tiers FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM public.events e JOIN public.memberships m
      ON m.group_id=e.group_id
    WHERE e.id=ticket_tiers.event_id AND m.user_id=auth.uid()
      AND m.membership_status='active' AND m.standing<>'banned'));
DROP POLICY IF EXISTS "Group admins can manage ticket tiers" ON public.ticket_tiers;
CREATE POLICY event_manager_ticket_tiers ON public.ticket_tiers FOR ALL
  TO authenticated USING (EXISTS (
    SELECT 1 FROM public.events e WHERE e.id=ticket_tiers.event_id
      AND public.has_group_permission(e.group_id,'events.manage')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e WHERE e.id=ticket_tiers.event_id
      AND public.has_group_permission(e.group_id,'events.manage')));
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER
  ON public.ticket_tiers FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_ticket_tier(
  p_event uuid,p_name text,p_price numeric,p_capacity integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_event public.events%ROWTYPE; v_currency text; v_id uuid;
BEGIN
  SELECT * INTO v_event FROM public.events WHERE id=p_event FOR SHARE;
  IF v_event.id IS NULL OR v_event.status='cancelled'
    OR v_event.starts_at<=now()
    THEN RAISE EXCEPTION 'EVENT_NOT_AVAILABLE'; END IF;
  IF NOT public.has_group_permission(v_event.group_id,'events.manage')
    OR (p_price>0 AND NOT public.has_group_permission(
      v_event.group_id,'finances.manage'))
    THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT currency INTO v_currency FROM public.groups WHERE id=v_event.group_id;
  IF nullif(trim(p_name),'') IS NULL OR length(trim(p_name))>120
    OR p_price IS NULL OR p_price<0 OR p_price<>
      round(p_price,financial_core.currency_scale(v_currency))
    OR (p_capacity IS NOT NULL AND p_capacity<=0)
    THEN RAISE EXCEPTION 'INVALID_TICKET_TIER'; END IF;
  INSERT INTO public.ticket_tiers(event_id,name,price,capacity)
    VALUES(p_event,trim(p_name),p_price,p_capacity) RETURNING id INTO v_id;
  RETURN v_id;
END
$$;
REVOKE ALL ON FUNCTION public.create_ticket_tier(uuid,text,numeric,integer)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_ticket_tier(uuid,text,numeric,integer)
  TO authenticated;

REVOKE ALL ON FUNCTION public.post_ticket_purchase(uuid,uuid,uuid,uuid,uuid)
  FROM PUBLIC,anon,authenticated,service_role;
DROP FUNCTION public.post_ticket_purchase(uuid,uuid,uuid,uuid,uuid);

CREATE OR REPLACE FUNCTION public.post_ticket_purchase(
  p_request uuid,p_event_id uuid,p_tier_id uuid,p_membership_id uuid,
  p_account_id uuid,p_category_id uuid,p_group_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_event public.events%ROWTYPE; v_tier public.ticket_tiers%ROWTYPE;
  v_existing public.ticket_purchases%ROWTYPE; v_currency text;
  v_sold_tier int; v_sold_event int; v_result jsonb; v_when timestamptz:=now();
  v_event_id uuid;
BEGIN
  IF auth.uid() IS NULL OR p_request IS NULL OR p_group_id IS NULL
    OR NOT public.has_group_permission(p_group_id,'events.manage')
    THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('m9_event_'||p_event_id::text));
  -- A revoked manager waiting on capacity/identity lock cannot post.
  PERFORM 1 FROM public.memberships m
    WHERE m.group_id=p_group_id AND m.user_id=auth.uid() FOR SHARE;
  IF NOT public.has_group_permission(p_group_id,'events.manage')
    THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_existing FROM public.ticket_purchases
    WHERE request_id=p_request FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.events e
        WHERE e.id=v_existing.event_id AND e.group_id=p_group_id)
      OR v_existing.event_id<>p_event_id OR v_existing.tier_id<>p_tier_id
      OR v_existing.membership_id<>p_membership_id
      OR v_existing.actor_id<>auth.uid()
      OR v_existing.account_id IS DISTINCT FROM p_account_id
      OR v_existing.category_id IS DISTINCT FROM p_category_id
      THEN RAISE EXCEPTION 'TICKET_IDENTITY_CONFLICT'; END IF;
    RETURN jsonb_build_object('ok',true,'decision','ALREADY_POSTED',
      'purchase_id',v_existing.id,'financial_event_id',v_existing.financial_event_id);
  END IF;
  SELECT * INTO v_event FROM public.events WHERE id=p_event_id AND group_id=p_group_id;
  SELECT * INTO v_tier FROM public.ticket_tiers
    WHERE id=p_tier_id AND event_id=p_event_id;
  IF v_event.id IS NULL OR v_tier.id IS NULL
    THEN RAISE EXCEPTION 'EVENT_OR_TIER_NOT_FOUND'; END IF;
  IF v_event.status='cancelled' OR v_event.starts_at<=now()
    THEN RAISE EXCEPTION 'EVENT_NOT_AVAILABLE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.memberships m WHERE m.id=p_membership_id
    AND m.group_id=p_group_id AND m.membership_status='active')
    THEN RAISE EXCEPTION 'MEMBER_NOT_ACTIVE'; END IF;
  SELECT currency INTO v_currency FROM public.groups WHERE id=p_group_id;
  IF (v_tier.sales_start IS NOT NULL AND now()<v_tier.sales_start)
    OR (v_tier.sales_end IS NOT NULL AND now()>v_tier.sales_end)
    THEN RAISE EXCEPTION 'TIER_SALES_CLOSED'; END IF;
  SELECT count(*) INTO v_sold_tier FROM public.ticket_purchases
    WHERE tier_id=p_tier_id AND status='completed';
  SELECT count(*) INTO v_sold_event FROM public.ticket_purchases
    WHERE event_id=p_event_id AND status='completed';
  IF (v_tier.capacity IS NOT NULL AND v_sold_tier>=v_tier.capacity)
    OR (v_event.capacity IS NOT NULL AND v_sold_event>=v_event.capacity)
    THEN RAISE EXCEPTION 'TICKET_SOLD_OUT'; END IF;
  IF v_tier.price>0 THEN
    IF p_account_id IS NULL OR p_category_id IS NULL
      THEN RAISE EXCEPTION 'TICKET_FINANCIAL_DIMENSIONS_REQUIRED'; END IF;
    v_result:=financial_core.post_module_pair(
      p_group_id,'events',p_request::text,'ticket_receipt',v_tier.price,
      v_currency,p_account_id,p_category_id,NULL,p_membership_id,v_when,
      'Ticket: '||v_event.title||' ('||v_tier.name||')');
    v_event_id:=(v_result->>'event_id')::uuid;
  ELSIF p_account_id IS NOT NULL OR p_category_id IS NOT NULL THEN
    RAISE EXCEPTION 'FREE_TICKET_FINANCIAL_DIMENSIONS';
  END IF;
  INSERT INTO public.ticket_purchases
    (id,request_id,event_id,tier_id,membership_id,amount_paid,currency,
     actor_id,account_id,category_id,financial_event_id)
  VALUES(p_request,p_request,p_event_id,p_tier_id,p_membership_id,
    v_tier.price,v_currency,auth.uid(),p_account_id,p_category_id,v_event_id);
  RETURN jsonb_build_object('ok',true,'decision','POSTED',
    'purchase_id',p_request,'financial_event_id',v_event_id);
END
$$;
REVOKE ALL ON FUNCTION public.post_ticket_purchase(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_ticket_purchase(
  uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_own_ticket_purchases(p_group uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rows jsonb;
BEGIN
  IF NOT public.has_group_permission(p_group,'events.manage')
    THEN RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'request_id',p.request_id,'event_id',p.event_id,'tier_id',p.tier_id,
    'membership_id',p.membership_id,'amount',p.amount_paid::text,
    'currency',p.currency,'financial_event_id',p.financial_event_id,
    'purchased_at',p.purchased_at) ORDER BY p.purchased_at DESC),
    '[]'::jsonb) INTO v_rows
  FROM public.ticket_purchases p JOIN public.events e ON e.id=p.event_id
  WHERE e.group_id=p_group AND p.actor_id=auth.uid();
  RETURN v_rows;
END
$$;
REVOKE ALL ON FUNCTION public.list_own_ticket_purchases(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_own_ticket_purchases(uuid) TO authenticated;
