-- R-006/R-009: unresolved conditional cash is remittable agency custody,
-- not spendable claim income. All settlement effects link to the receipt.
BEGIN;
CREATE TABLE financial_core.relief_credit_settlements (
  payment_id uuid PRIMARY KEY REFERENCES public.payments(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('recognize','refund')),
  receipt_event_id uuid NOT NULL REFERENCES public.financial_events(id)
    ON DELETE RESTRICT,
  owner_initial_event_id uuid REFERENCES public.financial_events(id)
    ON DELETE RESTRICT,
  owner_effect_event_id uuid NOT NULL UNIQUE REFERENCES public.financial_events(id)
    ON DELETE RESTRICT,
  branch_effect_event_id uuid UNIQUE REFERENCES public.financial_events(id)
    ON DELETE RESTRICT,
  payer_group_id uuid REFERENCES public.groups(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  settled_at timestamptz NOT NULL,
  CHECK ((action='recognize' AND branch_effect_event_id IS NULL
      AND payer_group_id IS NULL)
    OR (action='refund' AND payer_group_id IS NOT NULL))
);
ALTER TABLE financial_core.relief_credit_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.relief_credit_settlements
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION financial_core.relief_agency_available(
  p_plan uuid,p_branch uuid,p_owner uuid,p_fund uuid)
RETURNS numeric LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_receipts numeric; v_remitted numeric; v_paid numeric;
  v_refunded numeric;
BEGIN
  SELECT coalesce(sum(payment.amount),0) INTO v_receipts
  FROM financial_core.relief_agency_receipts link
  JOIN public.payments payment ON payment.id=link.payment_id
  JOIN financial_core.posting_command_payloads payload
    ON payload.event_id=link.branch_event_id
  WHERE link.plan_id=p_plan AND link.branch_group_id=p_branch
    AND link.owner_group_id=p_owner AND link.owner_event_id IS NOT NULL
    AND (p_fund IS NULL OR payload.canonical_payload->>'fund_id'=p_fund::text);
  SELECT coalesce(sum(remittance.amount),0) INTO v_remitted
  FROM public.relief_remittances remittance
  WHERE remittance.relief_plan_id=p_plan
    AND remittance.branch_group_id=p_branch
    AND remittance.owner_group_id=p_owner
    AND remittance.branch_event_id IS NOT NULL
    AND (p_fund IS NULL OR remittance.branch_fund_id=p_fund);
  SELECT coalesce(sum(payout.amount),0) INTO v_paid
  FROM financial_core.relief_delegated_payouts payout
  WHERE payout.plan_id=p_plan AND payout.branch_group_id=p_branch
    AND payout.owner_group_id=p_owner
    AND (p_fund IS NULL OR payout.branch_fund_id=p_fund);
  SELECT coalesce(sum(payment.amount),0) INTO v_refunded
  FROM financial_core.relief_credit_settlements settlement
  JOIN financial_core.relief_agency_receipts link
    ON link.payment_id=settlement.payment_id
  JOIN public.payments payment ON payment.id=settlement.payment_id
  JOIN financial_core.posting_command_payloads payload
    ON payload.event_id=link.branch_event_id
  WHERE link.plan_id=p_plan AND link.branch_group_id=p_branch
    AND link.owner_group_id=p_owner
    AND settlement.action='refund'
    AND settlement.branch_effect_event_id IS NOT NULL
    AND (p_fund IS NULL OR payload.canonical_payload->>'fund_id'=p_fund::text);
  RETURN v_receipts-v_remitted-v_paid-v_refunded;
END
$$;
REVOKE ALL ON FUNCTION financial_core.relief_agency_available(
  uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION financial_core.relief_agency_payout_available(
  p_plan uuid,p_branch uuid,p_owner uuid,p_fund uuid)
RETURNS numeric LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_receipts numeric; v_remitted numeric; v_paid numeric;
BEGIN
  SELECT coalesce(sum(payment.amount),0) INTO v_receipts
  FROM financial_core.relief_agency_receipts link
  JOIN public.payments payment ON payment.id=link.payment_id
  JOIN financial_core.posting_command_payloads payload
    ON payload.event_id=link.branch_event_id
  WHERE link.plan_id=p_plan AND link.branch_group_id=p_branch
    AND link.owner_group_id=p_owner AND link.owner_event_id IS NOT NULL
    AND (payment.cash_class='non_refundable'
      OR payment.settlement_status='recognized')
    AND (p_fund IS NULL OR payload.canonical_payload->>'fund_id'=p_fund::text);
  SELECT coalesce(sum(remittance.amount),0) INTO v_remitted
  FROM public.relief_remittances remittance
  WHERE remittance.relief_plan_id=p_plan
    AND remittance.branch_group_id=p_branch
    AND remittance.owner_group_id=p_owner
    AND remittance.branch_event_id IS NOT NULL
    AND (p_fund IS NULL OR remittance.branch_fund_id=p_fund);
  SELECT coalesce(sum(payout.amount),0) INTO v_paid
  FROM financial_core.relief_delegated_payouts payout
  WHERE payout.plan_id=p_plan AND payout.branch_group_id=p_branch
    AND payout.owner_group_id=p_owner
    AND (p_fund IS NULL OR payout.branch_fund_id=p_fund);
  -- A linked refund consumes its unresolved receipt, not another receipt's
  -- recognized balance. Unallocated remittances remain conservative.
  RETURN LEAST(v_receipts-v_remitted-v_paid,
    financial_core.relief_agency_available(p_plan,p_branch,p_owner,p_fund));
END
$$;
REVOKE ALL ON FUNCTION financial_core.relief_agency_payout_available(
  uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION financial_core.relief_owner_fund_available(
  p_plan uuid,p_branch uuid,p_owner uuid,p_branch_fund uuid,p_owner_fund uuid)
RETURNS numeric LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT
    coalesce((SELECT sum(payment.amount)
      FROM financial_core.relief_agency_receipts receipt
      JOIN public.payments payment ON payment.id=receipt.payment_id
      JOIN financial_core.posting_command_payloads branch_payload
        ON branch_payload.event_id=receipt.branch_event_id
      JOIN financial_core.posting_command_payloads owner_payload
        ON owner_payload.event_id=receipt.owner_event_id
      WHERE receipt.plan_id=p_plan AND receipt.branch_group_id=p_branch
        AND receipt.owner_group_id=p_owner
        AND branch_payload.canonical_payload->>'fund_id'=p_branch_fund::text
        AND owner_payload.canonical_payload->>'fund_id'=p_owner_fund::text),0)
    - coalesce((SELECT sum(remittance.amount)
      FROM public.relief_remittances remittance
      WHERE remittance.relief_plan_id=p_plan
        AND remittance.branch_group_id=p_branch
        AND remittance.owner_group_id=p_owner
        AND remittance.branch_fund_id=p_branch_fund
        AND remittance.branch_event_id IS NOT NULL),0)
    - coalesce((SELECT sum(payout.amount)
      FROM financial_core.relief_delegated_payouts payout
      WHERE payout.plan_id=p_plan AND payout.branch_group_id=p_branch
        AND payout.owner_group_id=p_owner
        AND payout.branch_fund_id=p_branch_fund
        AND payout.owner_fund_id=p_owner_fund),0)
    - coalesce((SELECT sum(payment.amount)
      FROM financial_core.relief_credit_settlements settlement
      JOIN financial_core.relief_agency_receipts receipt
        ON receipt.payment_id=settlement.payment_id
      JOIN public.payments payment ON payment.id=settlement.payment_id
      JOIN financial_core.posting_command_payloads branch_payload
        ON branch_payload.event_id=receipt.branch_event_id
      JOIN financial_core.posting_command_payloads owner_payload
        ON owner_payload.event_id=receipt.owner_event_id
      WHERE receipt.plan_id=p_plan AND receipt.branch_group_id=p_branch
        AND receipt.owner_group_id=p_owner
        AND settlement.action='refund'
        AND settlement.branch_effect_event_id IS NOT NULL
        AND branch_payload.canonical_payload->>'fund_id'=p_branch_fund::text
        AND owner_payload.canonical_payload->>'fund_id'=p_owner_fund::text),0);
$$;
REVOKE ALL ON FUNCTION financial_core.relief_owner_fund_available(
  uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION financial_core.relief_owner_payout_available(
  p_plan uuid,p_branch uuid,p_owner uuid,p_branch_fund uuid,p_owner_fund uuid)
RETURNS numeric LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
  SELECT coalesce((SELECT sum(payment.amount)
      FROM financial_core.relief_agency_receipts receipt
      JOIN public.payments payment ON payment.id=receipt.payment_id
      JOIN financial_core.posting_command_payloads branch_payload
        ON branch_payload.event_id=receipt.branch_event_id
      JOIN financial_core.posting_command_payloads owner_payload
        ON owner_payload.event_id=receipt.owner_event_id
      WHERE receipt.plan_id=p_plan AND receipt.branch_group_id=p_branch
        AND receipt.owner_group_id=p_owner
        AND (payment.cash_class='non_refundable'
          OR payment.settlement_status='recognized')
        AND branch_payload.canonical_payload->>'fund_id'=p_branch_fund::text
        AND owner_payload.canonical_payload->>'fund_id'=p_owner_fund::text),0)
    - coalesce((SELECT sum(remittance.amount)
      FROM public.relief_remittances remittance
      WHERE remittance.relief_plan_id=p_plan
        AND remittance.branch_group_id=p_branch
        AND remittance.owner_group_id=p_owner
        AND remittance.branch_fund_id=p_branch_fund
        AND remittance.branch_event_id IS NOT NULL),0)
    - coalesce((SELECT sum(payout.amount)
      FROM financial_core.relief_delegated_payouts payout
      WHERE payout.plan_id=p_plan AND payout.branch_group_id=p_branch
        AND payout.owner_group_id=p_owner
        AND payout.branch_fund_id=p_branch_fund
        AND payout.owner_fund_id=p_owner_fund),0);
$$;
REVOKE ALL ON FUNCTION financial_core.relief_owner_payout_available(
  uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION financial_core.guard_relief_delegated_owner_fund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.amount>financial_core.relief_agency_payout_available(
      NEW.plan_id,NEW.branch_group_id,NEW.owner_group_id,NULL)
     OR NEW.amount>financial_core.relief_agency_payout_available(
      NEW.plan_id,NEW.branch_group_id,NEW.owner_group_id,NEW.branch_fund_id)
     OR NEW.amount>financial_core.relief_owner_payout_available(
      NEW.plan_id,NEW.branch_group_id,NEW.owner_group_id,
      NEW.branch_fund_id,NEW.owner_fund_id)
  THEN RAISE EXCEPTION 'DELEGATED_RECOGNIZED_FUNDS_INSUFFICIENT'; END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION financial_core.guard_relief_delegated_owner_fund()
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
