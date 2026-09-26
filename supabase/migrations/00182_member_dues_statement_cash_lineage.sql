-- F4-001 / Security Revision 2: a member statement follows dues cash receipts
-- and linked refunds. Recognition/allocation moves no cash and is not another
-- contribution; Relief and other module receipts are separate domains.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_member_contribution_statement(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_group_id uuid;
  v_uid uuid;
  v_member_id uuid;
  v_currency text;
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_is_owner boolean;
  v_has_view boolean;
  v_result jsonb;
  v_transactions jsonb;
  v_total numeric;
BEGIN
  v_uid := auth.uid();
  v_group_id := (p_command->>'group_id')::uuid;
  v_member_id := (p_command->>'membership_id')::uuid;
  v_currency := p_command->>'currency';
  v_start_date := (p_command->>'start_date')::timestamptz;
  v_end_date := COALESCE((p_command->>'end_date')::timestamptz, now());

  SELECT (user_id = v_uid AND membership_status = 'active') INTO v_is_owner
  FROM public.memberships WHERE id = v_member_id AND group_id = v_group_id;
  v_has_view := public.has_group_permission(v_group_id, 'finances.view', v_uid);
  IF v_is_owner IS NOT TRUE AND v_has_view IS NOT TRUE THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = 'INSUFFICIENT_PRIVILEGE';
  END IF;
  IF v_currency IS NULL OR financial_core.currency_scale(v_currency) IS NULL THEN
    RAISE EXCEPTION 'INVALID_CURRENCY' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb), COALESCE(SUM(t.amount), 0)
    INTO v_transactions, v_total
  FROM (
    SELECT e.id AS event_id, e.source_module, e.description,
      e.occurred_at, p.amount_signed AS amount
    FROM public.financial_events e
    JOIN public.financial_postings p ON p.event_id = e.id
    WHERE e.group_id = v_group_id AND e.currency = v_currency
      AND e.status = 'posted' AND e.event_class IN ('money_in','money_out')
      AND p.member_id = v_member_id AND p.control_class = 'custody'
      AND p.amount_signed <> 0
      AND EXISTS (
        SELECT 1 FROM public.payments payment
        WHERE payment.group_id = v_group_id
          AND payment.membership_id = v_member_id
          AND (payment.financial_event_id = e.id OR payment.refund_event_id = e.id)
      )
      AND (v_start_date IS NULL OR e.occurred_at >= v_start_date)
      AND e.occurred_at <= v_end_date
    ORDER BY e.occurred_at ASC, e.id
  ) t;

  v_result := jsonb_build_object(
    'membership_id', v_member_id, 'currency', v_currency,
    'transactions', v_transactions, 'total_contributed', v_total,
    'generated_at', now(), 'start_date', v_start_date,
    'end_date', v_end_date
  );
  RETURN v_result;
END;
$$;
-- CREATE OR REPLACE retains the existing function owner and explicit EXECUTE ACL.
COMMIT;
