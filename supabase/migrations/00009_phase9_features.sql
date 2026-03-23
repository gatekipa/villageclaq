-- ============================================================
-- Phase 9: Savings Circle, Elections, Document Vault, Membership Cards
-- Pan-African rotating savings, voting, document management
-- ============================================================

-- ==================== ENUM TYPES ====================

CREATE TYPE savings_frequency AS ENUM ('weekly', 'biweekly', 'monthly');
CREATE TYPE savings_rotation_type AS ENUM ('sequential', 'random', 'auction');
CREATE TYPE savings_cycle_status AS ENUM ('active', 'completed', 'paused');
CREATE TYPE savings_contribution_status AS ENUM ('pending', 'paid', 'late', 'defaulted');

CREATE TYPE election_type AS ENUM ('officer_election', 'motion', 'poll');
CREATE TYPE election_status AS ENUM ('draft', 'open', 'closed', 'cancelled');

CREATE TYPE document_category AS ENUM ('constitution', 'financial', 'certificate', 'meeting', 'photo', 'other');

-- ==================== SAVINGS CIRCLES ====================

CREATE TABLE savings_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_fr TEXT,
  custom_label TEXT, -- What the group calls it: Njangi, Ajo, Susu, Stokvel, Chama, etc.
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XAF',
  frequency savings_frequency NOT NULL DEFAULT 'monthly',
  total_rounds INTEGER NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 1,
  rotation_type savings_rotation_type NOT NULL DEFAULT 'sequential',
  start_date DATE NOT NULL,
  status savings_cycle_status NOT NULL DEFAULT 'active',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_savings_cycles_group ON savings_cycles(group_id);
CREATE INDEX idx_savings_cycles_status ON savings_cycles(status);

CREATE TABLE savings_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES savings_cycles(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  collection_round INTEGER NOT NULL,
  has_collected BOOLEAN NOT NULL DEFAULT false,
  collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cycle_id, membership_id),
  UNIQUE(cycle_id, collection_round)
);

CREATE INDEX idx_savings_participants_cycle ON savings_participants(cycle_id);
CREATE INDEX idx_savings_participants_member ON savings_participants(membership_id);

CREATE TABLE savings_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES savings_cycles(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  paid_at TIMESTAMPTZ,
  status savings_contribution_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(cycle_id, membership_id, round_number)
);

CREATE INDEX idx_savings_contributions_cycle ON savings_contributions(cycle_id);
CREATE INDEX idx_savings_contributions_round ON savings_contributions(cycle_id, round_number);

-- ==================== ELECTIONS ====================

CREATE TABLE elections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_fr TEXT,
  description TEXT,
  description_fr TEXT,
  election_type election_type NOT NULL DEFAULT 'poll',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status election_status NOT NULL DEFAULT 'draft',
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_elections_group ON elections(group_id);
CREATE INDEX idx_elections_status ON elections(status);

CREATE TABLE election_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  position_id UUID REFERENCES group_positions(id),
  statement TEXT,
  statement_fr TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_election_candidates_election ON election_candidates(election_id);

CREATE TABLE election_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  label_fr TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_election_options_election ON election_options(election_id);

CREATE TABLE election_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id UUID NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  voter_membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES election_candidates(id),
  option_id UUID REFERENCES election_options(id),
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(election_id, voter_membership_id) -- One vote per person per election
);

CREATE INDEX idx_election_votes_election ON election_votes(election_id);

-- ==================== DOCUMENT VAULT ====================

CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  title_fr TEXT,
  category document_category NOT NULL DEFAULT 'other',
  description TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER, -- bytes
  version INTEGER NOT NULL DEFAULT 1,
  parent_id UUID REFERENCES documents(id), -- For version history
  is_restricted BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_group ON documents(group_id);
CREATE INDEX idx_documents_category ON documents(group_id, category);
CREATE INDEX idx_documents_parent ON documents(parent_id) WHERE parent_id IS NOT NULL;

-- ==================== ADD CUSTOM SAVINGS LABEL TO GROUPS ====================

ALTER TABLE groups ADD COLUMN IF NOT EXISTS savings_circle_label TEXT DEFAULT 'Savings Circle';
ALTER TABLE groups ADD COLUMN IF NOT EXISTS savings_circle_label_fr TEXT DEFAULT 'Cercle d''épargne';

-- ==================== TRIGGERS ====================

CREATE TRIGGER set_savings_cycles_updated_at BEFORE UPDATE ON savings_cycles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_savings_contributions_updated_at BEFORE UPDATE ON savings_contributions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_elections_updated_at BEFORE UPDATE ON elections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE savings_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE election_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE election_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE election_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Savings: group members can view, admins can manage
CREATE POLICY "Members can view savings cycles" ON savings_cycles
  FOR SELECT USING (EXISTS (SELECT 1 FROM memberships WHERE group_id = savings_cycles.group_id AND user_id = auth.uid()));

CREATE POLICY "Admins can manage savings cycles" ON savings_cycles
  FOR ALL USING (EXISTS (SELECT 1 FROM memberships WHERE group_id = savings_cycles.group_id AND user_id = auth.uid() AND role IN ('admin', 'owner', 'moderator')));

CREATE POLICY "Members can view participants" ON savings_participants
  FOR SELECT USING (EXISTS (SELECT 1 FROM savings_cycles sc JOIN memberships m ON m.group_id = sc.group_id WHERE sc.id = savings_participants.cycle_id AND m.user_id = auth.uid()));

CREATE POLICY "Admins can manage participants" ON savings_participants
  FOR ALL USING (EXISTS (SELECT 1 FROM savings_cycles sc JOIN memberships m ON m.group_id = sc.group_id WHERE sc.id = savings_participants.cycle_id AND m.user_id = auth.uid() AND m.role IN ('admin', 'owner', 'moderator')));

CREATE POLICY "Members can view contributions" ON savings_contributions
  FOR SELECT USING (EXISTS (SELECT 1 FROM savings_cycles sc JOIN memberships m ON m.group_id = sc.group_id WHERE sc.id = savings_contributions.cycle_id AND m.user_id = auth.uid()));

CREATE POLICY "Admins can manage contributions" ON savings_contributions
  FOR ALL USING (EXISTS (SELECT 1 FROM savings_cycles sc JOIN memberships m ON m.group_id = sc.group_id WHERE sc.id = savings_contributions.cycle_id AND m.user_id = auth.uid() AND m.role IN ('admin', 'owner', 'moderator')));

-- Elections: group members can view, admins manage, good standing vote
CREATE POLICY "Members can view elections" ON elections
  FOR SELECT USING (EXISTS (SELECT 1 FROM memberships WHERE group_id = elections.group_id AND user_id = auth.uid()));

CREATE POLICY "Admins can manage elections" ON elections
  FOR ALL USING (EXISTS (SELECT 1 FROM memberships WHERE group_id = elections.group_id AND user_id = auth.uid() AND role IN ('admin', 'owner', 'moderator')));

CREATE POLICY "Members can view candidates" ON election_candidates
  FOR SELECT USING (EXISTS (SELECT 1 FROM elections e JOIN memberships m ON m.group_id = e.group_id WHERE e.id = election_candidates.election_id AND m.user_id = auth.uid()));

CREATE POLICY "Admins can manage candidates" ON election_candidates
  FOR ALL USING (EXISTS (SELECT 1 FROM elections e JOIN memberships m ON m.group_id = e.group_id WHERE e.id = election_candidates.election_id AND m.user_id = auth.uid() AND m.role IN ('admin', 'owner', 'moderator')));

CREATE POLICY "Members can view options" ON election_options
  FOR SELECT USING (EXISTS (SELECT 1 FROM elections e JOIN memberships m ON m.group_id = e.group_id WHERE e.id = election_options.election_id AND m.user_id = auth.uid()));

CREATE POLICY "Admins can manage options" ON election_options
  FOR ALL USING (EXISTS (SELECT 1 FROM elections e JOIN memberships m ON m.group_id = e.group_id WHERE e.id = election_options.election_id AND m.user_id = auth.uid() AND m.role IN ('admin', 'owner', 'moderator')));

-- Votes: members in good standing can insert their own, only count-based queries visible
CREATE POLICY "Good standing members can vote" ON election_votes
  FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM memberships WHERE id = election_votes.voter_membership_id AND user_id = auth.uid() AND standing = 'good'));

CREATE POLICY "Members can view own vote exists" ON election_votes
  FOR SELECT USING (EXISTS (SELECT 1 FROM memberships WHERE id = election_votes.voter_membership_id AND user_id = auth.uid()));

-- Documents: members can view unrestricted, admins can view all, admins manage
CREATE POLICY "Members can view unrestricted documents" ON documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM memberships WHERE group_id = documents.group_id AND user_id = auth.uid())
    AND (is_restricted = false OR EXISTS (SELECT 1 FROM memberships WHERE group_id = documents.group_id AND user_id = auth.uid() AND role IN ('admin', 'owner', 'moderator')))
  );

CREATE POLICY "Admins can manage documents" ON documents
  FOR ALL USING (EXISTS (SELECT 1 FROM memberships WHERE group_id = documents.group_id AND user_id = auth.uid() AND role IN ('admin', 'owner', 'moderator')));
