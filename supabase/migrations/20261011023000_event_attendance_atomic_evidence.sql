-- PREPARED ONLY. This migration is not covered by the approval for 20261010233459.
-- Do not apply without separate approval for this exact file and hash.
-- Existing attendance and audit rows are left intact. Installation performs
-- function/trigger/policy/trigger-function-ACL DDL only. Later writes create
-- server-authored evidence in the same transaction as each attendance insert or
-- material update. Exact replays preserve the first check-in timestamp/marker.
BEGIN;

-- The existing public RPC keeps its signature, authorization and EXECUTE ACL.
-- A repeated identical status/method is not a new check-in or correction.
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
      updated_at = now()
  WHERE public.event_attendances.status IS DISTINCT FROM EXCLUDED.status
     OR public.event_attendances.checked_in_via IS DISTINCT FROM EXCLUDED.checked_in_via;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_event_attendance_identity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.event_id IS DISTINCT FROM OLD.event_id
    OR NEW.membership_id IS DISTINCT FROM OLD.membership_id THEN
    RAISE EXCEPTION 'ATTENDANCE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  -- The officer form reuses persisted check-in fields on retry. Suppress an
  -- exact no-op before updated_at/standing/audit triggers can create noise.
  IF (NEW.status, NEW.checked_in_via, NEW.checked_in_at, NEW.marked_by, NEW.notes)
     IS NOT DISTINCT FROM
     (OLD.status, OLD.checked_in_via, OLD.checked_in_at, OLD.marked_by, OLD.notes) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- New public-schema SECURITY DEFINER trigger functions otherwise inherit
-- PostgreSQL's default PUBLIC EXECUTE privilege. Triggers are installed by
-- the owner, and ordinary clients do not need direct function invocation.
REVOKE ALL ON FUNCTION public.guard_event_attendance_identity() FROM PUBLIC;

CREATE TRIGGER guard_event_attendance_identity
BEFORE UPDATE ON public.event_attendances
FOR EACH ROW EXECUTE FUNCTION public.guard_event_attendance_identity();

-- Attendance history is corrected in place with the original retained in the
-- atomic audit. Authenticated clients cannot remove the attendance row.
CREATE POLICY event_attendance_preserve_history_delete
ON public.event_attendances AS RESTRICTIVE FOR DELETE TO authenticated
USING (false);

CREATE OR REPLACE FUNCTION public.audit_event_attendance_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_group_id uuid;
  v_action text;
  v_details jsonb;
BEGIN
  SELECT e.group_id INTO v_group_id
  FROM public.events e
  JOIN public.memberships m ON m.id = NEW.membership_id AND m.group_id = e.group_id
  WHERE e.id = NEW.event_id;
  IF v_group_id IS NULL THEN
    RAISE EXCEPTION 'ATTENDANCE_EVENT_MEMBER_SCOPE' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'event.attendance_recorded';
    v_details := jsonb_build_object(
      'event_id', NEW.event_id,
      'membership_id', NEW.membership_id,
      'new_status', NEW.status,
      'new_checkin_method', NEW.checked_in_via,
      'new_checked_in_at', NEW.checked_in_at,
      'new_marked_by', NEW.marked_by,
      'new_notes', NEW.notes
    );
  ELSE
    IF (OLD.event_id, OLD.membership_id, OLD.status, OLD.checked_in_via, OLD.checked_in_at, OLD.marked_by, OLD.notes)
       IS NOT DISTINCT FROM
       (NEW.event_id, NEW.membership_id, NEW.status, NEW.checked_in_via, NEW.checked_in_at, NEW.marked_by, NEW.notes) THEN
      RETURN NEW;
    END IF;
    v_action := 'event.attendance_corrected';
    v_details := jsonb_build_object(
      'event_id', NEW.event_id,
      'membership_id', NEW.membership_id,
      'old_event_id', OLD.event_id,
      'old_membership_id', OLD.membership_id,
      'old_status', OLD.status,
      'old_checkin_method', OLD.checked_in_via,
      'old_checked_in_at', OLD.checked_in_at,
      'old_marked_by', OLD.marked_by,
      'old_notes', OLD.notes,
      'new_status', NEW.status,
      'new_checkin_method', NEW.checked_in_via,
      'new_checked_in_at', NEW.checked_in_at,
      'new_marked_by', NEW.marked_by,
      'new_notes', NEW.notes
    );
  END IF;

  INSERT INTO public.group_audit_logs (
    group_id, actor_id, action, entity_type, entity_id, details, description
  ) VALUES (
    v_group_id, auth.uid(), v_action, 'event_attendance', NEW.id, v_details,
    CASE WHEN TG_OP = 'INSERT' THEN 'Attendance recorded'
      ELSE 'Attendance corrected' END
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_event_attendance_change() FROM PUBLIC;

CREATE TRIGGER record_event_attendance_audit
AFTER INSERT OR UPDATE ON public.event_attendances
FOR EACH ROW EXECUTE FUNCTION public.audit_event_attendance_change();

COMMIT;
