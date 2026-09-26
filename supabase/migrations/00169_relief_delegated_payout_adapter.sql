-- R-006: delegated branch payout from already recognized agency custody.
-- Branch liability/custody and owner restricted expense/receivable are one
-- claim occurrence and one database transaction with two authoritative audits.
BEGIN;
CREATE TABLE financial_core.relief_delegated_payouts (
  claim_id uuid PRIMARY KEY REFERENCES public.relief_claims(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.relief_plans(id) ON DELETE RESTRICT,
  scope_id uuid NOT NULL REFERENCES public.relief_plan_scope_versions(id)
    ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES public.organizations(id)
    ON DELETE RESTRICT,
  branch_group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  owner_group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE RESTRICT,
  branch_account_id uuid NOT NULL REFERENCES public.financial_accounts(id)
    ON DELETE RESTRICT,
  branch_fund_id uuid NOT NULL REFERENCES public.financial_funds(id)
    ON DELETE RESTRICT,
  owner_fund_id uuid NOT NULL REFERENCES public.financial_funds(id)
    ON DELETE RESTRICT,
  owner_category_id uuid NOT NULL REFERENCES public.financial_categories(id)
    ON DELETE RESTRICT,
  branch_event_id uuid NOT NULL UNIQUE,
  owner_event_id uuid NOT NULL UNIQUE,
  amount numeric NOT NULL CHECK (amount>0),
  currency text NOT NULL,
  paid_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  paid_at timestamptz NOT NULL,
  CONSTRAINT delegated_payout_branch_event_scope
    FOREIGN KEY(branch_event_id,branch_group_id)
    REFERENCES public.financial_events(id,group_id) ON DELETE RESTRICT,
  CONSTRAINT delegated_payout_owner_event_scope
    FOREIGN KEY(owner_event_id,owner_group_id)
    REFERENCES public.financial_events(id,group_id) ON DELETE RESTRICT,
  CHECK (branch_group_id<>owner_group_id)
);
CREATE INDEX relief_delegated_payouts_plan_branch
  ON financial_core.relief_delegated_payouts(plan_id,branch_group_id);
ALTER TABLE financial_core.relief_delegated_payouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON financial_core.relief_delegated_payouts
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_relief_payout_scope_adapter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_payout public.organization_units%ROWTYPE;
BEGIN
  SELECT * INTO v_payout FROM public.organization_units
    WHERE id=NEW.payout_unit_id AND organization_id=NEW.organization_id
      AND archived_at IS NULL;
  IF v_payout.id IS NULL OR v_payout.group_id IS NULL
     OR (v_payout.group_id<>NEW.financial_owner_group_id
       AND NOT financial_core.relief_unit_in_scope(NEW.collection_unit_id,
         NEW.collection_mode,v_payout.id))
  THEN RAISE EXCEPTION 'RELIEF_PAYOUT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.guard_relief_payout_scope_adapter()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.can_pay_relief_plan(p_plan uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.relief_plan_scope_versions scope
    JOIN public.organizations organization ON organization.id=scope.organization_id
    JOIN public.organization_units payout_unit
      ON payout_unit.id=scope.payout_unit_id
        AND payout_unit.organization_id=scope.organization_id
        AND payout_unit.archived_at IS NULL
    WHERE scope.plan_id=p_plan AND scope.effective_to IS NULL
      AND scope.topology_version=organization.topology_version
      AND payout_unit.group_id IS NOT NULL
      AND public.has_group_permission(payout_unit.group_id,
        'finances.manage',auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.relief_plans plan
      WHERE plan.id=p_plan
        AND NOT EXISTS (SELECT 1 FROM public.relief_plan_scope_versions scope
          WHERE scope.plan_id=plan.id AND scope.effective_to IS NULL)
        AND public.has_group_permission(plan.group_id,'finances.manage',auth.uid()));
$function$;
REVOKE ALL ON FUNCTION public.can_pay_relief_plan(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_pay_relief_plan(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.assert_relief_claim_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_plan public.relief_plans%ROWTYPE;
  v_member public.memberships%ROWTYPE;
  v_event public.financial_events%ROWTYPE;
  v_scope public.relief_plan_scope_versions%ROWTYPE;
  v_contract public.relief_coverage_contracts%ROWTYPE;
  v_unit uuid; v_topology bigint;
  v_link financial_core.relief_delegated_payouts%ROWTYPE;
  v_branch_event public.financial_events%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.relief_plans WHERE id=NEW.plan_id;
  SELECT * INTO v_member FROM public.memberships WHERE id=NEW.membership_id;
  IF v_plan.id IS NULL OR v_member.id IS NULL
     OR NEW.group_id IS DISTINCT FROM v_plan.group_id
     OR NEW.claimant_membership_id IS DISTINCT FROM NEW.membership_id
     OR NEW.currency IS DISTINCT FROM v_plan.currency
     OR NEW.amount_requested IS DISTINCT FROM NEW.amount
  THEN RAISE EXCEPTION 'RELIEF_CLAIM_DIMENSION_CONFLICT'; END IF;
  IF TG_OP='INSERT' THEN
    SELECT * INTO v_scope FROM public.relief_plan_scope_versions
      WHERE plan_id=v_plan.id AND effective_to IS NULL;
    IF v_member.group_id IS DISTINCT FROM v_plan.group_id THEN
      IF v_scope.id IS NULL OR v_member.membership_status<>'active'
      THEN RAISE EXCEPTION 'RELIEF_CLAIM_COVERAGE_REQUIRED' USING ERRCODE='42501'; END IF;
      SELECT c.* INTO v_contract FROM public.relief_coverage_contracts c
        JOIN public.organization_people p ON p.id=c.person_id
        WHERE c.plan_id=v_plan.id AND c.organization_id=v_scope.organization_id
          AND p.user_id=v_member.user_id
          AND c.current_membership_id=v_member.id AND c.status='active';
      SELECT u.id INTO v_unit FROM public.organization_units u
        WHERE u.group_id=v_member.group_id AND u.archived_at IS NULL;
      SELECT o.topology_version INTO v_topology FROM public.organizations o
        WHERE o.id=v_scope.organization_id;
      IF v_contract.id IS NULL OR v_topology IS DISTINCT FROM v_scope.topology_version
         OR v_unit IS NULL OR NOT EXISTS (
           SELECT 1 FROM financial_core.relief_plan_scope_membership sm
           WHERE sm.scope_id=v_scope.id AND sm.unit_id=v_unit
             AND sm.purpose='participation')
      THEN RAISE EXCEPTION 'RELIEF_CLAIM_COVERAGE_REQUIRED' USING ERRCODE='42501'; END IF;
    END IF;
  ELSE
    IF NEW.plan_id IS DISTINCT FROM OLD.plan_id
       OR NEW.membership_id IS DISTINCT FROM OLD.membership_id
       OR NEW.claimant_membership_id IS DISTINCT FROM OLD.claimant_membership_id
       OR NEW.group_id IS DISTINCT FROM OLD.group_id
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.amount_requested IS DISTINCT FROM OLD.amount_requested
       OR NEW.amount IS DISTINCT FROM OLD.amount
    THEN RAISE EXCEPTION 'RELIEF_CLAIM_IDENTITY_IMMUTABLE'; END IF;
  END IF;
  IF TG_OP='UPDATE' AND OLD.status='paid'
     AND (NEW.status IS DISTINCT FROM OLD.status
       OR NEW.amount_approved IS DISTINCT FROM OLD.amount_approved
       OR NEW.claimant_membership_id IS DISTINCT FROM OLD.claimant_membership_id
       OR NEW.payout_account_id IS DISTINCT FROM OLD.payout_account_id
       OR NEW.financial_event_id IS DISTINCT FROM OLD.financial_event_id
       OR NEW.disbursed_at IS DISTINCT FROM OLD.disbursed_at)
  THEN RAISE EXCEPTION 'PAID_CLAIM_IMMUTABLE'; END IF;
  IF NEW.status='paid' THEN
    SELECT * INTO v_link FROM financial_core.relief_delegated_payouts
      WHERE claim_id=NEW.id;
    SELECT * INTO v_event FROM public.financial_events WHERE id=NEW.financial_event_id;
    IF v_link.claim_id IS NOT NULL THEN
      SELECT * INTO v_branch_event FROM public.financial_events
        WHERE id=v_link.branch_event_id;
      IF v_link.plan_id IS DISTINCT FROM NEW.plan_id
         OR v_link.owner_group_id IS DISTINCT FROM NEW.group_id
         OR v_link.owner_event_id IS DISTINCT FROM NEW.financial_event_id
         OR v_link.branch_account_id IS DISTINCT FROM NEW.payout_account_id
         OR v_link.amount IS DISTINCT FROM NEW.amount_approved
         OR v_link.currency IS DISTINCT FROM NEW.currency
         OR v_event.group_id IS DISTINCT FROM NEW.group_id
         OR v_event.source_module<>'relief'
         OR v_event.source_record_id<>NEW.id::text
         OR v_event.effect_kind<>'agency_claim_payout_owner'
         OR v_branch_event.group_id IS DISTINCT FROM v_link.branch_group_id
         OR v_branch_event.source_module<>'relief'
         OR v_branch_event.source_record_id<>NEW.id::text
         OR v_branch_event.effect_kind<>'agency_claim_payout_out'
         OR (SELECT count(*) FROM financial_core.financial_event_audit_links a
           WHERE a.event_id IN (v_link.branch_event_id,v_link.owner_event_id))<>2
         OR NOT EXISTS (SELECT 1 FROM public.financial_postings fp
           WHERE fp.event_id=v_link.branch_event_id
             AND fp.control_class='liability'
             AND fp.amount_signed=NEW.amount_approved)
         OR NOT EXISTS (SELECT 1 FROM public.financial_postings fp
           WHERE fp.event_id=v_link.branch_event_id
             AND fp.control_class='custody'
             AND fp.account_id=NEW.payout_account_id
             AND fp.amount_signed=-NEW.amount_approved)
         OR NOT EXISTS (SELECT 1 FROM public.financial_postings fp
           WHERE fp.event_id=v_link.owner_event_id
             AND fp.control_class='expense'
             AND fp.amount_signed=NEW.amount_approved)
         OR NOT EXISTS (SELECT 1 FROM public.financial_postings fp
           WHERE fp.event_id=v_link.owner_event_id
             AND fp.control_class='receivable'
             AND fp.amount_signed=-NEW.amount_approved)
      THEN RAISE EXCEPTION 'PAID_CLAIM_EVENT_CONFLICT'; END IF;
    ELSIF v_event.id IS NULL OR v_event.group_id<>NEW.group_id
       OR v_event.source_module<>'relief' OR v_event.source_record_id<>NEW.id::text
       OR v_event.effect_kind<>'claim_payout' OR v_event.currency<>NEW.currency
       OR NOT EXISTS (SELECT 1 FROM public.financial_postings fp
           WHERE fp.event_id=v_event.id AND fp.control_class='custody'
             AND fp.account_id=NEW.payout_account_id
             AND fp.amount_signed=-NEW.amount_approved)
    THEN RAISE EXCEPTION 'PAID_CLAIM_EVENT_CONFLICT'; END IF;
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.assert_relief_claim_contract()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION financial_core.relief_agency_available(
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
  RETURN v_receipts-v_remitted-v_paid;
END
$$;
REVOKE ALL ON FUNCTION financial_core.relief_agency_available(
  uuid,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION financial_core.guard_relief_remittance_agency_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.relief_plan_id IS NULL OR NEW.branch_group_id IS NULL
     OR NEW.owner_group_id IS NULL OR NEW.branch_fund_id IS NULL
  THEN RAISE EXCEPTION 'REMITTANCE_DIMENSIONS_MISSING'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'relief-agency-reserve/'||NEW.relief_plan_id::text||'/'||
    NEW.branch_group_id::text,0));
  IF NEW.amount>financial_core.relief_agency_available(
      NEW.relief_plan_id,NEW.branch_group_id,NEW.owner_group_id,NULL)
     OR NEW.amount>financial_core.relief_agency_available(
      NEW.relief_plan_id,NEW.branch_group_id,NEW.owner_group_id,
      NEW.branch_fund_id)
  THEN RAISE EXCEPTION 'REMITTANCE_EXCEEDS_AGENCY_BALANCE'; END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER relief_remittance_agency_balance
  BEFORE INSERT ON public.relief_remittances FOR EACH ROW
  EXECUTE FUNCTION financial_core.guard_relief_remittance_agency_balance();
REVOKE ALL ON FUNCTION financial_core.guard_relief_remittance_agency_balance()
  FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION financial_core.post_delegated_relief_claim_payout(
  p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_claim public.relief_claims%ROWTYPE;
  v_plan public.relief_plans%ROWTYPE;
  v_scope public.relief_plan_scope_versions%ROWTYPE;
  v_account public.financial_accounts%ROWTYPE;
  v_link financial_core.relief_delegated_payouts%ROWTYPE;
  v_branch uuid; v_actor uuid; v_branch_fund uuid; v_owner_fund uuid;
  v_category uuid; v_account_id uuid; v_branch_result jsonb;
  v_owner_result jsonb; v_branch_event uuid; v_owner_event uuid;
  v_occurred timestamptz; v_cash numeric;
BEGIN
  IF auth.uid() IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
     OR p_command->>'claim_id' IS NULL OR p_command->>'account_id' IS NULL
     OR p_command->>'fund_id' IS NULL OR p_command->>'owner_fund_id' IS NULL
     OR EXISTS (SELECT 1 FROM pg_catalog.jsonb_object_keys(p_command) k
       WHERE k NOT IN ('claim_id','account_id','fund_id','owner_fund_id'))
  THEN RAISE EXCEPTION 'INVALID_DELEGATED_PAYOUT_COMMAND'; END IF;
  v_account_id:=(p_command->>'account_id')::uuid;
  v_branch_fund:=(p_command->>'fund_id')::uuid;
  v_owner_fund:=(p_command->>'owner_fund_id')::uuid;
  SELECT * INTO v_claim FROM public.relief_claims
    WHERE id=(p_command->>'claim_id')::uuid FOR UPDATE;
  IF v_claim.id IS NULL THEN RAISE EXCEPTION 'CLAIM_NOT_FOUND'; END IF;
  SELECT * INTO v_plan FROM public.relief_plans
    WHERE id=v_claim.plan_id FOR UPDATE;
  IF v_plan.id IS NULL OR v_plan.group_id IS DISTINCT FROM v_claim.group_id
     OR v_claim.status NOT IN ('approved','paid')
     OR v_claim.amount_approved IS NULL OR v_claim.amount_approved<=0
     OR v_claim.currency IS DISTINCT FROM v_plan.currency
  THEN RAISE EXCEPTION 'DELEGATED_PAYOUT_CLAIM_CONFLICT'; END IF;
  SELECT * INTO v_scope FROM public.relief_plan_scope_versions
    WHERE plan_id=v_plan.id AND effective_to IS NULL;
  SELECT authority.actor_id,authority.branch_group_id INTO v_actor,v_branch
  FROM financial_core.assert_relief_delegated_payout_authority(
    v_plan.group_id,v_claim.id::text) authority;
  IF v_actor IS NULL OR v_branch IS NULL OR v_scope.id IS NULL
  THEN RAISE EXCEPTION 'RELIEF_PAYOUT_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_account FROM public.financial_accounts
    WHERE id=v_account_id FOR SHARE;
  SELECT * INTO v_link FROM financial_core.relief_delegated_payouts
    WHERE claim_id=v_claim.id FOR UPDATE;
  IF v_account.id IS NULL OR v_account.group_id<>v_branch
     OR v_account.currency<>v_claim.currency
     OR v_account.kind NOT IN ('bank','cash','mobile_money','wallet')
     OR (v_link.claim_id IS NULL AND v_account.status<>'active')
     OR NOT EXISTS (SELECT 1 FROM public.financial_funds fund
       WHERE fund.id=v_branch_fund AND fund.group_id=v_branch
         AND fund.is_restricted
         AND (v_link.claim_id IS NOT NULL OR fund.status='active'))
     OR NOT EXISTS (SELECT 1 FROM public.financial_funds fund
       WHERE fund.id=v_owner_fund AND fund.group_id=v_plan.group_id
         AND fund.is_restricted
         AND (v_link.claim_id IS NOT NULL OR fund.status='active'))
  THEN RAISE EXCEPTION 'DELEGATED_PAYOUT_CUSTODY_OR_FUND_INVALID'; END IF;
  IF v_claim.status='paid' THEN
    IF v_link.claim_id IS NULL OR v_link.plan_id<>v_plan.id
       OR v_link.branch_group_id<>v_branch
       OR v_link.owner_group_id<>v_plan.group_id
       OR v_link.branch_account_id<>v_account_id
       OR v_link.branch_fund_id<>v_branch_fund
       OR v_link.owner_fund_id<>v_owner_fund
       OR v_link.owner_event_id IS DISTINCT FROM v_claim.financial_event_id
       OR v_link.amount IS DISTINCT FROM v_claim.amount_approved
       OR v_link.currency IS DISTINCT FROM v_claim.currency
    THEN RAISE EXCEPTION 'DELEGATED_PAYOUT_INTENT_CONFLICT'; END IF;
    RETURN pg_catalog.jsonb_build_object('ok',true,'claim_id',v_claim.id,
      'financial_event_id',v_link.owner_event_id,
      'branch_event_id',v_link.branch_event_id,
      'fund_id',v_branch_fund,'owner_fund_id',v_owner_fund,
      'posting_count',0,'decision','IDEMPOTENT_RETURN_EXISTING');
  END IF;
  IF v_link.claim_id IS NOT NULL
  THEN RAISE EXCEPTION 'DELEGATED_PAYOUT_INTENT_CONFLICT'; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'relief-agency-reserve/'||v_plan.id::text||'/'||v_branch::text,0));
  IF v_claim.amount_approved>financial_core.relief_agency_available(
      v_plan.id,v_branch,v_plan.group_id,NULL)
     OR v_claim.amount_approved>financial_core.relief_agency_available(
      v_plan.id,v_branch,v_plan.group_id,v_branch_fund)
  THEN RAISE EXCEPTION 'DELEGATED_PAYOUT_EXCEEDS_AGENCY_BALANCE'; END IF;
  SELECT coalesce(sum(posting.amount_signed),0) INTO v_cash
  FROM public.financial_postings posting
  WHERE posting.group_id=v_branch AND posting.account_id=v_account_id
    AND posting.fund_id=v_branch_fund AND posting.currency=v_claim.currency
    AND posting.control_class='custody';
  IF v_cash<v_claim.amount_approved
  THEN RAISE EXCEPTION 'DELEGATED_PAYOUT_CUSTODY_INSUFFICIENT'; END IF;
  SELECT category.id INTO v_category FROM public.financial_categories category
    WHERE category.group_id=v_plan.group_id AND category.category_class='expense'
      AND category.status='active'
    ORDER BY (category.name ILIKE '%relief%') DESC,
      category.created_at,category.id LIMIT 1;
  IF v_category IS NULL THEN RAISE EXCEPTION 'RELIEF_EXPENSE_ACCOUNT_NOT_CONFIGURED'; END IF;
  v_occurred:=transaction_timestamp();
  v_branch_result:=financial_core.post_module_pair(v_branch,'relief',
    v_claim.id::text,'agency_claim_payout_out',v_claim.amount_approved,
    v_claim.currency,v_account_id,NULL,v_branch_fund,NULL,v_occurred,
    'Delegated Relief claim payout from branch agency custody');
  v_branch_event:=(v_branch_result->>'event_id')::uuid;
  v_owner_result:=financial_core.post_module_pair(v_plan.group_id,'relief',
    v_claim.id::text,'agency_claim_payout_owner',v_claim.amount_approved,
    v_claim.currency,NULL,v_category,v_owner_fund,NULL,v_occurred,
    'Owner restricted Relief expense paid by branch agent');
  v_owner_event:=(v_owner_result->>'event_id')::uuid;
  IF v_branch_event IS NULL OR v_owner_event IS NULL
     OR v_branch_event=v_owner_event
  THEN RAISE EXCEPTION 'DELEGATED_PAYOUT_POSTING_FAILED'; END IF;
  INSERT INTO financial_core.relief_delegated_payouts
    (claim_id,plan_id,scope_id,organization_id,branch_group_id,
     owner_group_id,branch_account_id,branch_fund_id,owner_fund_id,
     owner_category_id,branch_event_id,owner_event_id,amount,currency,
     paid_by,paid_at)
  VALUES (v_claim.id,v_plan.id,v_scope.id,v_scope.organization_id,v_branch,
    v_plan.group_id,v_account_id,v_branch_fund,v_owner_fund,v_category,
    v_branch_event,v_owner_event,v_claim.amount_approved,v_claim.currency,
    v_actor,v_occurred);
  UPDATE public.relief_claims SET status='paid',financial_event_id=v_owner_event,
    payout_account_id=v_account_id,disbursed_at=v_occurred,updated_at=now()
    WHERE id=v_claim.id;
  RETURN pg_catalog.jsonb_build_object('ok',true,'claim_id',v_claim.id,
    'financial_event_id',v_owner_event,'branch_event_id',v_branch_event,
    'fund_id',v_branch_fund,'owner_fund_id',v_owner_fund,
    'posting_count',4,'decision','POSTED');
END
$$;
REVOKE ALL ON FUNCTION financial_core.post_delegated_relief_claim_payout(
  jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION financial_core.post_owner_relief_claim_payout(p_command jsonb)
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
REVOKE ALL ON FUNCTION financial_core.post_owner_relief_claim_payout(jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.post_relief_claim_payout(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_claim_id uuid; v_plan_id uuid; v_owner uuid;
  v_payout_group uuid; v_delegated boolean;
BEGIN
  IF auth.uid() IS NULL OR pg_catalog.jsonb_typeof(p_command) IS DISTINCT FROM 'object'
     OR p_command->>'claim_id' IS NULL
  THEN RAISE EXCEPTION 'INVALID_PAYOUT_COMMAND'; END IF;
  v_claim_id:=(p_command->>'claim_id')::uuid;
  SELECT claim.plan_id,claim.group_id INTO v_plan_id,v_owner
    FROM public.relief_claims claim WHERE claim.id=v_claim_id;
  IF v_plan_id IS NULL THEN RAISE EXCEPTION 'CLAIM_NOT_FOUND'; END IF;
  SELECT EXISTS (SELECT 1 FROM financial_core.relief_delegated_payouts link
    WHERE link.claim_id=v_claim_id) INTO v_delegated;
  IF NOT v_delegated THEN
    SELECT unit.group_id INTO v_payout_group
    FROM public.relief_plan_scope_versions scope
    JOIN public.organization_units unit ON unit.id=scope.payout_unit_id
      AND unit.archived_at IS NULL
    WHERE scope.plan_id=v_plan_id AND scope.effective_to IS NULL;
    v_delegated:=v_payout_group IS NOT NULL AND v_payout_group<>v_owner;
  END IF;
  IF v_delegated THEN
    RETURN financial_core.post_delegated_relief_claim_payout(p_command);
  END IF;
  RETURN financial_core.post_owner_relief_claim_payout(p_command);
END
$$;
REVOKE ALL ON FUNCTION public.post_relief_claim_payout(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_relief_claim_payout(jsonb) TO authenticated;
COMMIT;
