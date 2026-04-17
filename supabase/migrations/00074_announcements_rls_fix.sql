-- Announcements: RLS tightening + audience-aware SELECT
--
-- Findings (pre-fix, verified against pg_policies):
--  1. SELECT policy "Members can view group announcements" (and the
--     duplicate "rls_ann_select") exposed every announcement in the
--     group to every member — regardless of the audience JSONB. A
--     "roles:['admin']" announcement (the app's equivalent of
--     executives-only) was readable by every regular member.
--  2. INSERT/UPDATE/DELETE policies were split across "Admins can
--     manage group announcements" (moderator/admin/owner) and
--     rls_ann_insert/update/delete (is_group_admin, excludes
--     moderator). Rebuild with a single coherent set via
--     has_group_permission('announcements.manage').
--
-- Audience JSONB shape as written by the client:
--     {"type":"all"}
--     {"type":"roles",   "roles":   ["admin","owner",...]}
--     {"type":"members", "members": ["<membership_id>",...]}
--
-- After this migration:
--   SELECT is allowed when
--     - caller is a group member AND
--       - audience.type = 'all', OR
--       - audience.type = 'roles'   AND caller's membership.role is in audience.roles, OR
--       - audience.type = 'members' AND caller's membership.id   is in audience.members, OR
--     - caller is a manager with announcements.manage (always sees all for admin UI)
--     - caller is platform staff (support-only, unchanged)
-- Drafts (sent_at IS NULL and scheduled_at IS NULL) are visible only to
-- managers — members shouldn't see unsent announcements at all.

CREATE OR REPLACE FUNCTION public.is_announcement_visible(
  p_audience jsonb,
  p_group_id uuid,
  uid uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := COALESCE(p_audience ->> 'type', 'all');
  v_role text;
  v_membership_id uuid;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;

  SELECT id, role::text INTO v_membership_id, v_role
  FROM public.memberships
  WHERE group_id = p_group_id AND user_id = uid
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN false;
  END IF;

  IF v_type = 'all' THEN
    RETURN true;
  ELSIF v_type = 'roles' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(p_audience -> 'roles', '[]'::jsonb)) r(val)
      WHERE r.val = v_role
    );
  ELSIF v_type = 'members' THEN
    RETURN EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(COALESCE(p_audience -> 'members', '[]'::jsonb)) m(val)
      WHERE m.val = v_membership_id::text
    );
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_announcement_visible(jsonb, uuid, uuid)
  TO authenticated, anon;

-- Drop every existing policy so the table has one coherent set
DROP POLICY IF EXISTS "Members can view group announcements" ON announcements;
DROP POLICY IF EXISTS "Admins can manage group announcements" ON announcements;
DROP POLICY IF EXISTS "rls_ann_select"  ON announcements;
DROP POLICY IF EXISTS "rls_ann_insert"  ON announcements;
DROP POLICY IF EXISTS "rls_ann_update"  ON announcements;
DROP POLICY IF EXISTS "rls_ann_delete"  ON announcements;
-- Keep the platform-staff view-all policy created in migration 00068.
-- (It already exists; not dropped.)

-- SELECT: managers always see everything; members see only what the
-- audience targets AND only once it is either sent or scheduled.
CREATE POLICY "ann_select" ON announcements FOR SELECT TO authenticated
  USING (
    has_group_permission(group_id, 'announcements.manage')
    OR (
      (sent_at IS NOT NULL OR scheduled_at IS NOT NULL)
      AND is_announcement_visible(audience, group_id)
    )
  );

CREATE POLICY "ann_insert" ON announcements FOR INSERT TO authenticated
  WITH CHECK (has_group_permission(group_id, 'announcements.manage'));

CREATE POLICY "ann_update" ON announcements FOR UPDATE TO authenticated
  USING      (has_group_permission(group_id, 'announcements.manage'))
  WITH CHECK (has_group_permission(group_id, 'announcements.manage'));

CREATE POLICY "ann_delete" ON announcements FOR DELETE TO authenticated
  USING (has_group_permission(group_id, 'announcements.manage'));
