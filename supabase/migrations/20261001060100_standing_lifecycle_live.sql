-- Founder standing lifecycle: fresh rule evaluation at read/decision time.
-- The two-argument API remains for existing recalculation commands. No applied
-- migration is edited and no historical obligation or receipt is rewritten.
CREATE OR REPLACE FUNCTION public.compute_member_standing(
  p_membership_id uuid,
  p_rules jsonb,
  p_at timestamptz
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

  -- factor switches (fines/loans/customActivity default false, the rest true)
  v_f_dues boolean;
  v_f_meeting boolean;
  v_f_event boolean;
  v_f_relief boolean;
  v_f_hosting boolean;
  v_f_fines boolean;
  v_f_loans boolean;
  v_f_disputes boolean;
  v_f_custom boolean;

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
  v_timezone text;
  v_local_today date;
BEGIN
  SELECT group_id, is_proxy, membership_status::text, calculated_standing::text
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
  -- Meeting vs event attendance. Back-compat: a pre-split JSONB stored a
  -- single 'attendance' flag — apply it to both when the new keys are absent.
  v_f_meeting    := COALESCE((v_factors->>'meetingAttendance')::boolean,
                             (v_factors->>'attendance')::boolean, true);
  v_f_event      := COALESCE((v_factors->>'eventAttendance')::boolean,
                             (v_factors->>'attendance')::boolean, false);
  v_f_relief     := COALESCE((v_factors->>'relief')::boolean, true);
  v_f_hosting    := COALESCE((v_factors->>'hosting')::boolean, true);
  v_f_fines      := COALESCE((v_factors->>'fines')::boolean, false);
  v_f_loans      := COALESCE((v_factors->>'loans')::boolean, false);
  v_f_disputes   := COALESCE((v_factors->>'disputes')::boolean, true);
  v_f_custom     := COALESCE((v_factors->>'customActivity')::boolean, false);

  -- The group calendar is payment_reminders.timezone; match the app's UTC fallback.
  SELECT COALESCE(NULLIF(settings->'payment_reminders'->>'timezone',''),'UTC')
    INTO v_timezone FROM groups WHERE id=v_group_id;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name=v_timezone) THEN
    v_timezone:='UTC';
  END IF;
  v_local_today := (p_at AT TIME ZONE v_timezone)::date;
  v_cutoff := p_at - (v_lookback_months || ' months')::interval;

  -- Rule: Dues — overdue (past due_date + grace), unpaid, NOT an excluded type.
  IF v_f_dues THEN
    SELECT COUNT(*) INTO v_overdue_count
    FROM contribution_obligations
    WHERE membership_id = p_membership_id
      AND status IN ('pending','partial','overdue')
      AND due_date + (v_grace_days || ' days')::interval < v_local_today
      AND NOT (contribution_type_id::text IN (
        SELECT jsonb_array_elements_text(v_excluded)));
    IF v_overdue_count > 0 THEN
      v_dues_fail := true;
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  -- Rule: Meeting attendance — formal gatherings (event_type meeting/agm).
  -- 'present'/'late' count as attended; 'excused' excluded from denominator.
  IF v_f_meeting THEN
    SELECT
      COUNT(*) FILTER (WHERE ea.status IS NOT NULL AND ea.status <> 'excused'),
      COUNT(*) FILTER (WHERE ea.status IN ('present','late'))
      INTO v_attendance_eligible, v_attendance_present
    FROM event_attendances ea
    JOIN events e ON e.id = ea.event_id
    WHERE ea.membership_id = p_membership_id
      AND COALESCE(e.event_type::text, 'meeting') IN ('meeting','agm')
      AND e.ends_at IS NOT NULL
      AND e.ends_at >= v_cutoff
      AND e.ends_at <= p_at;
    IF v_attendance_eligible > 0 THEN
      v_attendance_rate := (v_attendance_present::numeric / v_attendance_eligible::numeric) * 100;
      IF v_attendance_rate < v_attendance_pct THEN
        v_fail_count := v_fail_count + 1;
      END IF;
    END IF;
  END IF;

  -- Rule: Event attendance — casual events (everything except meeting/agm).
  -- OFF by default: a random event must not damage standing unless enabled.
  IF v_f_event THEN
    SELECT
      COUNT(*) FILTER (WHERE ea.status IS NOT NULL AND ea.status <> 'excused'),
      COUNT(*) FILTER (WHERE ea.status IN ('present','late'))
      INTO v_attendance_eligible, v_attendance_present
    FROM event_attendances ea
    JOIN events e ON e.id = ea.event_id
    WHERE ea.membership_id = p_membership_id
      AND COALESCE(e.event_type::text, 'meeting') NOT IN ('meeting','agm')
      AND e.ends_at IS NOT NULL
      AND e.ends_at >= v_cutoff
      AND e.ends_at <= p_at;
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

  -- Rule: Custom activities — declared slot, intentionally inert. No activity
  -- type feeds standing yet; this gate exists so a future standing-impacting
  -- activity type is evaluated HERE behind the toggle, never silently. Mirrors
  -- the TypeScript engine's customActivity slot.
  IF v_f_custom THEN
    NULL; -- no custom-activity data source yet
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

REVOKE ALL ON FUNCTION public.compute_member_standing(uuid,jsonb,timestamptz)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compute_member_standing(uuid,jsonb,timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.compute_member_standing(
  p_membership_id uuid, p_rules jsonb DEFAULT NULL
) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.compute_member_standing(p_membership_id,p_rules,now());
$$;
REVOKE ALL ON FUNCTION public.compute_member_standing(uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compute_member_standing(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.effective_standing_for_authority(
  p_membership_id uuid, p_at timestamptz DEFAULT now()
) RETURNS public.membership_standing
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT COALESCE(
    public.active_standing_override(m.id,p_at),
    public.compute_member_standing(m.id,NULL::jsonb,p_at)::public.membership_standing
  )
  FROM public.memberships m WHERE m.id=p_membership_id;
$$;
REVOKE ALL ON FUNCTION public.effective_standing_for_authority(uuid,timestamptz)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.effective_standing_for_authority(uuid,timestamptz)
  TO authenticated,service_role;

-- A group member already allowed to read the roster can obtain only that
-- group's effective standings. The shared roster cache uses these values.
CREATE OR REPLACE FUNCTION public.group_effective_standings(p_group_id uuid)
RETURNS TABLE(membership_id uuid, standing public.membership_standing)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.memberships actor
    WHERE actor.group_id=p_group_id AND actor.user_id=auth.uid()
      AND actor.membership_status='active'
  ) THEN RAISE EXCEPTION 'STANDING_ROSTER_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  RETURN QUERY
    SELECT m.id, public.effective_standing_for_authority(m.id,now())
    FROM public.memberships m WHERE m.group_id=p_group_id;
END;
$$;
REVOKE ALL ON FUNCTION public.group_effective_standings(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.group_effective_standings(uuid) TO authenticated;

-- The loan guarantor trigger is an authoritative eligibility gate; use the
-- same live standing rather than the stale materialized column.
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
  IF public.effective_standing_for_authority(v_guarantor.id,now())<>'good'
    THEN RAISE EXCEPTION 'GUARANTOR_NOT_IN_GOOD_STANDING'; END IF;
  IF EXISTS (SELECT 1 FROM public.loans l
    WHERE l.membership_id=v_guarantor.id AND l.group_id=NEW.group_id
      AND l.id<>NEW.id AND l.status='defaulted') THEN
    RAISE EXCEPTION 'GUARANTOR_HAS_DEFAULTED_LOANS'; END IF;
  RETURN NEW;
END
$$;
