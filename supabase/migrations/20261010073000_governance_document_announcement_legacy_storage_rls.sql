-- Prepared for separate owner approval on the isolated qualification branch.
-- Replaces only read authorization objects; no application row DML.
BEGIN;

-- Both legacy constitution reads include exited memberships. Keep active
-- members' existing read access while ending departed access.
DROP POLICY IF EXISTS "Users can view constitutions" ON public.group_constitutions;
DROP POLICY IF EXISTS "rls_const_select" ON public.group_constitutions;
CREATE POLICY "group_constitutions_active_member_select"
  ON public.group_constitutions FOR SELECT TO authenticated
  USING (public.is_active_group_member(group_id));

-- The audience helper otherwise resolves the first historical membership,
-- including an exited one, for scheduled or sent announcements.
CREATE OR REPLACE FUNCTION public.is_announcement_visible(
  p_audience jsonb, p_group_id uuid, uid uuid DEFAULT auth.uid()
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public'
AS $function$
DECLARE
  v_type text := COALESCE(p_audience ->> 'type', 'all');
  v_role text;
  v_membership_id uuid;
BEGIN
  IF uid IS NULL THEN RETURN false; END IF;
  SELECT id, role::text INTO v_membership_id, v_role
  FROM public.memberships
  WHERE group_id = p_group_id AND user_id = uid AND membership_status = 'active'
  LIMIT 1;
  IF v_membership_id IS NULL THEN RETURN false; END IF;
  IF v_type = 'all' THEN
    RETURN true;
  ELSIF v_type = 'roles' THEN
    RETURN EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_audience -> 'roles', '[]'::jsonb)) r(val)
      WHERE r.val = v_role
    );
  ELSIF v_type = 'members' THEN
    RETURN EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(COALESCE(p_audience -> 'members', '[]'::jsonb)) m(val)
      WHERE m.val = v_membership_id::text
    );
  END IF;
  RETURN false;
END;
$function$;

-- The historical UUID-first object path currently delegates to
-- is_group_member(), which accepts exited memberships. This restrictive
-- policy leaves all other object paths' existing policy evaluation intact.
CREATE POLICY "gdocs_legacy_active_read_guard"
  ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    CASE
      WHEN bucket_id = 'group-documents'
        AND name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/]+$'
      THEN public.is_active_group_member(split_part(name, '/', 1)::uuid)
      ELSE true
    END
  );
COMMIT;