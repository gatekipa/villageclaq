-- 00194: authorize the stable-parent object-key shapes introduced by 00188.
-- Official attachment access is derived from the exact parent row and state.
-- Object bytes are append-only: authoritative commands audit the durable link
-- and lifecycle, while Storage cannot replace or delete bytes out of band.

CREATE OR REPLACE FUNCTION public.storage_group_documents_authorized(p_name text, p_operation text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_parts text[];
  v_n int;
  v_prefix text;
  v_gid uuid;
  v_mid uuid;
  v_pid uuid;
  v_parent uuid;
  uuid_re constant text := '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
BEGIN
  IF p_operation IS NULL OR p_operation NOT IN ('select', 'insert', 'update', 'delete') THEN
    RETURN false;
  END IF;
  IF p_name IS NULL OR p_name = '' THEN
    RETURN false;
  END IF;
  IF position(E'\\' IN p_name) > 0
     OR p_name ~ '%2[Ff]' OR p_name ~ '%5[Cc]' OR p_name ~ '%2[Ee]'
     OR p_name ~ E'[\u2215\u2044\uFF0F\u2571\u29F8\u29F9]'
     OR left(p_name, 1) = '/' OR right(p_name, 1) = '/' OR position('//' IN p_name) > 0 THEN
    RETURN false;
  END IF;

  v_parts := string_to_array(p_name, '/');
  v_n := coalesce(array_length(v_parts, 1), 0);
  IF v_n < 2 OR EXISTS (
    SELECT 1 FROM unnest(v_parts) AS s(seg)
    WHERE s.seg IS NULL OR s.seg = '' OR s.seg = '.' OR s.seg = '..'
  ) THEN
    RETURN false;
  END IF;

  -- Historical UUID-first documents: {groupId}/{file}.
  IF v_n = 2 AND v_parts[1] ~ uuid_re THEN
    v_gid := v_parts[1]::uuid;
    IF p_operation = 'select' THEN
      RETURN public.is_group_member(v_gid);
    ELSIF p_operation IN ('insert', 'update') THEN
      RETURN public.has_group_permission(v_gid, 'documents.manage');
    ELSIF p_operation = 'delete' THEN
      RETURN public.is_group_admin(v_gid);
    END IF;
    RETURN false;
  END IF;

  v_prefix := v_parts[1];

  IF v_prefix = 'logos' THEN
    IF v_n <> 3 OR v_parts[2] !~ uuid_re THEN RETURN false; END IF;
    v_gid := v_parts[2]::uuid;
    IF p_operation = 'select' THEN RETURN public.is_group_member(v_gid); END IF;
    RETURN false;
  END IF;

  IF v_prefix = 'minutes' THEN
    IF v_n NOT IN (3,4) OR v_parts[2] !~ uuid_re THEN RETURN false; END IF;
    v_gid := v_parts[2]::uuid;
    -- Historical minutes/{group}/{file}: allow reads only when a retained
    -- parent row references the exact key. No new legacy objects or mutations.
    IF v_n = 3 THEN
      IF p_operation <> 'select' THEN RETURN false; END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.meeting_minutes m
        WHERE m.group_id=v_gid AND m.attachment_object_key=p_name
          AND (
            public.has_group_permission(v_gid,'minutes.manage')
            OR (public.is_active_group_member(v_gid) AND m.status IN ('published','provisional'))
          )
      );
    END IF;
    IF v_parts[3] !~ uuid_re THEN RETURN false; END IF;
    v_parent := v_parts[3]::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.meeting_minutes m
      WHERE m.group_id=v_gid AND m.record_id=v_parent
    ) THEN RETURN false; END IF;
    IF p_operation = 'select' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.meeting_minutes m
        WHERE m.group_id=v_gid AND m.record_id=v_parent
          AND m.attachment_object_key=p_name
          AND (
            public.has_group_permission(v_gid,'minutes.manage')
            OR (public.is_active_group_member(v_gid) AND m.status IN ('published','provisional'))
          )
      );
    END IF;
    IF p_operation <> 'insert' THEN RETURN false; END IF;
    RETURN public.has_group_permission(v_gid,'minutes.manage') AND EXISTS (
      SELECT 1 FROM public.meeting_minutes m
      WHERE m.group_id=v_gid AND m.record_id=v_parent
        AND m.status IN ('draft','provisional')
    );
  END IF;

  IF v_prefix = 'constitutions' THEN
    IF v_n NOT IN (3,4) OR v_parts[2] !~ uuid_re THEN RETURN false; END IF;
    v_gid := v_parts[2]::uuid;
    -- Historical constitutions/{group}/{file}: exact referenced reads only.
    IF v_n = 3 THEN
      IF p_operation <> 'select' THEN RETURN false; END IF;
      RETURN EXISTS (
        SELECT 1 FROM public.group_constitutions d
        WHERE d.group_id=v_gid AND d.attachment_object_key=p_name
          AND (
            public.has_group_permission(v_gid,'documents.manage')
            OR public.has_group_permission(v_gid,'governance.manage')
            OR (public.is_active_group_member(v_gid) AND d.status='published')
          )
      );
    END IF;
    IF v_parts[3] !~ uuid_re THEN RETURN false; END IF;
    v_parent := v_parts[3]::uuid;
    IF NOT EXISTS (
      SELECT 1 FROM public.group_constitutions d
      WHERE d.group_id=v_gid AND d.document_id=v_parent
    ) THEN RETURN false; END IF;
    IF p_operation = 'select' THEN
      RETURN EXISTS (
        SELECT 1 FROM public.group_constitutions d
        WHERE d.group_id=v_gid AND d.document_id=v_parent
          AND d.attachment_object_key=p_name
          AND (
            public.has_group_permission(v_gid,'documents.manage')
            OR public.has_group_permission(v_gid,'governance.manage')
            OR (public.is_active_group_member(v_gid) AND d.status='published')
          )
      );
    END IF;
    IF p_operation <> 'insert' THEN RETURN false; END IF;
    RETURN (
      public.has_group_permission(v_gid,'documents.manage')
      OR public.has_group_permission(v_gid,'governance.manage')
    ) AND EXISTS (
      SELECT 1 FROM public.group_constitutions d
      WHERE d.group_id=v_gid AND d.document_id=v_parent AND d.status='draft'
    );
  END IF;

  IF v_prefix = 'relief-claims' THEN
    IF v_n <> 4 OR v_parts[2] !~ uuid_re OR v_parts[3] !~ uuid_re THEN RETURN false; END IF;
    v_gid := v_parts[2]::uuid;
    v_mid := v_parts[3]::uuid;
    IF p_operation = 'delete' THEN RETURN public.is_group_admin(v_gid); END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.id=v_mid AND m.user_id=auth.uid() AND m.group_id=v_gid
        AND (p_operation='select' OR m.membership_status='active')
    );
  END IF;

  IF v_prefix = 'projects' THEN
    IF v_n <> 3 OR v_parts[2] !~ uuid_re THEN RETURN false; END IF;
    v_pid := v_parts[2]::uuid;
    SELECT p.group_id INTO v_gid FROM public.projects p WHERE p.id=v_pid;
    IF v_gid IS NULL THEN RETURN false; END IF;
    IF p_operation='select' THEN RETURN public.is_group_member(v_gid); END IF;
    IF p_operation IN ('insert','update','delete') THEN RETURN public.is_group_admin(v_gid); END IF;
  END IF;

  RETURN false;
END;
$function$;

ALTER FUNCTION public.storage_group_documents_authorized(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.storage_group_documents_authorized(text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.storage_group_documents_authorized(text,text) TO authenticated;
