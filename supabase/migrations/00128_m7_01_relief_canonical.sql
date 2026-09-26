-- M7 relief continuation: production S0/M2 owns these tables and tenant policies.
DO $pre$
BEGIN
  IF to_regclass('public.relief_plans') IS NULL OR to_regclass('public.relief_enrollments') IS NULL
     OR to_regclass('public.relief_claims') IS NULL
     OR to_regprocedure('financial_core.post_module_pair(uuid,text,text,text,numeric,text,uuid,uuid,uuid,uuid,timestamptz,text)') IS NULL
  THEN RAISE EXCEPTION 'M7_ABORT: S0/M2 or F3 prerequisites missing'; END IF;
END
$pre$;
BEGIN;
ALTER TABLE public.relief_plans
  ADD COLUMN IF NOT EXISTS coverage_amount numeric(15,2),
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS status text;
UPDATE public.relief_plans p SET currency=coalesce(p.currency,g.currency),
  status=coalesce(p.status,CASE WHEN p.is_active THEN 'active' ELSE 'paused' END)
FROM public.groups g WHERE g.id=p.group_id;
ALTER TABLE public.relief_plans
  ADD CONSTRAINT relief_plans_coverage_positive CHECK (coverage_amount IS NULL OR coverage_amount>0),
  ADD CONSTRAINT relief_plans_new_status CHECK (status IN ('active','paused','retired'));
ALTER TABLE public.relief_enrollments
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id),
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS matures_at timestamptz;
UPDATE public.relief_enrollments e SET
  group_id=coalesce(e.group_id,p.group_id),
  status=coalesce(e.status,CASE WHEN e.is_active THEN 'active' ELSE 'suspended' END),
  matures_at=coalesce(e.matures_at,e.enrolled_at+make_interval(days=>p.waiting_period_days))
FROM public.relief_plans p WHERE p.id=e.plan_id;
ALTER TABLE public.relief_enrollments
  ADD CONSTRAINT relief_enrollments_new_status CHECK (status IN ('active','suspended','cancelled'));
ALTER TABLE public.relief_claims
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id),
  ADD COLUMN IF NOT EXISTS claimant_membership_id uuid REFERENCES public.memberships(id),
  ADD COLUMN IF NOT EXISTS incident_date date,
  ADD COLUMN IF NOT EXISTS amount_requested numeric(15,2),
  ADD COLUMN IF NOT EXISTS amount_approved numeric(15,2),
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS document_urls text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS disbursed_at timestamptz,
  ADD COLUMN IF NOT EXISTS financial_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payout_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE RESTRICT;
UPDATE public.relief_claims c SET group_id=coalesce(c.group_id,p.group_id),
  claimant_membership_id=coalesce(c.claimant_membership_id,c.membership_id),
  amount_requested=coalesce(c.amount_requested,c.amount),
  currency=coalesce(c.currency,p.currency,g.currency)
FROM public.relief_plans p JOIN public.groups g ON g.id=p.group_id WHERE p.id=c.plan_id;
ALTER TABLE public.relief_claims
  ADD CONSTRAINT relief_claims_requested_positive CHECK (amount_requested IS NULL OR amount_requested>0),
  ADD CONSTRAINT relief_claims_approved_positive CHECK (amount_approved IS NULL OR amount_approved>0),
  ADD CONSTRAINT relief_claims_paid_link CHECK (status<>'paid' OR
    (financial_event_id IS NOT NULL AND payout_account_id IS NOT NULL
      AND disbursed_at IS NOT NULL AND amount_approved IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS relief_claims_financial_event_unique
  ON public.relief_claims(financial_event_id) WHERE financial_event_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assert_relief_claim_contract()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_plan public.relief_plans%ROWTYPE; v_member public.memberships%ROWTYPE;
        v_event public.financial_events%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.relief_plans WHERE id=NEW.plan_id;
  SELECT * INTO v_member FROM public.memberships WHERE id=NEW.membership_id;
  IF v_plan.id IS NULL OR v_member.id IS NULL OR v_member.group_id<>v_plan.group_id
     OR NEW.group_id IS DISTINCT FROM v_plan.group_id
     OR NEW.claimant_membership_id IS DISTINCT FROM NEW.membership_id
     OR NEW.currency IS DISTINCT FROM v_plan.currency
     OR NEW.amount_requested IS DISTINCT FROM NEW.amount
  THEN RAISE EXCEPTION 'RELIEF_CLAIM_DIMENSION_CONFLICT'; END IF;
  IF TG_OP='UPDATE' AND OLD.status='paid'
     AND (NEW.status IS DISTINCT FROM OLD.status
       OR NEW.amount_approved IS DISTINCT FROM OLD.amount_approved
       OR NEW.claimant_membership_id IS DISTINCT FROM OLD.claimant_membership_id
       OR NEW.payout_account_id IS DISTINCT FROM OLD.payout_account_id
       OR NEW.financial_event_id IS DISTINCT FROM OLD.financial_event_id
       OR NEW.disbursed_at IS DISTINCT FROM OLD.disbursed_at)
  THEN RAISE EXCEPTION 'PAID_CLAIM_IMMUTABLE'; END IF;
  IF NEW.status='paid' THEN
    SELECT * INTO v_event FROM public.financial_events WHERE id=NEW.financial_event_id;
    IF v_event.id IS NULL OR v_event.group_id<>NEW.group_id
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
DROP TRIGGER IF EXISTS trg_assert_relief_claim_contract ON public.relief_claims;
CREATE TRIGGER trg_assert_relief_claim_contract BEFORE INSERT OR UPDATE ON public.relief_claims
  FOR EACH ROW EXECUTE FUNCTION public.assert_relief_claim_contract();
CREATE OR REPLACE FUNCTION public.prevent_paid_claim_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.status='paid' OR OLD.financial_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'PAID_CLAIM_DELETE_PROHIBITED'; END IF;
  RETURN OLD;
END
$$;
DROP TRIGGER IF EXISTS trg_prevent_paid_claim_delete ON public.relief_claims;
CREATE TRIGGER trg_prevent_paid_claim_delete BEFORE DELETE ON public.relief_claims
  FOR EACH ROW EXECUTE FUNCTION public.prevent_paid_claim_delete();
CREATE OR REPLACE FUNCTION public.assert_claim_eligibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_enrollment public.relief_enrollments%ROWTYPE;
BEGIN
  SELECT * INTO v_enrollment FROM public.relief_enrollments
  WHERE plan_id=NEW.plan_id AND membership_id=NEW.claimant_membership_id AND status='active';
  IF v_enrollment.id IS NULL THEN RAISE EXCEPTION 'MEMBER_NOT_ENROLLED_IN_PLAN'; END IF;
  IF NEW.incident_date<v_enrollment.matures_at::date THEN
    RAISE EXCEPTION 'CLAIM_PREMATURE_WAITING_PERIOD_NOT_MET'; END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_assert_claim_eligibility ON public.relief_claims;
CREATE TRIGGER trg_assert_claim_eligibility BEFORE INSERT ON public.relief_claims
  FOR EACH ROW EXECUTE FUNCTION public.assert_claim_eligibility();

CREATE OR REPLACE FUNCTION public.post_relief_claim_payout(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_claim public.relief_claims%ROWTYPE; v_plan public.relief_plans%ROWTYPE;
        v_account public.financial_accounts%ROWTYPE; v_category uuid; v_result jsonb;
        v_event uuid; v_occurred timestamptz; v_account_id uuid;
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
  PERFORM financial_core.assert_finances_manage(v_claim.group_id);
  IF v_claim.status NOT IN ('approved','paid') THEN RAISE EXCEPTION 'CLAIM_NOT_APPROVED_FOR_PAYOUT'; END IF;
  SELECT * INTO v_account FROM public.financial_accounts WHERE id=v_account_id FOR SHARE;
  IF v_account.id IS NULL OR v_account.group_id<>v_claim.group_id
     OR v_account.currency<>v_claim.currency
     OR (v_claim.status='approved' AND v_account.status<>'active')
  THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND_OR_INVALID'; END IF;
  SELECT c.id INTO v_category FROM public.financial_categories c
    WHERE c.group_id=v_claim.group_id AND c.category_class='expense'
      AND c.status='active'
    ORDER BY (c.name ILIKE '%relief%') DESC,c.created_at,c.id LIMIT 1;
  IF v_category IS NULL THEN RAISE EXCEPTION 'RELIEF_EXPENSE_ACCOUNT_NOT_CONFIGURED'; END IF;
  v_occurred:=coalesce(v_claim.disbursed_at,transaction_timestamp());
  v_result:=financial_core.post_module_pair(v_claim.group_id,'relief',v_claim.id::text,
    'claim_payout',v_claim.amount_approved,v_claim.currency,v_account.id,v_category,
    NULL,v_claim.claimant_membership_id,v_occurred,'Relief claim payout');
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
    'financial_event_id',v_event,'posting_count',v_result->'new_posting_count',
    'decision',v_result->'decision');
END
$$;
REVOKE ALL ON FUNCTION public.post_relief_claim_payout(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_relief_claim_payout(jsonb) TO authenticated;
COMMIT;
