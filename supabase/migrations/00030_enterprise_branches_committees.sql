-- ============================================================
-- Migration 00030: Enterprise / Branches / Committees Enhancements
-- ============================================================

-- ── A. Enhance organizations table ─────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS base_country TEXT,
  ADD COLUMN IF NOT EXISTS base_currency TEXT DEFAULT 'XAF',
  ADD COLUMN IF NOT EXISTS hq_group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  ADD COLUMN IF NOT EXISTS sharing_defaults JSONB DEFAULT '{"member_count":true,"member_roster":false,"financial_summary":true,"detailed_transactions":false,"attendance_summary":true,"event_calendar":true,"meeting_minutes":false,"relief_fund_status":true}'::jsonb;

-- ── B. Add group_level to groups ───────────────────────────────────────
ALTER TABLE public.groups
  ADD COLUMN IF NOT EXISTS group_level TEXT NOT NULL DEFAULT 'standalone' CHECK (group_level IN ('standalone', 'hq', 'branch'));

-- ── C. Create exchange_rates table ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_currency TEXT NOT NULL,
  to_currency TEXT NOT NULL,
  rate NUMERIC(18, 8) NOT NULL CHECK (rate > 0),
  effective_date DATE NOT NULL,
  set_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, from_currency, to_currency, effective_date)
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_org ON public.exchange_rates(organization_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_lookup ON public.exchange_rates(organization_id, from_currency, to_currency, effective_date DESC);

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

-- SELECT: any member of a group in the organization
CREATE POLICY "Members of org groups can view exchange rates"
  ON public.exchange_rates FOR SELECT
  USING (
    organization_id IN (
      SELECT g.organization_id FROM public.groups g
      WHERE g.id IN (SELECT unnest(get_user_group_ids()))
        AND g.organization_id IS NOT NULL
    )
  );

-- INSERT/UPDATE: admin/owner of HQ group in the organization
CREATE POLICY "HQ admins can manage exchange rates"
  ON public.exchange_rates FOR ALL
  USING (
    organization_id IN (
      SELECT o.id FROM public.organizations o
      JOIN public.groups g ON g.id = o.hq_group_id
      WHERE g.id IN (SELECT unnest(get_user_group_ids()))
        AND EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.user_id = auth.uid()
            AND m.group_id = g.id
            AND m.role IN ('owner', 'admin')
        )
    )
  );

CREATE TRIGGER set_exchange_rates_updated_at
  BEFORE UPDATE ON public.exchange_rates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── D. Enhance committees table ────────────────────────────────────────
ALTER TABLE public.committees
  ADD COLUMN IF NOT EXISTS budget_allocation NUMERIC(12, 2) DEFAULT 0;

-- ── E. Enhance committee_members table ─────────────────────────────────
ALTER TABLE public.committee_members
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member' CHECK (role IN ('member', 'head', 'secretary', 'treasurer'));

-- ── F. Fix RLS on committees to use get_user_group_ids() ───────────────
-- Drop old self-referencing policies and recreate with security-safe helper
DROP POLICY IF EXISTS "Users can view committees in their groups" ON public.committees;
DROP POLICY IF EXISTS "Admins can manage committees" ON public.committees;

CREATE POLICY "Users can view committees in their groups"
  ON public.committees FOR SELECT
  USING (group_id IN (SELECT unnest(get_user_group_ids())));

CREATE POLICY "Admins can manage committees"
  ON public.committees FOR ALL
  USING (
    group_id IN (SELECT unnest(get_user_group_ids()))
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.group_id = committees.group_id
        AND m.role IN ('owner', 'admin')
    )
  );

-- Fix RLS on committee_members
DROP POLICY IF EXISTS "Users can view committee members in their groups" ON public.committee_members;
DROP POLICY IF EXISTS "Admins can manage committee members" ON public.committee_members;

CREATE POLICY "Users can view committee members in their groups"
  ON public.committee_members FOR SELECT
  USING (
    committee_id IN (
      SELECT c.id FROM public.committees c
      WHERE c.group_id IN (SELECT unnest(get_user_group_ids()))
    )
  );

CREATE POLICY "Admins can manage committee members"
  ON public.committee_members FOR ALL
  USING (
    committee_id IN (
      SELECT c.id FROM public.committees c
      WHERE c.group_id IN (SELECT unnest(get_user_group_ids()))
        AND EXISTS (
          SELECT 1 FROM public.memberships m
          WHERE m.user_id = auth.uid()
            AND m.group_id = c.group_id
            AND m.role IN ('owner', 'admin')
        )
    )
  );

-- Fix RLS on sub_group_transfers
DROP POLICY IF EXISTS "Users can view transfers in their groups" ON public.sub_group_transfers;
DROP POLICY IF EXISTS "Users can create transfers" ON public.sub_group_transfers;
DROP POLICY IF EXISTS "Admins can update transfers" ON public.sub_group_transfers;

CREATE POLICY "Users can view transfers in their groups"
  ON public.sub_group_transfers FOR SELECT
  USING (group_id IN (SELECT unnest(get_user_group_ids())));

CREATE POLICY "Users can create transfers"
  ON public.sub_group_transfers FOR INSERT
  WITH CHECK (group_id IN (SELECT unnest(get_user_group_ids())));

CREATE POLICY "Admins can update transfers"
  ON public.sub_group_transfers FOR UPDATE
  USING (
    group_id IN (SELECT unnest(get_user_group_ids()))
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.group_id = sub_group_transfers.group_id
        AND m.role IN ('owner', 'admin')
    )
  );

-- Fix RLS on member_transfers to use get_user_group_ids()
DROP POLICY IF EXISTS "Admins of source or dest can view transfers" ON public.member_transfers;
DROP POLICY IF EXISTS "Admins can create transfers" ON public.member_transfers;
DROP POLICY IF EXISTS "Admins can update transfers" ON public.member_transfers;

CREATE POLICY "Admins of source or dest can view transfers"
  ON public.member_transfers FOR SELECT
  USING (
    (source_group_id IN (SELECT unnest(get_user_group_ids()))
     OR dest_group_id IN (SELECT unnest(get_user_group_ids())))
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND (m.group_id = member_transfers.source_group_id OR m.group_id = member_transfers.dest_group_id)
    )
  );

CREATE POLICY "Admins can create transfers"
  ON public.member_transfers FOR INSERT
  WITH CHECK (
    source_group_id IN (SELECT unnest(get_user_group_ids()))
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND m.group_id = member_transfers.source_group_id
    )
  );

CREATE POLICY "Admins can update transfers"
  ON public.member_transfers FOR UPDATE
  USING (
    (source_group_id IN (SELECT unnest(get_user_group_ids()))
     OR dest_group_id IN (SELECT unnest(get_user_group_ids())))
    AND EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = auth.uid()
        AND m.role IN ('owner', 'admin')
        AND (m.group_id = member_transfers.source_group_id OR m.group_id = member_transfers.dest_group_id)
    )
  );

-- ── G. GRANT ALL to authenticated role ─────────────────────────────────
GRANT ALL ON public.organizations TO authenticated;
GRANT ALL ON public.exchange_rates TO authenticated;
GRANT ALL ON public.committees TO authenticated;
GRANT ALL ON public.committee_members TO authenticated;
GRANT ALL ON public.sub_group_transfers TO authenticated;
GRANT ALL ON public.member_transfers TO authenticated;
