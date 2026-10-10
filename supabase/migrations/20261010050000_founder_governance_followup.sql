BEGIN;

-- Preserve each assignment row while ending its authority and freeing the
-- position's holder slot when its member leaves active membership.
CREATE OR REPLACE FUNCTION public.end_departed_member_assignments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_ended integer;
BEGIN
  IF OLD.membership_status = 'active' AND NEW.membership_status <> 'active' THEN
    UPDATE public.position_assignments pa
       SET ended_at = now()
      FROM public.group_positions gp
     WHERE pa.membership_id = NEW.id
       AND pa.position_id = gp.id
       AND gp.group_id = NEW.group_id
       AND pa.ended_at IS NULL;
    GET DIAGNOSTICS v_ended = ROW_COUNT;
    IF v_ended > 0 THEN
      INSERT INTO public.group_audit_logs
        (group_id, actor_id, action, entity_type, entity_id, details)
      VALUES
        (NEW.group_id, auth.uid(), 'position.assignments_ended_on_departure',
         'membership', NEW.id,
         jsonb_build_object('previous_status', OLD.membership_status,
                            'new_status', NEW.membership_status,
                            'ended_assignments', v_ended));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.end_departed_member_assignments()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS end_departed_member_assignments ON public.memberships;
CREATE TRIGGER end_departed_member_assignments
AFTER UPDATE OF membership_status ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.end_departed_member_assignments();

-- Legacy positions_select uses get_user_group_ids(), which includes exited
-- memberships. Role definitions should disappear when membership ends.
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'group_positions'
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.group_positions', p.policyname);
  END LOOP;
END $$;
CREATE POLICY positions_active_member_read ON public.group_positions
FOR SELECT TO authenticated
USING (public.is_active_group_member(group_id));
-- Direct owner DML and existing role commands can bypass application-side audit.
-- Row triggers make every persisted authority change leave an audit record.
CREATE OR REPLACE FUNCTION public.audit_membership_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    INSERT INTO public.group_audit_logs
      (group_id, actor_id, action, entity_type, entity_id, details)
    VALUES
      (NEW.group_id, auth.uid(), 'membership.role_changed', 'membership', NEW.id,
       jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role));
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_membership_role_change()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_membership_role_change ON public.memberships;
CREATE TRIGGER audit_membership_role_change
AFTER UPDATE OF role ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.audit_membership_role_change();

CREATE OR REPLACE FUNCTION public.audit_position_authority_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_group uuid; v_position uuid; v_entity uuid; v_details jsonb;
BEGIN
  IF TG_TABLE_NAME = 'group_positions' THEN
    IF TG_OP = 'DELETE' THEN
      v_group := OLD.group_id;
      v_entity := OLD.id;
      v_details := jsonb_build_object('title', OLD.title);
    ELSE
      v_group := NEW.group_id;
      v_entity := NEW.id;
      v_details := jsonb_build_object('title', NEW.title);
    END IF;
  ELSIF TG_TABLE_NAME = 'position_permissions' THEN
    IF TG_OP = 'DELETE' THEN
      v_position := OLD.position_id;
      v_details := jsonb_build_object('permission', OLD.permission);
    ELSE
      v_position := NEW.position_id;
      v_details := jsonb_build_object('permission', NEW.permission);
    END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN
      v_position := OLD.position_id;
      v_details := jsonb_build_object('membership_id', OLD.membership_id,
                                      'ended_at', OLD.ended_at);
    ELSE
      v_position := NEW.position_id;
      v_details := jsonb_build_object('membership_id', NEW.membership_id,
                                      'ended_at', NEW.ended_at);
    END IF;
  END IF;
  IF v_position IS NOT NULL THEN
    SELECT gp.group_id INTO v_group
    FROM public.group_positions gp WHERE gp.id = v_position;
    v_entity := v_position;
  END IF;
  IF v_group IS NOT NULL THEN
    INSERT INTO public.group_audit_logs
      (group_id, actor_id, action, entity_type, entity_id, details)
    VALUES
      (v_group, auth.uid(), 'authority.' || TG_TABLE_NAME || '.' || lower(TG_OP),
       TG_TABLE_NAME, v_entity, v_details);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.audit_position_authority_change()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS audit_position_change ON public.group_positions;
CREATE TRIGGER audit_position_change
AFTER INSERT OR UPDATE OR DELETE ON public.group_positions
FOR EACH ROW EXECUTE FUNCTION public.audit_position_authority_change();
DROP TRIGGER IF EXISTS audit_position_permission_change ON public.position_permissions;
CREATE TRIGGER audit_position_permission_change
AFTER INSERT OR UPDATE OR DELETE ON public.position_permissions
FOR EACH ROW EXECUTE FUNCTION public.audit_position_authority_change();
DROP TRIGGER IF EXISTS audit_position_assignment_change ON public.position_assignments;
CREATE TRIGGER audit_position_assignment_change
AFTER INSERT OR UPDATE OR DELETE ON public.position_assignments
FOR EACH ROW EXECUTE FUNCTION public.audit_position_authority_change();
-- The canonical atomic transfer demotes the owner before promoting the
-- successor. During that second UPDATE there is briefly no active owner.
-- Permit only that promotion while its verified transfer flag is active and
-- the caller is the current creator/demoted admin; all other role changes
-- still require the active owner. The transfer command updates created_by
-- after the promotion and clears the flag before returning.
CREATE OR REPLACE FUNCTION public.guard_owner_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role
     AND NOT public.is_active_group_owner(OLD.group_id) THEN
    IF NOT (
      OLD.group_id = NEW.group_id
      AND OLD.role <> 'owner'
      AND NEW.role = 'owner'
      AND current_setting('app.allow_owner_transfer', true) = 'true'
      AND EXISTS (
        SELECT 1 FROM public.groups g
        JOIN public.memberships m
          ON m.group_id = g.id AND m.user_id = auth.uid()
        WHERE g.id = OLD.group_id
          AND g.created_by = auth.uid()
          AND m.role = 'admin'
          AND m.membership_status = 'active'
      )
    ) THEN
      RAISE EXCEPTION 'OWNER_ROLE_CHANGE_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_owner_role_change()
  FROM PUBLIC, anon, authenticated;
-- Former inviters must not retain administrative recipient/token access.
-- Invitee's own identity-checked SELECT policies remain independent.
DROP POLICY IF EXISTS invitation_manager_read ON public.invitations;
CREATE POLICY invitation_manager_read ON public.invitations
FOR SELECT TO authenticated
USING (
  public.is_active_group_member(group_id)
  AND (
    invited_by = auth.uid()
    OR public.has_group_permission(group_id, 'members.invite')
    OR public.has_group_permission(group_id, 'members.manage')
  )
);
-- A delegated inviter may manage regular pending invitations, but cannot
-- revoke an owner-issued admin/moderator appointment.
CREATE OR REPLACE FUNCTION public.revoke_group_invitation(p_invitation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_group uuid; v_status text; v_role text;
BEGIN
  SELECT group_id, status::text, role::text INTO v_group, v_status, v_role
  FROM public.invitations WHERE id = p_invitation_id FOR UPDATE;
  IF v_group IS NULL OR NOT public.is_active_group_member(v_group)
     OR NOT public.has_group_permission(v_group, 'members.invite') THEN
    RAISE EXCEPTION 'INVITATION_REVOKE_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  IF v_role IN ('admin', 'moderator')
     AND NOT public.is_active_group_owner(v_group) THEN
    RAISE EXCEPTION 'OWNER_REQUIRED_FOR_PRIVILEGED_INVITATION' USING ERRCODE = '42501';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'INVITATION_NOT_PENDING' USING ERRCODE = '23514';
  END IF;
  UPDATE public.invitations SET status = 'revoked' WHERE id = p_invitation_id;
  INSERT INTO public.group_audit_logs
    (group_id, actor_id, action, entity_type, entity_id, details)
  VALUES
    (v_group, auth.uid(), 'member.invitation_revoked', 'invitation',
     p_invitation_id, jsonb_build_object('role', v_role));
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_group_invitation(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_group_invitation(uuid) TO authenticated;
-- Membership rows are group-bound records. A move would carry an officer role
-- into another tenant. Existing-account joining creates a separate row.
-- Only the canonical SECURITY DEFINER proxy-claim command may bind a previously
-- unclaimed proxy's user_id; ordinary authenticated DML cannot rebind a role.
CREATE OR REPLACE FUNCTION public.guard_membership_identity_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF OLD.group_id IS DISTINCT FROM NEW.group_id THEN
    RAISE EXCEPTION 'MEMBERSHIP_GROUP_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    IF NOT (
      current_user = 'postgres'
      AND OLD.user_id IS NULL
      AND OLD.is_proxy IS TRUE
      AND NEW.user_id = auth.uid()
      AND NEW.is_proxy IS FALSE
    ) THEN
      RAISE EXCEPTION 'MEMBERSHIP_USER_REBIND_DENIED' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_membership_identity_change()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_membership_identity_change ON public.memberships;
CREATE TRIGGER guard_membership_identity_change
BEFORE UPDATE OF group_id, user_id ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.guard_membership_identity_change();
COMMIT;
