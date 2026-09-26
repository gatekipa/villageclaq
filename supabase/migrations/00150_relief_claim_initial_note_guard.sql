-- R-005: a new claimant-submitted row cannot carry a forged reviewer note.
-- This focused follow-on retains the already published 00149 migration text.
CREATE OR REPLACE FUNCTION public.guard_relief_claim_initial_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status<>'submitted' OR NEW.decision_version<>0
     OR NEW.amount_approved IS NOT NULL OR NEW.review_notes IS NOT NULL
     OR NEW.reviewed_by IS NOT NULL OR NEW.reviewed_at IS NOT NULL
     OR NEW.financial_event_id IS NOT NULL OR NEW.payout_account_id IS NOT NULL
     OR NEW.disbursed_at IS NOT NULL
  THEN RAISE EXCEPTION 'RELIEF_CLAIM_INITIAL_STATE_CONFLICT'; END IF;
  RETURN NEW;
END
$$;
