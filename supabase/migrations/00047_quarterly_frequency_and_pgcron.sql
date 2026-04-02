-- Migration 00047: Add quarterly to relief_contribution_frequency + pg_cron scheduling
--
-- FIX 3: Adds 'quarterly' to the relief_contribution_frequency ENUM
-- FIX 2: Schedules daily batch sync via pg_cron (graceful skip if extension unavailable)
-- Also: re-creates trigger + batch functions to handle quarterly period

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. ADD 'quarterly' to relief_contribution_frequency ENUM
-- ════════════════════════════════════════════════════════════════════════════════
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is idempotent in PostgreSQL 12+

ALTER TYPE relief_contribution_frequency ADD VALUE IF NOT EXISTS 'quarterly';

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. RE-CREATE trigger function with quarterly support
-- ════════════════════════════════════════════════════════════════════════════════
-- Must use CREATE OR REPLACE (no DROP CASCADE — would nuke the trigger)

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
  IF NEW.relief_plan_id IS NULL OR NEW.status != 'confirmed' THEN
    RETURN NEW;
  END IF;

  SELECT re.id, re.contribution_status
  INTO v_enrollment_id, v_current_status
  FROM relief_enrollments re
  WHERE re.plan_id = NEW.relief_plan_id
    AND re.membership_id = NEW.membership_id
    AND re.is_active = true
  LIMIT 1;

  IF v_enrollment_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_current_status = 'suspended' THEN
    RETURN NEW;
  END IF;

  SELECT rp.contribution_frequency::text, rp.contribution_amount
  INTO v_frequency, v_required
  FROM relief_plans rp
  WHERE rp.id = NEW.relief_plan_id;

  IF v_required IS NULL OR v_required <= 0 THEN
    RETURN NEW;
  END IF;

  IF v_frequency = 'monthly' THEN
    v_period_start := date_trunc('month', CURRENT_DATE);
  ELSIF v_frequency = 'quarterly' THEN
    v_period_start := date_trunc('quarter', CURRENT_DATE);
  ELSIF v_frequency = 'annual' THEN
    v_period_start := date_trunc('year', CURRENT_DATE);
  ELSIF v_frequency = 'per_event' THEN
    v_period_start := NULL;
  ELSE
    v_period_start := date_trunc('month', CURRENT_DATE);
  END IF;

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

  IF v_total_paid >= v_required THEN
    v_new_status := 'up_to_date';
  ELSE
    v_new_status := 'behind';
  END IF;

  IF v_current_status IS DISTINCT FROM v_new_status THEN
    UPDATE relief_enrollments
    SET contribution_status = v_new_status,
        updated_at = NOW()
    WHERE id = v_enrollment_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. RE-CREATE batch function with quarterly support
-- ════════════════════════════════════════════════════════════════════════════════

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
    IF v_rec.required_amount IS NULL OR v_rec.required_amount <= 0 THEN
      CONTINUE;
    END IF;

    IF v_rec.frequency = 'monthly' THEN
      v_period_start := date_trunc('month', CURRENT_DATE);
    ELSIF v_rec.frequency = 'quarterly' THEN
      v_period_start := date_trunc('quarter', CURRENT_DATE);
    ELSIF v_rec.frequency = 'annual' THEN
      v_period_start := date_trunc('year', CURRENT_DATE);
    ELSIF v_rec.frequency = 'per_event' THEN
      v_period_start := NULL;
    ELSE
      v_period_start := date_trunc('month', CURRENT_DATE);
    END IF;

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

    IF v_total_paid >= v_rec.required_amount THEN
      v_new_status := 'up_to_date';
    ELSE
      v_new_status := 'behind';
    END IF;

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
-- 4. pg_cron scheduling (graceful skip if extension unavailable)
-- ════════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- Check if pg_cron extension is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing schedule if any (idempotent)
    PERFORM cron.unschedule('daily-relief-sync');
    -- Schedule daily at 2:00 AM UTC
    PERFORM cron.schedule(
      'daily-relief-sync',
      '0 2 * * *',
      'SELECT sync_relief_eligibility_statuses(); SELECT sync_relief_contribution_statuses();'
    );
    RAISE NOTICE 'pg_cron: scheduled daily-relief-sync at 02:00 UTC';
  ELSE
    RAISE NOTICE 'pg_cron extension not available — use Vercel cron (/api/cron/relief-sync) instead';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Gracefully handle cron.unschedule failure (e.g., job doesn't exist yet)
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'daily-relief-sync',
      '0 2 * * *',
      'SELECT sync_relief_eligibility_statuses(); SELECT sync_relief_contribution_statuses();'
    );
    RAISE NOTICE 'pg_cron: scheduled daily-relief-sync at 02:00 UTC (first time)';
  END IF;
END;
$$;
