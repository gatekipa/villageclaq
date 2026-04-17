-- 00080: Configurable standing rules per group
-- ---------------------------------------------------------------------------
-- Migration 00079 hardcoded the standing thresholds:
--   * attendance threshold: 60%
--   * missed hosting threshold: 2+
--   * overdue grace: none (due_date < CURRENT_DATE)
--   * attendance lookback: 12 months
--
-- The PRD promises admins can configure these per group. This migration
-- moves thresholds into groups.settings.standing_rules JSONB with safe
-- defaults, refactors recalculate_membership_standing() to read from it,
-- and adds two RPCs:
--
--   preview_standing_changes(p_group_id, p_new_rules)
--     -> { total_members, would_become_good, would_become_warning,
--          would_become_suspended, would_change }
--
--   apply_standing_rules(p_group_id, p_rules)
--     -> integer count of memberships whose standing actually changed.
--
-- Schema inside groups.settings.standing_rules:
--   {
--     "enabled": true,
--     "attendance_threshold_percent": 60,
--     "missed_hosting_threshold": 2,
--     "overdue_grace_days": 0,
--     "attendance_lookback_months": 12
--   }
--
-- Defaults are picked to match 00079's behavior so a group with no
-- standing_rules set gets identical results after the migration.

-- ---------------------------------------------------------------------------
-- 1. Pure helper — compute a member's standing under a given rules object.
--    If p_rules IS NULL, read from the member's group settings.
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
  v_enabled boolean;
  v_attendance_pct int;
  v_missed_hosting int;
  v_grace_days int;
  v_lookback_months int;

  v_overdue_count int;
  v_relief_behind int;
  v_attendance_eligible int;
  v_attendance_present int;
  v_attendance_rate numeric;
  v_hosting_missed int;
  v_fail_count int := 0;
  v_dues_fail boolean := false;
  v_cutoff timestamptz;
BEGIN
  SELECT group_id, is_proxy, membership_status::text, standing::text
    INTO v_group_id, v_is_proxy, v_membership_status, v_current_standing
  FROM memberships
  WHERE id = p_membership_id;

  IF v_group_id IS NULL
     OR v_is_proxy = true
     OR v_membership_status NOT IN ('active','pending_approval') THEN
    RETURN COALESCE(v_current_standing, 'good');
  END IF;

  -- Resolve rules: explicit p_rules wins, else read from group.
  IF p_rules IS NOT NULL THEN
    v_rules := p_rules;
  ELSE
    SELECT COALESCE(settings->'standing_rules', '{}'::jsonb) INTO v_rules
    FROM groups WHERE id = v_group_id;
  END IF;

  -- Safe extraction with defaults matching 00079.
  -- NULLIF guards against empty strings ending up as 0.
  v_enabled          := COALESCE((v_rules->>'enabled')::boolean, true);
  v_attendance_pct   := GREATEST(0, LEAST(100,
                          COALESCE(NULLIF(v_rules->>'attendance_threshold_percent','')::int, 60)));
  v_missed_hosting   := GREATEST(0,
                          COALESCE(NULLIF(v_rules->>'missed_hosting_threshold','')::int, 2));
  v_grace_days       := GREATEST(0,
                          COALESCE(NULLIF(v_rules->>'overdue_grace_days','')::int, 0));
  v_lookback_months  := GREATEST(1,
                          COALESCE(NULLIF(v_rules->>'attendance_lookback_months','')::int, 12));

  -- Opt-out: groups can disable auto-standing and keep whatever was set.
  IF v_enabled = false THEN
    RETURN COALESCE(v_current_standing, 'good');
  END IF;

  v_cutoff := now() - (v_lookback_months || ' months')::interval;

  -- Rule 1: Dues — any obligation whose due_date + grace has already passed
  -- and is not paid.
  SELECT COUNT(*) INTO v_overdue_count
  FROM contribution_obligations
  WHERE membership_id = p_membership_id
    AND status IN ('pending','partial','overdue')
    AND due_date + (v_grace_days || ' days')::interval < CURRENT_DATE;
  IF v_overdue_count > 0 THEN
    v_dues_fail := true;
    v_fail_count := v_fail_count + 1;
  END IF;

  -- Rule 2: Attendance — below threshold over lookback window.
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
    IF v_attendance_rate < v_attendance_pct THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  -- Rule 3: Relief — any enrollment marked behind.
  SELECT COUNT(*) INTO v_relief_behind
  FROM relief_enrollments
  WHERE membership_id = p_membership_id
    AND is_active = true
    AND contribution_status = 'behind';
  IF v_relief_behind > 0 THEN
    v_fail_count := v_fail_count + 1;
  END IF;

  -- Rule 4 (soft): Hosting — missed count at or above threshold.
  SELECT COUNT(*) INTO v_hosting_missed
  FROM hosting_assignments
  WHERE membership_id = p_membership_id
    AND status = 'missed';
  IF v_hosting_missed >= v_missed_hosting THEN
    v_fail_count := v_fail_count + 1;
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
-- 2. Rewrite recalculate_membership_standing to delegate to the helper
--    (keeps the same name, so existing triggers from 00079 continue firing).
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
BEGIN
  v_new_standing := compute_member_standing(p_membership_id, NULL);

  SELECT standing::text INTO v_current_standing
  FROM memberships WHERE id = p_membership_id;

  IF v_current_standing IS DISTINCT FROM v_new_standing THEN
    UPDATE memberships
       SET standing = v_new_standing::membership_standing,
           updated_at = now()
     WHERE id = p_membership_id;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. preview_standing_changes — dry-run that returns a change summary.
--    SELECT-only — never writes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_standing_changes(
  p_group_id uuid,
  p_new_rules jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_would_good int := 0;
  v_would_warning int := 0;
  v_would_suspended int := 0;
  v_would_change int := 0;
  r record;
  v_projected text;
BEGIN
  IF NOT is_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT id, standing::text AS current_standing
    FROM memberships
    WHERE group_id = p_group_id
      AND is_proxy = false
      AND membership_status IN ('active','pending_approval')
  LOOP
    v_total := v_total + 1;
    v_projected := compute_member_standing(r.id, p_new_rules);
    IF v_projected = 'good' THEN
      v_would_good := v_would_good + 1;
    ELSIF v_projected = 'warning' THEN
      v_would_warning := v_would_warning + 1;
    ELSIF v_projected = 'suspended' THEN
      v_would_suspended := v_would_suspended + 1;
    END IF;
    IF v_projected IS DISTINCT FROM r.current_standing THEN
      v_would_change := v_would_change + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_members', v_total,
    'would_become_good', v_would_good,
    'would_become_warning', v_would_warning,
    'would_become_suspended', v_would_suspended,
    'would_change', v_would_change
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_standing_changes(uuid, jsonb)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. apply_standing_rules — validate, merge into groups.settings,
--    recalculate every member, return the count that actually changed.
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
  v_normalized jsonb;
BEGIN
  IF NOT is_group_admin(p_group_id) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  -- Validate + normalize. NULLIF guards against "" when a caller uses
  -- jsonb_build_object with missing numeric input.
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

  v_normalized := jsonb_build_object(
    'enabled', v_enabled,
    'attendance_threshold_percent', v_attendance_pct,
    'missed_hosting_threshold', v_missed_hosting,
    'overdue_grace_days', v_grace_days,
    'attendance_lookback_months', v_lookback_months
  );

  UPDATE groups
     SET settings = COALESCE(settings,'{}'::jsonb)
                    || jsonb_build_object('standing_rules', v_normalized),
         updated_at = now()
   WHERE id = p_group_id;

  -- Recalculate every non-proxy active member. Count the actual changes.
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
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'changed', v_changed,
    'rules', v_normalized
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_standing_rules(uuid, jsonb)
  TO authenticated, service_role;
