-- ============================================================
-- Phase 5: Family Members Table
-- ============================================================

CREATE TYPE family_relationship AS ENUM ('spouse', 'child', 'parent', 'sibling', 'other');

CREATE TABLE family_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  relationship family_relationship NOT NULL,
  date_of_birth DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_family_members_membership ON family_members(membership_id);

CREATE TRIGGER set_family_members_updated_at
  BEFORE UPDATE ON family_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view own family"
  ON family_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.id = family_members.membership_id
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can manage own family"
  ON family_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.id = family_members.membership_id
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all family members"
  ON family_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships m1
      JOIN memberships m2 ON m2.group_id = m1.group_id
      WHERE m2.id = family_members.membership_id
        AND m1.user_id = auth.uid()
        AND m1.role IN ('owner', 'admin')
    )
  );
