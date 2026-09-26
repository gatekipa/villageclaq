-- R-002/R-005: bind decisions and retries to current contracted review authority.
-- Uncontracted plans keep their legacy owner path until R-012.
CREATE OR REPLACE FUNCTION public.can_review_relief_plan(p_plan uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_plan public.relief_plans%ROWTYPE;
  v_scope public.relief_plan_scope_versions%ROWTYPE;
  v_review_group uuid; v_topology bigint;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_plan FROM public.relief_plans WHERE id=p_plan;
  IF v_plan.id IS NULL THEN RETURN false; END IF;
  SELECT * INTO v_scope FROM public.relief_plan_scope_versions
    WHERE plan_id=p_plan AND effective_to IS NULL;
  IF v_scope.id IS NULL THEN
    RETURN public.has_group_permission(v_plan.group_id,'relief.manage',auth.uid());
  END IF;
  SELECT topology_version INTO v_topology FROM public.organizations
    WHERE id=v_scope.organization_id;
  SELECT group_id INTO v_review_group FROM public.organization_units
    WHERE id=v_scope.review_unit_id AND archived_at IS NULL;
  RETURN v_topology IS NOT DISTINCT FROM v_scope.topology_version
    AND v_review_group IS NOT NULL
    AND public.has_group_permission(v_review_group,'relief.manage',auth.uid());
END
$$;
REVOKE ALL ON FUNCTION public.can_review_relief_plan(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_review_relief_plan(uuid)
  TO authenticated;

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
  ELSIF NOT public.can_review_relief_plan(v_plan.id) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE='42501';
  END IF;
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

DROP POLICY IF EXISTS relief_claim_detail_current_scope ON public.relief_claims;
CREATE POLICY relief_claim_detail_current_scope ON public.relief_claims
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.memberships claimant
      WHERE claimant.id=relief_claims.membership_id
        AND claimant.user_id=auth.uid())
    OR public.can_review_relief_plan(relief_claims.plan_id));

CREATE OR REPLACE FUNCTION public.list_relief_claim_decisions(p_claim_id uuid)
RETURNS SETOF public.relief_claim_decisions LANGUAGE plpgsql SECURITY DEFINER
SET search_path='' AS $$
DECLARE v_claim public.relief_claims%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  SELECT * INTO v_claim FROM public.relief_claims WHERE id=p_claim_id;
  IF v_claim.id IS NULL THEN RAISE EXCEPTION 'CLAIM_NOT_FOUND'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.memberships m
        WHERE m.id=v_claim.claimant_membership_id AND m.user_id=auth.uid())
     AND NOT public.can_review_relief_plan(v_claim.plan_id)
  THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  RETURN QUERY SELECT * FROM public.relief_claim_decisions d
    WHERE d.claim_id=p_claim_id ORDER BY d.decision_version;
END
$$;
REVOKE ALL ON FUNCTION public.list_relief_claim_decisions(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_relief_claim_decisions(uuid)
  TO authenticated;
