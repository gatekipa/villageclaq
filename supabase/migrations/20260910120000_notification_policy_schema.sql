-- =============================================================================
-- 20260910120000_notification_policy_schema.sql
-- =============================================================================
-- CREATE-NOT-APPLY — Product Consistency Cut 2 / Phase 2 schema artifact.
-- Do NOT apply this migration in production from this track.
-- Do NOT wire crons, producers, or adapters to these tables yet.
--
-- notification_policy_occurrences is DORMANT: reserved for future domain
-- adapters (PC-PAYMENT → PC-HOSTING → PC-EVENTS). No producers write rows yet.
--
-- Permission key (documented choice): settings.manage
--   WRITE (INSERT/UPDATE/DELETE): has_group_permission(..., 'settings.manage')
--   READ  (SELECT): same — officers with settings.manage OR owner / general admin
--     (has_group_permission already treats owner + admin-without-assignments as true).
--   Ordinary members: no SELECT/WRITE on policy tables.
--   Do NOT invent notifications.manage.
-- Platform service_role bypasses RLS for future workers (separate from this cut).
-- F3 ledger track: untouched.
-- Announcement queue modernization: remains DORMANT.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- A) notification_policies
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  domain text NOT NULL,
  object_id uuid NULL, -- NULL = group/domain default; non-null = object override
  enabled boolean NOT NULL DEFAULT true,
  timezone text NOT NULL DEFAULT 'UTC',
  repeat_interval_hours integer NULL,
  max_occurrences integer NULL,
  stop_when_resolved boolean NOT NULL DEFAULT true,
  stop_after_hours integer NULL,
  quiet_start_minute integer NULL,
  quiet_end_minute integer NULL,
  channel_in_app boolean NOT NULL DEFAULT true,
  channel_email boolean NOT NULL DEFAULT true,
  channel_sms boolean NOT NULL DEFAULT true,
  channel_whatsapp boolean NOT NULL DEFAULT true,
  channel_push boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  updated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_policies_domain_check
    CHECK (domain IN ('payment', 'hosting', 'event')),
  CONSTRAINT notification_policies_repeat_interval_positive
    CHECK (repeat_interval_hours IS NULL OR repeat_interval_hours > 0),
  CONSTRAINT notification_policies_max_occurrences_positive
    CHECK (max_occurrences IS NULL OR max_occurrences > 0),
  CONSTRAINT notification_policies_stop_after_positive
    CHECK (stop_after_hours IS NULL OR stop_after_hours > 0),
  CONSTRAINT notification_policies_quiet_start_range
    CHECK (quiet_start_minute IS NULL OR (quiet_start_minute >= 0 AND quiet_start_minute <= 1439)),
  CONSTRAINT notification_policies_quiet_end_range
    CHECK (quiet_end_minute IS NULL OR (quiet_end_minute >= 0 AND quiet_end_minute <= 1439)),
  -- Quiet minutes both null or both non-null
  CONSTRAINT notification_policies_quiet_pair
    CHECK (
      (quiet_start_minute IS NULL AND quiet_end_minute IS NULL)
      OR (quiet_start_minute IS NOT NULL AND quiet_end_minute IS NOT NULL)
    ),
  -- If repeat_interval_hours set then max_occurrences must be set
  CONSTRAINT notification_policies_repeat_requires_max
    CHECK (
      repeat_interval_hours IS NULL
      OR max_occurrences IS NOT NULL
    ),
  -- PG15+: NULLS NOT DISTINCT so one NULL object_id default per (group, domain)
  CONSTRAINT notification_policies_group_domain_object_unique
    UNIQUE NULLS NOT DISTINCT (group_id, domain, object_id)
);

COMMENT ON TABLE public.notification_policies IS
  'CREATE-NOT-APPLY Product Consistency policy rows. No delivery fields. WRITE/READ gated by settings.manage via has_group_permission.';
COMMENT ON COLUMN public.notification_policies.object_id IS
  'NULL = group/domain default; non-NULL = per-object override (e.g. one event).';
COMMENT ON COLUMN public.notification_policies.domain IS
  'payment | hosting | event — next domain order PC-PAYMENT → PC-HOSTING → PC-EVENTS.';

CREATE INDEX IF NOT EXISTS notification_policies_group_domain_idx
  ON public.notification_policies (group_id, domain);

-- ---------------------------------------------------------------------------
-- B) notification_policy_triggers
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_policy_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id uuid NOT NULL REFERENCES public.notification_policies(id) ON DELETE CASCADE,
  offset_hours integer NOT NULL,
  CONSTRAINT notification_policy_triggers_policy_offset_unique
    UNIQUE (policy_id, offset_hours)
);

COMMENT ON TABLE public.notification_policy_triggers IS
  'Relative trigger offsets (hours) for a policy. Negative = before anchor; positive = after.';

CREATE INDEX IF NOT EXISTS notification_policy_triggers_policy_id_idx
  ON public.notification_policy_triggers (policy_id);

-- ---------------------------------------------------------------------------
-- C) notification_policy_occurrences (DORMANT)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_policy_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  domain text NOT NULL,
  object_id uuid NOT NULL,
  anchor_at timestamptz NOT NULL,
  trigger_offset_hours integer NOT NULL,
  occurrence_index integer NOT NULL,
  identity_key text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled',
  eligible_at timestamptz NOT NULL,
  deferred_until timestamptz NULL,
  superseded_by uuid NULL REFERENCES public.notification_policy_occurrences(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_policy_occurrences_domain_check
    CHECK (domain IN ('payment', 'hosting', 'event')),
  CONSTRAINT notification_policy_occurrences_index_nonneg
    CHECK (occurrence_index >= 0),
  CONSTRAINT notification_policy_occurrences_status_check
    CHECK (status IN (
      'scheduled',
      'deferred',
      'sent',
      'skipped',
      'superseded',
      'cancelled',
      'stop_resolved',
      'stop_policy'
    )),
  CONSTRAINT notification_policy_occurrences_identity_unique
    UNIQUE (identity_key),
  CONSTRAINT notification_policy_occurrences_natural_unique
    UNIQUE (group_id, domain, object_id, anchor_at, trigger_offset_hours, occurrence_index)
);

COMMENT ON TABLE public.notification_policy_occurrences IS
  'DORMANT — future adapters only. identity_key must match pure occurrenceIdentity(). No producers write yet. CREATE-NOT-APPLY track must not wire crons.';
COMMENT ON COLUMN public.notification_policy_occurrences.identity_key IS
  'Stable string: domain:objectId:anchorIso:triggerOffsetHours:occurrenceIndex (see occurrenceIdentity).';

CREATE INDEX IF NOT EXISTS notification_policy_occurrences_due_idx
  ON public.notification_policy_occurrences (group_id, domain, status, eligible_at);
CREATE INDEX IF NOT EXISTS notification_policy_occurrences_object_idx
  ON public.notification_policy_occurrences (group_id, domain, object_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance (policies + occurrences)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_policy_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_policies_updated_at ON public.notification_policies;
CREATE TRIGGER trg_notification_policies_updated_at
  BEFORE UPDATE ON public.notification_policies
  FOR EACH ROW EXECUTE FUNCTION public.notification_policy_set_updated_at();

DROP TRIGGER IF EXISTS trg_notification_policy_occurrences_updated_at
  ON public.notification_policy_occurrences;
CREATE TRIGGER trg_notification_policy_occurrences_updated_at
  BEFORE UPDATE ON public.notification_policy_occurrences
  FOR EACH ROW EXECUTE FUNCTION public.notification_policy_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: ENABLE + FORCE on all three
-- Permission: settings.manage (NOT notifications.manage)
-- ---------------------------------------------------------------------------
ALTER TABLE public.notification_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_policies FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notification_policy_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_policy_triggers FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notification_policy_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_policy_occurrences FORCE ROW LEVEL SECURITY;

-- Policies: drop-if-exists then create (idempotent-friendly for CREATE-NOT-APPLY review)
DROP POLICY IF EXISTS np_select ON public.notification_policies;
DROP POLICY IF EXISTS np_insert ON public.notification_policies;
DROP POLICY IF EXISTS np_update ON public.notification_policies;
DROP POLICY IF EXISTS np_delete ON public.notification_policies;

-- READ: settings.manage holders (includes owner + admin-without-assignments via helper)
CREATE POLICY np_select ON public.notification_policies
  FOR SELECT TO authenticated
  USING (public.has_group_permission(group_id, 'settings.manage'));

CREATE POLICY np_insert ON public.notification_policies
  FOR INSERT TO authenticated
  WITH CHECK (public.has_group_permission(group_id, 'settings.manage'));

CREATE POLICY np_update ON public.notification_policies
  FOR UPDATE TO authenticated
  USING (public.has_group_permission(group_id, 'settings.manage'))
  WITH CHECK (public.has_group_permission(group_id, 'settings.manage'));

CREATE POLICY np_delete ON public.notification_policies
  FOR DELETE TO authenticated
  USING (public.has_group_permission(group_id, 'settings.manage'));

-- Triggers: gate via parent policy's group_id
DROP POLICY IF EXISTS npt_select ON public.notification_policy_triggers;
DROP POLICY IF EXISTS npt_insert ON public.notification_policy_triggers;
DROP POLICY IF EXISTS npt_update ON public.notification_policy_triggers;
DROP POLICY IF EXISTS npt_delete ON public.notification_policy_triggers;

CREATE POLICY npt_select ON public.notification_policy_triggers
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notification_policies p
      WHERE p.id = policy_id
        AND public.has_group_permission(p.group_id, 'settings.manage')
    )
  );

CREATE POLICY npt_insert ON public.notification_policy_triggers
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notification_policies p
      WHERE p.id = policy_id
        AND public.has_group_permission(p.group_id, 'settings.manage')
    )
  );

CREATE POLICY npt_update ON public.notification_policy_triggers
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notification_policies p
      WHERE p.id = policy_id
        AND public.has_group_permission(p.group_id, 'settings.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.notification_policies p
      WHERE p.id = policy_id
        AND public.has_group_permission(p.group_id, 'settings.manage')
    )
  );

CREATE POLICY npt_delete ON public.notification_policy_triggers
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.notification_policies p
      WHERE p.id = policy_id
        AND public.has_group_permission(p.group_id, 'settings.manage')
    )
  );

-- Occurrences (dormant): officers may SELECT for diagnostics; writes reserved for
-- service_role workers later. Authenticated INSERT/UPDATE/DELETE still gated by
-- settings.manage so accidental client writes cannot fan out without permission.
DROP POLICY IF EXISTS npo_select ON public.notification_policy_occurrences;
DROP POLICY IF EXISTS npo_insert ON public.notification_policy_occurrences;
DROP POLICY IF EXISTS npo_update ON public.notification_policy_occurrences;
DROP POLICY IF EXISTS npo_delete ON public.notification_policy_occurrences;

CREATE POLICY npo_select ON public.notification_policy_occurrences
  FOR SELECT TO authenticated
  USING (public.has_group_permission(group_id, 'settings.manage'));

CREATE POLICY npo_insert ON public.notification_policy_occurrences
  FOR INSERT TO authenticated
  WITH CHECK (public.has_group_permission(group_id, 'settings.manage'));

CREATE POLICY npo_update ON public.notification_policy_occurrences
  FOR UPDATE TO authenticated
  USING (public.has_group_permission(group_id, 'settings.manage'))
  WITH CHECK (public.has_group_permission(group_id, 'settings.manage'));

CREATE POLICY npo_delete ON public.notification_policy_occurrences
  FOR DELETE TO authenticated
  USING (public.has_group_permission(group_id, 'settings.manage'));

-- ---------------------------------------------------------------------------
-- Grants: revoke public; grant to authenticated behind RLS
-- service_role retains bypass for future workers (Supabase default).
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.notification_policies FROM PUBLIC, anon;
REVOKE ALL ON public.notification_policy_triggers FROM PUBLIC, anon;
REVOKE ALL ON public.notification_policy_occurrences FROM PUBLIC, anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_policies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_policy_triggers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_policy_occurrences TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_policies TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_policy_triggers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_policy_occurrences TO service_role;

-- Document helper dependency (existing VillageClaq helpers — do not redefine here)
COMMENT ON POLICY np_select ON public.notification_policies IS
  'READ requires has_group_permission(group_id, settings.manage). Ordinary members excluded. TODO: if has_group_permission is absent in a branch, fall back to is_group_admin(group_id) AND document.';
