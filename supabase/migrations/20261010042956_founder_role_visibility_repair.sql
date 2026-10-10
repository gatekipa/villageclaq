BEGIN;

-- Founder governance amendment: only the active owner may alter authority.
-- An officer title, settings.manage, or roles.manage never permits self-grant.
CREATE OR REPLACE FUNCTION public.is_active_group_owner(p_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.group_id = p_group_id
      AND m.user_id = auth.uid()
      AND m.role = 'owner'
      AND m.membership_status = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_group_owner(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_group_owner(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_owner_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role
     AND NOT public.is_active_group_owner(OLD.group_id) THEN
    RAISE EXCEPTION 'OWNER_ROLE_CHANGE_REQUIRED' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_owner_role_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_owner_role_change ON public.memberships;
CREATE TRIGGER guard_owner_role_change
BEFORE UPDATE OF role ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.guard_owner_role_change();

-- Remove permissive legacy policies, including ALL policies that OR with
-- restrictive ones. Keep reads scoped to a current group membership.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('group_positions','position_assignments','position_permissions')
      AND cmd IN ('ALL','INSERT','UPDATE','DELETE')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
  END LOOP;
  FOR p IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('position_assignments','position_permissions')
      AND cmd = 'SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I',p.policyname,p.tablename);
  END LOOP;
END $$;

CREATE POLICY gp_owner_insert ON public.group_positions FOR INSERT TO authenticated
WITH CHECK (public.is_active_group_owner(group_id));
CREATE POLICY gp_owner_update ON public.group_positions FOR UPDATE TO authenticated
USING (public.is_active_group_owner(group_id))
WITH CHECK (public.is_active_group_owner(group_id));
CREATE POLICY gp_owner_delete ON public.group_positions FOR DELETE TO authenticated
USING (public.is_active_group_owner(group_id));

CREATE POLICY pa_group_read ON public.position_assignments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_positions gp
  WHERE gp.id = position_assignments.position_id
    AND public.is_active_group_member(gp.group_id)
));
CREATE POLICY pa_owner_insert ON public.position_assignments FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_positions gp
  JOIN public.memberships m ON m.id = position_assignments.membership_id
  WHERE gp.id = position_assignments.position_id
    AND gp.group_id = m.group_id
    AND m.membership_status = 'active'
    AND public.is_active_group_owner(gp.group_id)
));
CREATE POLICY pa_owner_update ON public.position_assignments FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_positions gp
  WHERE gp.id = position_assignments.position_id
    AND public.is_active_group_owner(gp.group_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_positions gp
  JOIN public.memberships m ON m.id = position_assignments.membership_id
  WHERE gp.id = position_assignments.position_id
    AND gp.group_id = m.group_id
    AND m.membership_status = 'active'
    AND public.is_active_group_owner(gp.group_id)
));
-- No direct DELETE: ending assignments preserves their historical holder.

CREATE POLICY pp_group_read ON public.position_permissions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_positions gp
  WHERE gp.id = position_permissions.position_id
    AND public.is_active_group_member(gp.group_id)
));
CREATE POLICY pp_owner_insert ON public.position_permissions FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_positions gp
  WHERE gp.id = position_permissions.position_id
    AND public.is_active_group_owner(gp.group_id)
));
CREATE POLICY pp_owner_delete ON public.position_permissions FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.group_positions gp
  WHERE gp.id = position_permissions.position_id
    AND public.is_active_group_owner(gp.group_id)
));

-- A role definition with any holder is an organizational record.
CREATE OR REPLACE FUNCTION public.guard_position_history_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.position_assignments pa WHERE pa.position_id = OLD.id) THEN
    RAISE EXCEPTION 'POSITION_HISTORY_RETAINED' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_position_history_delete() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_position_history_delete ON public.group_positions;
CREATE TRIGGER guard_position_history_delete BEFORE DELETE ON public.group_positions
FOR EACH ROW EXECUTE FUNCTION public.guard_position_history_delete();

-- The join-code is invitation administration; member referral uses M13.
REVOKE INSERT, UPDATE, DELETE ON public.join_codes FROM authenticated;
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='join_codes'
      AND cmd IN ('ALL','SELECT','INSERT','UPDATE','DELETE')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.join_codes',p.policyname);
  END LOOP;
END $$;
CREATE POLICY join_codes_inviter_read ON public.join_codes FOR SELECT TO authenticated
USING (
  public.is_active_group_member(group_id)
  AND public.has_group_permission(group_id,'members.invite')
);

-- Bulk contact roster is both member administration and export. An ordinary
-- directory view remains governed by its separate membership read policy.
CREATE OR REPLACE FUNCTION public.get_roster_with_contacts(p_group_id uuid)
RETURNS TABLE(membership_id uuid, user_id uuid, is_proxy boolean, display_name text,
              full_name text, phone text, role text, standing text, joined_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_group_permission(p_group_id,'members.manage')
     OR NOT public.has_group_permission(p_group_id,'reports.export') THEN
    RAISE EXCEPTION 'ROSTER_EXPORT_NOT_AUTHORIZED' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT m.id,m.user_id,coalesce(m.is_proxy,false),m.display_name,p.full_name,
      CASE WHEN m.is_proxy THEN nullif(m.privacy_settings->>'proxy_phone','')
           ELSE nullif(p.phone,'') END,
      m.role::text,public.effective_standing_for_authority(m.id,now())::text,m.joined_at
    FROM public.memberships m
    LEFT JOIN public.profiles p ON p.id=m.user_id
    WHERE m.group_id=p_group_id
    ORDER BY m.joined_at ASC NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.get_roster_with_contacts(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_roster_with_contacts(uuid) TO authenticated;

-- Atomic replacement avoids an intermediate empty permission set on failure.
CREATE OR REPLACE FUNCTION public.replace_position_permissions(
  p_position_id uuid, p_permissions text[]
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_group uuid;
BEGIN
  SELECT gp.group_id INTO v_group FROM public.group_positions gp
  WHERE gp.id=p_position_id FOR UPDATE;
  IF v_group IS NULL OR NOT public.is_active_group_owner(v_group) THEN
    RAISE EXCEPTION 'POSITION_PERMISSIONS_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(coalesce(p_permissions,ARRAY[]::text[])) x
    WHERE length(x) NOT BETWEEN 1 AND 128
  ) THEN
    RAISE EXCEPTION 'POSITION_PERMISSION_INVALID' USING ERRCODE='22023';
  END IF;
  DELETE FROM public.position_permissions WHERE position_id=p_position_id;
  INSERT INTO public.position_permissions(position_id,permission)
  SELECT p_position_id,x FROM (
    SELECT DISTINCT unnest(coalesce(p_permissions,ARRAY[]::text[])) AS x
  ) s;
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(v_group,auth.uid(),'position.permissions_replaced','group_position',p_position_id,
    jsonb_build_object('permissions',p_permissions));
END;
$$;
REVOKE ALL ON FUNCTION public.replace_position_permissions(uuid,text[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.replace_position_permissions(uuid,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_position_assignment(
  p_position_id uuid, p_membership_id uuid, p_assign boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_group uuid; v_limit integer; v_count integer;
BEGIN
  SELECT gp.group_id,gp.max_holders INTO v_group,v_limit
  FROM public.group_positions gp WHERE gp.id=p_position_id FOR UPDATE;
  IF v_group IS NULL OR NOT public.is_active_group_owner(v_group) THEN
    RAISE EXCEPTION 'POSITION_ASSIGNMENT_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.id=p_membership_id AND m.group_id=v_group AND m.membership_status='active'
  ) THEN
    RAISE EXCEPTION 'POSITION_MEMBER_NOT_ACTIVE_IN_GROUP' USING ERRCODE='42501';
  END IF;
  IF p_assign THEN
    SELECT count(*) INTO v_count FROM public.position_assignments
    WHERE position_id=p_position_id AND ended_at IS NULL;
    IF v_limit IS NOT NULL AND v_count >= v_limit
       AND NOT EXISTS (SELECT 1 FROM public.position_assignments
          WHERE position_id=p_position_id AND membership_id=p_membership_id AND ended_at IS NULL) THEN
      RAISE EXCEPTION 'POSITION_HOLDER_LIMIT' USING ERRCODE='23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.position_assignments
       WHERE position_id=p_position_id AND membership_id=p_membership_id AND ended_at IS NULL) THEN
      INSERT INTO public.position_assignments(position_id,membership_id,assigned_by)
      VALUES(p_position_id,p_membership_id,auth.uid());
    END IF;
  ELSE
    UPDATE public.position_assignments SET ended_at=now()
    WHERE position_id=p_position_id AND membership_id=p_membership_id AND ended_at IS NULL;
  END IF;
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(v_group,auth.uid(),CASE WHEN p_assign THEN 'position.assigned' ELSE 'position.removed' END,
    'group_position',p_position_id,jsonb_build_object('membership_id',p_membership_id));
END;
$$;
REVOKE ALL ON FUNCTION public.set_position_assignment(uuid,uuid,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.set_position_assignment(uuid,uuid,boolean) TO authenticated;

-- Invitation administration must not expose recipient contacts or tokens to
-- every group member. Acceptance/decline remains in the existing identity-
-- checked SECURITY DEFINER RPCs; revocation is an inviter action.
DROP POLICY IF EXISTS "Group members can view invitations" ON public.invitations;
DROP POLICY IF EXISTS "Group admins can create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Group admins can update invitations" ON public.invitations;
DROP POLICY IF EXISTS "Group admins can delete invitations" ON public.invitations;
REVOKE UPDATE, DELETE ON public.invitations FROM authenticated;
CREATE POLICY invitation_manager_read ON public.invitations FOR SELECT TO authenticated
USING (
  invited_by=auth.uid() OR (
    public.is_active_group_member(group_id)
    AND (public.has_group_permission(group_id,'members.invite')
      OR public.has_group_permission(group_id,'members.manage'))
  )
);
CREATE POLICY invitation_inviter_insert ON public.invitations FOR INSERT TO authenticated
WITH CHECK (
  invited_by=auth.uid()
  AND status='pending'
  AND public.is_active_group_member(group_id)
  AND public.has_group_permission(group_id,'members.invite')
  AND ((role IS NULL OR role='member') OR public.is_active_group_owner(group_id))
);
CREATE OR REPLACE FUNCTION public.guard_invitation_authority()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.role IN ('admin','moderator') AND NOT public.is_active_group_owner(NEW.group_id) THEN
      RAISE EXCEPTION 'OWNER_REQUIRED_FOR_PRIVILEGED_INVITATION' USING ERRCODE='42501';
    END IF;
  ELSE
    IF NEW.group_id IS DISTINCT FROM OLD.group_id OR NEW.role IS DISTINCT FROM OLD.role
       OR NEW.invited_by IS DISTINCT FROM OLD.invited_by
       OR NEW.email IS DISTINCT FROM OLD.email OR NEW.phone IS DISTINCT FROM OLD.phone THEN
      RAISE EXCEPTION 'INVITATION_IDENTITY_IMMUTABLE' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_invitation_authority() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS guard_invitation_authority ON public.invitations;
CREATE TRIGGER guard_invitation_authority BEFORE INSERT OR UPDATE ON public.invitations
FOR EACH ROW EXECUTE FUNCTION public.guard_invitation_authority();

CREATE OR REPLACE FUNCTION public.revoke_group_invitation(p_invitation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $$
DECLARE v_group uuid; v_status text;
BEGIN
  SELECT group_id,status::text INTO v_group,v_status
  FROM public.invitations WHERE id=p_invitation_id FOR UPDATE;
  IF v_group IS NULL OR NOT public.is_active_group_member(v_group)
     OR NOT public.has_group_permission(v_group,'members.invite') THEN
    RAISE EXCEPTION 'INVITATION_REVOKE_NOT_AUTHORIZED' USING ERRCODE='42501';
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'INVITATION_NOT_PENDING' USING ERRCODE='23514';
  END IF;
  UPDATE public.invitations SET status='revoked' WHERE id=p_invitation_id;
  INSERT INTO public.group_audit_logs(group_id,actor_id,action,entity_type,entity_id,details)
  VALUES(v_group,auth.uid(),'member.invitation_revoked','invitation',p_invitation_id,'{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_group_invitation(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.revoke_group_invitation(uuid) TO authenticated;

COMMIT;
