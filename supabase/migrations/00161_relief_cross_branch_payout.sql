-- R-004/R-006: the owner pays an approved branch claimant from owner
-- custody. F3 member linkage is group-local; the immutable claim source
-- retains the branch claimant and its person-coverage responsibility.
BEGIN;
CREATE OR REPLACE FUNCTION public.post_relief_claim_payout(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_claim public.relief_claims%ROWTYPE; v_plan public.relief_plans%ROWTYPE;
        v_account public.financial_accounts%ROWTYPE; v_category uuid; v_result jsonb;
        v_event uuid; v_occurred timestamptz; v_account_id uuid;
        v_fund uuid; v_prior_payload jsonb; v_posting_member uuid;
        v_claimant_group uuid;
BEGIN
  IF auth.uid() IS NULL OR p_command IS NULL OR (p_command->>'claim_id') IS NULL
     OR (p_command->>'account_id') IS NULL THEN RAISE EXCEPTION 'INVALID_PAYOUT_COMMAND'; END IF;
  v_account_id:=(p_command->>'account_id')::uuid;
  SELECT * INTO v_claim FROM public.relief_claims WHERE id=(p_command->>'claim_id')::uuid FOR UPDATE;
  IF v_claim.id IS NULL THEN RAISE EXCEPTION 'CLAIM_NOT_FOUND'; END IF;
  SELECT * INTO v_plan FROM public.relief_plans WHERE id=v_claim.plan_id FOR SHARE;
  IF v_plan.id IS NULL OR v_plan.group_id<>v_claim.group_id
     OR v_claim.membership_id<>v_claim.claimant_membership_id
  THEN RAISE EXCEPTION 'RELIEF_CLAIM_DIMENSION_CONFLICT'; END IF;
  SELECT group_id INTO v_claimant_group FROM public.memberships
    WHERE id=v_claim.claimant_membership_id;
  IF v_claimant_group IS NULL THEN RAISE EXCEPTION 'CLAIMANT_MEMBERSHIP_MISSING'; END IF;
  IF v_claimant_group=v_claim.group_id THEN
    v_posting_member:=v_claim.claimant_membership_id;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM public.relief_coverage_contracts c
      JOIN public.relief_coverage_responsibilities r ON r.contract_id=c.id
      JOIN public.organization_people person ON person.id=c.person_id
      JOIN public.memberships claimant ON claimant.id=r.membership_id
      WHERE c.plan_id=v_claim.plan_id
        AND r.membership_id=v_claim.claimant_membership_id
        AND claimant.user_id=person.user_id
        AND r.effective_from<=v_claim.created_at
        AND (r.effective_to IS NULL OR v_claim.created_at<=r.effective_to))
    THEN RAISE EXCEPTION 'RELIEF_CLAIM_COVERAGE_REQUIRED' USING ERRCODE='42501'; END IF;
    v_posting_member:=NULL;
  END IF;
  PERFORM financial_core.assert_finances_manage(v_claim.group_id);
  PERFORM public.assert_relief_owner_payout_scope(v_plan.id);
  IF v_claim.status NOT IN ('approved','paid') THEN RAISE EXCEPTION 'CLAIM_NOT_APPROVED_FOR_PAYOUT'; END IF;
  SELECT * INTO v_account FROM public.financial_accounts WHERE id=v_account_id FOR SHARE;
  IF v_account.id IS NULL OR v_account.group_id<>v_claim.group_id
     OR v_account.currency<>v_claim.currency
     OR (v_claim.status='approved' AND v_account.status<>'active')
  THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND_OR_INVALID'; END IF;
  IF v_claim.status='paid' THEN
    SELECT c.canonical_payload INTO v_prior_payload
      FROM financial_core.posting_command_payloads c
      WHERE c.event_id=v_claim.financial_event_id;
    IF v_prior_payload IS NULL THEN RAISE EXCEPTION 'PAYOUT_SOURCE_EVIDENCE_MISSING'; END IF;
    v_category:=(v_prior_payload->>'category_id')::uuid;
    v_fund:=coalesce(nullif(p_command->>'fund_id','')::uuid,
      (v_prior_payload->>'fund_id')::uuid);
  ELSE
    v_fund:=nullif(p_command->>'fund_id','')::uuid;
    IF v_fund IS NULL OR NOT EXISTS (SELECT 1 FROM public.financial_funds f
        WHERE f.id=v_fund AND f.group_id=v_claim.group_id
          AND f.status='active' AND f.is_restricted)
    THEN RAISE EXCEPTION 'RESTRICTED_RELIEF_FUND_REQUIRED'; END IF;
    SELECT c.id INTO v_category FROM public.financial_categories c
      WHERE c.group_id=v_claim.group_id AND c.category_class='expense'
        AND c.status='active'
      ORDER BY (c.name ILIKE '%relief%') DESC,c.created_at,c.id LIMIT 1;
  END IF;
  IF v_category IS NULL THEN RAISE EXCEPTION 'RELIEF_EXPENSE_ACCOUNT_NOT_CONFIGURED'; END IF;
  v_occurred:=coalesce(v_claim.disbursed_at,transaction_timestamp());
  v_result:=financial_core.post_module_pair(v_claim.group_id,'relief',v_claim.id::text,
    'claim_payout',v_claim.amount_approved,v_claim.currency,v_account.id,v_category,
    v_fund,v_posting_member,v_occurred,'Relief claim payout');
  v_event:=(v_result->>'event_id')::uuid;
  IF v_event IS NULL THEN RAISE EXCEPTION 'POSTING_FAILED'; END IF;
  IF v_claim.status='paid' THEN
    IF v_claim.financial_event_id IS DISTINCT FROM v_event
       OR v_claim.payout_account_id IS DISTINCT FROM v_account.id THEN
      RAISE EXCEPTION 'CONFLICT'; END IF;
  ELSE
    UPDATE public.relief_claims SET status='paid',financial_event_id=v_event,
      payout_account_id=v_account.id,disbursed_at=v_occurred,updated_at=now()
    WHERE id=v_claim.id;
  END IF;
  RETURN pg_catalog.jsonb_build_object('ok',true,'claim_id',v_claim.id,
    'financial_event_id',v_event,'fund_id',v_fund,
    'posting_count',v_result->'new_posting_count',
    'decision',v_result->'decision');
END
$$;
REVOKE ALL ON FUNCTION public.post_relief_claim_payout(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_relief_claim_payout(jsonb) TO authenticated;
COMMIT;
