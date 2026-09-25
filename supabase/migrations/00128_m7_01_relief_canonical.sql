-- M7 Slice 1: Database Migration & Canonical F3 Payout RPC

DO $m7_pre$
BEGIN
  -- Verify presence of public.has_group_permission
  IF to_regprocedure('public.has_group_permission(uuid,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'M7_ABORT: public.has_group_permission missing';
  END IF;
  
  -- Verify presence of canonical F3 ledger
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'financial_core' AND tablename = 'currencies') THEN
    RAISE EXCEPTION 'M7_ABORT: financial_core.currencies missing';
  END IF;
  
  -- Verify presence of M4 dues bridge migration
  IF to_regprocedure('public.post_dues_payment_confirmation(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'M7_ABORT: 00124 dues bridge missing';
  END IF;
END
$m7_pre$;

BEGIN;

-- 2. Canonical Relief Infrastructure Schema
CREATE TABLE IF NOT EXISTS public.relief_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  coverage_amount numeric(15,2) NOT NULL CHECK (coverage_amount > 0),
  currency text NOT NULL REFERENCES financial_core.currencies(code),
  waiting_period_days integer NOT NULL DEFAULT 90 CHECK (waiting_period_days >= 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (group_id, name)
);

CREATE TABLE IF NOT EXISTS public.relief_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.relief_plans(id) ON DELETE RESTRICT,
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'cancelled')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  matures_at timestamptz NOT NULL,
  UNIQUE (plan_id, membership_id)
);

CREATE TABLE IF NOT EXISTS public.relief_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.relief_plans(id) ON DELETE RESTRICT,
  claimant_membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE RESTRICT,
  incident_date date NOT NULL,
  amount_requested numeric(15,2) NOT NULL CHECK (amount_requested > 0),
  amount_approved numeric(15,2) CHECK (amount_approved > 0),
  currency text NOT NULL REFERENCES financial_core.currencies(code),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'paid')),
  document_urls text[] DEFAULT '{}',
  reviewed_by uuid REFERENCES public.memberships(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  disbursed_at timestamptz,
  financial_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  payout_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS Enablement
ALTER TABLE public.relief_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relief_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relief_claims ENABLE ROW LEVEL SECURITY;

-- 3. Immutability & Safety Triggers
CREATE OR REPLACE FUNCTION public.prevent_paid_claim_modification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'paid' THEN
    IF NEW.amount_approved IS DISTINCT FROM OLD.amount_approved OR
       NEW.claimant_membership_id IS DISTINCT FROM OLD.claimant_membership_id OR
       NEW.payout_account_id IS DISTINCT FROM OLD.payout_account_id OR
       NEW.financial_event_id IS DISTINCT FROM OLD.financial_event_id THEN
      RAISE EXCEPTION 'PAID_CLAIM_IMMUTABLE' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_paid_claim_modification ON public.relief_claims;
CREATE TRIGGER trg_prevent_paid_claim_modification
  BEFORE UPDATE ON public.relief_claims
  FOR EACH ROW EXECUTE FUNCTION public.prevent_paid_claim_modification();

CREATE OR REPLACE FUNCTION public.prevent_paid_claim_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status = 'paid' OR OLD.financial_event_id IS NOT NULL THEN
    RAISE EXCEPTION 'PAID_CLAIM_DELETE_PROHIBITED' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_paid_claim_delete ON public.relief_claims;
CREATE TRIGGER trg_prevent_paid_claim_delete
  BEFORE DELETE ON public.relief_claims
  FOR EACH ROW EXECUTE FUNCTION public.prevent_paid_claim_delete();

CREATE OR REPLACE FUNCTION public.assert_claim_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_enrollment public.relief_enrollments%ROWTYPE;
BEGIN
  SELECT * INTO v_enrollment
  FROM public.relief_enrollments
  WHERE plan_id = NEW.plan_id AND membership_id = NEW.claimant_membership_id AND status = 'active';

  IF v_enrollment.id IS NULL THEN
    RAISE EXCEPTION 'MEMBER_NOT_ENROLLED_IN_PLAN' USING ERRCODE = '23514';
  END IF;

  IF NEW.incident_date < v_enrollment.matures_at::date THEN
    RAISE EXCEPTION 'CLAIM_PREMATURE_WAITING_PERIOD_NOT_MET' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_claim_eligibility ON public.relief_claims;
CREATE TRIGGER trg_assert_claim_eligibility
  BEFORE INSERT OR UPDATE ON public.relief_claims
  FOR EACH ROW EXECUTE FUNCTION public.assert_claim_eligibility();

-- 4. Canonical Atomic Disbursement RPC
CREATE OR REPLACE FUNCTION public.post_relief_claim_payout(p_command jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_claim_id uuid := (p_command->>'claim_id')::uuid;
  v_account_id uuid := (p_command->>'account_id')::uuid;
  v_request_id uuid := (p_command->>'request_id')::uuid;
  v_claim public.relief_claims%ROWTYPE;
  v_account public.financial_accounts%ROWTYPE;
  v_expense_account_id uuid;
  v_f3_res jsonb;
  v_event_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- 1. Advisory Lock
  PERFORM pg_catalog.pg_advisory_xact_lock(
    hashtext('relief-payout'), hashtext(v_claim_id::text)
  );

  -- 2. Lookup Claim
  SELECT * INTO v_claim FROM public.relief_claims WHERE id = v_claim_id FOR UPDATE;
  IF v_claim.id IS NULL THEN
    RAISE EXCEPTION 'CLAIM_NOT_FOUND';
  END IF;

  -- Authorization
  IF NOT (public.has_group_permission(v_claim.group_id, 'finances.manage') OR 
          EXISTS (SELECT 1 FROM public.memberships WHERE group_id = v_claim.group_id AND user_id = v_user_id AND role = 'owner')) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  -- 3. Idempotency Check
  IF v_claim.status = 'paid' AND v_claim.financial_event_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'decision', 'IDEMPOTENT_RETURN_EXISTING',
      'claim_id', v_claim_id,
      'financial_event_id', v_claim.financial_event_id,
      'posting_count', 0
    );
  END IF;

  -- 4. Status Validation
  IF v_claim.status <> 'approved' THEN
    RAISE EXCEPTION 'CLAIM_NOT_APPROVED_FOR_PAYOUT';
  END IF;

  -- 5. Lookup Custody Account
  SELECT * INTO v_account FROM public.financial_accounts WHERE id = v_account_id FOR SHARE;
  IF v_account.id IS NULL OR v_account.status <> 'active' OR v_account.kind NOT IN ('bank', 'cash', 'mobile_money', 'wallet') THEN
    RAISE EXCEPTION 'ACCOUNT_NOT_FOUND_OR_INVALID';
  END IF;

  -- 6. Currency Match
  IF v_account.currency <> v_claim.currency THEN
    RAISE EXCEPTION 'CURRENCY_MISMATCH';
  END IF;

  -- 7. Active Fiscal Epoch check (handled by post_f3_command inherently, but we ensure group matches)
  IF v_account.group_id <> v_claim.group_id THEN
    RAISE EXCEPTION 'CROSS_GROUP_DIMENSION';
  END IF;

  -- 8. Resolve Expense Category
  SELECT c.id INTO v_expense_account_id
  FROM public.financial_categories c
  WHERE c.group_id = v_claim.group_id
    AND c.category_class = 'expense'
    AND c.status = 'active'
    AND c.code = 'relief_expense'
  LIMIT 1;

  IF v_expense_account_id IS NULL THEN
    SELECT c.id INTO v_expense_account_id
    FROM public.financial_categories c
    WHERE c.group_id = v_claim.group_id
      AND c.category_class = 'expense'
      AND c.status = 'active'
    ORDER BY (c.name ILIKE '%relief%' OR c.name ILIKE '%payout%') DESC, c.created_at ASC
    LIMIT 1;
  END IF;

  IF v_expense_account_id IS NULL THEN
    RAISE EXCEPTION 'RELIEF_EXPENSE_ACCOUNT_NOT_CONFIGURED';
  END IF;

  -- 9. F3 Command Dispatch
  v_f3_res := financial_core.post_f3_command(jsonb_build_object(
    'command_type', 'record_event',
    'group_id', v_claim.group_id,
    'action_type', 'money_out',
    'event_type', 'relief_payout',
    'occurred_at', now(),
    'currency', v_claim.currency,
    'postings', jsonb_build_array(
      jsonb_build_object('account_id', v_expense_account_id, 'amount', v_claim.amount_approved, 'direction', 'debit'),
      jsonb_build_object('account_id', v_account.id, 'amount', v_claim.amount_approved, 'direction', 'credit')
    ),
    'metadata', jsonb_build_object('claim_id', v_claim.id, 'plan_id', v_claim.plan_id, 'member_id', v_claim.claimant_membership_id)
  ), v_request_id);

  v_event_id := (v_f3_res->>'event_id')::uuid;
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'POSTING_FAILED';
  END IF;

  -- 10. Update Claim
  UPDATE public.relief_claims
  SET status = 'paid',
      financial_event_id = v_event_id,
      payout_account_id = v_account.id,
      disbursed_at = now(),
      updated_at = now()
  WHERE id = v_claim.id;

  -- 11. Return JSON confirmation
  RETURN jsonb_build_object(
    'ok', true,
    'claim_id', v_claim.id,
    'financial_event_id', v_event_id,
    'posting_count', COALESCE((v_f3_res->>'new_posting_count')::int, 2)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_relief_claim_payout(jsonb) TO authenticated;

COMMIT;
