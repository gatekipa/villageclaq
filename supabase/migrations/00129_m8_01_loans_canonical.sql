-- M8 loan principal and interest use fixed F3 postings. Existing legacy
-- repayments require explicit cutover; they are never silently reposted.
BEGIN;
DO $pre$
BEGIN
  IF to_regclass('public.loans') IS NULL OR to_regclass('public.loan_repayments') IS NULL
     OR to_regprocedure('financial_core.post_module_pair(uuid,text,text,text,numeric,text,uuid,uuid,uuid,uuid,timestamptz,text)') IS NULL
  THEN RAISE EXCEPTION 'M8_ABORT: S0/M2 loans or F3 adapter missing'; END IF;
END
$pre$;
ALTER TABLE public.loans
  ADD COLUMN disbursement_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  ADD COLUMN disbursement_account_id uuid REFERENCES public.financial_accounts(id) ON DELETE RESTRICT;
ALTER TABLE public.loan_repayments
  ADD COLUMN posting_status text NOT NULL DEFAULT 'legacy_recorded'
    CHECK (posting_status IN ('legacy_recorded','pending','posted')),
  ADD COLUMN request_id uuid UNIQUE,
  ADD COLUMN account_id uuid REFERENCES public.financial_accounts(id) ON DELETE RESTRICT,
  ADD COLUMN principal_amount numeric(18,8),
  ADD COLUMN interest_amount numeric(18,8),
  ADD COLUMN principal_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  ADD COLUMN interest_event_id uuid REFERENCES public.financial_events(id) ON DELETE RESTRICT,
  ADD CONSTRAINT loan_repayment_posted_link CHECK (
    posting_status<>'posted' OR
      (account_id IS NOT NULL AND request_id IS NOT NULL
       AND (principal_event_id IS NOT NULL OR interest_event_id IS NOT NULL))
  );
CREATE INDEX loan_repayments_pending_lookup ON public.loan_repayments(loan_id,created_at)
  WHERE posting_status='pending';
REVOKE INSERT,UPDATE,DELETE ON public.loan_repayments FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.assert_loan_guarantor_eligibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_guarantor public.memberships%ROWTYPE;
BEGIN
  IF NEW.guarantor_membership_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.guarantor_membership_id=NEW.membership_id THEN
    RAISE EXCEPTION 'CANNOT_GUARANTEE_OWN_LOAN'; END IF;
  SELECT * INTO v_guarantor FROM public.memberships WHERE id=NEW.guarantor_membership_id;
  IF v_guarantor.id IS NULL OR v_guarantor.group_id<>NEW.group_id
     OR v_guarantor.membership_status<>'active' THEN
    RAISE EXCEPTION 'GUARANTOR_NOT_ACTIVE'; END IF;
  IF v_guarantor.standing<>'good' THEN RAISE EXCEPTION 'GUARANTOR_NOT_IN_GOOD_STANDING'; END IF;
  IF EXISTS (SELECT 1 FROM public.loans l
    WHERE l.membership_id=v_guarantor.id AND l.group_id=NEW.group_id
      AND l.id<>NEW.id AND l.status='defaulted') THEN
    RAISE EXCEPTION 'GUARANTOR_HAS_DEFAULTED_LOANS'; END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS trg_assert_loan_guarantor_eligibility ON public.loans;
CREATE TRIGGER trg_assert_loan_guarantor_eligibility BEFORE INSERT OR UPDATE ON public.loans
  FOR EACH ROW EXECUTE FUNCTION public.assert_loan_guarantor_eligibility();

CREATE OR REPLACE FUNCTION public.post_loan_disbursement(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_loan public.loans%ROWTYPE; v_account public.financial_accounts%ROWTYPE;
  v_result jsonb; v_event uuid; v_occurred timestamptz; v_months int;
  v_scale int; v_factor numeric; v_each numeric; v_last numeric; v_i int;
BEGIN
  IF auth.uid() IS NULL OR p_command->>'loan_id' IS NULL
     OR p_command->>'account_id' IS NULL THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  SELECT * INTO v_loan FROM public.loans WHERE id=(p_command->>'loan_id')::uuid FOR UPDATE;
  IF v_loan.id IS NULL THEN RAISE EXCEPTION 'LOAN_NOT_FOUND'; END IF;
  PERFORM financial_core.assert_finances_manage(v_loan.group_id);
  IF v_loan.status NOT IN ('approved','repaying','completed') THEN
    RAISE EXCEPTION 'LOAN_NOT_APPROVED_FOR_DISBURSEMENT'; END IF;
  IF v_loan.amount_approved IS NULL OR v_loan.amount_approved<=0
     OR v_loan.total_repayable IS NULL OR v_loan.total_repayable<v_loan.amount_approved
     OR NOT EXISTS (SELECT 1 FROM public.memberships m
       WHERE m.id=v_loan.membership_id AND m.group_id=v_loan.group_id)
  THEN RAISE EXCEPTION 'LOAN_CONTRACT_INVALID'; END IF;
  IF EXISTS (SELECT 1 FROM public.loan_repayments r WHERE r.loan_id=v_loan.id
      AND r.posting_status='legacy_recorded') THEN
    RAISE EXCEPTION 'LEGACY_LOAN_CUTOVER_REQUIRED'; END IF;
  SELECT * INTO v_account FROM public.financial_accounts
    WHERE id=(p_command->>'account_id')::uuid FOR SHARE;
  IF v_account.id IS NULL OR v_account.group_id<>v_loan.group_id
     OR v_account.currency<>v_loan.currency OR
     (v_loan.disbursement_event_id IS NULL AND v_account.status<>'active')
  THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND_OR_INACTIVE'; END IF;
  v_occurred:=coalesce(v_loan.disbursed_at,
    (p_command->>'disbursed_at')::timestamptz,transaction_timestamp());
  v_result:=financial_core.post_module_pair(v_loan.group_id,'loan',v_loan.id::text,
    'principal_disbursement',v_loan.amount_approved,v_loan.currency,
    v_account.id,NULL,NULL,v_loan.membership_id,v_occurred,'Loan principal disbursement');
  v_event:=(v_result->>'event_id')::uuid;
  IF v_loan.disbursement_event_id IS NOT NULL THEN
    IF v_loan.disbursement_event_id<>v_event
       OR v_loan.disbursement_account_id<>v_account.id
    THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    RETURN jsonb_build_object('decision','IDEMPOTENT_RETURN_EXISTING',
      'loan_id',v_loan.id,'event_id',v_event,'posting_count',0);
  END IF;
  IF EXISTS (SELECT 1 FROM public.loan_schedule s WHERE s.loan_id=v_loan.id) THEN
    RAISE EXCEPTION 'SCHEDULE_CUTOVER_REQUIRED'; END IF;
  SELECT coalesce(c.max_repayment_months,12) INTO v_months
    FROM public.loan_configs c WHERE c.group_id=v_loan.group_id AND c.status='active'
    ORDER BY c.created_at DESC LIMIT 1;
  v_months:=coalesce(v_months,12);
  IF v_months NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'INVALID_REPAYMENT_TERM'; END IF;
  v_scale:=financial_core.currency_scale(v_loan.currency);
  v_factor:=power(10::numeric,v_scale);
  v_each:=ceil(v_loan.total_repayable/v_months*v_factor)/v_factor;
  FOR v_i IN 1..v_months LOOP
    v_last:=CASE WHEN v_i=v_months
      THEN v_loan.total_repayable-v_each*(v_months-1) ELSE v_each END;
    IF v_last<=0 THEN RAISE EXCEPTION 'INVALID_REPAYMENT_SCHEDULE'; END IF;
    INSERT INTO public.loan_schedule(loan_id,installment_number,due_date,amount_due)
    VALUES(v_loan.id,v_i,(v_occurred::date+(v_i||' months')::interval)::date,v_last);
  END LOOP;
  UPDATE public.loans SET status='repaying',disbursed_at=v_occurred,
    disbursement_event_id=v_event,disbursement_account_id=v_account.id,updated_at=now()
  WHERE id=v_loan.id;
  RETURN jsonb_build_object('decision','DISBURSED','loan_id',v_loan.id,
    'event_id',v_event,'schedule_count',v_months);
END
$$;

CREATE OR REPLACE FUNCTION public.prepare_loan_repayment(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_loan public.loans%ROWTYPE; v_account public.financial_accounts%ROWTYPE;
  v_existing public.loan_repayments%ROWTYPE; v_request uuid;
  v_amount numeric; v_method text; v_notes text; v_reference text;
BEGIN
  IF auth.uid() IS NULL OR p_command->>'loan_id' IS NULL
     OR p_command->>'account_id' IS NULL OR p_command->>'amount' IS NULL
  THEN RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  v_request:=coalesce((p_command->>'request_id')::uuid,gen_random_uuid());
  v_amount:=(p_command->>'amount')::numeric;
  v_method:=coalesce(p_command->>'payment_method','cash');
  v_notes:=nullif(p_command->>'notes','');
  v_reference:=nullif(p_command->>'reference_number','');
  SELECT * INTO v_loan FROM public.loans WHERE id=(p_command->>'loan_id')::uuid FOR SHARE;
  IF v_loan.id IS NULL THEN RAISE EXCEPTION 'LOAN_NOT_FOUND'; END IF;
  PERFORM financial_core.assert_finances_manage(v_loan.group_id);
  SELECT * INTO v_existing FROM public.loan_repayments
    WHERE request_id=v_request FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.loan_id<>v_loan.id OR v_existing.account_id<>(p_command->>'account_id')::uuid
       OR v_existing.amount<>v_amount OR v_existing.payment_method<>v_method
       OR v_existing.notes IS DISTINCT FROM v_notes
       OR v_existing.reference_number IS DISTINCT FROM v_reference
    THEN RAISE EXCEPTION 'CONFLICT'; END IF;
    RETURN jsonb_build_object('repayment_id',v_existing.id,'status',v_existing.posting_status);
  END IF;
  IF v_loan.status<>'repaying' OR v_amount<=0
     OR v_amount>v_loan.total_repayable-v_loan.total_repaid
  THEN RAISE EXCEPTION 'INVALID_REPAYMENT'; END IF;
  SELECT * INTO v_account FROM public.financial_accounts
    WHERE id=(p_command->>'account_id')::uuid FOR SHARE;
  IF v_account.id IS NULL OR v_account.group_id<>v_loan.group_id
     OR v_account.currency<>v_loan.currency OR v_account.status<>'active'
  THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND_OR_INACTIVE'; END IF;
  INSERT INTO public.loan_repayments
    (loan_id,amount,payment_method,reference_number,notes,recorded_by,
     posting_status,request_id,account_id)
  VALUES(v_loan.id,v_amount,v_method,v_reference,v_notes,auth.uid(),
    'pending',v_request,v_account.id)
  RETURNING * INTO v_existing;
  RETURN jsonb_build_object('repayment_id',v_existing.id,'status','pending');
END
$$;

CREATE OR REPLACE FUNCTION public.post_loan_repayment(p_command jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_repayment public.loan_repayments%ROWTYPE; v_loan public.loans%ROWTYPE;
  v_account public.financial_accounts%ROWTYPE; v_interest_due numeric;
  v_interest numeric; v_principal numeric; v_interest_paid numeric; v_category uuid;
  v_principal_event uuid; v_interest_event uuid; v_result jsonb;
  v_remaining numeric; v_apply numeric; v_schedule public.loan_schedule%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR p_command->>'repayment_id' IS NULL THEN
    RAISE EXCEPTION 'INVALID_COMMAND'; END IF;
  SELECT * INTO v_repayment FROM public.loan_repayments
    WHERE id=(p_command->>'repayment_id')::uuid FOR UPDATE;
  IF v_repayment.id IS NULL OR v_repayment.posting_status='legacy_recorded'
  THEN RAISE EXCEPTION 'REPAYMENT_NOT_FOUND'; END IF;
  SELECT * INTO v_loan FROM public.loans WHERE id=v_repayment.loan_id FOR UPDATE;
  PERFORM financial_core.assert_finances_manage(v_loan.group_id);
  IF v_repayment.posting_status='posted' THEN
    RETURN jsonb_build_object('decision','IDEMPOTENT_RETURN_EXISTING',
      'loan_id',v_loan.id,'repayment_id',v_repayment.id,
      'principal_event_id',v_repayment.principal_event_id,
      'interest_event_id',v_repayment.interest_event_id,'posting_count',0);
  END IF;
  IF v_loan.status<>'repaying' OR v_loan.disbursement_event_id IS NULL
     OR v_repayment.amount>v_loan.total_repayable-v_loan.total_repaid
     OR EXISTS (SELECT 1 FROM public.loan_repayments r
       WHERE r.loan_id=v_loan.id AND r.posting_status='legacy_recorded')
  THEN RAISE EXCEPTION 'LOAN_CUTOVER_OR_BALANCE_CONFLICT'; END IF;
  SELECT * INTO v_account FROM public.financial_accounts
    WHERE id=v_repayment.account_id FOR SHARE;
  IF v_account.id IS NULL OR v_account.group_id<>v_loan.group_id
     OR v_account.currency<>v_loan.currency OR v_account.status<>'active'
  THEN RAISE EXCEPTION 'ACCOUNT_NOT_FOUND_OR_INACTIVE'; END IF;
  SELECT coalesce(sum(r.interest_amount),0) INTO v_interest_paid
    FROM public.loan_repayments r WHERE r.loan_id=v_loan.id AND r.posting_status='posted';
  v_interest_due:=greatest(0,v_loan.total_repayable-v_loan.amount_approved-v_interest_paid);
  v_interest:=least(v_repayment.amount,v_interest_due);
  v_principal:=v_repayment.amount-v_interest;
  IF v_interest>0 THEN
    SELECT c.id INTO v_category FROM public.financial_categories c
    WHERE c.group_id=v_loan.group_id AND c.category_class='income' AND c.status='active'
    ORDER BY (c.name ILIKE '%loan%' OR c.name ILIKE '%interest%') DESC,c.created_at,c.id LIMIT 1;
    IF v_category IS NULL THEN RAISE EXCEPTION 'LOAN_INTEREST_INCOME_ACCOUNT_NOT_CONFIGURED'; END IF;
    v_result:=financial_core.post_module_pair(v_loan.group_id,'loan',v_repayment.id::text,
      'interest_receipt',v_interest,v_loan.currency,v_account.id,v_category,NULL,
      v_loan.membership_id,v_repayment.paid_at,'Loan interest receipt');
    v_interest_event:=(v_result->>'event_id')::uuid;
  END IF;
  IF v_principal>0 THEN
    v_result:=financial_core.post_module_pair(v_loan.group_id,'loan',v_repayment.id::text,
      'principal_repayment',v_principal,v_loan.currency,v_account.id,NULL,NULL,
      v_loan.membership_id,v_repayment.paid_at,'Loan principal repayment');
    v_principal_event:=(v_result->>'event_id')::uuid;
  END IF;
  v_remaining:=v_repayment.amount;
  FOR v_schedule IN SELECT * FROM public.loan_schedule s
    WHERE s.loan_id=v_loan.id AND s.amount_paid<s.amount_due
    ORDER BY s.installment_number FOR UPDATE LOOP
    EXIT WHEN v_remaining<=0;
    v_apply:=least(v_remaining,v_schedule.amount_due-v_schedule.amount_paid);
    UPDATE public.loan_schedule SET amount_paid=amount_paid+v_apply,
      status=CASE WHEN amount_paid+v_apply>=amount_due THEN 'paid' ELSE 'partial' END,
      updated_at=now() WHERE id=v_schedule.id;
    v_remaining:=v_remaining-v_apply;
  END LOOP;
  IF v_remaining>0 THEN RAISE EXCEPTION 'SCHEDULE_BALANCE_CONFLICT'; END IF;
  UPDATE public.loan_repayments SET posting_status='posted',
    principal_amount=v_principal,interest_amount=v_interest,
    principal_event_id=v_principal_event,interest_event_id=v_interest_event
  WHERE id=v_repayment.id;
  UPDATE public.loans SET total_repaid=total_repaid+v_repayment.amount,
    status=CASE WHEN total_repaid+v_repayment.amount>=total_repayable
      THEN 'completed' ELSE 'repaying' END,
    completed_at=CASE WHEN total_repaid+v_repayment.amount>=total_repayable
      THEN now() ELSE completed_at END,updated_at=now() WHERE id=v_loan.id;
  RETURN jsonb_build_object('decision','REPAID','loan_id',v_loan.id,
    'repayment_id',v_repayment.id,'principal_event_id',v_principal_event,
    'interest_event_id',v_interest_event,'principal',v_principal,'interest',v_interest);
END
$$;
REVOKE ALL ON FUNCTION public.post_loan_disbursement(jsonb),
  public.prepare_loan_repayment(jsonb),public.post_loan_repayment(jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_loan_disbursement(jsonb),
  public.prepare_loan_repayment(jsonb),public.post_loan_repayment(jsonb)
  TO authenticated;
COMMIT;
