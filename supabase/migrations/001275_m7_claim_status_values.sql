-- A separate history step is required because PostgreSQL cannot use newly
-- added enum values until the transaction that added them commits.
DO $pre$
BEGIN
  IF to_regtype('public.relief_claim_status') IS NULL THEN
    RAISE EXCEPTION 'M7_ABORT: S0/M2 relief_claim_status missing';
  END IF;
END
$pre$;
ALTER TYPE public.relief_claim_status ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE public.relief_claim_status ADD VALUE IF NOT EXISTS 'rejected';
