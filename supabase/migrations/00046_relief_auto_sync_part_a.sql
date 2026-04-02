-- Migration 00046 Part A: Relief Auto-Sync — Schema + Backfill + Eligibility Lifecycle
--
-- Closes two data integrity gaps identified in the relief module audit:
--   GAP 1 (partial): Adds eligible_date + eligibility_status columns, backfills,
--                     creates BEFORE INSERT/UPDATE triggers for auto-computation
--   GAP 2 schema:    Prepares columns for contribution_status trigger (Part B)
--
-- Part B (00046_relief_auto_sync_part_b.sql) adds the payment trigger and batch sync functions.

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. ADD COLUMNS: eligible_date + eligibility_status
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE relief_enrollments
  ADD COLUMN IF NOT EXISTS eligible_date DATE;

ALTER TABLE relief_enrollments
  ADD COLUMN IF NOT EXISTS eligibility_status TEXT NOT NULL DEFAULT 'waiting_period';

-- Idempotent CHECK constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'relief_enrollments_eligibility_status_check'
  ) THEN
    ALTER TABLE relief_enrollments
      ADD CONSTRAINT relief_enrollments_eligibility_status_check
      CHECK (eligibility_status IN ('waiting_period', 'eligible', 'ineligible', 'suspended'));
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. BACKFILL existing rows
-- ════════════════════════════════════════════════════════════════════════════════

-- 2a. Set eligible_date = enrolled_at + plan.waiting_period_days for all rows missing it
UPDATE relief_enrollments re
SET eligible_date = re.enrolled_at::date + rp.waiting_period_days
FROM relief_plans rp
WHERE rp.id = re.plan_id
  AND re.eligible_date IS NULL;

-- 2b. Transition waiting_period → eligible for enrollments past their eligible_date
UPDATE relief_enrollments
SET eligibility_status = 'eligible'
WHERE eligible_date IS NOT NULL
  AND eligible_date <= CURRENT_DATE
  AND eligibility_status = 'waiting_period';

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. INDEXES for batch queries
-- ════════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_relief_enrollments_eligibility_waiting;
CREATE INDEX idx_relief_enrollments_eligibility_waiting
  ON relief_enrollments(eligible_date)
  WHERE eligibility_status = 'waiting_period';

DROP INDEX IF EXISTS idx_relief_enrollments_contribution_behind;
CREATE INDEX idx_relief_enrollments_contribution_behind
  ON relief_enrollments(contribution_status)
  WHERE contribution_status != 'up_to_date';

-- ════════════════════════════════════════════════════════════════════════════════
-- 4. BEFORE INSERT trigger: auto-compute eligible_date + eligibility_status
-- ════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS compute_relief_enrollment_eligibility() CASCADE;

CREATE OR REPLACE FUNCTION compute_relief_enrollment_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_waiting_days INTEGER;
BEGIN
  -- Look up waiting_period_days from the relief plan
  SELECT waiting_period_days INTO v_waiting_days
  FROM relief_plans
  WHERE id = NEW.plan_id;

  IF v_waiting_days IS NULL THEN
    v_waiting_days := 180; -- fallback default
  END IF;

  -- Compute eligible_date if not explicitly provided by the client
  IF NEW.eligible_date IS NULL THEN
    NEW.eligible_date := NEW.enrolled_at::date + v_waiting_days;
  END IF;

  -- Set eligibility_status based on eligible_date vs today
  IF NEW.eligible_date <= CURRENT_DATE THEN
    NEW.eligibility_status := 'eligible';
  ELSE
    NEW.eligibility_status := 'waiting_period';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_compute_enrollment_eligibility ON relief_enrollments;
CREATE TRIGGER trigger_compute_enrollment_eligibility
  BEFORE INSERT ON relief_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION compute_relief_enrollment_eligibility();

-- ════════════════════════════════════════════════════════════════════════════════
-- 5. BEFORE UPDATE trigger: re-check eligibility when eligible_date changes
-- ════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS recheck_relief_enrollment_eligibility() CASCADE;

CREATE OR REPLACE FUNCTION recheck_relief_enrollment_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when eligible_date actually changed
  IF OLD.eligible_date IS DISTINCT FROM NEW.eligible_date THEN
    IF NEW.eligible_date <= CURRENT_DATE THEN
      NEW.eligibility_status := 'eligible';
    ELSE
      -- Only revert to waiting_period if admin hasn't manually set suspended/ineligible
      IF OLD.eligibility_status NOT IN ('suspended', 'ineligible') THEN
        NEW.eligibility_status := 'waiting_period';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_recheck_enrollment_eligibility ON relief_enrollments;
CREATE TRIGGER trigger_recheck_enrollment_eligibility
  BEFORE UPDATE OF eligible_date ON relief_enrollments
  FOR EACH ROW
  EXECUTE FUNCTION recheck_relief_enrollment_eligibility();

-- ════════════════════════════════════════════════════════════════════════════════
-- 6. Batch function: transition all overdue waiting_period → eligible
-- ════════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS sync_relief_eligibility_statuses();

CREATE OR REPLACE FUNCTION sync_relief_eligibility_statuses()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE relief_enrollments
  SET eligibility_status = 'eligible',
      updated_at = NOW()
  WHERE eligibility_status = 'waiting_period'
    AND eligible_date <= CURRENT_DATE
    AND is_active = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
