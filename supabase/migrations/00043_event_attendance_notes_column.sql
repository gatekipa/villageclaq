-- Migration 00043: Add notes column to event_attendances
-- Allows admins to add context like "arrived 30 minutes late" or "left early"

ALTER TABLE public.event_attendances
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Composite index for fast group-level attendance queries (standing calculation)
CREATE INDEX IF NOT EXISTS idx_event_attendances_membership_status
  ON public.event_attendances(membership_id, status);
