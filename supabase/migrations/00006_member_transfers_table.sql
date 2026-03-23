-- ============================================================
-- Phase 6: Member Transfers + Enterprise
-- ============================================================

CREATE TYPE transfer_status AS ENUM ('requested', 'source_approved', 'dest_approved', 'completed', 'rejected');

CREATE TABLE member_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES profiles(id),
  source_group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  dest_group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  status transfer_status NOT NULL DEFAULT 'requested',
  reason TEXT,
  transfer_summary_json JSONB NOT NULL DEFAULT '{}',
  requested_by UUID NOT NULL REFERENCES profiles(id),
  approved_by_source UUID REFERENCES profiles(id),
  approved_by_dest UUID REFERENCES profiles(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_member_transfers_member ON member_transfers(member_id);
CREATE INDEX idx_member_transfers_source ON member_transfers(source_group_id);
CREATE INDEX idx_member_transfers_dest ON member_transfers(dest_group_id);
CREATE INDEX idx_member_transfers_status ON member_transfers(status);

CREATE TRIGGER set_member_transfers_updated_at
  BEFORE UPDATE ON member_transfers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE member_transfers ENABLE ROW LEVEL SECURITY;

-- Branch sharing controls column on groups
ALTER TABLE groups ADD COLUMN IF NOT EXISTS sharing_controls JSONB NOT NULL DEFAULT '{"member_count":true,"financial_summary":true,"detailed_transactions":false,"attendance":true,"events":true,"minutes":false,"relief":false}';

CREATE POLICY "Admins of source or dest can view transfers"
  ON member_transfers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
        AND (memberships.group_id = member_transfers.source_group_id OR memberships.group_id = member_transfers.dest_group_id)
    )
  );

CREATE POLICY "Admins can create transfers"
  ON member_transfers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
        AND memberships.group_id = member_transfers.source_group_id
    )
  );

CREATE POLICY "Admins can update transfers"
  ON member_transfers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
        AND (memberships.group_id = member_transfers.source_group_id OR memberships.group_id = member_transfers.dest_group_id)
    )
  );
