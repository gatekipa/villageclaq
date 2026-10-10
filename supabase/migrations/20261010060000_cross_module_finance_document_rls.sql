-- Prepared only. Applying this migration requires a separate isolated-branch approval.
-- No application rows are deleted or rewritten during installation.
BEGIN;

-- The legacy permissive read policies are OR-combined with the newer policies.
-- Drop them before adding one active, audience-scoped read for each surface.
DROP POLICY IF EXISTS "rls_doc_select" ON public.documents;
DROP POLICY IF EXISTS "Members can view unrestricted documents" ON public.documents;
CREATE POLICY "documents_active_audience_select" ON public.documents
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.group_id = documents.group_id
        AND m.user_id = auth.uid()
        AND m.membership_status = 'active'
        AND (
          documents.is_restricted = false
          OR m.role IN ('owner', 'admin', 'moderator')
        )
    )
  );

DROP POLICY IF EXISTS "fine_types_select" ON public.fine_types;
CREATE POLICY "fine_types_active_member_select" ON public.fine_types
  FOR SELECT TO authenticated
  USING (public.is_active_group_member(group_id));

DROP POLICY IF EXISTS "Members view own fines" ON public.fines;
DROP POLICY IF EXISTS "rls_fin_select" ON public.fines;
CREATE POLICY "fines_active_own_or_manager_select" ON public.fines
  FOR SELECT TO authenticated
  USING (
    public.is_active_group_member(group_id)
    AND (
      public.has_group_permission(group_id, 'fines.manage')
      OR EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.id = fines.membership_id
          AND m.group_id = fines.group_id
          AND m.user_id = auth.uid()
          AND m.membership_status = 'active'
      )
    )
  );

-- A member may file a dispute for their own pending fine, but may not edit
-- another member's fine or any financial fields through direct table DML.
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

  IF public.has_group_permission(OLD.group_id, 'fines.manage') THEN
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

DROP TRIGGER IF EXISTS guard_fine_update_authority ON public.fines;
CREATE TRIGGER guard_fine_update_authority
  BEFORE UPDATE ON public.fines
  FOR EACH ROW EXECUTE FUNCTION public.guard_fine_update_authority();

DROP POLICY IF EXISTS "rls_fin_update" ON public.fines;
CREATE POLICY "fines_manager_update" ON public.fines
  FOR UPDATE TO authenticated
  USING (public.has_group_permission(group_id, 'fines.manage'))
  WITH CHECK (public.has_group_permission(group_id, 'fines.manage'));
CREATE POLICY "fines_own_dispute_update" ON public.fines
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = fines.membership_id
        AND m.group_id = fines.group_id
        AND m.user_id = auth.uid()
        AND m.membership_status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = fines.membership_id
        AND m.group_id = fines.group_id
        AND m.user_id = auth.uid()
        AND m.membership_status = 'active'
    )
  );

-- Disputes are private to their filer and authorized fine managers.
DROP POLICY IF EXISTS "disputes_select" ON public.disputes;
DROP POLICY IF EXISTS "Users can create disputes in their groups" ON public.disputes;
DROP POLICY IF EXISTS "disputes_insert" ON public.disputes;
DROP POLICY IF EXISTS "Users can update disputes in their groups" ON public.disputes;
DROP POLICY IF EXISTS "Users can delete disputes in their groups" ON public.disputes;
CREATE POLICY "disputes_active_own_or_manager_select" ON public.disputes
  FOR SELECT TO authenticated
  USING (
    public.has_group_permission(group_id, 'fines.manage')
    OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = disputes.filed_by
        AND m.group_id = disputes.group_id
        AND m.user_id = auth.uid()
        AND m.membership_status = 'active'
    )
  );
CREATE POLICY "disputes_active_own_insert" ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id = disputes.filed_by
        AND m.group_id = disputes.group_id
        AND m.user_id = auth.uid()
        AND m.membership_status = 'active'
    )
    AND (
      disputes.related_fine_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.fines f
        WHERE f.id = disputes.related_fine_id
          AND f.group_id = disputes.group_id
          AND f.membership_id = disputes.filed_by
      )
    )
  );
CREATE POLICY "disputes_manager_update" ON public.disputes
  FOR UPDATE TO authenticated
  USING (public.has_group_permission(group_id, 'fines.manage'))
  WITH CHECK (public.has_group_permission(group_id, 'fines.manage'));
CREATE POLICY "disputes_manager_delete" ON public.disputes
  FOR DELETE TO authenticated
  USING (public.has_group_permission(group_id, 'fines.manage'));

COMMIT;