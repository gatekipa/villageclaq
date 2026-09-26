-- 00199: preserve access to official attachments created before 00188.
--
-- Historical clients stored a short-lived Storage URL in file_url. 00188
-- introduced durable object-key columns but did not backfill those rows. Resolve
-- only validated group-documents URLs whose decoded key exists in storage.objects.
-- Fail the upgrade when any historical URL cannot be resolved: silently making
-- an official record unreadable is not an acceptable compatibility strategy.

CREATE OR REPLACE FUNCTION public.extract_legacy_official_attachment_key(
  p_value text,
  p_prefix text,
  p_group_id uuid
) RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO ''
AS $function$
DECLARE
  v_input text := btrim(p_value);
  v_marker_public text := '/object/public/group-documents/';
  v_marker_signed text := '/object/sign/group-documents/';
  v_marker_position integer;
  v_encoded text;
  v_bytes bytea := decode('', 'hex');
  v_index integer := 1;
  v_pair text;
  v_key text;
  v_parts text[];
BEGIN
  IF v_input IS NULL OR v_input = ''
     OR p_prefix NOT IN ('minutes', 'constitutions')
     OR p_group_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Query strings and fragments belong to the old signed URL, not the key.
  v_input := split_part(split_part(v_input, '?', 1), '#', 1);

  IF v_input LIKE p_prefix || '/%' THEN
    v_encoded := v_input;
  ELSE
    IF v_input !~ '^https?://[^/]+/' THEN
      RETURN NULL;
    END IF;
    v_marker_position := strpos(v_input, v_marker_public);
    IF v_marker_position > 0 THEN
      v_encoded := substr(v_input, v_marker_position + length(v_marker_public));
    ELSE
      v_marker_position := strpos(v_input, v_marker_signed);
      IF v_marker_position = 0 THEN RETURN NULL; END IF;
      v_encoded := substr(v_input, v_marker_position + length(v_marker_signed));
    END IF;
  END IF;

  -- Percent-decode the URL path as UTF-8. Encoded separators are decoded before
  -- segment validation, so they cannot create a hidden path shape.
  WHILE v_index <= length(v_encoded) LOOP
    IF substr(v_encoded, v_index, 1) = '%' THEN
      IF v_index + 2 > length(v_encoded) THEN RETURN NULL; END IF;
      v_pair := substr(v_encoded, v_index + 1, 2);
      IF v_pair !~ '^[0-9A-Fa-f]{2}$' THEN RETURN NULL; END IF;
      v_bytes := v_bytes || decode(v_pair, 'hex');
      v_index := v_index + 3;
    ELSE
      v_bytes := v_bytes || convert_to(substr(v_encoded, v_index, 1), 'UTF8');
      v_index := v_index + 1;
    END IF;
  END LOOP;

  BEGIN
    v_key := convert_from(v_bytes, 'UTF8');
  EXCEPTION WHEN character_not_in_repertoire OR untranslatable_character THEN
    RETURN NULL;
  END;

  IF position(E'\\' IN v_key) > 0 OR left(v_key, 1) = '/'
     OR right(v_key, 1) = '/' OR position('//' IN v_key) > 0 THEN
    RETURN NULL;
  END IF;
  v_parts := string_to_array(v_key, '/');
  IF coalesce(array_length(v_parts, 1), 0) <> 3
     OR v_parts[1] <> p_prefix
     OR lower(v_parts[2]) <> lower(p_group_id::text)
     OR v_parts[3] IS NULL OR v_parts[3] IN ('', '.', '..') THEN
    RETURN NULL;
  END IF;
  RETURN v_key;
END;
$function$;

REVOKE ALL ON FUNCTION public.extract_legacy_official_attachment_key(text,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extract_legacy_official_attachment_key(text,text,uuid)
  TO service_role;

-- Preserve historical timestamps while adding the durable reference.
ALTER TABLE public.meeting_minutes DISABLE TRIGGER set_meeting_minutes_updated_at;
ALTER TABLE public.group_constitutions DISABLE TRIGGER trg_group_constitutions_updated_at;
SELECT set_config('app.governance_command', 'on', true);

WITH resolved AS (
  SELECT m.id, o.name
  FROM public.meeting_minutes m
  CROSS JOIN LATERAL (
    SELECT public.extract_legacy_official_attachment_key(
      m.file_url, 'minutes', m.group_id
    ) AS object_key
  ) k
  JOIN storage.objects o
    ON o.bucket_id = 'group-documents' AND o.name = k.object_key
  WHERE m.file_url IS NOT NULL AND m.attachment_object_key IS NULL
)
UPDATE public.meeting_minutes m
SET attachment_bucket = 'group-documents', attachment_object_key = r.name
FROM resolved r
WHERE m.id = r.id;

WITH resolved AS (
  SELECT d.id, o.name
  FROM public.group_constitutions d
  CROSS JOIN LATERAL (
    SELECT public.extract_legacy_official_attachment_key(
      d.file_url, 'constitutions', d.group_id
    ) AS object_key
  ) k
  JOIN storage.objects o
    ON o.bucket_id = 'group-documents' AND o.name = k.object_key
  WHERE d.file_url IS NOT NULL AND d.attachment_object_key IS NULL
)
UPDATE public.group_constitutions d
SET attachment_bucket = 'group-documents', attachment_object_key = r.name
FROM resolved r
WHERE d.id = r.id;

ALTER TABLE public.meeting_minutes ENABLE TRIGGER set_meeting_minutes_updated_at;
ALTER TABLE public.group_constitutions ENABLE TRIGGER trg_group_constitutions_updated_at;

DO $block$
DECLARE
  v_minutes_unresolved bigint;
  v_constitutions_unresolved bigint;
BEGIN
  SELECT count(*) INTO v_minutes_unresolved
  FROM public.meeting_minutes
  WHERE file_url IS NOT NULL AND attachment_object_key IS NULL;

  SELECT count(*) INTO v_constitutions_unresolved
  FROM public.group_constitutions
  WHERE file_url IS NOT NULL AND attachment_object_key IS NULL;

  IF v_minutes_unresolved > 0 OR v_constitutions_unresolved > 0 THEN
    RAISE EXCEPTION
      'LEGACY_OFFICIAL_ATTACHMENT_UNRESOLVED: minutes=%, constitutions=%',
      v_minutes_unresolved, v_constitutions_unresolved
      USING ERRCODE = '23514';
  END IF;
END;
$block$;

COMMENT ON FUNCTION public.extract_legacy_official_attachment_key(text,text,uuid) IS
  'Service-only strict decoder used to reconcile pre-00188 official Storage URLs with durable object keys.';
