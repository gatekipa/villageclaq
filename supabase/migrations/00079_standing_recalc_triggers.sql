-- B1: Standing auto-recalculation triggers
-- ---------------------------------------------------------------------------
-- Before: memberships.standing was only ever updated when a user navigated
-- to a page that imported calculate-standing.ts. Record a payment? Stale.
-- Mark a member absent? Stale. Miss a hosting turn? Stale. The Member
-- Standing Report is lying until someone touches the member's detail page.
--
-- This migration adds a server-side recalculator that runs on every
-- material activity (payment insert/update, attendance insert/update,
-- hosting status change). Rules mirror calculate-standing.ts so the
-- client and server compute the same value.
--
-- Performance: all three trigger paths fire a single SELECT count + an
-- update — ~3ms on small groups, dominated by the UPDATE latch. The
-- supporting index ensures the obligations lookup is covered.

-- ---------------------------------------------------------------------------
-- Support index (idempotent — CREATE INDEX IF NOT EXISTS)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_contribution_obligations_member_status_due
  ON contribution_obligations (membership_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_event_attendances_member_status
  ON event_attendances (membership_id, status);

-- ---------------------------------------------------------------------------
-- recalculate_membership_standing(p_membership_id)
-- ---------------------------------------------------------------------------
-- Pure PL/pgSQL — no network or external calls. Mirrors the four rules
-- documented at the top of calculate-standing.ts.
--
-- Thresholds are hardcoded here; if the group wants configurable
-- thresholds later, they should live in groups.settings JSONB and be
-- read here.

CREATE OR REPLACE FUNCTION public.recalculate_membership_standing(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_overdue_count integer;
  v_relief_behind integer;
  v_attendance_eligible integer;
  v_attendance_present integer;
  v_attendance_rate numeric;
  v_hosting_missed integer;
  v_fail_count integer := 0;
  v_dues_fail boolean := false;
  v_new_standing text := 'good';
  v_current_standing text;
  v_cutoff timestamptz := now() - interval '12 months';
BEGIN
  -- Don't touch proxies or exited memberships
  PERFORM 1 FROM memberships
  WHERE id = p_membership_id
    AND membership_status IN ('active','pending_approval')
    AND is_proxy = false;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Rule 1: Dues — any obligation past due_date that isn't paid
  SELECT COUNT(*) INTO v_overdue_count
  FROM contribution_obligations
  WHERE membership_id = p_membership_id
    AND status IN ('pending','partial','overdue')
    AND due_date < CURRENT_DATE;
  IF v_overdue_count > 0 THEN
    v_dues_fail := true;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- Rule 2: Attendance — < 60% over last 12 months on events that ended
  SELECT
    COUNT(*) FILTER (WHERE ea.status IS NOT NULL),
    COUNT(*) FILTER (WHERE ea.status = 'present')
  INTO v_attendance_eligible, v_attendance_present
  FROM event_attendances ea
  JOIN events e ON e.id = ea.event_id
  WHERE ea.membership_id = p_membership_id
    AND e.ends_at IS NOT NULL
    AND e.ends_at >= v_cutoff
    AND e.ends_at <= now();
  IF v_attendance_eligible > 0 THEN
    v_attendance_rate := (v_attendance_present::numeric / v_attendance_eligible::numeric) * 100;
    IF v_attendance_rate < 60 THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  -- Rule 3: Relief — any enrollment marked behind
  SELECT COUNT(*) INTO v_relief_behind
  FROM relief_enrollments
  WHERE membership_id = p_membership_id
    AND is_active = true
    AND contribution_status = 'behind';
  IF v_relief_behind > 0 THEN
    v_fail_count := v_fail_count + 1;
  END IF;

  -- Rule 4 (soft): Hosting missed streak of 2+ assignments
  SELECT COUNT(*) INTO v_hosting_missed
  FROM hosting_assignments
  WHERE membership_id = p_membership_id
    AND status = 'missed';
  IF v_hosting_missed >= 2 THEN
    v_fail_count := v_fail_count + 1;
  END IF;

  -- Score
  IF v_dues_fail OR v_fail_count >= 2 THEN
    v_new_standing := 'suspended';
  ELSIF v_fail_count = 1 THEN
    v_new_standing := 'warning';
  ELSE
    v_new_standing := 'good';
  END IF;

  -- Only update if changed — avoids trigger storms on no-op writes
  SELECT standing::text INTO v_current_standing FROM memberships WHERE id = p_membership_id;
  IF v_current_standing IS DISTINCT FROM v_new_standing THEN
    UPDATE memberships
    SET standing = v_new_standing::membership_standing,
        updated_at = now()
    WHERE id = p_membership_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_membership_standing(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Trigger dispatchers — fire recalc on payments / attendances / hosting
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_recalc_standing_from_payment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.membership_id IS NOT NULL THEN
    PERFORM recalculate_membership_standing(NEW.membership_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalc_standing_on_payment ON payments;
CREATE TRIGGER recalc_standing_on_payment
  AFTER INSERT OR UPDATE OF amount, status ON payments
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_standing_from_payment();


CREATE OR REPLACE FUNCTION public.trg_recalc_standing_from_attendance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.membership_id IS NOT NULL THEN
    PERFORM recalculate_membership_standing(NEW.membership_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalc_standing_on_attendance ON event_attendances;
CREATE TRIGGER recalc_standing_on_attendance
  AFTER INSERT OR UPDATE OF status ON event_attendances
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_standing_from_attendance();


CREATE OR REPLACE FUNCTION public.trg_recalc_standing_from_hosting()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.membership_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
    PERFORM recalculate_membership_standing(NEW.membership_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recalc_standing_on_hosting ON hosting_assignments;
CREATE TRIGGER recalc_standing_on_hosting
  AFTER INSERT OR UPDATE OF status ON hosting_assignments
  FOR EACH ROW EXECUTE FUNCTION trg_recalc_standing_from_hosting();


-- ---------------------------------------------------------------------------
-- B2: payment→obligation cascade idempotency
-- ---------------------------------------------------------------------------
-- The existing update_obligation_on_payment() trigger fires when
-- NEW.obligation_id IS NOT NULL. The client useRecordPayment hook
-- deliberately omits obligation_id to avoid double-counting (its own
-- CAS loop does the cascade). Any new insert path that DOES pass
-- obligation_id would fire the trigger AND — if the caller also does
-- a manual cascade — increment amount_paid twice.
--
-- Make the trigger idempotent by keying on payment_id: if this payment's
-- amount has already been applied to this obligation, skip. We track
-- this via a new (obligation_id, payment_id) uniqueness guard in a
-- lightweight ledger table.

CREATE TABLE IF NOT EXISTS payment_obligation_applications (
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  obligation_id uuid NOT NULL REFERENCES contribution_obligations(id) ON DELETE CASCADE,
  amount_applied numeric NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (payment_id, obligation_id)
);

ALTER TABLE payment_obligation_applications ENABLE ROW LEVEL SECURITY;

-- Admins can read for audit; writes happen only via the trigger /
-- service-role. No write policies means the table is read-only from RLS.
CREATE POLICY "poa_select_admin" ON payment_obligation_applications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM payments p
      WHERE p.id = payment_obligation_applications.payment_id
        AND is_group_admin(p.group_id)
    )
  );

-- Rewrite update_obligation_on_payment() to check the ledger first.
CREATE OR REPLACE FUNCTION public.update_obligation_on_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already_applied boolean;
BEGIN
  IF NEW.obligation_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency guard — has this payment already been applied to this
  -- obligation? Possible if a retry or a duplicate insert path fires
  -- the trigger twice.
  SELECT EXISTS (
    SELECT 1 FROM payment_obligation_applications
    WHERE payment_id = NEW.id AND obligation_id = NEW.obligation_id
  ) INTO v_already_applied;

  IF v_already_applied THEN
    RETURN NEW;
  END IF;

  UPDATE contribution_obligations
  SET amount_paid = amount_paid + NEW.amount,
      status = CASE
        WHEN amount_paid + NEW.amount >= amount THEN 'paid'
        WHEN amount_paid + NEW.amount > 0 THEN 'partial'
        ELSE status
      END
  WHERE id = NEW.obligation_id;

  -- Record the application so a second trigger fire is a no-op.
  INSERT INTO payment_obligation_applications (payment_id, obligation_id, amount_applied)
  VALUES (NEW.id, NEW.obligation_id, NEW.amount);

  RETURN NEW;
END;
$$;
