-- R-005: an explicit claimant withdrawal is distinct from a reviewer denial.
-- Keep this enum addition in its own migration so the following migration can
-- use the new value after the migration transaction commits.
ALTER TYPE public.relief_claim_status ADD VALUE IF NOT EXISTS 'withdrawn';
