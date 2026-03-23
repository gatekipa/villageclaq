-- ============================================================
-- Phase 4: Relief Plans (Mutual Aid) Tables
-- ============================================================

-- ==================== ENUM TYPES ====================

CREATE TYPE relief_event_type AS ENUM ('death', 'illness', 'wedding', 'childbirth', 'natural_disaster', 'other');
CREATE TYPE relief_contribution_frequency AS ENUM ('monthly', 'per_event', 'annual');
CREATE TYPE relief_claim_status AS ENUM ('submitted', 'reviewing', 'approved', 'denied');

-- ==================== RELIEF PLANS ====================

CREATE TABLE relief_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_fr TEXT,
  description TEXT,
  description_fr TEXT,
  qualifying_events JSONB NOT NULL DEFAULT '[]',
  contribution_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  contribution_frequency relief_contribution_frequency NOT NULL DEFAULT 'monthly',
  payout_rules JSONB NOT NULL DEFAULT '{}',
  waiting_period_days INTEGER NOT NULL DEFAULT 180,
  auto_enroll BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_relief_plans_group ON relief_plans(group_id);
CREATE INDEX idx_relief_plans_active ON relief_plans(group_id, is_active);

-- ==================== RELIEF ENROLLMENTS ====================

CREATE TABLE relief_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES relief_plans(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  contribution_status TEXT NOT NULL DEFAULT 'up_to_date',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(plan_id, membership_id)
);

CREATE INDEX idx_relief_enrollments_plan ON relief_enrollments(plan_id);
CREATE INDEX idx_relief_enrollments_membership ON relief_enrollments(membership_id);
CREATE INDEX idx_relief_enrollments_active ON relief_enrollments(plan_id, is_active);

-- ==================== RELIEF CLAIMS ====================

CREATE TABLE relief_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES relief_plans(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  event_type relief_event_type NOT NULL,
  description TEXT,
  supporting_doc_url TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status relief_claim_status NOT NULL DEFAULT 'submitted',
  reviewed_by UUID REFERENCES profiles(id),
  review_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_relief_claims_plan ON relief_claims(plan_id);
CREATE INDEX idx_relief_claims_membership ON relief_claims(membership_id);
CREATE INDEX idx_relief_claims_status ON relief_claims(status);
CREATE INDEX idx_relief_claims_created ON relief_claims(created_at DESC);

-- ==================== RELIEF PAYOUTS ====================

CREATE TABLE relief_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL REFERENCES relief_claims(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_relief_payouts_claim ON relief_payouts(claim_id);

-- ==================== TRIGGERS ====================

CREATE TRIGGER set_relief_plans_updated_at
  BEFORE UPDATE ON relief_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_relief_enrollments_updated_at
  BEFORE UPDATE ON relief_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_relief_claims_updated_at
  BEFORE UPDATE ON relief_claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_relief_payouts_updated_at
  BEFORE UPDATE ON relief_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ==================== ROW LEVEL SECURITY ====================

ALTER TABLE relief_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE relief_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE relief_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE relief_payouts ENABLE ROW LEVEL SECURITY;

-- Relief plans: members can view, admins manage
CREATE POLICY "Group members can view relief plans"
  ON relief_plans FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.group_id = relief_plans.group_id
        AND memberships.user_id = auth.uid()
        AND memberships.standing != 'banned'
    )
  );

CREATE POLICY "Group admins can manage relief plans"
  ON relief_plans FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.group_id = relief_plans.group_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

-- Enrollments: members see own, admins see all
CREATE POLICY "Members can view own enrollments"
  ON relief_enrollments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.id = relief_enrollments.membership_id
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all enrollments"
  ON relief_enrollments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM relief_plans
      JOIN memberships ON memberships.group_id = relief_plans.group_id
      WHERE relief_plans.id = relief_enrollments.plan_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can manage enrollments"
  ON relief_enrollments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM relief_plans
      JOIN memberships ON memberships.group_id = relief_plans.group_id
      WHERE relief_plans.id = relief_enrollments.plan_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

-- Claims: members see own, admins see all
CREATE POLICY "Members can view own claims"
  ON relief_claims FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.id = relief_claims.membership_id
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can submit claims"
  ON relief_claims FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships
      WHERE memberships.id = relief_claims.membership_id
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can view all claims"
  ON relief_claims FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM relief_plans
      JOIN memberships ON memberships.group_id = relief_plans.group_id
      WHERE relief_plans.id = relief_claims.plan_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can manage claims"
  ON relief_claims FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM relief_plans
      JOIN memberships ON memberships.group_id = relief_plans.group_id
      WHERE relief_plans.id = relief_claims.plan_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );

-- Payouts: members see own, admins manage
CREATE POLICY "Members can view own payouts"
  ON relief_payouts FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM relief_claims
      JOIN memberships ON memberships.id = relief_claims.membership_id
      WHERE relief_claims.id = relief_payouts.claim_id
        AND memberships.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage payouts"
  ON relief_payouts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM relief_claims
      JOIN relief_plans ON relief_plans.id = relief_claims.plan_id
      JOIN memberships ON memberships.group_id = relief_plans.group_id
      WHERE relief_claims.id = relief_payouts.claim_id
        AND memberships.user_id = auth.uid()
        AND memberships.role IN ('owner', 'admin')
    )
  );
