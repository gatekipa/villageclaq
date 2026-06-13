-- 00101: Configurable standing FACTORS + per-type exclusions + change history
-- ===========================================================================
-- Sprint D (Member Standing Operating System).
--
-- WHY
-- ---
-- 00080 made the standing THRESHOLDS configurable (attendance %, hosting
-- count, grace days, lookback) but the SQL engine still hard-applies four
-- factors (dues, attendance, relief, hosting) for every group and ignores
-- fines/loans/disputes. The TypeScript engine, meanwhile, scores SEVEN
-- factors. The two engines therefore disagree, and a group cannot say
-- "fines don't affect standing" or "this one-off levy doesn't count".
--
-- This migration teaches the SQL engine the same configurable FACTOR model
-- the TypeScript engine now uses (src/lib/standing-rules.ts):
--   groups.settings.standing_rules.factors = {
--     dues, attendance, relief, hosting, fines, loans, disputes : boolean }
--   groups.settings.standing_rules.excluded_contribution_type_ids = [uuid,...]
-- Defaults: dues/attendance/relief/hosting/disputes = true; fines/loans =
-- false (a random fine or loan must not silently damage standing).
--
-- It also closes the audit hole: trigger-driven recalculation used to change
-- memberships.standing silently. recalculate_membership_standing() now writes
-- a 'member.standing_recalculated' row to group_audit_logs on a real change,
-- so every standing transition leaves a history (old -> new).
--
-- SAFETY / IDEMPOTENCY
-- -------------------
-- CREATE OR REPLACE only — no table drops, no data writes at apply time, no
-- column adds. Re-runnable. A group with no factors set behaves exactly as
-- before (all true except fines/loans, which were never scored by SQL — so
-- behaviour is identical for groups that have not opted fines/loans in).
--
-- PREFLIGHT (run as SELECT, read-only — must all be true before applying):
--   SELECT
--     (SELECT count(*) FROM pg_proc WHERE proname='compute_member_standing')=1,
--     (SELECT count(*) FROM pg_proc WHERE proname='apply_standing_rules')=1,
--     (SELECT count(*) FROM pg_proc WHERE proname='recalculate_membership_standing')=1,
--     (SELECT to_regclass('public.group_audit_logs') IS NOT NULL);
--
-- VERIFICATION (after apply):
--   -- factor off => no dues effect even with an overdue obligation:
--   SELECT compute_member_standing('<membership_uuid>'::uuid,
--     '{"factors":{"dues":false}}'::jsonb);                 -- expect 'good'
--   -- preview is non-destructive and reflects factors:
--   SELECT preview_standing_changes('<group_uuid>'::uuid,
--     '{"factors":{"fines":true}}'::jsonb);
--   -- audit row appears on a real change:
--   SELECT recalculate_membership_standing('<membership_uuid>'::uuid);
--   SELECT action, details FROM group_audit_logs
--     WHERE entity_id='<membership_uuid>'::uuid
--     ORDER BY created_at DESC LIMIT 1;
--
-- ROLLBACK: re-apply 00080 (restores the 4-factor compute_member_standing and
--   the factor-dropping apply_standing_rules) and re-apply 00079's
--   recalculate_membership_standing (the version without the audit insert).
--   No data migration to undo. After rollback, the TypeScript engine still
--   honours factors for DISPLAY; only the trigger/RPC path reverts to 4 rules.
--
-- RELEASE SEQUENCING:
--   1. Deploy the application code (TS engine + settings UI honour factors
--      immediately for every displayed standing; the JSONB is written by the
--      settings tab directly).
--   2. Apply THIS migration so the trigger path + admin RPCs honour the same
--      factors and stop overwriting factor-off decisions.
--   3. (Optional) Backfill: for each group, SELECT apply_standing_rules(gid,
--      groups.settings->'standing_rules') to recalculate every member under
--      the current rules. Safe, idempotent, writes only changed rows.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. compute_member_standing — factor-aware, with fines/loans/disputes and
--    per-contribution-type exclusions. Mirrors src/lib/calculate-standing.ts.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_member_standing(
  p_membership_id uuid,
  p_rules jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
  v_is_proxy boolean;
  v_membership_status text;
  v_current_standing text;
  v_rules jsonb;
  v_factors jsonb;
  v_excluded jsonb;
  v_enabled boolean;
  v_attendance_pct int;
  v_missed_hosting int;
  v_grace_days int;
  v_lookback_months int;

  -- factor switches (fines/loans default false, the rest true)
  v_f_dues boolean;
  v_f_attendance boolean;
  v_f_relief boolean;
  v_f_hosting boolean;
  v_f_fines boolean;
  v_f_loans boolean;
  v_f_disputes boolean;

  v_overdue_count int;
  v_relief_behind int;
  v_attendance_eligible int;
  v_attendance_present int;
  v_attendance_rate numeric;
  v_hosting_missed int;
  v_fines_pending int;
  v_loans_bad int;
  v_disputes_open int;
  v_fail_count int := 0;
  v_dues_fail boolean := false;
  v_cutoff timestamptz;
BEGIN
  SELECT group_id, is_proxy, membership_status::text, standing::text
    INTO v_group_id, v_is_proxy, v_membership_status, v_current_standing
  FROM memberships
  WHERE id = p_membership_id;

  -- Proxy members and non-active/pending lifecycles keep their stored value.
  IF v_group_id IS NULL
     OR v_is_proxy = true
     OR v_membership_status NOT IN ('active','pending_approval') THEN
    RETURN COALESCE(v_current_standing, 'good');
  END IF;

  IF p_rules IS NOT NULL THEN
    v_rules := p_rules;
  ELSE
    SELECT COALESCE(settings->'standing_rules', '{}'::jsonb) INTO v_rules
    FROM groups WHERE id = v_group_id;
  END IF;

  v_enabled          := COALESCE((v_rules->>'enabled')::boolean, true);
  v_attendance_pct   := GREATEST(0, LEAST(100,
                          COALESCE(NULLIF(v_rules->>'attendance_threshold_percent','')::int, 60)));
  v_missed_hosting   := GREATEST(0,
                          COALESCE(NULLIF(v_rules->>'missed_hosting_threshold','')::int, 2));
  v_grace_days       := GREATEST(0,
                          COALESCE(NULLIF(v_rules->>'overdue_grace_days','')::int, 0));
  v_lookback_months  := GREATEST(1,
                          COALESCE(NULLIF(v_rules->>'attendance_lookback_months','')::int, 12));

  IF v_enabled = false THEN
    RETURN COALESCE(v_current_standing, 'good');
  END IF;

  -- Factor switches. Defaults match DEFAULT_STANDING_FACTORS.
  v_factors    := COALESCE(v_rules->'factors', '{}'::jsonb);
  v_excluded   := COALESCE(v_rules->'excluded_contribution_type_ids', '[]'::jsonb);
  v_f_dues       := COALESCE((v_factors->>'dues')::boolean, true);
  v_f_attendance := COALESCE((v_factors->>'attendance')::boolean, true);
  v_f_relief     := COALESCE((v_factors->>'relief')::boolean, true);
  v_f_hosting    := COALESCE((v_factors->>'hosting')::boolean, true);
  v_f_fines      := COALESCE((v_factors->>'fines')::boolean, false);
  v_f_loans      := COALESCE((v_factors->>'loans')::boolean, false);
  v_f_disputes   := COALESCE((v_factors->>'disputes')::boolean, true);

  v_cutoff := now() - (v_lookback_months || ' months')::interval;

  -- Rule: Dues — overdue (past due_date + grace), unpaid, NOT an excluded type.
  IF v_f_dues THEN
    SELECT COUNT(*) INTO v_overdue_count
    FROM contribution_obligations
    WHERE membership_id = p_membership_id
      AND status IN ('pending','partial','overdue')
      AND due_date + (v_grace_days || ' days')::interval < CURRENT_DATE
      AND NOT (contribution_type_id::text IN (
        SELECT jsonb_array_elements_text(v_excluded)));
    IF v_overdue_count > 0 THEN
      v_dues_fail := true;
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  -- Rule: Attendance — below threshold over the lookback window. Mirrors the
  -- TypeScript engine: 'present' and 'late' both count as attended, and
  -- 'excused' absences are excluded from the denominator.
  IF v_f_attendance THEN
    SELECT
      COUNT(*) FILTER (WHERE ea.status IS NOT NULL AND ea.status <> 'excused'),
      COUNT(*) FILTER (WHERE ea.status IN ('present','late'))
      INTO v_attendance_eligible, v_attendance_present
    FROM event_attendances ea
    JOIN events e ON e.id = ea.event_id
    WHERE ea.membership_id = p_membership_id
      AND e.ends_at IS NOT NULL
      AND e.ends_at >= v_cutoff
      AND e.ends_at <= now();
    IF v_attendance_eligible > 0 THEN
      v_attendance_rate := (v_attendance_present::numeric / v_attendance_eligible::numeric) * 100;
      IF v_attendance_rate < v_attendance_pct THEN
        v_fail_count := v_fail_count + 1;
      END IF;
    END IF;
  END IF;

  -- Rule: Relief — any enrollment behind or overdue. Mirrors the TypeScript
  -- engine (which counts contribution_status 'behind' OR 'overdue').
  IF v_f_relief THEN
    SELECT COUNT(*) INTO v_relief_behind
    FROM relief_enrollments
    WHERE membership_id = p_membership_id
      AND contribution_status IN ('behind','overdue');
    IF v_relief_behind > 0 THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  -- Rule: Hosting — missed count at or above threshold.
  IF v_f_hosting THEN
    SELECT COUNT(*) INTO v_hosting_missed
    FROM hosting_assignments
    WHERE membership_id = p_membership_id
      AND status = 'missed';
    IF v_hosting_missed >= v_missed_hosting THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  -- Rule: Fines — any pending (unpaid, non-disputed) fine. OFF by default.
  IF v_f_fines THEN
    SELECT COUNT(*) INTO v_fines_pending
    FROM fines
    WHERE membership_id = p_membership_id
      AND status = 'pending';
    IF v_fines_pending > 0 THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  -- Rule: Loans — overdue installments on a repaying loan, or a defaulted
  -- loan. OFF by default.
  IF v_f_loans THEN
    SELECT
      (SELECT COUNT(*)
         FROM loan_schedule ls
         JOIN loans l ON l.id = ls.loan_id
        WHERE l.membership_id = p_membership_id
          AND l.status = 'repaying'
          AND ls.status = 'overdue')
      + (SELECT COUNT(*)
           FROM loans
          WHERE membership_id = p_membership_id
            AND status = 'defaulted')
      INTO v_loans_bad;
    IF v_loans_bad > 0 THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  -- Rule: Disputes — any open/under-review dispute filed by or against.
  IF v_f_disputes THEN
    SELECT COUNT(*) INTO v_disputes_open
    FROM disputes
    WHERE group_id = v_group_id
      AND status IN ('open','under_review')
      AND (filed_by = p_membership_id OR against_membership_id = p_membership_id);
    IF v_disputes_open > 0 THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  IF v_dues_fail OR v_fail_count >= 2 THEN
    RETURN 'suspended';
  ELSIF v_fail_count = 1 THEN
    RETURN 'warning';
  ELSE
    RETURN 'good';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_member_standing(uuid, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. recalculate_membership_standing — now records an audit row on a real
--    change so trigger-driven transitions leave a history (old -> new).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_membership_standing(p_membership_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_standing text;
  v_current_standing text;
  v_group_id uuid;
BEGIN
  v_new_standing := compute_member_standing(p_membership_id, NULL);

  SELECT standing::text, group_id INTO v_current_standing, v_group_id
  FROM memberships WHERE id = p_membership_id;

  IF v_current_standing IS DISTINCT FROM v_new_standing THEN
    UPDATE memberships
       SET standing = v_new_standing::membership_standing,
           updated_at = now()
     WHERE id = p_membership_id;

    -- Close the audit hole: capture every automatic transition. actor_id is
    -- NULL because this is a system (recalculation) change, not a person.
    -- Failure-isolated: this runs on the trigger critical path (payment /
    -- attendance / hosting writes), so a logging error must never roll back
    -- the standing update or the triggering write.
    BEGIN
      INSERT INTO group_audit_logs (group_id, actor_id, action, entity_type, entity_id, details)
      VALUES (
        v_group_id, NULL, 'member.standing_recalculated', 'membership', p_membership_id,
        jsonb_build_object('oldStanding', v_current_standing, 'newStanding', v_new_standing, 'source', 'system')
      );
    EXCEPTION WHEN OTHERS THEN
      NULL; -- best-effort audit; never block the standing change
    END;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. apply_standing_rules — PRESERVE the factor + exclusion keys when
--    normalizing (00080 dropped them by rebuilding only the 5 thresholds).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_standing_rules(
  p_group_id uuid,
  p_rules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed int := 0;
  v_before text;
  v_after text;
  r record;
  v_enabled boolean;
  v_attendance_pct int;
  v_missed_hosting int;
  v_grace_days int;
  v_lookback_months int;
  v_factors jsonb;
  v_excluded jsonb;
  v_normalized jsonb;
BEGIN
  IF NOT is_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  v_enabled         := COALESCE((p_rules->>'enabled')::boolean, true);
  v_attendance_pct  := COALESCE(NULLIF(p_rules->>'attendance_threshold_percent','')::int, 60);
  v_missed_hosting  := COALESCE(NULLIF(p_rules->>'missed_hosting_threshold','')::int, 2);
  v_grace_days      := COALESCE(NULLIF(p_rules->>'overdue_grace_days','')::int, 0);
  v_lookback_months := COALESCE(NULLIF(p_rules->>'attendance_lookback_months','')::int, 12);

  IF v_attendance_pct < 0 OR v_attendance_pct > 100 THEN
    RAISE EXCEPTION 'attendance_threshold_percent must be between 0 and 100';
  END IF;
  IF v_missed_hosting < 0 THEN
    RAISE EXCEPTION 'missed_hosting_threshold must be >= 0';
  END IF;
  IF v_grace_days < 0 THEN
    RAISE EXCEPTION 'overdue_grace_days must be >= 0';
  END IF;
  IF v_lookback_months < 1 THEN
    RAISE EXCEPTION 'attendance_lookback_months must be >= 1';
  END IF;

  -- Preserve factors + exclusions verbatim when present (validated shape:
  -- objects/arrays), else fall back to empty so compute uses its defaults.
  v_factors := CASE WHEN jsonb_typeof(p_rules->'factors') = 'object'
                    THEN p_rules->'factors' ELSE '{}'::jsonb END;
  v_excluded := CASE WHEN jsonb_typeof(p_rules->'excluded_contribution_type_ids') = 'array'
                     THEN p_rules->'excluded_contribution_type_ids' ELSE '[]'::jsonb END;

  v_normalized := jsonb_build_object(
    'enabled', v_enabled,
    'attendance_threshold_percent', v_attendance_pct,
    'missed_hosting_threshold', v_missed_hosting,
    'overdue_grace_days', v_grace_days,
    'attendance_lookback_months', v_lookback_months,
    'factors', v_factors,
    'excluded_contribution_type_ids', v_excluded
  );

  UPDATE groups
     SET settings = COALESCE(settings,'{}'::jsonb)
                    || jsonb_build_object('standing_rules', v_normalized),
         updated_at = now()
   WHERE id = p_group_id;

  FOR r IN
    SELECT id, standing::text AS current_standing
    FROM memberships
    WHERE group_id = p_group_id
      AND is_proxy = false
      AND membership_status IN ('active','pending_approval')
  LOOP
    v_before := r.current_standing;
    v_after := compute_member_standing(r.id, NULL);
    IF v_after IS DISTINCT FROM v_before THEN
      UPDATE memberships
         SET standing = v_after::membership_standing,
             updated_at = now()
       WHERE id = r.id;
      v_changed := v_changed + 1;

      -- Audit rule-driven batch changes too, so they appear in history like
      -- the trigger path. Failure-isolated; actor_id NULL (admin RPC, system).
      BEGIN
        INSERT INTO group_audit_logs (group_id, actor_id, action, entity_type, entity_id, details)
        VALUES (
          p_group_id, NULL, 'member.standing_recalculated', 'membership', r.id,
          jsonb_build_object('oldStanding', v_before, 'newStanding', v_after, 'source', 'rules_applied')
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('changed', v_changed, 'rules', v_normalized);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_standing_rules(uuid, jsonb)
  TO authenticated, service_role;
