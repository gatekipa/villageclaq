-- 00033_fines_disputes_overhaul.sql
-- Full overhaul of fines and disputes module
-- Adds fine_types table, extends fines with payment/waive tracking,
-- extends disputes with against_membership, dispute_type, related_fine, docs

-- =====================================================================
-- A. fine_types table (replaces/supplements fine_rules for UI config)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fine_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'XAF',
  auto_apply BOOLEAN NOT NULL DEFAULT false,
  trigger_event TEXT CHECK (trigger_event IN ('late_to_meeting', 'absent_unexcused', 'late_payment', 'missed_hosting', 'custom')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fine_types_group ON public.fine_types(group_id);

ALTER TABLE public.fine_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fine_types_select" ON public.fine_types FOR SELECT USING (
  group_id IN (SELECT get_user_group_ids())
);
CREATE POLICY "fine_types_admin" ON public.fine_types FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.group_id = fine_types.group_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
  )
);

GRANT ALL ON public.fine_types TO authenticated;

-- updated_at trigger
CREATE TRIGGER set_fine_types_updated_at
  BEFORE UPDATE ON public.fine_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================================
-- B. ALTER fines table — add missing columns for spec
-- =====================================================================

-- Add fine_type_id linking to the new fine_types table
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS fine_type_id UUID REFERENCES public.fine_types(id) ON DELETE SET NULL;

-- Add currency
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'XAF';

-- Add reason (human-readable text for why the fine was issued)
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS reason TEXT;

-- Add issued_by (who issued the fine)
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS issued_by UUID REFERENCES auth.users(id);

-- Add issued_at
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Payment tracking
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12, 2);
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS payment_reference TEXT;

-- Waive tracking
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS waived_by UUID REFERENCES auth.users(id);
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS waived_at TIMESTAMPTZ;
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS waive_reason TEXT;

-- Link to dispute
ALTER TABLE public.fines ADD COLUMN IF NOT EXISTS dispute_id UUID;

-- Add status index
CREATE INDEX IF NOT EXISTS idx_fines_status ON public.fines(status);

-- Ensure updated_at trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_fines_updated_at'
  ) THEN
    CREATE TRIGGER set_fines_updated_at
      BEFORE UPDATE ON public.fines
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END
$$;

-- =====================================================================
-- C. ALTER disputes table — add missing columns for spec
-- =====================================================================

-- Rename filed_by -> keep as is (already references memberships)
-- Add against_membership_id
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS against_membership_id UUID REFERENCES public.memberships(id) ON DELETE SET NULL;

-- Add dispute_type (fine_dispute, payment_dispute, election_dispute, misconduct, general)
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS dispute_type TEXT DEFAULT 'general' CHECK (dispute_type IN ('fine_dispute', 'payment_dispute', 'election_dispute', 'misconduct', 'general'));

-- Rename title to subject (keep title, add subject as alias — or just add subject)
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS subject TEXT;
-- Backfill subject from title
UPDATE public.disputes SET subject = title WHERE subject IS NULL AND title IS NOT NULL;

-- Add supporting_docs
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS supporting_docs JSONB DEFAULT '[]'::jsonb;

-- Add related_fine_id
ALTER TABLE public.disputes ADD COLUMN IF NOT EXISTS related_fine_id UUID REFERENCES public.fines(id) ON DELETE SET NULL;

-- Ensure updated_at trigger exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_disputes_updated_at'
  ) THEN
    CREATE TRIGGER set_disputes_updated_at
      BEFORE UPDATE ON public.disputes
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END
$$;

-- Fix disputes RLS: drop self-referencing policies, use get_user_group_ids()
DROP POLICY IF EXISTS "Users can view disputes in their groups" ON public.disputes;
DROP POLICY IF EXISTS "Admins can manage disputes" ON public.disputes;
DROP POLICY IF EXISTS "Members can file disputes" ON public.disputes;

CREATE POLICY "disputes_select" ON public.disputes FOR SELECT USING (
  group_id IN (SELECT get_user_group_ids())
);
CREATE POLICY "disputes_insert" ON public.disputes FOR INSERT WITH CHECK (
  group_id IN (SELECT get_user_group_ids())
);
CREATE POLICY "disputes_admin" ON public.disputes FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.memberships
    WHERE memberships.group_id = disputes.group_id
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
  )
);

-- Ensure GRANT
GRANT ALL ON public.disputes TO authenticated;
GRANT ALL ON public.fine_types TO authenticated;
GRANT ALL ON public.fines TO authenticated;

-- Add index on disputes filed_by_membership_id (filed_by column)
CREATE INDEX IF NOT EXISTS idx_disputes_against ON public.disputes(against_membership_id);
