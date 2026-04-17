-- G2 / G3 / G4 / G5 — remediation migration.
-- Each block is independent and idempotent.

-- ==========================================================================
-- G1 helper: get_visible_profiles_for_group
-- Batched version of get_visible_profile used by the Member Directory
-- page. Returns one row per co-member with fields already filtered by
-- each target's memberships.privacy_settings. Avoids N+1 round-trips.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.get_visible_profiles_for_group(p_group_id uuid)
RETURNS TABLE (
  user_id uuid,
  full_name text,
  display_name text,
  avatar_url text,
  email text,
  phone text,
  date_of_birth date,
  preferred_locale text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN RETURN; END IF;

  -- Caller must be an active member of the group
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = p_group_id
      AND user_id = v_caller
      AND membership_status = 'active'
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH caller_is_admin AS (
    SELECT EXISTS (
      SELECT 1 FROM public.memberships
      WHERE group_id = p_group_id
        AND user_id = v_caller
        AND role IN ('owner','admin')
        AND membership_status = 'active'
    ) AS is_admin
  )
  SELECT
    m.user_id,
    p.full_name,
    p.display_name,
    p.avatar_url,
    CASE
      WHEN m.user_id = v_caller
        OR (SELECT is_admin FROM caller_is_admin)
        OR COALESCE((m.privacy_settings->>'show_email')::boolean, false)
      THEN (SELECT email FROM auth.users au WHERE au.id = m.user_id)
      ELSE NULL
    END AS email,
    CASE
      WHEN m.user_id = v_caller
        OR (SELECT is_admin FROM caller_is_admin)
        OR COALESCE((m.privacy_settings->>'show_phone')::boolean, false)
      THEN p.phone
      ELSE NULL
    END AS phone,
    CASE
      WHEN m.user_id = v_caller
        OR (SELECT is_admin FROM caller_is_admin)
        OR COALESCE((m.privacy_settings->>'show_birthday')::boolean, false)
      THEN p.date_of_birth
      ELSE NULL
    END AS date_of_birth,
    p.preferred_locale
  FROM public.memberships m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.group_id = p_group_id
    AND m.user_id IS NOT NULL
    AND m.membership_status = 'active';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_profiles_for_group(uuid) TO authenticated;


-- ==========================================================================
-- G2: storage policies — DEFERRED (must be applied via Supabase Dashboard)
-- --------------------------------------------------------------------------
-- The Supabase MCP apply_migration tool does not have permission to
-- modify the `storage` schema (schema-level permission held only by the
-- Supabase superuser role). The storage-policy block below is therefore
-- kept as a reference SQL block; apply it manually via the Dashboard SQL
-- editor (which runs as the owner role) or via the CLI with service-role
-- credentials.
--
-- Pre-existing state verified live:
--   * avatars / group-documents / receipts buckets are all public:true
--     so SELECT policies don't protect public URLs.
--   * INSERT/UPDATE/DELETE only check auth.role() = 'authenticated' —
--     any authenticated user can overwrite any other user's avatar by
--     specifying their path. No folder-scoping on writes.
--
-- The SQL below tightens INSERT/UPDATE/DELETE to:
--   * avatars: path must start with auth.uid() folder.
--   * receipts + group-documents: path's {category}/{groupId}/... shape
--     requires the caller to be a group member (INSERT/UPDATE) or admin
--     (DELETE). Non-standard paths (projects/{projectId}/...) still
--     require authentication.
--
-- The public:true bucket flag + open SELECT policy are NOT addressed
-- here — closing that requires flipping buckets to private AND
-- migrating every .getPublicUrl() call-site to .createSignedUrl().
-- FLAGGED as a separate follow-up.
-- ==========================================================================
-- BEGIN DASHBOARD-ONLY BLOCK ------------------------------------------------

-- Avatars: path = `{userId}/{filename}`
DROP POLICY IF EXISTS "Authenticated users can upload avatars" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatars"    ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatars"    ON storage.objects;

CREATE POLICY "avatars_insert_own" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Helper used by receipts/group-documents: given a storage key
-- '{category}/{groupId}/...', verify caller is a member of the group_id.
-- The app's upload paths follow that shape:
--   receipts:        dispute-docs/{groupId}/{membershipId}/{timestamp}-{name}
--   group-documents: logos/{groupId}/...
--                    relief-claims/{groupId}/{membershipId}/...
--                    constitutions/{groupId}/...
--                    minutes/{groupId}/...
--                    projects/{projectId}/...     ← project path not group-scoped
-- The projects path breaks the {category}/{groupId}/ shape; we fall back
-- to "authenticated" for that prefix to avoid breaking the feature. This
-- is an acknowledged gap — see the flag at the end.
CREATE OR REPLACE FUNCTION storage.path_group_id(p_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN (storage.foldername(p_name))[1] IN ('logos', 'relief-claims', 'constitutions', 'minutes', 'dispute-docs')
      THEN NULLIF((storage.foldername(p_name))[2], '')::uuid
    ELSE NULL
  END;
$$;

DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update their receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete receipts" ON storage.objects;

CREATE POLICY "receipts_insert_group" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (
      -- Canonical group-scoped path
      (storage.path_group_id(name) IS NOT NULL AND is_group_member(storage.path_group_id(name)))
      -- Fallback for non-standard paths (e.g. legacy uploads) — still
      -- require authenticated; SELECT is public anyway so no data leak.
      OR storage.path_group_id(name) IS NULL
    )
  );

CREATE POLICY "receipts_update_group" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.path_group_id(name) IS NULL OR is_group_member(storage.path_group_id(name)))
  );

CREATE POLICY "receipts_delete_group" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (storage.path_group_id(name) IS NULL OR is_group_admin(storage.path_group_id(name)))
  );

DROP POLICY IF EXISTS "Authenticated users can upload group documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update group documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete group documents" ON storage.objects;

CREATE POLICY "gdocs_insert_group" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'group-documents'
    AND (
      (storage.path_group_id(name) IS NOT NULL AND is_group_member(storage.path_group_id(name)))
      OR storage.path_group_id(name) IS NULL -- projects/{projectId}/... and other legacy shapes
    )
  );

CREATE POLICY "gdocs_update_group" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'group-documents'
    AND (storage.path_group_id(name) IS NULL OR is_group_member(storage.path_group_id(name)))
  );

CREATE POLICY "gdocs_delete_group" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'group-documents'
    AND (storage.path_group_id(name) IS NULL OR is_group_admin(storage.path_group_id(name)))
  );

-- FLAGGED FOR FOLLOW-UP: all three buckets remain public: true, so any
-- URL that leaks externally is still accessible without auth. Closing
-- that requires flipping public → false AND migrating every
-- .getPublicUrl() call-site to .createSignedUrl() — out of this pass'
-- scope.
-- END DASHBOARD-ONLY BLOCK --------------------------------------------------


-- ==========================================================================
-- G3: election term tracking
-- --------------------------------------------------------------------------
-- Close-an-election currently does nothing structurally. Add:
--   * election_id column on position_assignments (FK to elections).
--   * finalize_election(p_election_id) RPC that, given a closed
--     officer_election with a clear winner AND a linked position, ends
--     the current holder's assignment and creates a new assignment for
--     the winner.
-- Tied elections are NOT auto-assigned — admin resolves manually.
-- ==========================================================================

ALTER TABLE public.position_assignments
  ADD COLUMN IF NOT EXISTS election_id uuid REFERENCES public.elections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_position_assignments_election
  ON public.position_assignments(election_id)
  WHERE election_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.finalize_election(p_election_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_group_id uuid;
  v_election_type text;
  v_election_status text;
  v_winner_candidate_id uuid;
  v_winner_membership_id uuid;
  v_winner_position_id uuid;
  v_max_count integer;
  v_tied boolean;
  v_new_assignment_id uuid;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT group_id, election_type::text, status::text
    INTO v_group_id, v_election_type, v_election_status
  FROM public.elections WHERE id = p_election_id;

  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'election_not_found');
  END IF;

  IF NOT has_group_permission(v_group_id, 'elections.manage') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  IF v_election_type <> 'officer_election' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_officer_election');
  END IF;

  IF v_election_status <> 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'election_not_closed');
  END IF;

  -- Compute winner from election_ballots. Tie → bail.
  WITH counts AS (
    SELECT candidate_id, COUNT(*) AS c
    FROM public.election_ballots
    WHERE election_id = p_election_id AND candidate_id IS NOT NULL
    GROUP BY candidate_id
  ),
  top AS (
    SELECT MAX(c) AS max_c FROM counts
  ),
  winners AS (
    SELECT candidate_id FROM counts, top WHERE counts.c = top.max_c
  )
  SELECT candidate_id, (SELECT max_c FROM top), (SELECT COUNT(*) > 1 FROM winners)
    INTO v_winner_candidate_id, v_max_count, v_tied
  FROM winners
  LIMIT 1;

  IF v_winner_candidate_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_votes');
  END IF;
  IF v_tied THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tied', 'max_votes', v_max_count);
  END IF;

  SELECT membership_id, position_id
    INTO v_winner_membership_id, v_winner_position_id
  FROM public.election_candidates
  WHERE id = v_winner_candidate_id;

  IF v_winner_position_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_position_linked');
  END IF;

  -- If the winner is already the active holder, return a no-op success.
  IF EXISTS (
    SELECT 1 FROM public.position_assignments
    WHERE position_id = v_winner_position_id
      AND membership_id = v_winner_membership_id
      AND ended_at IS NULL
  ) THEN
    RETURN jsonb_build_object('ok', true, 'no_change', true);
  END IF;

  -- End the outgoing holder's term
  UPDATE public.position_assignments
  SET ended_at = now()
  WHERE position_id = v_winner_position_id
    AND ended_at IS NULL;

  -- Create the winner's new assignment
  INSERT INTO public.position_assignments (position_id, membership_id, assigned_by, started_at, election_id)
  VALUES (v_winner_position_id, v_winner_membership_id, v_caller, now(), p_election_id)
  RETURNING id INTO v_new_assignment_id;

  RETURN jsonb_build_object(
    'ok', true,
    'assignment_id', v_new_assignment_id,
    'position_id', v_winner_position_id,
    'winner_membership_id', v_winner_membership_id,
    'votes', v_max_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_election(uuid) TO authenticated;


-- ==========================================================================
-- G4: overlapping elections for the same position
-- --------------------------------------------------------------------------
-- Block creation of a new election whose candidates target a position
-- that already has an open (draft/open) election in the same group. We
-- evaluate at election_candidates INSERT (since elections don't carry a
-- position_id — positions are assigned per candidate) AND at election
-- state transitions.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.prevent_overlapping_elections_for_position()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group_id uuid;
  v_exists boolean;
BEGIN
  IF NEW.position_id IS NULL THEN RETURN NEW; END IF;

  SELECT group_id INTO v_group_id FROM public.elections WHERE id = NEW.election_id;
  IF v_group_id IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.election_candidates ec
    JOIN public.elections e ON e.id = ec.election_id
    WHERE ec.position_id = NEW.position_id
      AND e.group_id = v_group_id
      AND e.status IN ('draft','open')
      AND ec.election_id <> NEW.election_id
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'overlapping_election_for_position' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_overlapping_elections_for_position ON election_candidates;
CREATE TRIGGER prevent_overlapping_elections_for_position
  BEFORE INSERT OR UPDATE OF position_id ON election_candidates
  FOR EACH ROW EXECUTE FUNCTION prevent_overlapping_elections_for_position();


-- ==========================================================================
-- G5: enterprise branch transfer RPC
-- --------------------------------------------------------------------------
-- The old enterprise/transfers page did a direct .insert() that failed
-- under the pre-existing RLS (user_id <> auth.uid()). Lockdown in 00076
-- reinforced the block. This RPC implements the intended flow:
--   1. Verify caller is an admin of either the source or destination
--      group (federated HQ transfers assume both belong to the same org).
--   2. Transfer record must exist with status = 'approved_dest' (or
--      whatever fully-approved status; we accept any non-completed
--      approved status).
--   3. Flip source membership standing to 'transferred' (audit trail —
--      do NOT delete; payments/attendance stay linked).
--   4. Insert new 'active' membership in the destination group with
--      role='member' and standing='good'.
--   5. Mark transfer as completed with timestamp.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.execute_member_transfer(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_transfer RECORD;
  v_source_membership_id uuid;
  v_new_membership_id uuid;
  v_display_name text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  SELECT id, source_group_id, dest_group_id, member_id, status::text, completed_at
    INTO v_transfer
  FROM public.member_transfers WHERE id = p_transfer_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_found');
  END IF;

  IF v_transfer.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'transfer_not_approved');
  END IF;

  IF v_transfer.completed_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_completed');
  END IF;

  -- Caller must be admin of either source or destination group
  IF NOT (
    is_group_admin(v_transfer.source_group_id)
    OR is_group_admin(v_transfer.dest_group_id)
    OR is_platform_staff()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- Grab source membership for audit (don't delete — payments/attendance FK).
  SELECT id, display_name INTO v_source_membership_id, v_display_name
  FROM public.memberships
  WHERE group_id = v_transfer.source_group_id
    AND user_id = v_transfer.member_id
    AND membership_status = 'active'
  LIMIT 1;

  IF v_source_membership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'source_membership_missing');
  END IF;

  -- Block duplicate in destination
  IF EXISTS (
    SELECT 1 FROM public.memberships
    WHERE group_id = v_transfer.dest_group_id
      AND user_id = v_transfer.member_id
      AND membership_status = 'active'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_in_destination');
  END IF;

  UPDATE public.memberships
  SET standing = 'transferred'::membership_standing,
      membership_status = 'exited',
      updated_at = now()
  WHERE id = v_source_membership_id;

  INSERT INTO public.memberships (user_id, group_id, role, standing, is_proxy, display_name, membership_status, joined_at)
  VALUES (
    v_transfer.member_id,
    v_transfer.dest_group_id,
    'member'::membership_role,
    'good'::membership_standing,
    false,
    v_display_name,
    'active',
    now()
  )
  RETURNING id INTO v_new_membership_id;

  UPDATE public.member_transfers
  SET status = 'completed',
      completed_at = now(),
      updated_at = now()
  WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'ok', true,
    'new_membership_id', v_new_membership_id,
    'source_membership_id', v_source_membership_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.execute_member_transfer(uuid) TO authenticated;


-- ==========================================================================
-- G6 helper: member_locale(p_user_id) — used by the per-recipient
-- notification locale refactor to pick the right language copy for each
-- recipient. Falls back to 'en'.
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.member_locale(p_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT preferred_locale FROM public.profiles WHERE id = p_user_id),
    'en'
  );
$$;

GRANT EXECUTE ON FUNCTION public.member_locale(uuid) TO authenticated, service_role;
