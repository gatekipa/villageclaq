-- R-006/R-009: delegated expense may reduce only the owner's recognized
-- receivable in the selected restricted fund. Pending branch remittances
-- reserve agency custody even before the owner chooses a receiving fund.
BEGIN;
CREATE FUNCTION financial_core.relief_owner_fund_available(
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
        AND payout.owner_fund_id=p_owner_fund),0);
$$;
REVOKE ALL ON FUNCTION financial_core.relief_owner_fund_available(
  uuid,uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION financial_core.guard_relief_delegated_owner_fund()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.amount>financial_core.relief_owner_fund_available(
      NEW.plan_id,NEW.branch_group_id,NEW.owner_group_id,
      NEW.branch_fund_id,NEW.owner_fund_id)
  THEN RAISE EXCEPTION 'DELEGATED_OWNER_FUND_RECEIVABLE_INSUFFICIENT'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER relief_delegated_owner_fund_reserve
  BEFORE INSERT ON financial_core.relief_delegated_payouts
  FOR EACH ROW EXECUTE FUNCTION financial_core.guard_relief_delegated_owner_fund();
REVOKE ALL ON FUNCTION financial_core.guard_relief_delegated_owner_fund()
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
