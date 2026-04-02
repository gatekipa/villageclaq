-- Migration 00046 Part B: Relief Auto-Sync — Contribution Status Trigger + Batch Sync
--
-- Closes GAP 1 fully: contribution_status on relief_enrollments is now auto-maintained
-- by a trigger on the payments table. A batch function handles the no-payment case.
--
-- Depends on: 00046_relief_auto_sync_part_a.sql (eligible_date + eligibility_status columns)

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. TRIGGER FUNCTION: auto-sync contribution_status after payment confirmation
-- ════════════════════════════════════════════════════════════════════════════════
-- Fires AFTER INSERT OR UPDATE OF status ON payments
-- Condition: NEW.relief_plan_id IS NOT NULL AND NEW.status = 'confirmed'
--
-- Logic:
--   1. Find matching enrollment (plan_id + membership_id + is_active)
--   2. Get plan's contribution_frequency and contribution_amount
--   3. Sum confirmed payments in current period (month/year/all-time for per_event)
--   4. If total >= required → 'up_to_date'; else → 'behind'
--   5. Never sets 'suspended' — that's admin-only

DROP FUNCTION IF EXISTS sync_relief_contribution_status() CASCADE;

CREATE OR REPLACE FUNCTION sync_relief_contribution_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrollment_id  UUID;
  v_frequency      TEXT;
  v_required       NUMERIC;
  v_period_start   TIMESTAMPTZ;
  v_total_paid     NUMERIC;
  v_new_status     TEXT;
  v_current_status TEXT;
BEGIN
  -- Guard: only process confirmed payments tagged to a relief plan
  IF NEW.relief_plan_id IS NULL OR NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  -- Find the matching active enrollment
  SELECT re.id, re.contribution_status
  INTO v_enrollment_id, v_current_status
  FROM relief_enrollments re
  WHERE re.plan_id = NEW.relief_plan_id
    AND re.membership_id = NEW.membership_id
    AND re.is_active = true
  LIMIT 1;

  -- No matching enrollment — skip silently (payment for non-enrolled member)
  IF v_enrollment_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Do not overwrite admin-set 'suspended' status
  IF v_current_status = 'suspended' THEN
    RETURN NEW;
  END IF;

  -- Get plan contribution rules
  SELECT rp.contribution_frequency::text, rp.contribution_amount
  INTO v_frequency, v_required
  FROM relief_plans rp
  WHERE rp.id = NEW.relief_plan_id;

  IF v_required IS NULL OR v_required <= 0 THEN
    -- No contribution required — always up to date
    RETURN NEW;
  END IF;

  -- Determine period start based on contribution frequency
  IF v_frequency = 'monthly' THEN
    v_period_start := date_trunc('month', CURRENT_DATE);
  ELSIF v_frequency = 'annual' THEN
    v_period_start := date_trunc('year', CURRENT_DATE);
  ELSIF v_frequency = 'per_event' THEN
    v_period_start := NULL; -- no period; any confirmed payment counts
  ELSE
    -- Unknown frequency — fall back to monthly
    v_period_start := date_trunc('month', CURRENT_DATE);
  END IF;

  -- Calculate total confirmed payments in the current period
  IF v_frequency = 'per_event' THEN
    SELECT COALESCE(SUM(p.amount), 0) INTO v_total_paid
    FROM payments p
    WHERE p.relief_plan_id = NEW.relief_plan_id
      AND p.membership_id = NEW.membership_id
      AND p.status = 'confirmed';
  ELSE
    SELECT COALESCE(SUM(p.amount), 0) INTO v_total_paid
    FROM payments p
    WHERE p.relief_plan_id = NEW.relief_plan_id
      AND p.membership_id = NEW.membership_id
      AND p.status = 'confirmed'
      AND p.created_at >= v_period_start;
  END IF;

  -- Determine new contribution status
  IF v_total_paid >= v_required THEN
    v_new_status := 'up_to_date';
  ELSE
    v_new_status := 'behind';
  END IF;

  -- Update enrollment only if status actually changed (avoid unnecessary writes)
  IF v_current_status IS DISTINCT FROM v_new_status THEN
    UPDATE relief_enrollments
    SET contribution_status = v_new_status,
        updated_at = NOW()
    WHERE id = v_enrollment_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_relief_contribution_status ON payments;
CREATE TRIGGER trigger_sync_relief_contribution_status
  AFTER INSERT OR UPDATE OF status ON payments
  FOR EACH ROW
  WHEN (NEW.relief_plan_id IS NOT NULL AND NEW.status = 'confirmed')
  EXECUTE FUNCTION sync_relief_contribution_status();

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. BATCH FUNCTION: sync contribution_statuses for ALL active enrollments
-- ════════════════════════════════════════════════════════════════════════════════
-- Catches members who simply didn't pay — since the trigger only fires on
-- payment events. Call this daily via pg_cron, edge function, or Vercel cron.
--
-- For each active enrollment:
--   - Check if confirmed payments exist for the CURRENT period
--   - If total >= required → 'up_to_date'
--   - If total < required → 'behind'
--   - Never sets 'suspended' (admin-only)
-- Returns count of enrollments whose status was changed.

DROP FUNCTION IF EXISTS sync_relief_contribution_statuses();

CREATE OR REPLACE FUNCTION sync_relief_contribution_statuses()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated      INTEGER := 0;
  v_rec          RECORD;
  v_period_start TIMESTAMPTZ;
  v_total_paid   NUMERIC;
  v_new_status   TEXT;
BEGIN
  FOR v_rec IN
    SELECT
      re.id           AS enrollment_id,
      re.plan_id,
      re.membership_id,
      re.contribution_status,
      rp.contribution_frequency::text AS frequency,
      rp.contribution_amount          AS required_amount
    FROM relief_enrollments re
    JOIN relief_plans rp ON rp.id = re.plan_id
    WHERE re.is_active = true
      AND re.contribution_status != 'suspended'
  LOOP
    -- Skip plans with no contribution requirement
    IF v_rec.required_amount IS NULL OR v_rec.required_amount <= 0 THEN
      CONTINUE;
    END IF;

    -- Determine period start
    IF v_rec.frequency = 'monthly' THEN
      v_period_start := date_trunc('month', CURRENT_DATE);
    ELSIF v_rec.frequency = 'annual' THEN
      v_period_start := date_trunc('year', CURRENT_DATE);
    ELSIF v_rec.frequency = 'per_event' THEN
      v_period_start := NULL;
    ELSE
      v_period_start := date_trunc('month', CURRENT_DATE);
    END IF;

    -- Sum confirmed payments in period
    IF v_rec.frequency = 'per_event' THEN
      SELECT COALESCE(SUM(p.amount), 0) INTO v_total_paid
      FROM payments p
      WHERE p.relief_plan_id = v_rec.plan_id
        AND p.membership_id = v_rec.membership_id
        AND p.status = 'confirmed';
    ELSE
      SELECT COALESCE(SUM(p.amount), 0) INTO v_total_paid
      FROM payments p
      WHERE p.relief_plan_id = v_rec.plan_id
        AND p.membership_id = v_rec.membership_id
        AND p.status = 'confirmed'
        AND p.created_at >= v_period_start;
    END IF;

    -- Determine new status
    IF v_total_paid >= v_rec.required_amount THEN
      v_new_status := 'up_to_date';
    ELSE
      v_new_status := 'behind';
    END IF;

    -- Update if changed
    IF v_rec.contribution_status IS DISTINCT FROM v_new_status THEN
      UPDATE relief_enrollments
      SET contribution_status = v_new_status,
          updated_at = NOW()
      WHERE id = v_rec.enrollment_id;

      v_updated := v_updated + 1;
    END IF;
  END LOOP;

  RETURN v_updated;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. SCHEDULING NOTES
-- ════════════════════════════════════════════════════════════════════════════════
-- If pg_cron extension is enabled, uncomment these lines to run both batch
-- functions daily at midnight UTC:
--
-- SELECT cron.schedule(
--   'relief-daily-sync',
--   '0 0 * * *',
--   $$SELECT sync_relief_eligibility_statuses(); SELECT sync_relief_contribution_statuses();$$
-- );
--
-- If pg_cron is NOT available, call these functions from:
--   - A Supabase Edge Function on a cron schedule, OR
--   - A Vercel cron job hitting: POST /api/cron/relief-sync
--     which calls supabase.rpc('sync_relief_eligibility_statuses')
--     and supabase.rpc('sync_relief_contribution_statuses')
