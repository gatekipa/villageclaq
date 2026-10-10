-- Prepared for separate exact-file owner approval on isolated nisipxbuvndobyxqqglf.
-- Supersedes the earlier hash of this unapplied file after focused review.
-- Replaces access policies/functions only; no application row DML.
BEGIN;

-- Both legacy constitution reads include exited memberships. Keep active
-- members' existing read access while ending departed access.
DROP POLICY IF EXISTS "Users can view constitutions" ON public.group_constitutions;
DROP POLICY IF EXISTS "rls_const_select" ON public.group_constitutions;
CREATE POLICY "group_constitutions_active_member_select"
  ON public.group_constitutions FOR SELECT TO authenticated
  USING (
    public.has_group_permission(group_id, 'documents.manage')
    OR public.has_group_permission(group_id, 'governance.manage')
    OR (public.is_active_group_member(group_id) AND status = 'published')
  );


-- Broad legacy FOR ALL policies OR with narrower policies and bypass scoped
-- position grants. Replace them and the role-only mutation policies.
DROP POLICY IF EXISTS "Admins can manage documents" ON public.documents;
DROP POLICY IF EXISTS "documents_active_audience_select" ON public.documents;
CREATE POLICY "documents_active_audience_select" ON public.documents
  FOR SELECT TO authenticated
  USING (
    public.is_active_group_member(group_id)
    AND (NOT is_restricted OR public.has_group_permission(group_id, 'documents.manage'))
  );
DROP POLICY IF EXISTS "rls_doc_insert" ON public.documents;
DROP POLICY IF EXISTS "rls_doc_update" ON public.documents;
DROP POLICY IF EXISTS "rls_doc_delete" ON public.documents;
CREATE POLICY "documents_manager_insert" ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (public.has_group_permission(group_id, 'documents.manage'));
CREATE POLICY "documents_manager_update" ON public.documents
  FOR UPDATE TO authenticated
  USING (public.has_group_permission(group_id, 'documents.manage'))
  WITH CHECK (public.has_group_permission(group_id, 'documents.manage'));
CREATE POLICY "documents_manager_delete" ON public.documents
  FOR DELETE TO authenticated
  USING (public.has_group_permission(group_id, 'documents.manage'));

DROP POLICY IF EXISTS "fine_types_admin" ON public.fine_types;
CREATE POLICY "fine_types_manager_insert" ON public.fine_types
  FOR INSERT TO authenticated
  WITH CHECK (public.has_group_permission(group_id, 'disputes.manage')
    OR public.has_group_permission(group_id, 'finances.manage'));
CREATE POLICY "fine_types_manager_update" ON public.fine_types
  FOR UPDATE TO authenticated
  USING (public.has_group_permission(group_id, 'disputes.manage')
    OR public.has_group_permission(group_id, 'finances.manage'))
  WITH CHECK (public.has_group_permission(group_id, 'disputes.manage')
    OR public.has_group_permission(group_id, 'finances.manage'));
CREATE POLICY "fine_types_manager_delete" ON public.fine_types
  FOR DELETE TO authenticated
  USING (public.has_group_permission(group_id, 'disputes.manage')
    OR public.has_group_permission(group_id, 'finances.manage'));

DROP POLICY IF EXISTS "Admin manage fines" ON public.fines;
DROP POLICY IF EXISTS "rls_fin_insert" ON public.fines;
CREATE POLICY "fines_manager_insert" ON public.fines
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_group_permission(group_id, 'disputes.manage')
      OR public.has_group_permission(group_id, 'finances.manage'))
    AND EXISTS (SELECT 1 FROM public.memberships m
      WHERE m.id = fines.membership_id AND m.group_id = fines.group_id)
    AND (fine_type_id IS NULL OR EXISTS (SELECT 1 FROM public.fine_types ft
      WHERE ft.id = fines.fine_type_id AND ft.group_id = fines.group_id))
  );
CREATE POLICY "fines_manager_delete" ON public.fines
  FOR DELETE TO authenticated
  USING (public.has_group_permission(group_id, 'disputes.manage')
    OR public.has_group_permission(group_id, 'finances.manage'));
DROP POLICY IF EXISTS "fines_active_own_or_manager_select" ON public.fines;
CREATE POLICY "fines_active_own_or_manager_select" ON public.fines
  FOR SELECT TO authenticated
  USING (
    public.is_active_group_member(group_id)
    AND (
      public.has_group_permission(group_id, 'disputes.manage')
      OR public.has_group_permission(group_id, 'finances.manage')
      OR EXISTS (SELECT 1 FROM public.memberships m
        WHERE m.id = fines.membership_id AND m.group_id = fines.group_id
          AND m.user_id = auth.uid() AND m.membership_status = 'active')
    )
  );
DROP POLICY IF EXISTS "fines_manager_update" ON public.fines;
CREATE POLICY "fines_manager_update" ON public.fines
  FOR UPDATE TO authenticated
  USING (public.has_group_permission(group_id, 'disputes.manage')
    OR public.has_group_permission(group_id, 'finances.manage'))
  WITH CHECK (public.has_group_permission(group_id, 'disputes.manage')
    OR public.has_group_permission(group_id, 'finances.manage'));

CREATE OR REPLACE FUNCTION public.guard_fine_update_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.group_id IS DISTINCT FROM OLD.group_id
     OR NEW.membership_id IS DISTINCT FROM OLD.membership_id THEN
    RAISE EXCEPTION 'FINE_IDENTITY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;

  IF public.has_group_permission(OLD.group_id, 'disputes.manage')
     OR public.has_group_permission(OLD.group_id, 'finances.manage') THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m
    WHERE m.id = OLD.membership_id
      AND m.group_id = OLD.group_id
      AND m.user_id = auth.uid()
      AND m.membership_status = 'active'
  ) THEN
    RAISE EXCEPTION 'FINE_MANAGER_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF OLD.status IS DISTINCT FROM 'pending'::public.fine_status
     OR NEW.status IS DISTINCT FROM 'disputed'::public.fine_status
     OR NEW.dispute_id IS NULL
     OR (to_jsonb(NEW) - ARRAY['status','dispute_id','updated_at'])
        IS DISTINCT FROM
        (to_jsonb(OLD) - ARRAY['status','dispute_id','updated_at'])
     OR NOT EXISTS (
       SELECT 1 FROM public.disputes d
       WHERE d.id = NEW.dispute_id
         AND d.group_id = OLD.group_id
         AND d.filed_by = OLD.membership_id
         AND d.related_fine_id = OLD.id
         AND d.dispute_type = 'fine_dispute'
         AND d.status = 'open'
     )
  THEN
    RAISE EXCEPTION 'FINE_DISPUTE_COMMAND_REQUIRED' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

DROP POLICY IF EXISTS "disputes_admin" ON public.disputes;
DROP POLICY IF EXISTS "disputes_active_own_or_manager_select" ON public.disputes;
CREATE POLICY "disputes_active_own_or_manager_select" ON public.disputes
  FOR SELECT TO authenticated
  USING (
    public.has_group_permission(group_id, 'disputes.manage')
    OR public.has_group_permission(group_id, 'finances.manage')
    OR EXISTS (SELECT 1 FROM public.memberships m
      WHERE m.id = disputes.filed_by AND m.group_id = disputes.group_id
        AND m.user_id = auth.uid() AND m.membership_status = 'active')
  );
CREATE POLICY "disputes_manager_insert" ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_group_permission(group_id, 'disputes.manage')
      OR public.has_group_permission(group_id, 'finances.manage'))
    AND (filed_by IS NULL OR EXISTS (SELECT 1 FROM public.memberships m
      WHERE m.id = disputes.filed_by AND m.group_id = disputes.group_id))
    AND (related_fine_id IS NULL OR EXISTS (SELECT 1 FROM public.fines f
      WHERE f.id = disputes.related_fine_id AND f.group_id = disputes.group_id))
  );
DROP POLICY IF EXISTS "disputes_manager_update" ON public.disputes;
CREATE POLICY "disputes_manager_update" ON public.disputes
  FOR UPDATE TO authenticated
  USING (public.has_group_permission(group_id, 'disputes.manage')
    OR public.has_group_permission(group_id, 'finances.manage'))
  WITH CHECK (public.has_group_permission(group_id, 'disputes.manage')
    OR public.has_group_permission(group_id, 'finances.manage'));
DROP POLICY IF EXISTS "disputes_manager_delete" ON public.disputes;
CREATE POLICY "disputes_manager_delete" ON public.disputes
  FOR DELETE TO authenticated
  USING (public.has_group_permission(group_id, 'disputes.manage')
    OR public.has_group_permission(group_id, 'finances.manage'));

-- A scheduled row must not be visible to recipients before it is sent.
DROP POLICY IF EXISTS "ann_select" ON public.announcements;
CREATE POLICY "ann_select" ON public.announcements
  FOR SELECT TO authenticated
  USING (
    public.has_group_permission(group_id, 'announcements.manage')
    OR (sent_at IS NOT NULL AND public.is_announcement_visible(audience, group_id))
  );

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

-- Legacy UUID-first, logo, project and relief-claim object reads can admit
-- exited memberships. This restrictive guard requires current membership
-- on those paths while leaving other keys to their existing policies.
CREATE POLICY "gdocs_legacy_active_read_guard"
  ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    CASE
      WHEN bucket_id = 'group-documents'
        AND name ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/]+$'
      THEN public.is_active_group_member(split_part(name, '/', 1)::uuid)
      WHEN bucket_id = 'group-documents'
        AND name ~ '^logos/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/]+$'
      THEN public.is_active_group_member(split_part(name, '/', 2)::uuid)
      WHEN bucket_id = 'group-documents'
        AND name ~ '^projects/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/]+$'
      THEN EXISTS (SELECT 1 FROM public.projects p
        WHERE p.id = split_part(name, '/', 2)::uuid
          AND public.is_active_group_member(p.group_id))
      WHEN bucket_id = 'group-documents'
        AND name ~ '^relief-claims/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/[^/]+$'
      THEN public.is_active_group_member(split_part(name, '/', 2)::uuid)
      ELSE true
    END
  );
COMMIT;
