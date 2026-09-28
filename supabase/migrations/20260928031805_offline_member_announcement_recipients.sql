-- Account activation is optional for active group membership. Extend the
-- authoritative announcement recipient branch to the same consented offline
-- contact contract already used by contribution reminders. Provider delivery
-- remains queue-backed; this migration does not grant queue/table access.

BEGIN;

DO $do$
DECLARE
  v_sql text;
  v_before text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_sql
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname = 'enqueue_outbound_notification'
     AND pg_get_function_identity_arguments(p.oid) =
       'p_notification_type text, p_domain_object_id uuid, p_channel notification_channel, p_recipient_membership_id uuid, p_locale text';

  IF v_sql IS NULL THEN
    RAISE EXCEPTION 'ENQUEUE_OUTBOUND_NOTIFICATION_NOT_FOUND';
  END IF;
  v_before := v_sql;

  v_sql := replace(v_sql,
$$    IF NOT FOUND
       OR v_membership.group_id IS DISTINCT FROM v_group_id
       OR v_membership.user_id IS NULL
       OR COALESCE(v_membership.membership_status, 'active') IS DISTINCT FROM 'active'
       OR v_membership.standing::text = 'banned' THEN$$,
$$    IF NOT FOUND
       OR v_membership.group_id IS DISTINCT FROM v_group_id
       OR (v_membership.user_id IS NULL AND NOT COALESCE(v_membership.is_proxy, false))
       OR COALESCE(v_membership.membership_status, 'active') IS DISTINCT FROM 'active'
       OR v_membership.standing::text = 'banned' THEN$$);

  v_sql := replace(v_sql,
$$    v_recipient_membership_id := v_membership.id;
    v_recipient_user_id := v_membership.user_id;
    v_prefs_key := 'announcements';
    v_key := v_announcement.id::text || ':' || v_recipient_user_id::text;
    v_type_ids := jsonb_build_object('announcementId', v_announcement.id, 'userId', v_recipient_user_id);
    v_phone := public.cut2_internal_resolve_phone(v_recipient_membership_id, 'standard');$$,
$$    v_recipient_membership_id := v_membership.id;
    v_recipient_user_id := v_membership.user_id;
    v_is_proxy := COALESCE(v_membership.is_proxy, false);
    v_prefs_key := 'announcements';
    v_key := v_announcement.id::text || ':' || COALESCE(v_recipient_user_id::text, 'offline:' || v_membership.id::text);
    v_type_ids := jsonb_build_object(
      'announcementId', v_announcement.id,
      'userId', v_recipient_user_id,
      'membershipId', v_membership.id
    );
    v_phone := public.cut2_internal_resolve_phone(
      v_recipient_membership_id,
      CASE WHEN v_is_proxy THEN 'proxy' ELSE 'standard' END
    );$$);

  IF v_sql = v_before
     OR position('offline:' in v_sql) = 0
     OR position('membershipId' in v_sql) = 0 THEN
    RAISE EXCEPTION 'ANNOUNCEMENT_OFFLINE_RECIPIENT_CONTRACT_MISMATCH';
  END IF;

  EXECUTE v_sql;
END;
$do$;

COMMIT;
