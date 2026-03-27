-- Disputes table for group conflict resolution
CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('financial', 'attendance', 'conduct', 'elections', 'hosting', 'other')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  description TEXT,
  filed_by UUID NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'under_review', 'mediation', 'resolved', 'dismissed')),
  resolution TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.memberships(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

-- Members can view disputes in their groups
CREATE POLICY "Users can view disputes in their groups"
  ON public.disputes FOR SELECT
  USING (group_id IN (SELECT group_id FROM public.memberships WHERE user_id = auth.uid()));

-- Admins can manage disputes
CREATE POLICY "Admins can manage disputes"
  ON public.disputes FOR ALL
  USING (group_id IN (SELECT group_id FROM public.memberships WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Any member can file a dispute
CREATE POLICY "Members can file disputes"
  ON public.disputes FOR INSERT
  WITH CHECK (group_id IN (SELECT group_id FROM public.memberships WHERE user_id = auth.uid()));

CREATE INDEX idx_disputes_group_id ON public.disputes(group_id);
CREATE INDEX idx_disputes_status ON public.disputes(status);
CREATE INDEX idx_disputes_filed_by ON public.disputes(filed_by);
