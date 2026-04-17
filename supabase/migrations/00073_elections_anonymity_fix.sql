-- Elections: P0 anonymity + impersonation + eligibility fixes
--
-- Findings (pre-fix, verified against pg_policies + information_schema):
--  1. election_votes stored voter_membership_id on the SAME row as
--     candidate_id/option_id. RLS policy rls_evote_select let any
--     group member SELECT the whole table → complete voter→choice map
--     exposed to peers, admins, and anyone with service-role access.
--  2. RLS INSERT policy rls_evote_insert was ORed with "Good standing
--     members can vote"; the laxer policy let any member impersonate
--     any other member's vote (voter_membership_id was not bound to
--     auth.uid()) and did not require 'good' standing.
--  3. No DB-level protection against voting outside the configured
--     starts_at..ends_at window, voting in a 'draft' or 'closed'
--     election, or voting for a candidate/option that belongs to a
--     different election.
--
-- Fix: split election_votes into two tables so voter identity and vote
-- choice are permanently decoupled, and force all writes through a
-- SECURITY DEFINER RPC that enforces every precondition atomically.
--   - election_vote_receipts (election_id, voter_membership_id)
--     stores WHO voted (for dedup + "you already voted" UX) but never
--     the CHOICE.
--   - election_ballots (election_id, candidate_id | option_id)
--     stores the CHOICE but has no voter reference. Once inserted,
--     there is no join path back to a voter.
--
-- RLS: receipts are visible only to their own voter; ballots are
-- visible to group members only after the election closes (prevents
-- live tallies). Neither table accepts direct INSERT/UPDATE/DELETE —
-- all writes go through cast_ballot().
--
-- Data migration: the 4 existing rows are split into matching receipt
-- + ballot rows to preserve tallies. The prior schema already leaked
-- past votes via rls_evote_select; this migration cannot undo that
-- leak (backups may persist) but stops all new leakage forward.

-- ---------------------------------------------------------------------------
-- 1. New tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS election_vote_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  voter_membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(election_id, voter_membership_id)
);

CREATE INDEX IF NOT EXISTS idx_election_vote_receipts_election ON election_vote_receipts(election_id);
CREATE INDEX IF NOT EXISTS idx_election_vote_receipts_voter   ON election_vote_receipts(voter_membership_id);

CREATE TABLE IF NOT EXISTS election_ballots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES election_candidates(id) ON DELETE RESTRICT,
  option_id UUID REFERENCES election_options(id) ON DELETE RESTRICT,
  cast_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    ((candidate_id IS NOT NULL)::int + (option_id IS NOT NULL)::int) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_election_ballots_election  ON election_ballots(election_id);
CREATE INDEX IF NOT EXISTS idx_election_ballots_candidate ON election_ballots(candidate_id);
CREATE INDEX IF NOT EXISTS idx_election_ballots_option    ON election_ballots(option_id);

-- ---------------------------------------------------------------------------
-- 2. Data migration from legacy election_votes (split into receipt + ballot)
-- ---------------------------------------------------------------------------

INSERT INTO election_vote_receipts (election_id, voter_membership_id, voted_at)
SELECT election_id, voter_membership_id, voted_at
FROM election_votes
ON CONFLICT (election_id, voter_membership_id) DO NOTHING;

INSERT INTO election_ballots (election_id, candidate_id, option_id, cast_at)
SELECT election_id, candidate_id, option_id, voted_at
FROM election_votes
-- only rows that satisfy the check constraint (exactly one of candidate_id/option_id)
WHERE ((candidate_id IS NOT NULL)::int + (option_id IS NOT NULL)::int) = 1;

-- ---------------------------------------------------------------------------
-- 3. Drop legacy table (removes rls_evote_select and impersonation INSERT)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS election_votes CASCADE;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE election_vote_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE election_ballots       ENABLE ROW LEVEL SECURITY;

-- Receipts: voter can see only their own receipt ("have I voted?" UX).
-- No one else can see it — not peers, not admins, not managers.
CREATE POLICY "evr_select_own" ON election_vote_receipts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.id = election_vote_receipts.voter_membership_id
        AND m.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies on receipts → default deny. All
-- writes go through the cast_ballot() SECURITY DEFINER RPC.

-- Ballots: visible to group members only AFTER the election closes
-- (prevents live tallies during voting per audit rule B6). Ballots
-- carry NO voter reference, so seeing them reveals nothing about
-- who voted for what.
CREATE POLICY "eb_select_after_close" ON election_ballots FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM elections e
      WHERE e.id = election_ballots.election_id
        AND e.status IN ('closed','cancelled')
        AND is_group_member(e.group_id)
    )
  );

-- No INSERT/UPDATE/DELETE policies on ballots → default deny, RPC only.

-- ---------------------------------------------------------------------------
-- 5. cast_ballot() — atomic, authenticated, anonymous vote writer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cast_ballot(
  p_election_id uuid,
  p_candidate_id uuid DEFAULT NULL,
  p_option_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_membership_id uuid;
  v_standing text;
  v_election_group uuid;
  v_election_type text;
  v_election_status text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'auth_required');
  END IF;

  -- Exactly one of candidate_id / option_id must be set
  IF ((p_candidate_id IS NOT NULL)::int + (p_option_id IS NOT NULL)::int) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_choice');
  END IF;

  SELECT group_id, election_type::text, status::text, starts_at, ends_at
    INTO v_election_group, v_election_type, v_election_status, v_starts_at, v_ends_at
  FROM elections
  WHERE id = p_election_id;

  IF v_election_group IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'election_not_found');
  END IF;

  IF v_election_status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'election_not_open');
  END IF;

  IF now() < v_starts_at OR now() > v_ends_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_within_voting_period');
  END IF;

  -- Caller must be a good-standing member of the election's group.
  -- Real members only — proxy rows have user_id = NULL and never
  -- match auth.uid().
  SELECT id, standing::text
    INTO v_membership_id, v_standing
  FROM memberships
  WHERE group_id = v_election_group
    AND user_id = v_user_id
  LIMIT 1;

  IF v_membership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  IF v_standing <> 'good' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_in_good_standing');
  END IF;

  -- Verify candidate/option actually belongs to this election, and
  -- matches the election type.
  IF p_candidate_id IS NOT NULL THEN
    IF v_election_type <> 'officer_election' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'candidate_not_allowed_for_type');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM election_candidates
      WHERE id = p_candidate_id AND election_id = p_election_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_candidate');
    END IF;
  ELSE
    IF v_election_type NOT IN ('poll','motion') THEN
      RETURN jsonb_build_object('ok', false, 'error', 'option_not_allowed_for_type');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM election_options
      WHERE id = p_option_id AND election_id = p_election_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'invalid_option');
    END IF;
  END IF;

  -- Dedup: one vote per (election, voter). Receipt UNIQUE constraint
  -- is the final authority, but we also return a friendly error code.
  IF EXISTS (
    SELECT 1 FROM election_vote_receipts
    WHERE election_id = p_election_id
      AND voter_membership_id = v_membership_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_voted');
  END IF;

  -- Write both rows. Each is independent — no join column links them
  -- back together.
  INSERT INTO election_vote_receipts (election_id, voter_membership_id)
  VALUES (p_election_id, v_membership_id);

  INSERT INTO election_ballots (election_id, candidate_id, option_id)
  VALUES (p_election_id, p_candidate_id, p_option_id);

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_ballot(uuid, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Tighten election_candidates self-nomination: require good standing
-- ---------------------------------------------------------------------------
-- Prior rls_ec_insert allowed any group member to insert a candidate row;
-- combined with the looser "Admins can manage candidates" ALL policy this
-- meant banned/suspended members could self-nominate. Replace with one
-- coherent set that requires good standing for self-nomination.

DROP POLICY IF EXISTS "rls_ec_insert"              ON election_candidates;
DROP POLICY IF EXISTS "Admins can manage candidates" ON election_candidates;

-- Admins/managers: always
CREATE POLICY "ec_manage_insert" ON election_candidates FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM elections e
      WHERE e.id = election_candidates.election_id
        AND has_group_permission(e.group_id, 'elections.manage')
    )
  );

-- Self-nomination: caller's own membership, good standing, election open
CREATE POLICY "ec_self_nominate" ON election_candidates FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM memberships m
      JOIN elections  e ON e.id = election_candidates.election_id
      WHERE m.id = election_candidates.membership_id
        AND m.user_id = auth.uid()
        AND m.group_id = e.group_id
        AND m.standing = 'good'
        AND e.status IN ('draft','open')
    )
  );

-- UPDATE: admins/managers (no change to logic, clean restatement)
CREATE POLICY "ec_manage_update" ON election_candidates FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM elections e
      WHERE e.id = election_candidates.election_id
        AND has_group_permission(e.group_id, 'elections.manage')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM elections e
      WHERE e.id = election_candidates.election_id
        AND has_group_permission(e.group_id, 'elections.manage')
    )
  );
