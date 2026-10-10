-- Scoped event/attendance repair. Replaces two existing RPCs and two write
-- policies and adds three restrictive write guards; no installation-time
-- application-row DML, grant, ownership, or table change.
-- Existing rows are untouched.
CREATE OR REPLACE FUNCTION public.manage_event(
  p_group_id uuid,
  p_payload jsonb,
  p_event_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_new_id uuid;
  v_existing public.events%ROWTYPE;
  v_start timestamptz;
  v_end timestamptz;
  v_status public.event_status;
  v_type public.event_type;
  v_link text;
BEGIN
  IF NOT public.has_group_permission(p_group_id, 'events.manage', v_caller) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
  END IF;

  IF p_event_id IS NOT NULL THEN
    -- Ticket purchase uses this same lock before status/capacity observation.
    PERFORM pg_advisory_xact_lock(hashtext('m9_event_' || p_event_id::text));
    IF NOT public.has_group_permission(p_group_id, 'events.manage', v_caller) THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Cancellation is a status transition. It must not erase title or dates.
  IF p_event_id IS NOT NULL AND p_payload ? 'status' AND NOT (p_payload ? 'title') THEN
    IF p_payload->>'status' <> 'cancelled' THEN
      RAISE EXCEPTION 'EVENT_INVALID_STATUS' USING ERRCODE = '22023';
    END IF;
    UPDATE public.events SET status = 'cancelled'::public.event_status
      WHERE id = p_event_id AND group_id = p_group_id
      RETURNING id INTO v_new_id;
    IF v_new_id IS NULL THEN
      RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    RETURN jsonb_build_object('ok', true, 'event_id', v_new_id);
  END IF;

  v_start := (p_payload->>'starts_at')::timestamptz;
  v_end := (p_payload->>'ends_at')::timestamptz;
  v_type := (p_payload->>'event_type')::public.event_type;
  v_link := NULLIF(BTRIM(p_payload->>'meeting_link'), '');
  IF NULLIF(BTRIM(p_payload->>'title'), '') IS NULL OR v_start IS NULL OR v_type IS NULL THEN
    RAISE EXCEPTION 'EVENT_REQUIRED_FIELDS' USING ERRCODE = '22023';
  END IF;
  IF v_end IS NOT NULL AND v_end <= v_start THEN
    RAISE EXCEPTION 'EVENT_END_BEFORE_START' USING ERRCODE = '22023';
  END IF;
  IF v_link IS NOT NULL AND v_link !~* '^https://[^[:space:]]+$' THEN
    RAISE EXCEPTION 'EVENT_INVALID_MEETING_LINK' USING ERRCODE = '22023';
  END IF;

  IF p_event_id IS NULL THEN
    v_status := COALESCE((p_payload->>'status')::public.event_status,
      'upcoming'::public.event_status);
    IF v_status NOT IN ('upcoming'::public.event_status, 'completed'::public.event_status) THEN
      RAISE EXCEPTION 'EVENT_INVALID_STATUS' USING ERRCODE = '22023';
    END IF;
    -- A client-generated UUID is the creation identity. A lost response can be
    -- retried without adding a second event. Older callers may omit it.
    v_new_id := COALESCE((p_payload->>'creation_id')::uuid, gen_random_uuid());
    INSERT INTO public.events (
      id, group_id, title, title_fr, description, location, meeting_link,
      event_type, status, starts_at, ends_at, capacity, is_recurring,
      recurrence_rule, created_by
    ) VALUES (
      v_new_id, p_group_id, BTRIM(p_payload->>'title'),
      NULLIF(BTRIM(p_payload->>'title_fr'), ''), p_payload->>'description',
      p_payload->>'location', v_link, v_type, v_status, v_start, v_end,
      (p_payload->>'capacity')::integer,
      COALESCE((p_payload->>'is_recurring')::boolean, false),
      (p_payload->>'recurrence_rule')::public.recurrence_rule, v_caller
    ) ON CONFLICT (id) DO NOTHING;
    IF NOT FOUND THEN
      SELECT * INTO v_existing FROM public.events WHERE id = v_new_id;
      IF NOT FOUND OR v_existing.group_id IS DISTINCT FROM p_group_id
        OR v_existing.created_by IS DISTINCT FROM v_caller
        OR v_existing.title IS DISTINCT FROM BTRIM(p_payload->>'title')
        OR v_existing.title_fr IS DISTINCT FROM NULLIF(BTRIM(p_payload->>'title_fr'), '')
        OR v_existing.description IS DISTINCT FROM p_payload->>'description'
        OR v_existing.location IS DISTINCT FROM p_payload->>'location'
        OR v_existing.meeting_link IS DISTINCT FROM v_link
        OR v_existing.starts_at IS DISTINCT FROM v_start
        OR v_existing.ends_at IS DISTINCT FROM v_end
        OR v_existing.event_type IS DISTINCT FROM v_type
        OR v_existing.status IS DISTINCT FROM v_status
        OR v_existing.capacity IS DISTINCT FROM (p_payload->>'capacity')::integer
        OR v_existing.is_recurring IS DISTINCT FROM COALESCE((p_payload->>'is_recurring')::boolean, false)
        OR v_existing.recurrence_rule IS DISTINCT FROM (p_payload->>'recurrence_rule')::public.recurrence_rule THEN
        RAISE EXCEPTION 'EVENT_CREATION_ID_CONFLICT' USING ERRCODE = '23505';
      END IF;
      -- Current permission was rechecked above. A response-lost replay still
      -- succeeds if the once-future start has passed since the original save.
      RETURN jsonb_build_object('ok', true, 'event_id', v_new_id);
    END IF;
    IF v_start < now() AND
      (v_status <> 'completed'::public.event_status OR v_type <> 'meeting'::public.event_type
       OR v_end IS NULL OR v_end > now()) THEN
      RAISE EXCEPTION 'EVENT_PAST_START_REQUIRES_COMPLETED_MEETING' USING ERRCODE = '22023';
    END IF;
    IF v_start >= now() AND v_status = 'completed'::public.event_status THEN
      RAISE EXCEPTION 'EVENT_FUTURE_CANNOT_BE_COMPLETED' USING ERRCODE = '22023';
    END IF;
  ELSE
    UPDATE public.events SET
      title = BTRIM(p_payload->>'title'),
      title_fr = NULLIF(BTRIM(p_payload->>'title_fr'), ''),
      description = p_payload->>'description',
      location = p_payload->>'location',
      meeting_link = v_link,
      event_type = v_type,
      starts_at = v_start,
      ends_at = v_end,
      capacity = (p_payload->>'capacity')::integer,
      is_recurring = COALESCE((p_payload->>'is_recurring')::boolean, false),
      recurrence_rule = (p_payload->>'recurrence_rule')::public.recurrence_rule
    WHERE id = p_event_id AND group_id = p_group_id
    RETURNING id INTO v_new_id;
    IF v_new_id IS NULL THEN
      RAISE EXCEPTION 'EVENT_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'event_id', v_new_id);
END;
$$;

-- Officers may record a completed meeting after its window. Self check-in is
-- restricted to the QR window and cannot change another member's status.
CREATE OR REPLACE FUNCTION public.record_event_attendance(
  p_event_id uuid,
  p_membership_id uuid,
  p_group_id uuid,
  p_status public.attendance_status,
  p_checkin_method public.checkin_method DEFAULT 'manual'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_event public.events%ROWTYPE;
  v_member public.memberships%ROWTYPE;
  v_can_manage boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('m9_event_' || p_event_id::text));
  SELECT * INTO v_event FROM public.events
    WHERE id = p_event_id AND group_id = p_group_id;
  SELECT * INTO v_member FROM public.memberships
    WHERE id = p_membership_id AND group_id = p_group_id
      AND membership_status = 'active';
  IF v_event.id IS NULL OR v_member.id IS NULL THEN
    RAISE EXCEPTION 'EVENT_MEMBER_SCOPE' USING ERRCODE = '42501';
  END IF;
  IF v_event.status = 'cancelled'::public.event_status THEN
    RAISE EXCEPTION 'EVENT_CANCELLED' USING ERRCODE = '42501';
  END IF;

  v_can_manage := public.has_group_permission(p_group_id, 'attendance.manage', v_caller);
  IF NOT v_can_manage THEN
    IF v_member.user_id IS DISTINCT FROM v_caller
      OR p_status <> 'present'::public.attendance_status
      OR p_checkin_method <> 'qr'::public.checkin_method
      OR now() NOT BETWEEN v_event.starts_at - interval '30 minutes'
        AND COALESCE(v_event.ends_at, v_event.starts_at + interval '3 hours') + interval '30 minutes' THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('m9_attendance_' || p_event_id::text || '_' || p_membership_id::text));
  INSERT INTO public.event_attendances (event_id, membership_id, status, checked_in_via, checked_in_at, marked_by)
  VALUES (p_event_id, p_membership_id, p_status, p_checkin_method, now(), v_caller)
  ON CONFLICT (event_id, membership_id) DO UPDATE
  SET status = EXCLUDED.status,
      checked_in_via = EXCLUDED.checked_in_via,
      checked_in_at = EXCLUDED.checked_in_at,
      marked_by = EXCLUDED.marked_by,
      updated_at = now();
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Keep valid QR self check-in while removing attendance-for-another-member.
-- The existing permissive owner/admin ALL policy remains in force, so the
-- restrictive guards below are required for every write path.
DROP POLICY IF EXISTS rls_att_insert ON public.event_attendances;
CREATE POLICY rls_att_insert ON public.event_attendances
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.memberships m ON m.id = event_attendances.membership_id
        AND m.group_id = e.group_id AND m.membership_status = 'active'
      WHERE e.id = event_attendances.event_id
        AND e.status <> 'cancelled'::public.event_status
        AND (
          public.has_group_permission(e.group_id, 'attendance.manage', auth.uid())
          OR (
            m.user_id = auth.uid()
            AND event_attendances.status = 'present'::public.attendance_status
            AND event_attendances.checked_in_via = 'qr'::public.checkin_method
            AND event_attendances.marked_by = auth.uid()
            AND event_attendances.checked_in_at BETWEEN now() - interval '5 minutes' AND now() + interval '5 minutes'
            AND now() BETWEEN e.starts_at - interval '30 minutes'
              AND COALESCE(e.ends_at, e.starts_at + interval '3 hours') + interval '30 minutes'
          )
        )
    )
  );

-- Restrictive policies are ANDed with all permissive policies, including the
-- legacy owner/admin FOR ALL policy. Both old and new UPDATE row shapes must
-- point to an active membership in the event's own group.
CREATE POLICY event_attendance_member_scope_insert ON public.event_attendances
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.memberships m ON m.id = event_attendances.membership_id
      AND m.group_id = e.group_id AND m.membership_status = 'active'
    WHERE e.id = event_attendances.event_id
      AND e.status <> 'cancelled'::public.event_status
      AND (
        public.has_group_permission(e.group_id, 'attendance.manage', auth.uid())
        OR (
          m.user_id = auth.uid()
          AND event_attendances.status = 'present'::public.attendance_status
          AND event_attendances.checked_in_via = 'qr'::public.checkin_method
          AND event_attendances.marked_by = auth.uid()
          AND event_attendances.checked_in_at BETWEEN now() - interval '5 minutes' AND now() + interval '5 minutes'
          AND now() BETWEEN e.starts_at - interval '30 minutes'
            AND COALESCE(e.ends_at, e.starts_at + interval '3 hours') + interval '30 minutes'
        )
      )
  ));

-- The old update policy only recognized role-based admins. A current
-- attendance.manage assignment may also authorize an officer.
DROP POLICY IF EXISTS rls_att_update ON public.event_attendances;
CREATE POLICY rls_att_update ON public.event_attendances
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = event_attendances.event_id
      AND public.has_group_permission(e.group_id, 'attendance.manage', auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e WHERE e.id = event_attendances.event_id
      AND public.has_group_permission(e.group_id, 'attendance.manage', auth.uid())
  ));

CREATE POLICY event_attendance_member_scope_update ON public.event_attendances
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.memberships m ON m.id = event_attendances.membership_id
      AND m.group_id = e.group_id AND m.membership_status = 'active'
    WHERE e.id = event_attendances.event_id
      AND public.has_group_permission(e.group_id, 'attendance.manage', auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.memberships m ON m.id = event_attendances.membership_id
      AND m.group_id = e.group_id AND m.membership_status = 'active'
    WHERE e.id = event_attendances.event_id
      AND e.status <> 'cancelled'::public.event_status
      AND public.has_group_permission(e.group_id, 'attendance.manage', auth.uid())
  ));

CREATE POLICY event_attendance_member_scope_delete ON public.event_attendances
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.memberships m ON m.id = event_attendances.membership_id
      AND m.group_id = e.group_id AND m.membership_status = 'active'
    WHERE e.id = event_attendances.event_id
      AND public.has_group_permission(e.group_id, 'attendance.manage', auth.uid())
  ));
