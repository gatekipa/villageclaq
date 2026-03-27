-- Committees (sub-groups) table
CREATE TABLE IF NOT EXISTS public.committees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'committee' CHECK (type IN ('committee', 'chapter', 'department', 'project')),
  description TEXT,
  leader_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  email TEXT,
  meeting_schedule TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.committees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view committees in their groups"
  ON public.committees FOR SELECT
  USING (group_id IN (SELECT group_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Admins can manage committees"
  ON public.committees FOR ALL
  USING (group_id IN (SELECT group_id FROM public.memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

CREATE INDEX idx_committees_group_id ON public.committees(group_id);

-- ─── Committee members join table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.committee_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id UUID NOT NULL REFERENCES public.committees(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(committee_id, membership_id)
);

ALTER TABLE public.committee_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view committee members in their groups"
  ON public.committee_members FOR SELECT
  USING (committee_id IN (SELECT id FROM public.committees WHERE group_id IN (SELECT group_id FROM public.memberships WHERE user_id = auth.uid())));

CREATE POLICY "Admins can manage committee members"
  ON public.committee_members FOR ALL
  USING (committee_id IN (SELECT id FROM public.committees WHERE group_id IN (SELECT group_id FROM public.memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))));

CREATE INDEX idx_committee_members_committee_id ON public.committee_members(committee_id);
CREATE INDEX idx_committee_members_membership_id ON public.committee_members(membership_id);

-- ─── Sub-group transfers table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sub_group_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  membership_id UUID NOT NULL REFERENCES public.memberships(id),
  from_subgroup_id UUID REFERENCES public.committees(id),
  to_subgroup_id UUID REFERENCES public.committees(id),
  reason TEXT,
  preserve_standing BOOLEAN DEFAULT true,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_at TIMESTAMPTZ DEFAULT now(),
  requested_by UUID REFERENCES public.memberships(id),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.memberships(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sub_group_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transfers in their groups"
  ON public.sub_group_transfers FOR SELECT
  USING (group_id IN (SELECT group_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Users can create transfers"
  ON public.sub_group_transfers FOR INSERT
  WITH CHECK (group_id IN (SELECT group_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE POLICY "Admins can update transfers"
  ON public.sub_group_transfers FOR UPDATE
  USING (group_id IN (SELECT group_id FROM public.memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

CREATE INDEX idx_sub_group_transfers_group_id ON public.sub_group_transfers(group_id);
CREATE INDEX idx_sub_group_transfers_status ON public.sub_group_transfers(status);
