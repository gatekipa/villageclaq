-- R-005: claim decisions are versioned, server authorized and immutable.
BEGIN;
ALTER TABLE public.relief_claims
  ADD COLUMN decision_version integer NOT NULL DEFAULT 0
    CHECK (decision_version >= 0);

CREATE TABLE public.relief_claim_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.relief_claims(id) ON DELETE RESTRICT,
  decision_version integer NOT NULL CHECK (decision_version > 0),
  prior_status public.relief_claim_status NOT NULL,
  new_status public.relief_claim_status NOT NULL,
  actor_id uuid NOT NULL,
  request_id uuid UNIQUE,
  command_payload jsonb NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (claim_id,decision_version)
);
CREATE INDEX relief_claim_decisions_claim_order
  ON public.relief_claim_decisions(claim_id,decision_version);
ALTER TABLE public.relief_claim_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.relief_claim_decisions FROM PUBLIC,anon,authenticated;

-- Older policies and default grants allowed a reviewer to rewrite dimensions,
-- decision facts and even remove an unpaid claim. Payout and decision RPCs run
-- as the owning database role and retain their existing server-side checks.
DROP POLICY IF EXISTS relief_claims_update ON public.relief_claims;
DROP POLICY IF EXISTS relief_claims_delete ON public.relief_claims;
REVOKE UPDATE,DELETE ON public.relief_claims FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_relief_claim_initial_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status<>'submitted' OR NEW.decision_version<>0
     OR NEW.amount_approved IS NOT NULL OR NEW.reviewed_by IS NOT NULL
     OR NEW.reviewed_at IS NOT NULL OR NEW.financial_event_id IS NOT NULL
     OR NEW.payout_account_id IS NOT NULL OR NEW.disbursed_at IS NOT NULL
  THEN RAISE EXCEPTION 'RELIEF_CLAIM_INITIAL_STATE_CONFLICT'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_guard_relief_claim_initial_state
  BEFORE INSERT ON public.relief_claims FOR EACH ROW
  EXECUTE FUNCTION public.guard_relief_claim_initial_state();

CREATE OR REPLACE FUNCTION public.guard_relief_claim_decision_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status='paid' AND OLD.status='approved' THEN
      NEW.decision_version:=OLD.decision_version+1;
    ELSIF current_setting('app.relief_decision_rpc',true)='on'
       AND NEW.decision_version=OLD.decision_version+1 THEN
      NULL;
    ELSE
      RAISE EXCEPTION 'RELIEF_CLAIM_TRANSITION_NOT_AUTHORIZED';
    END IF;
  ELSIF NEW.decision_version IS DISTINCT FROM OLD.decision_version THEN
    RAISE EXCEPTION 'RELIEF_CLAIM_VERSION_CONFLICT';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_guard_relief_claim_decision_version
  BEFORE UPDATE ON public.relief_claims FOR EACH ROW
  EXECUTE FUNCTION public.guard_relief_claim_decision_version();

-- The existing payout RPC changes approved -> paid within its financial
-- transaction. Its status and financial link receive history in that same
-- transaction; a failed audit/ledger write cannot leave a paid decision.
CREATE OR REPLACE FUNCTION public.record_relief_paid_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.status='paid' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.relief_claim_decisions
      (claim_id,decision_version,prior_status,new_status,actor_id,command_payload)
    VALUES (NEW.id,NEW.decision_version,OLD.status,NEW.status,auth.uid(),
      pg_catalog.jsonb_build_object('financial_event_id',NEW.financial_event_id,
        'payout_account_id',NEW.payout_account_id,
        'amount_approved',NEW.amount_approved));
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_record_relief_paid_decision
  AFTER UPDATE ON public.relief_claims FOR EACH ROW
  EXECUTE FUNCTION public.record_relief_paid_decision();

CREATE OR REPLACE FUNCTION public.decide_relief_claim(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_claim public.relief_claims%ROWTYPE;
        v_plan public.relief_plans%ROWTYPE;
        v_previous public.relief_claim_decisions%ROWTYPE;
        v_actor uuid:=auth.uid();
        v_claim_id uuid; v_request_id uuid; v_expected integer;
        v_status text; v_amount numeric; v_notes text; v_payload jsonb;
        v_is_claimant boolean;
BEGIN
  IF v_actor IS NULL OR p_command IS NULL
     OR p_command->>'group_id' IS NULL
     OR p_command->>'claim_id' IS NULL
     OR p_command->>'request_id' IS NULL
     OR p_command->>'expected_version' IS NULL
     OR p_command->>'status' IS NULL
  THEN RAISE EXCEPTION 'INVALID_CLAIM_DECISION'; END IF;
  v_claim_id:=(p_command->>'claim_id')::uuid;
  v_request_id:=(p_command->>'request_id')::uuid;
  v_expected:=(p_command->>'expected_version')::integer;
  v_status:=p_command->>'status';
  IF v_expected<0 OR v_status NOT IN ('reviewing','approved','rejected','withdrawn')
  THEN RAISE EXCEPTION 'INVALID_CLAIM_DECISION'; END IF;
  v_notes:=NULLIF(pg_catalog.btrim(p_command->>'review_notes'),'');
  IF v_status='approved' THEN
    v_amount:=(p_command->>'amount_approved')::numeric;
  ELSIF p_command ? 'amount_approved' AND p_command->>'amount_approved' IS NOT NULL
  THEN RAISE EXCEPTION 'INVALID_CLAIM_DECISION'; END IF;
  SELECT * INTO v_claim FROM public.relief_claims
    WHERE id=v_claim_id FOR UPDATE;
  IF v_claim.id IS NULL THEN RAISE EXCEPTION 'CLAIM_NOT_FOUND'; END IF;
  SELECT * INTO v_plan FROM public.relief_plans
    WHERE id=v_claim.plan_id FOR SHARE;
  IF v_plan.id IS NULL OR v_plan.group_id IS DISTINCT FROM v_claim.group_id
     OR v_claim.group_id IS DISTINCT FROM (p_command->>'group_id')::uuid
  THEN RAISE EXCEPTION 'RELIEF_CLAIM_DIMENSION_CONFLICT'; END IF;
  SELECT EXISTS (SELECT 1 FROM public.memberships m
    WHERE m.id=v_claim.claimant_membership_id AND m.user_id=v_actor
      AND m.membership_status='active') INTO v_is_claimant;
  IF v_status='withdrawn' THEN
    IF NOT v_is_claimant THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  ELSIF NOT public.has_group_permission(v_plan.group_id,'relief.manage',v_actor)
  THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  v_payload:=pg_catalog.jsonb_build_object('group_id',v_claim.group_id,
    'claim_id',v_claim_id,
    'expected_version',v_expected,'status',v_status,
    'amount_approved',v_amount,'review_notes',v_notes);
  SELECT * INTO v_previous FROM public.relief_claim_decisions
    WHERE request_id=v_request_id;
  IF v_previous.id IS NOT NULL THEN
    IF v_previous.claim_id<>v_claim_id OR v_previous.command_payload<>v_payload
       OR v_previous.actor_id<>v_actor
    THEN RAISE EXCEPTION 'CLAIM_DECISION_IDENTITY_CONFLICT'; END IF;
    RETURN pg_catalog.jsonb_build_object('claim_id',v_claim_id,
      'decision_version',v_previous.decision_version,
      'status',v_previous.new_status,'decision','recovered');
  END IF;
  IF v_claim.decision_version<>v_expected THEN
    RAISE EXCEPTION 'CLAIM_DECISION_VERSION_CONFLICT'; END IF;
  IF v_claim.status NOT IN ('submitted','reviewing') OR
     (v_status='reviewing' AND v_claim.status<>'submitted')
  THEN RAISE EXCEPTION 'CLAIM_DECISION_TRANSITION_CONFLICT'; END IF;
  IF v_status='approved' AND
     (v_amount IS NULL OR v_amount<=0 OR v_amount>v_claim.amount_requested)
  THEN RAISE EXCEPTION 'INVALID_APPROVED_AMOUNT'; END IF;
  PERFORM pg_catalog.set_config('app.relief_decision_rpc','on',true);
  UPDATE public.relief_claims SET
    status=v_status::public.relief_claim_status,
    amount_approved=v_amount,review_notes=v_notes,
    reviewed_by=CASE WHEN v_status='withdrawn' THEN NULL ELSE v_actor END,
    reviewed_at=transaction_timestamp(),updated_at=transaction_timestamp(),
    decision_version=v_expected+1
  WHERE id=v_claim_id;
  INSERT INTO public.relief_claim_decisions
    (claim_id,decision_version,prior_status,new_status,actor_id,request_id,
     command_payload)
  VALUES (v_claim_id,v_expected+1,v_claim.status,
    v_status::public.relief_claim_status,v_actor,v_request_id,v_payload);
  RETURN pg_catalog.jsonb_build_object('claim_id',v_claim_id,
    'decision_version',v_expected+1,'status',v_status,'decision','posted');
END
$$;
REVOKE ALL ON FUNCTION public.decide_relief_claim(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.decide_relief_claim(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_relief_claim_decisions(p_claim_id uuid)
RETURNS SETOF public.relief_claim_decisions LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $$
DECLARE v_claim public.relief_claims%ROWTYPE; v_plan public.relief_plans%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_claim FROM public.relief_claims WHERE id=p_claim_id;
  IF v_claim.id IS NULL THEN RAISE EXCEPTION 'CLAIM_NOT_FOUND'; END IF;
  SELECT * INTO v_plan FROM public.relief_plans WHERE id=v_claim.plan_id;
  IF NOT EXISTS (SELECT 1 FROM public.memberships m
        WHERE m.id=v_claim.claimant_membership_id AND m.user_id=auth.uid())
     AND NOT public.has_group_permission(v_plan.group_id,'relief.manage',auth.uid())
  THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY SELECT * FROM public.relief_claim_decisions d
    WHERE d.claim_id=p_claim_id ORDER BY d.decision_version;
END
$$;
REVOKE ALL ON FUNCTION public.list_relief_claim_decisions(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_relief_claim_decisions(uuid)
  TO authenticated;
COMMIT;
