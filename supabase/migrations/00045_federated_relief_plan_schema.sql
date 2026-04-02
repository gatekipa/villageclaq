-- Migration 00045: Federated Relief Plan Schema
-- Adds multi-branch / HQ-level relief plan support:
--   collection modes, claim processing delegation, enrollment types,
--   remittance tracking, and branch-level summary view.
--
-- SCHEMA CORRECTIONS applied vs original spec:
--   relief_enrollments FK column is `plan_id` (not `relief_plan_id`)
--   groups currency column is `currency` (not `default_currency`)
--   trigger function is `update_updated_at()` (not `update_updated_at_column()`)
--   `shared_from_org` added to relief_plans (required by the view, did not exist)

-- ════════════════════════════════════════════════════════════════════════════════
-- 1. ALTER TABLE relief_plans — add 5 columns
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE relief_plans
  ADD COLUMN IF NOT EXISTS shared_from_org BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE relief_plans
  ADD COLUMN IF NOT EXISTS collection_mode TEXT NOT NULL DEFAULT 'branch_collect'
  CHECK (collection_mode IN ('branch_collect', 'hq_collect', 'either'));

ALTER TABLE relief_plans
  ADD COLUMN IF NOT EXISTS claim_processing TEXT NOT NULL DEFAULT 'hq_only'
  CHECK (claim_processing IN ('hq_only', 'branch_delegated', 'branch_with_approval'));

ALTER TABLE relief_plans
  ADD COLUMN IF NOT EXISTS relief_only_rules JSONB DEFAULT NULL;

ALTER TABLE relief_plans
  ADD COLUMN IF NOT EXISTS external_rules JSONB DEFAULT NULL;

-- ════════════════════════════════════════════════════════════════════════════════
-- 2. ALTER TABLE relief_enrollments — add 2 columns
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE relief_enrollments
  ADD COLUMN IF NOT EXISTS enrollment_type TEXT NOT NULL DEFAULT 'full_member'
  CHECK (enrollment_type IN ('full_member', 'relief_only', 'external'));

ALTER TABLE relief_enrollments
  ADD COLUMN IF NOT EXISTS collecting_group_id UUID REFERENCES groups(id) DEFAULT NULL;

-- ════════════════════════════════════════════════════════════════════════════════
-- 3. ALTER TABLE payments — add 1 column
-- ════════════════════════════════════════════════════════════════════════════════

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS relief_plan_id UUID REFERENCES relief_plans(id) DEFAULT NULL;

-- ════════════════════════════════════════════════════════════════════════════════
-- 4. CREATE TABLE relief_remittances
-- ════════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS relief_remittances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_group_id UUID NOT NULL REFERENCES groups(id),
  relief_plan_id  UUID NOT NULL REFERENCES relief_plans(id),
  amount          NUMERIC(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'USD',
  remitted_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  method          TEXT NOT NULL CHECK (method IN ('bank_transfer', 'mobile_money', 'cash', 'other')),
  reference       TEXT,
  notes           TEXT,
  confirmed_by    UUID REFERENCES auth.users(id),
  confirmed_date  TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'disputed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE relief_remittances ENABLE ROW LEVEL SECURITY;

-- ════════════════════════════════════════════════════════════════════════════════
-- 4b. RLS policies for relief_remittances
-- ════════════════════════════════════════════════════════════════════════════════

-- SELECT: member of branch OR member of any group in the same organization
DROP POLICY IF EXISTS relief_remittances_select ON relief_remittances;
CREATE POLICY relief_remittances_select ON relief_remittances
  FOR SELECT USING (
    branch_group_id IN (SELECT get_user_group_ids())
    OR EXISTS (
      SELECT 1 FROM groups g_branch
      JOIN groups g_user ON g_user.organization_id = g_branch.organization_id
        AND g_user.organization_id IS NOT NULL
      WHERE g_branch.id = relief_remittances.branch_group_id
        AND g_user.id IN (SELECT get_user_group_ids())
    )
  );

-- INSERT: admin/owner of the branch
DROP POLICY IF EXISTS relief_remittances_insert ON relief_remittances;
CREATE POLICY relief_remittances_insert ON relief_remittances
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.group_id = relief_remittances.branch_group_id
        AND m.role IN ('admin', 'owner')
    )
  );

-- UPDATE: admin/owner of branch OR admin/owner of HQ group in same org
DROP POLICY IF EXISTS relief_remittances_update ON relief_remittances;
CREATE POLICY relief_remittances_update ON relief_remittances
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid()
        AND m.group_id = relief_remittances.branch_group_id
        AND m.role IN ('admin', 'owner')
    )
    OR EXISTS (
      SELECT 1 FROM memberships m
      JOIN groups g_hq ON g_hq.id = m.group_id
        AND g_hq.group_level = 'hq'
      JOIN groups g_branch ON g_branch.organization_id = g_hq.organization_id
        AND g_branch.organization_id IS NOT NULL
      WHERE m.user_id = auth.uid()
        AND m.role IN ('admin', 'owner')
        AND g_branch.id = relief_remittances.branch_group_id
    )
  );

-- GRANT
GRANT ALL ON relief_remittances TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════════
-- 5. CREATE VIEW relief_branch_summary
-- ════════════════════════════════════════════════════════════════════════════════
-- Corrected from spec:
--   re.plan_id (not re.relief_plan_id — actual FK column name)
--   g.currency (not g.default_currency — actual column name)

CREATE OR REPLACE VIEW relief_branch_summary AS
SELECT
  rp.id AS relief_plan_id,
  rp.name AS plan_name,
  re.collecting_group_id,
  g.name AS branch_name,
  g.currency AS branch_currency,
  COUNT(re.id) AS enrolled_count,
  COUNT(re.id) FILTER (WHERE re.enrollment_type = 'full_member') AS full_member_count,
  COUNT(re.id) FILTER (WHERE re.enrollment_type = 'relief_only') AS relief_only_count,
  COUNT(re.id) FILTER (WHERE re.enrollment_type = 'external') AS external_count,
  COUNT(DISTINCT p.membership_id) FILTER (WHERE p.created_at >= date_trunc('month', CURRENT_DATE)) AS paid_this_month,
  COALESCE(SUM(p.amount) FILTER (WHERE p.created_at >= date_trunc('month', CURRENT_DATE) AND p.status = 'confirmed'), 0) AS collected_this_month,
  COALESCE(SUM(rr.amount) FILTER (WHERE rr.status = 'confirmed'), 0) AS total_remitted
FROM relief_plans rp
JOIN relief_enrollments re ON re.plan_id = rp.id
LEFT JOIN groups g ON g.id = re.collecting_group_id
LEFT JOIN payments p ON p.relief_plan_id = rp.id AND p.membership_id = re.membership_id AND p.status = 'confirmed'
LEFT JOIN relief_remittances rr ON rr.relief_plan_id = rp.id AND rr.branch_group_id = re.collecting_group_id
WHERE rp.shared_from_org = true
GROUP BY rp.id, rp.name, re.collecting_group_id, g.name, g.currency;

GRANT SELECT ON relief_branch_summary TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════════
-- 6. Indexes
-- ════════════════════════════════════════════════════════════════════════════════

DROP INDEX IF EXISTS idx_relief_enrollments_collecting_group;
CREATE INDEX idx_relief_enrollments_collecting_group ON relief_enrollments(collecting_group_id);

DROP INDEX IF EXISTS idx_relief_enrollments_enrollment_type;
CREATE INDEX idx_relief_enrollments_enrollment_type ON relief_enrollments(enrollment_type);

DROP INDEX IF EXISTS idx_payments_relief_plan_id;
CREATE INDEX idx_payments_relief_plan_id ON payments(relief_plan_id) WHERE relief_plan_id IS NOT NULL;

DROP INDEX IF EXISTS idx_relief_remittances_branch_plan;
CREATE INDEX idx_relief_remittances_branch_plan ON relief_remittances(branch_group_id, relief_plan_id);

DROP INDEX IF EXISTS idx_relief_remittances_status;
CREATE INDEX idx_relief_remittances_status ON relief_remittances(status);

-- ════════════════════════════════════════════════════════════════════════════════
-- 7. updated_at trigger on relief_remittances
-- ════════════════════════════════════════════════════════════════════════════════
-- Uses the existing update_updated_at() function from 00001_core_tables.sql

DROP TRIGGER IF EXISTS update_relief_remittances_updated_at ON relief_remittances;
CREATE TRIGGER update_relief_remittances_updated_at
  BEFORE UPDATE ON relief_remittances
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
