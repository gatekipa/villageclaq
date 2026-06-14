-- 00104: Confirmed-payment accounting correction (Build 4)
-- ===========================================================================
-- CREATED, NOT APPLIED. Single-file manual migration. Apply after the Build 4
-- deploy is READY, as a verbatim single-file execution — do NOT run a broad
-- migration runner. Re-runnable (OR REPLACE / guarded backfill).
--
-- FINDING ADDRESSED
-- -----------------
-- [DANGEROUS — pending counted as collected] The payment→obligation cascade
-- trigger on_payment_recorded → update_obligation_on_payment() (00002, rewritten
-- 00079) fires AFTER INSERT ON payments and does
--     amount_paid := amount_paid + NEW.amount
-- with NO check on NEW.status. The member pay-now flow inserts a payment with
-- obligation_id SET and status='pending_confirmation' (RLS forces members to
-- that status), so the obligation's amount_paid is credited — and its status
-- flipped to paid/partial — BEFORE any treasurer confirms. Worse, the trigger
-- is INSERT-only, so a later REJECT (status→rejected) never backs the credit
-- out: amount_paid stays inflated forever. amount_paid is therefore a polluted
-- basis that overstates collections, understates outstanding, and can flip an
-- overdue member to 'good' standing on unconfirmed money.
--
-- FIX (two parts):
--   1. Replace the delta trigger with a RECOMPUTE-FROM-CONFIRMED trigger that
--      fires on INSERT / UPDATE OF (status,amount,obligation_id) / DELETE and
--      sets amount_paid = Σ CONFIRMED payments for the affected obligation(s).
--      This is idempotent and self-healing: confirm, reject, edit, delete, and
--      re-point all converge to the confirmed total. 'waived' is never
--      overridden. (The sibling relief trigger sync_relief_contribution_status
--      already uses this confirmed-only pattern — this brings dues in line.)
--   2. One-time BACKFILL: recompute amount_paid + status for every obligation
--      whose stored amount_paid disagrees with its confirmed total, healing the
--      historical pollution from pending/rejected pay-now submissions.
--
-- NOTE — app code is already correct without this migration: Build 4 reads
-- every figure through src/lib/money.ts, which derives "collected" and per-
-- obligation "paid" from CONFIRMED payments, never from amount_paid. This
-- migration brings the stored column (and anything still reading it, e.g.
-- member-standing Rule 1) onto the same confirmed basis.
--
-- PREFLIGHT (read-only — confirm before applying):
--   -- how many obligations are currently polluted (amount_paid != confirmed Σ):
--   WITH r AS (
--     SELECT co.id, co.amount_paid,
--            COALESCE(SUM(p.amount) FILTER (
--              WHERE p.status NOT IN ('pending_confirmation','rejected')),0) AS confirmed_sum
--     FROM contribution_obligations co
--     LEFT JOIN payments p ON p.obligation_id = co.id
--     GROUP BY co.id, co.amount_paid)
--   SELECT count(*) AS polluted_rows FROM r WHERE amount_paid IS DISTINCT FROM confirmed_sum;
--   -- confirm the legacy AFTER-INSERT trigger is what's live:
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.payments'::regclass AND NOT tgisinternal;
--
-- VERIFICATION (after apply):
--   -- recompute helper + new trigger present:
--   SELECT count(*) FROM pg_proc WHERE proname='recalc_obligation_amount_paid'; -- expect 1
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.payments'::regclass AND tgname='on_payment_changed'; -- expect 1 row
--   SELECT count(*) FROM pg_trigger WHERE tgrelid='public.payments'::regclass AND tgname='on_payment_recorded'; -- expect 0
--   -- no obligation remains polluted (re-run the preflight CTE): expect 0
--   -- function is confirmed-gated:
--   SELECT pg_get_functiondef('public.update_obligation_on_payment()'::regprocedure) ILIKE '%recalc_obligation_amount_paid%';
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS on_payment_changed ON public.payments;
--   DROP FUNCTION IF EXISTS public.recalc_obligation_amount_paid(uuid);
--   -- re-apply the 00079 update_obligation_on_payment() body and recreate
--   --   CREATE TRIGGER on_payment_recorded AFTER INSERT ON public.payments
--   --   FOR EACH ROW EXECUTE FUNCTION public.update_obligation_on_payment();
--   -- (the backfilled amount_paid values are the CORRECT confirmed totals; there
--   --  is no need to "undo" them — rollback only restores the old trigger.)
--
-- RELEASE SEQUENCING: independent of the app code (the app already reads the
--   confirmed basis via money.ts). Apply any time after the Build 4 deploy is
--   READY. Single-file manual execution; do NOT run a broad migration runner.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Recompute helper: set an obligation's amount_paid = Σ confirmed payments,
--    and re-derive its status (preserving waived / dormant overdue).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_obligation_amount_paid(p_obligation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_confirmed numeric;
  v_amount    numeric;
  v_status    obligation_status;
BEGIN
  IF p_obligation_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_confirmed
  FROM payments
  WHERE obligation_id = p_obligation_id
    AND status NOT IN ('pending_confirmation', 'rejected');

  SELECT amount, status INTO v_amount, v_status
  FROM contribution_obligations
  WHERE id = p_obligation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE contribution_obligations
  SET amount_paid = v_confirmed,
      status = CASE
        WHEN v_status = 'waived' THEN 'waived'
        WHEN v_amount > 0 AND v_confirmed >= v_amount THEN 'paid'
        WHEN v_confirmed > 0 THEN 'partial'
        WHEN v_status = 'overdue' THEN 'overdue'
        ELSE 'pending'
      END
  WHERE id = p_obligation_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Trigger function: recompute the affected obligation(s) on any payment
--    change. Handles re-pointed obligation_id (recomputes both old + new).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_obligation_on_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- New/updated row's obligation.
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.obligation_id IS NOT NULL THEN
    PERFORM public.recalc_obligation_amount_paid(NEW.obligation_id);
  END IF;

  -- Old obligation when a payment is deleted or re-pointed to a different one.
  IF TG_OP = 'DELETE' AND OLD.obligation_id IS NOT NULL THEN
    PERFORM public.recalc_obligation_amount_paid(OLD.obligation_id);
  ELSIF TG_OP = 'UPDATE'
        AND OLD.obligation_id IS NOT NULL
        AND OLD.obligation_id IS DISTINCT FROM NEW.obligation_id THEN
    PERFORM public.recalc_obligation_amount_paid(OLD.obligation_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Replace the AFTER-INSERT-only trigger with one that also fires on the
-- status/amount/obligation changes and on delete.
DROP TRIGGER IF EXISTS on_payment_recorded ON public.payments;
DROP TRIGGER IF EXISTS on_payment_changed ON public.payments;
CREATE TRIGGER on_payment_changed
  AFTER INSERT OR UPDATE OF status, amount, obligation_id OR DELETE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_obligation_on_payment();

-- ---------------------------------------------------------------------------
-- 3. One-time backfill: heal historical pollution. Only touches obligations
--    whose stored amount_paid disagrees with the confirmed total.
-- ---------------------------------------------------------------------------
WITH recomputed AS (
  SELECT co.id,
         co.amount AS oblig_amount,
         co.status AS oblig_status,
         COALESCE(SUM(p.amount) FILTER (
           WHERE p.status NOT IN ('pending_confirmation', 'rejected')), 0) AS confirmed_sum
  FROM contribution_obligations co
  LEFT JOIN payments p ON p.obligation_id = co.id
  GROUP BY co.id, co.amount, co.status
)
UPDATE contribution_obligations co
SET amount_paid = r.confirmed_sum,
    status = CASE
      WHEN r.oblig_status = 'waived' THEN 'waived'::obligation_status
      WHEN r.oblig_amount > 0 AND r.confirmed_sum >= r.oblig_amount THEN 'paid'::obligation_status
      WHEN r.confirmed_sum > 0 THEN 'partial'::obligation_status
      WHEN r.oblig_status = 'overdue' THEN 'overdue'::obligation_status
      ELSE 'pending'::obligation_status
    END
FROM recomputed r
WHERE r.id = co.id
  AND co.amount_paid IS DISTINCT FROM r.confirmed_sum;
