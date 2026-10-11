-- PREPARED ONLY. This migration is not covered by the approval for 20261010233459.
-- Do not apply without separate approval for this exact file and hash.
-- Existing attendance and audit rows are left intact. Installation performs
-- function/trigger/policy DDL only; later writes create server-authored evidence in
-- the same transaction as each attendance insert or material update.
BEGIN;

CREATE OR REPLACE FUNCTION public.guard_event_attendance_identity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NEW.event_id IS DISTINCT FROM OLD.event_id
    OR NEW.membership_id IS DISTINCT FROM OLD.membership_id THEN
    RAISE EXCEPTION 'ATTENDANCE_IDENTITY_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

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

CREATE TRIGGER record_event_attendance_audit
AFTER INSERT OR UPDATE ON public.event_attendances
FOR EACH ROW EXECUTE FUNCTION public.audit_event_attendance_change();

COMMIT;
