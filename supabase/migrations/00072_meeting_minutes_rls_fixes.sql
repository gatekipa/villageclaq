-- Meeting Minutes — RLS tightening + notification type + permission helper
--
-- Findings from audit:
--  1. Duplicate SELECT policies: "Group members can view published minutes" (strict)
--     AND "rls_mm_select" (is_group_member only). Postgres ORs SELECT policies, so
--     ANY group member could read DRAFT minutes — defeats draft status.
--  2. Write policies only honour role IN (owner, admin), so Secretaries with the
--     "minutes.manage" position permission are blocked by RLS even though the UI
--     lets them edit.
--  3. notification_type enum had no "meeting_minutes" value, so the publish flow
--     falls back to the generic "system" type.
--
-- This migration rebuilds the meeting_minutes RLS policies on top of a new
-- has_group_permission() helper, and registers the meeting_minutes enum value.
--
-- NOTE: ALTER TYPE ... ADD VALUE is executed separately (outside of the
-- transaction that runs the rest of the DDL) because Postgres forbids
-- referencing a newly-added enum value inside the same transaction. The
-- statement below is idempotent (IF NOT EXISTS) so re-runs are safe.

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'meeting_minutes';

-- ---------------------------------------------------------------------------
-- has_group_permission(): mirrors the usePermissions() hook exactly
--   Owner                                                → true
--   Admin with NO active position assignments            → true
--   Any member with an active position assignment that
--     has position_permissions.permission = perm_key     → true
--   Otherwise                                            → false
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_group_permission(
  gid uuid,
  perm_key text,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_membership_id uuid;
  v_role text;
  v_assignment_count int;
  v_has_perm boolean;
BEGIN
  SELECT m.id, m.role::text
    INTO v_membership_id, v_role
  FROM public.memberships m
  WHERE m.group_id = gid AND m.user_id = uid
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_role = 'owner' THEN
    RETURN true;
  END IF;

  SELECT COUNT(*) INTO v_assignment_count
  FROM public.position_assignments
  WHERE membership_id = v_membership_id AND ended_at IS NULL;

  IF v_role = 'admin' AND v_assignment_count = 0 THEN
    RETURN true;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.position_assignments pa
    JOIN public.position_permissions pp ON pp.position_id = pa.position_id
    WHERE pa.membership_id = v_membership_id
      AND pa.ended_at IS NULL
      AND pp.permission = perm_key
  ) INTO v_has_perm;

  RETURN v_has_perm;
END;
$$;

GRANT EXECUTE ON FUNCTION public.has_group_permission(uuid, text, uuid)
  TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- meeting_minutes: rebuild RLS cleanly
-- ---------------------------------------------------------------------------

-- Drop every prior policy so the table has a single coherent policy set
DROP POLICY IF EXISTS "rls_mm_select"                          ON meeting_minutes;
DROP POLICY IF EXISTS "rls_mm_insert"                          ON meeting_minutes;
DROP POLICY IF EXISTS "rls_mm_update"                          ON meeting_minutes;
DROP POLICY IF EXISTS "rls_mm_delete"                          ON meeting_minutes;
DROP POLICY IF EXISTS "Group admins can manage minutes"        ON meeting_minutes;
DROP POLICY IF EXISTS "Group members can view published minutes" ON meeting_minutes;
DROP POLICY IF EXISTS "mm_select"                              ON meeting_minutes;
DROP POLICY IF EXISTS "mm_insert"                              ON meeting_minutes;
DROP POLICY IF EXISTS "mm_update"                              ON meeting_minutes;
DROP POLICY IF EXISTS "mm_delete"                              ON meeting_minutes;

-- SELECT: active group members see PUBLISHED; managers see drafts too.
CREATE POLICY "mm_select" ON meeting_minutes FOR SELECT TO authenticated
  USING (
    is_group_member(group_id)
    AND (
      status = 'published'
      OR has_group_permission(group_id, 'minutes.manage')
    )
  );

-- INSERT / UPDATE / DELETE: owners, general admins, or users whose position
-- grants the "minutes.manage" permission.
CREATE POLICY "mm_insert" ON meeting_minutes FOR INSERT TO authenticated
  WITH CHECK (has_group_permission(group_id, 'minutes.manage'));

CREATE POLICY "mm_update" ON meeting_minutes FOR UPDATE TO authenticated
  USING      (has_group_permission(group_id, 'minutes.manage'))
  WITH CHECK (has_group_permission(group_id, 'minutes.manage'));

CREATE POLICY "mm_delete" ON meeting_minutes FOR DELETE TO authenticated
  USING (has_group_permission(group_id, 'minutes.manage'));
