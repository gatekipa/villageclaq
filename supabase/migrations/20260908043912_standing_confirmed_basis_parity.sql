-- P0 standing parity hotfix.
--
-- The application standing engine derives overdue dues from the F0
-- confirmed-payment allocation.  The prior SQL engine trusted the cached
-- obligation status instead.  Reuse the same durable allocation projection
-- that financial_private.reconcile_member rebuilds atomically; do not add a
-- second payment allocation algorithm here.

CREATE OR REPLACE FUNCTION public.compute_member_standing(
  p_membership_id uuid,
  p_rules jsonb DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = ''
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

  v_f_dues boolean;
  v_f_meeting boolean;
  v_f_event boolean;
  v_f_relief boolean;
  v_f_hosting boolean;
  v_f_fines boolean;
  v_f_loans boolean;
  v_f_disputes boolean;
  v_f_custom boolean;

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
  SELECT m.group_id, m.is_proxy, m.membership_status::text, m.standing::text
    INTO v_group_id, v_is_proxy, v_membership_status, v_current_standing
  FROM public.memberships m
  WHERE m.id = p_membership_id;

  IF v_group_id IS NULL THEN
    RETURN 'good';
  END IF;

  -- Direct authenticated callers must belong to the subject's tenant.  Trigger
  -- and service paths execute without an end-user uid and remain available only
  -- through their existing grants.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.memberships viewer
    WHERE viewer.group_id = v_group_id
      AND viewer.user_id = auth.uid()
      AND viewer.membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  -- Proxy members and non-active/pending lifecycles keep their stored value,
  -- but only after the caller boundary above has been enforced.
  IF v_is_proxy = true
     OR v_membership_status NOT IN ('active','pending_approval') THEN
    RETURN COALESCE(v_current_standing, 'good');
  END IF;

  IF p_rules IS NOT NULL THEN
    v_rules := p_rules;
  ELSE
    SELECT COALESCE(g.settings->'standing_rules', '{}'::jsonb) INTO v_rules
    FROM public.groups g
    WHERE g.id = v_group_id;
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

  v_factors    := COALESCE(v_rules->'factors', '{}'::jsonb);
  v_excluded   := COALESCE(v_rules->'excluded_contribution_type_ids', '[]'::jsonb);
  v_f_dues       := COALESCE((v_factors->>'dues')::boolean, true);
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

  v_cutoff := now() - (v_lookback_months || ' months')::interval;

  -- Allocate across every dues assessment first, exactly as money.ts does, and
  -- apply the standing exclusion only when deciding whether remaining debt is
  -- disqualifying.  Applications are rebuilt by reconcile_member from
  -- confirmed, non-relief payments, typed first and then general, oldest due/id
  -- first, within one group/member/ledger epoch.  The payment join makes the
  -- confirmed-only contract explicit even if cached obligation fields are stale.
  IF v_f_dues THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.contribution_obligations o
      LEFT JOIN public.payment_obligation_applications a
        ON a.obligation_id = o.id
       AND a.ledger_epoch_id = o.ledger_epoch_id
      LEFT JOIN public.payments p
        ON p.id = a.payment_id
       AND p.ledger_epoch_id = a.ledger_epoch_id
       AND p.group_id = o.group_id
       AND p.membership_id = o.membership_id
       AND p.currency = o.currency
       AND p.relief_plan_id IS NULL
       AND COALESCE(NULLIF(p.status, ''), 'confirmed') = 'confirmed'
      WHERE o.group_id = v_group_id
        AND o.membership_id = p_membership_id
        AND o.status <> 'waived'
        AND o.due_date + v_grace_days < CURRENT_DATE
        AND NOT (o.contribution_type_id::text IN (
          SELECT jsonb_array_elements_text(v_excluded)))
      GROUP BY o.id, o.amount
      HAVING o.amount > COALESCE(
        SUM(a.amount_applied) FILTER (WHERE p.id IS NOT NULL), 0)
    ) INTO v_dues_fail;

    IF v_dues_fail THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  IF v_f_meeting THEN
    SELECT
      COUNT(*) FILTER (WHERE ea.status IS NOT NULL AND ea.status <> 'excused'),
      COUNT(*) FILTER (WHERE ea.status IN ('present','late'))
      INTO v_attendance_eligible, v_attendance_present
    FROM public.event_attendances ea
    JOIN public.events e ON e.id = ea.event_id
    WHERE ea.membership_id = p_membership_id
      AND COALESCE(e.event_type::text, 'meeting') IN ('meeting','agm')
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

  IF v_f_event THEN
    SELECT
      COUNT(*) FILTER (WHERE ea.status IS NOT NULL AND ea.status <> 'excused'),
      COUNT(*) FILTER (WHERE ea.status IN ('present','late'))
      INTO v_attendance_eligible, v_attendance_present
    FROM public.event_attendances ea
    JOIN public.events e ON e.id = ea.event_id
    WHERE ea.membership_id = p_membership_id
      AND COALESCE(e.event_type::text, 'meeting') NOT IN ('meeting','agm')
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

  IF v_f_relief THEN
    SELECT COUNT(*) INTO v_relief_behind
    FROM public.relief_enrollments re
    WHERE re.membership_id = p_membership_id
      AND re.contribution_status IN ('behind','overdue');
    IF v_relief_behind > 0 THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  IF v_f_hosting THEN
    SELECT COUNT(*) INTO v_hosting_missed
    FROM public.hosting_assignments ha
    WHERE ha.membership_id = p_membership_id
      AND ha.status = 'missed';
    IF v_hosting_missed >= v_missed_hosting THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  IF v_f_fines THEN
    SELECT COUNT(*) INTO v_fines_pending
    FROM public.fines f
    WHERE f.membership_id = p_membership_id
      AND f.status = 'pending';
    IF v_fines_pending > 0 THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  IF v_f_loans THEN
    SELECT
      (SELECT COUNT(*)
         FROM public.loan_schedule ls
         JOIN public.loans l ON l.id = ls.loan_id
        WHERE l.membership_id = p_membership_id
          AND l.status = 'repaying'
          AND ls.status = 'overdue')
      + (SELECT COUNT(*)
           FROM public.loans l
          WHERE l.membership_id = p_membership_id
            AND l.status = 'defaulted')
      INTO v_loans_bad;
    IF v_loans_bad > 0 THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  IF v_f_disputes THEN
    SELECT COUNT(*) INTO v_disputes_open
    FROM public.disputes d
    WHERE d.group_id = v_group_id
      AND d.status IN ('open','under_review')
      AND (d.filed_by = p_membership_id OR d.against_membership_id = p_membership_id);
    IF v_disputes_open > 0 THEN
      v_fail_count := v_fail_count + 1;
    END IF;
  END IF;

  IF v_f_custom THEN
    NULL;
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

-- CREATE OR REPLACE preserves prior privileges; make the intended RPC surface
-- explicit and do not leave SECURITY DEFINER execution inherited through PUBLIC.
REVOKE ALL ON FUNCTION public.compute_member_standing(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_member_standing(uuid, jsonb)
  TO authenticated, service_role;

-- The historical recalculation RPC delegates to compute_member_standing, so its
-- direct cross-tenant calls now fail through the membership guard above.  Keep
-- trigger/service execution while removing the inherited anonymous surface.
REVOKE ALL ON FUNCTION public.recalculate_membership_standing(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recalculate_membership_standing(uuid)
  TO authenticated, service_role;
